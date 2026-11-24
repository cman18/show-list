(() => {
  "use strict";

  const FEED_STORAGE_KEY = "showlist.sheetFeedUrl";
  const CACHE_KEY = "showlist.lastKnownGood.v1";
  const VERSION_URL = "./version.json";
  let feedUrlPromise;

  function isEndpoint(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" &&
        url.hostname === "script.google.com" &&
        /^\/macros\/s\/[^/]+\/exec$/.test(url.pathname);
    } catch {
      return false;
    }
  }

  async function getFeedUrl() {
    const saved = localStorage.getItem(FEED_STORAGE_KEY);
    if (saved && isEndpoint(saved)) return saved;
    if (!feedUrlPromise) {
      feedUrlPromise = fetch(VERSION_URL + "?_=" + Date.now(), { cache: "no-store" })
        .then(response => response.ok ? response.json() : {})
        .then(config => {
          const configured = config && config.sheetFeedUrl;
          return typeof configured === "string" && isEndpoint(configured) ? configured : "";
        })
        .catch(() => "");
    }
    return feedUrlPromise;
  }

  function getSnapshot() {
    return Array.isArray(window.__showlistInitial) ? window.__showlistInitial : [];
  }

  function cachedTitles() {
    try {
      const value = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      return Array.isArray(value) ? value : null;
    } catch {
      return null;
    }
  }

  function stableKey(title) {
    return [title.title, title.type, title.year].map(value => String(value || "").trim().toLowerCase()).join("|");
  }

  function normalizeTitles(titles) {
    const snapshot = getSnapshot();
    const byId = new Map(snapshot.map(title => [String(title.id), title]));
    const byName = new Map(snapshot.map(title => [stableKey(title), title]));
    const seen = new Set();

    return titles.filter(item => item && typeof item.title === "string" && item.title.trim())
      .map(item => {
        const id = String(item.id || "legacy:" + stableKey(item));
        const existing = byId.get(id) || byName.get(stableKey(item)) || {};
        const merged = {
          ...existing,
          ...item,
          id,
          title: item.title.trim(),
          poster: item.poster || existing.poster || null,
          overview: item.overview || existing.overview || "",
          genres: Array.isArray(item.genres) && item.genres.length ? item.genres : (existing.genres || []),
          providers: Array.isArray(item.providers) ? item.providers : (existing.providers || []),
        };
        const key = merged.id || stableKey(merged);
        if (seen.has(key)) return null;
        seen.add(key);
        return merged;
      })
      .filter(Boolean);
  }

  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const callback = "__showListCallback_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      const script = document.createElement("script");
      const timeout = window.setTimeout(() => finish(new Error("Google Sheets timed out.")), 20000);
      let settled = false;

      function finish(error, payload) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        delete window[callback];
        script.remove();
        error ? reject(error) : resolve(payload);
      }

      window[callback] = payload => finish(null, payload);
      script.onerror = () => finish(new Error("Could not load the Google Sheets endpoint."));
      const endpoint = new URL(url);
      endpoint.searchParams.set("callback", callback);
      endpoint.searchParams.set("_", String(Date.now()));
      script.src = endpoint.toString();
      document.head.appendChild(script);
    });
  }

  function announce(status, isLive) {
    window.__showlistSyncStatus = { text: status, live: isLive };
    const statusEl = document.getElementById("sheet-sync-status");
    if (statusEl) {
      statusEl.textContent = status;
      statusEl.dataset.live = isLive ? "true" : "false";
    }
  }

  async function syncNow() {
    const endpoint = await getFeedUrl();
    if (!endpoint) {
      const lastGood = cachedTitles();
      announce("Saved copy · Connect Google Sheets", false);
      return lastGood || getSnapshot();
    }

    try {
      const payload = await jsonp(endpoint);
      if (!payload || payload.ok !== true || !Array.isArray(payload.titles)) {
        throw new Error(payload && payload.error ? payload.error : "Invalid Google Sheets response.");
      }
      const titles = normalizeTitles(payload.titles);
      localStorage.setItem(CACHE_KEY, JSON.stringify(titles));
      const syncedAt = payload.syncedAt ? new Date(payload.syncedAt) : new Date();
      const formatted = Number.isNaN(syncedAt.getTime())
        ? "just now"
        : syncedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      announce("Live · " + formatted, true);
      return titles;
    } catch {
      const lastGood = cachedTitles();
      announce("Saved copy · sync unavailable", false);
      return lastGood || getSnapshot();
    }
  }

  function forceSync() {
    return syncNow().then(titles => {
      if (Array.isArray(titles) && typeof window.__showlistApply === "function") {
        window.__showlistApply(titles);
      }
      return titles;
    });
  }

  function connectSheet() {
    const current = localStorage.getItem(FEED_STORAGE_KEY) || "";
    const value = window.prompt("Paste the Apps Script web app URL ending in /exec.");
    if (value === null) return;
    const cleaned = value.trim();
    if (!isEndpoint(cleaned)) {
      window.alert("Use the Google Apps Script deployment URL ending in /macros/s/.../exec.");
      return;
    }
    localStorage.setItem(FEED_STORAGE_KEY, cleaned);
    feedUrlPromise = Promise.resolve(cleaned);
    forceSync();
  }

  function styleAndMountControls() {
    if (!document.getElementById("sheet-sync-style")) {
      const style = document.createElement("style");
      style.id = "sheet-sync-style";
      style.textContent = `
        .sheet-sync-controls { display:inline-flex; align-items:center; gap:10px; flex-wrap:wrap; }
        #sheet-sync-status[data-live="true"] { color:#c4ed9e; }
        #sheet-sync-status[data-live="false"] { color:#a9b3b5; }
        #sheet-sync-refresh, #sheet-sync-connect {
          border:0; background:transparent; color:#d9dfdd; cursor:pointer;
          font:inherit; text-decoration:underline; text-underline-offset:3px; padding:0;
        }
        #sheet-sync-refresh:hover, #sheet-sync-connect:hover { color:#c4ed9e; }
        #sheet-sync-refresh:disabled { opacity:.6; cursor:wait; }
      `;
      document.head.appendChild(style);
    }

    const results = document.querySelector(".results-line");
    const oldIndicator = results && results.querySelector(".refresh-list");
    if (!results || !oldIndicator) return;

    const controls = document.createElement("span");
    controls.className = "refresh-list sheet-sync-controls";
    controls.innerHTML =
      '<span id="sheet-sync-status" role="status" aria-live="polite">Saved copy</span>' +
      '<button id="sheet-sync-refresh" type="button">Refresh sheet</button>' +
      '<button id="sheet-sync-connect" type="button">Connect sheet</button>';

    oldIndicator.replaceWith(controls);
    document.getElementById("sheet-sync-refresh").addEventListener("click", event => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "Refreshing…";
      forceSync().finally(() => {
        button.disabled = false;
        button.textContent = "Refresh sheet";
      });
    });
    document.getElementById("sheet-sync-connect").addEventListener("click", connectSheet);
    if (window.__showlistSyncStatus) {
      announce(window.__showlistSyncStatus.text, window.__showlistSyncStatus.live);
    }
  }

  window.__showlistSync = syncNow;
  window.__showlistForceSync = forceSync;
  const observer = new MutationObserver(styleAndMountControls);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  styleAndMountControls();

  window.setInterval(() => {
    forceSync();
  }, 60000);
})();
