(() => {
  "use strict";

  const CACHE_KEY = "showlist.lastKnownGood.v2";
  const FEED_URL = new URL("/show-list/watchlist.json", window.location.origin);
  const FORCE_SYNC_URL = "https://github.com/cman18/show-list/actions/workflows/notion-watchlist-sync.yml";

  function getSnapshot() {
    return Array.isArray(window.__showlistInitial) ? window.__showlistInitial : [];
  }

  function cachedState() {
    try {
      const value = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (Array.isArray(value)) return { titles: value, syncedAt: "" };
      if (value && Array.isArray(value.titles)) return value;
    } catch {
      // Ignore malformed browser storage and use the embedded catalog.
    }
    return null;
  }

  function stableKey(title) {
    return [title.title, title.type, title.year]
      .map(value => String(value || "").trim().toLowerCase())
      .join("|");
  }

  function normalizeTitles(titles) {
    const snapshot = getSnapshot();
    const byId = new Map(snapshot.map(title => [String(title.id), title]));
    const byName = new Map(snapshot.map(title => [stableKey(title), title]));
    const seen = new Set();

    return titles
      .filter(item => item && typeof item.title === "string" && item.title.trim())
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
          genres: Array.isArray(item.genres) && item.genres.length
            ? item.genres
            : (existing.genres || []),
          providers: Array.isArray(item.providers)
            ? item.providers
            : (existing.providers || []),
        };
        const key = merged.id || stableKey(merged);
        if (seen.has(key)) return null;
        seen.add(key);
        return merged;
      })
      .filter(Boolean);
  }

  function formatTime(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "";
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function announce(status, isLive) {
    window.__showlistSyncStatus = { text: status, live: isLive };
    const statusEl = document.getElementById("notion-sync-status");
    if (statusEl) {
      statusEl.textContent = status;
      statusEl.dataset.live = isLive ? "true" : "false";
    }
  }

  async function syncNow() {
    try {
      const url = new URL(FEED_URL);
      url.searchParams.set("_", String(Date.now()));
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error("Snapshot fetch failed.");
      const payload = await response.json();
      if (!payload || payload.ok !== true || !Array.isArray(payload.titles) || !payload.titles.length) {
        throw new Error("Invalid or empty Notion snapshot.");
      }

      const titles = normalizeTitles(payload.titles);
      const state = { titles, syncedAt: payload.syncedAt || "" };
      localStorage.setItem(CACHE_KEY, JSON.stringify(state));
      const formatted = formatTime(state.syncedAt);
      announce(formatted ? "Notion snapshot · updated " + formatted : "Notion snapshot loaded", true);
      return titles;
    } catch {
      const lastGood = cachedState();
      const titles = lastGood?.titles || getSnapshot();
      const formatted = formatTime(lastGood?.syncedAt);
      announce(
        formatted ? "Saved copy · snapshot from " + formatted : "Saved copy · snapshot unavailable",
        false,
      );
      return titles;
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

  function styleAndMountControls() {
    if (!document.getElementById("notion-sync-style")) {
      const style = document.createElement("style");
      style.id = "notion-sync-style";
      style.textContent = `
        .notion-sync-controls { display:inline-flex; align-items:center; gap:10px; flex-wrap:wrap; }
        #notion-sync-status[data-live="true"] { color:#c4ed9e; }
        #notion-sync-status[data-live="false"] { color:#a9b3b5; }
        #notion-sync-refresh, #notion-sync-force {
          border:0; background:transparent; color:#d9dfdd; cursor:pointer;
          font:inherit; text-decoration:underline; text-underline-offset:3px; padding:0;
        }
        #notion-sync-refresh:hover, #notion-sync-force:hover { color:#c4ed9e; }
        #notion-sync-refresh:disabled { opacity:.6; cursor:wait; }
      `;
      document.head.appendChild(style);
    }

    const results = document.querySelector(".results-line");
    const oldIndicator = results && results.querySelector(".refresh-list");
    if (!results || !oldIndicator || oldIndicator.classList.contains("notion-sync-controls")) return;

    const controls = document.createElement("span");
    controls.className = "refresh-list notion-sync-controls";
    controls.innerHTML =
      '<span id="notion-sync-status" role="status" aria-live="polite">Saved copy</span>' +
      '<button id="notion-sync-refresh" type="button">Refresh</button>' +
      '<a id="notion-sync-force" href="' + FORCE_SYNC_URL + '" target="_blank" rel="noopener noreferrer">Force sync</a>';

    oldIndicator.replaceWith(controls);
    document.getElementById("notion-sync-refresh").addEventListener("click", event => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "Refreshing…";
      forceSync().finally(() => {
        button.disabled = false;
        button.textContent = "Refresh";
      });
    });
    if (window.__showlistSyncStatus) {
      announce(window.__showlistSyncStatus.text, window.__showlistSyncStatus.live);
    }
  }

  window.__showlistSync = syncNow;
  window.__showlistForceSync = forceSync;
  const observer = new MutationObserver(styleAndMountControls);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  styleAndMountControls();

  if (document.readyState === "complete") {
    forceSync();
  } else {
    window.addEventListener("load", forceSync, { once: true });
  }

  window.setInterval(() => {
    forceSync();
  }, 60000);
})();
