// background.js - Search + Trust scoring

const TRUSTED_MALLS = {
  "coupang": { trust: 95, name: "Coupang" },
  "11st": { trust: 90, name: "11st" },
  "gmarket": { trust: 88, name: "Gmarket" },
  "ssg": { trust: 92, name: "SSG" },
  "auction": { trust: 85, name: "Auction" },
  "lotteon": { trust: 88, name: "LotteON" },
  "himart": { trust: 93, name: "Himart" },
  "emart": { trust: 92, name: "Emart" },
  "samsung": { trust: 98, name: "Samsung" },
  "apple": { trust: 99, name: "Apple" },
  "amazon": { trust: 90, name: "Amazon" },
  "naver": { trust: 88, name: "Naver" },
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "search") {
    handleSearch(request.query, request.mode)
      .then((r) => sendResponse({ success: true, results: r }))
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true;
  }
});

async function handleSearch(query, mode) {
  const config = await chrome.storage.sync.get(["naverClientId", "naverClientSecret"]);
  if (!config.naverClientId || !config.naverClientSecret) {
    throw new Error("API_KEY_MISSING");
  }

  const cleanQuery = query.replace(/\s+/g, " ").trim();
  const url = "https://openapi.naver.com/v1/search/shop.json?query=" +
    encodeURIComponent(cleanQuery) + "&display=20&sort=asc";

  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": config.naverClientId,
      "X-Naver-Client-Secret": config.naverClientSecret,
    },
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error("API_KEY_INVALID");
    throw new Error("API_ERROR_" + res.status);
  }

  const data = await res.json();
  if (!data.items || data.items.length === 0) return [];

  let results = data.items.map((item) => {
    const title = item.title.replace(/<[^>]*>/g, "");
    const price = parseInt(item.lprice, 10);
    const mall = item.mallName || "";
    const link = item.link;

    let trustScore = 55;
    const mallLower = mall.toLowerCase();
    const linkLower = link.toLowerCase();

    for (const [key, info] of Object.entries(TRUSTED_MALLS)) {
      if (mallLower.includes(key) || linkLower.includes(key)) {
        trustScore = info.trust;
        break;
      }
    }

    if (item.brand && item.brand.length > 0) trustScore = Math.min(trustScore + 5, 100);
    if (item.maker && item.maker.length > 0) trustScore = Math.min(trustScore + 3, 100);

    return { title, price, link, mall, image: item.image, brand: item.brand || "", trustScore };
  });

  if (mode === "cheapest") {
    results.sort((a, b) => a.price - b.price);
  } else if (mode === "trusted") {
    const trusted = results.filter((r) => r.trustScore >= 75);
    if (trusted.length > 0) {
      trusted.sort((a, b) => a.price - b.price);
      results = trusted;
    } else {
      results.sort((a, b) => b.trustScore - a.trustScore);
    }
  } else {
    const maxP = Math.max(...results.map((r) => r.price));
    const minP = Math.min(...results.map((r) => r.price));
    const range = maxP - minP || 1;
    results.forEach((r) => {
      const priceScore = 100 - ((r.price - minP) / range) * 100;
      r.score = r.trustScore * 0.4 + priceScore * 0.6;
    });
    results.sort((a, b) => b.score - a.score);
  }

  return results.slice(0, 5);
}
