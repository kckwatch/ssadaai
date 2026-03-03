chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "search") {
    handleSearch(request.query, request.mode)
      .then(function(r) { sendResponse({ success: true, results: r }); })
      .catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }
  if (request.action === "saveKey") {
    chrome.storage.local.set({
      naverClientId: request.id,
      naverClientSecret: request.secret
    }, function() {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true });
      }
    });
    return true;
  }
  if (request.action === "getKey") {
    chrome.storage.local.get(["naverClientId","naverClientSecret"], function(d) {
      sendResponse(d);
    });
    return true;
  }
});

var TRUSTED = {
  "coupang": 95, "11st": 90, "gmarket": 88, "ssg": 92,
  "auction": 85, "lotteon": 88, "himart": 93, "emart": 92,
  "samsung": 98, "apple": 99, "amazon": 90, "naver": 88
};

async function handleSearch(query, mode) {
  var config = await chrome.storage.local.get(["naverClientId","naverClientSecret"]);
  if (!config.naverClientId || !config.naverClientSecret) {
    throw new Error("API_KEY_MISSING");
  }

  var url = "https://openapi.naver.com/v1/search/shop.json?query=" +
    encodeURIComponent(query.trim()) + "&display=20&sort=asc";

  var res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": config.naverClientId,
      "X-Naver-Client-Secret": config.naverClientSecret
    }
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error("API_KEY_INVALID");
    throw new Error("API_ERROR_" + res.status);
  }

  var data = await res.json();
  if (!data.items || data.items.length === 0) return [];

  var results = data.items.map(function(item) {
    var title = item.title.replace(/<[^>]*>/g, "");
    var price = parseInt(item.lprice, 10);
    var mall = item.mallName || "";
    var link = item.link;
    var trustScore = 55;
    var ml = mall.toLowerCase();
    var ll = link.toLowerCase();

    var keys = Object.keys(TRUSTED);
    for (var k = 0; k < keys.length; k++) {
      if (ml.indexOf(keys[k]) >= 0 || ll.indexOf(keys[k]) >= 0) {
        trustScore = TRUSTED[keys[k]];
        break;
      }
    }
    if (item.brand && item.brand.length > 0) trustScore = Math.min(trustScore + 5, 100);

    return { title: title, price: price, link: link, mall: mall, image: item.image, trustScore: trustScore };
  });

  if (mode === "cheapest") {
    results.sort(function(a,b) { return a.price - b.price; });
  } else if (mode === "trusted") {
    var trusted = results.filter(function(r) { return r.trustScore >= 75; });
    if (trusted.length > 0) {
      trusted.sort(function(a,b) { return a.price - b.price; });
      results = trusted;
    }
  } else {
    var prices = results.map(function(r) { return r.price; });
    var maxP = Math.max.apply(null, prices);
    var minP = Math.min.apply(null, prices);
    var range = maxP - minP || 1;
    results.forEach(function(r) {
      var ps = 100 - ((r.price - minP) / range) * 100;
      r.score = r.trustScore * 0.4 + ps * 0.6;
    });
    results.sort(function(a,b) { return b.score - a.score; });
  }

  return results.slice(0, 5);
}
