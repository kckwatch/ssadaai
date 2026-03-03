// popup.js
const $ = (id) => document.getElementById(id);
let currentMode = "balanced";

const allStates = ["initialState","loadingState","apiKeyState","errorState","noResults"];
function showState(name) {
  allStates.forEach((s) => ($(s).style.display = "none"));
  $("goBanner").style.display = "none";
  $("othersLabel").style.display = "none";
  $("others").innerHTML = "";
  if (name) $(name).style.display = "";
  document.body.classList.remove("has-results");
}

function formatPrice(n) { return n.toLocaleString("ko-KR") + "\uc6d0"; }

function trustDots(score, big) {
  const filled = Math.round(score / 20);
  const cls = big ? "trust-dot" : "other-trust-dot";
  let h = '<span class="' + (big ? "trust-dots" : "other-trust") + '">';
  for (let i = 0; i < 5; i++) h += '<span class="' + cls + (i < filled ? " on" : "") + '"></span>';
  return h + "</span>";
}

document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentMode = btn.dataset.mode;
    const q = $("q").value.trim();
    if (q) doSearch(q);
  });
});

$("q").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { const q = $("q").value.trim(); if (q) doSearch(q); }
});

$("gearBtn").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("setupBtn").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("retryBtn").addEventListener("click", () => {
  const q = $("q").value.trim();
  if (q) doSearch(q); else showState("initialState");
});

async function doSearch(query) {
  showState("loadingState");
  chrome.runtime.sendMessage({ action: "search", query, mode: currentMode }, (response) => {
    if (chrome.runtime.lastError) { showState("errorState"); $("errMsg").textContent = "Extension error"; return; }
    if (!response || !response.success) {
      const err = response ? response.error : "unknown";
      if (err === "API_KEY_MISSING") { showState("apiKeyState"); }
      else { showState("errorState"); $("errMsg").textContent = err === "API_KEY_INVALID" ? "API key invalid" : "Search error"; }
      return;
    }
    if (response.results.length === 0) { showState("noResults"); return; }
    displayResults(response.results);
  });
}

function displayResults(results) {
  allStates.forEach((s) => ($(s).style.display = "none"));
  document.body.classList.add("has-results");

  const best = results[0];
  const banner = $("goBanner");
  let tag = "Recommended";
  if (currentMode === "cheapest") tag = "Cheapest";
  else if (currentMode === "trusted") tag = "Trusted+Cheap";

  banner.innerHTML =
    '<div class="go-top"><span class="go-tag">' + tag + ' #1</span>' +
    '<span class="go-price">' + formatPrice(best.price) + '</span></div>' +
    '<div class="go-title">' + best.title + '</div>' +
    '<div class="go-mall">' + best.mall + ' ' + trustDots(best.trustScore, true) + '</div>' +
    '<div class="go-arrow">&rarr;</div>';
  banner.style.display = "block";
  banner.className = "go-banner anim";
  banner.onclick = () => chrome.tabs.create({ url: best.link });

  const rest = results.slice(1);
  if (rest.length > 0) {
    $("othersLabel").style.display = "block";
    const container = $("others");
    container.innerHTML = "";
    rest.forEach((item, i) => {
      const el = document.createElement("a");
      el.href = "#";
      el.className = "other-item anim";
      el.style.animationDelay = (i + 1) * 0.06 + "s";
      el.onclick = (e) => { e.preventDefault(); chrome.tabs.create({ url: item.link }); };
      el.innerHTML =
        '<img class="other-img" src="' + (item.image || "") + '" onerror="this.style.display=\'none\'" />' +
        '<div class="other-info"><div class="other-title">' + item.title + '</div>' +
        '<div class="other-mall">' + item.mall + '</div></div>' +
        '<div class="other-price">' + formatPrice(item.price) + '</div>';
      container.appendChild(el);
    });
  }
}

chrome.storage.sync.get(["naverClientId","naverClientSecret"], (data) => {
  if (!data.naverClientId || !data.naverClientSecret) showState("apiKeyState");
});
