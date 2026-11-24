const CONFIG = {
  spreadsheetId: "1QHdc7GR5HxY3rJuOvsYe0Bf7b5TZcxXzeW8YuXub5qU",
  watchlistTab: "Watchlist",
  availabilityTab: "Availability",
};

function doGet(e) {
  const callback = String((e && e.parameter && e.parameter.callback) || "");
  if (!/^__showListCallback_[A-Za-z0-9_]+$/.test(callback)) {
    return ContentService.createTextOutput("A valid JSONP callback is required.")
      .setMimeType(ContentService.MimeType.TEXT);
  }

  try {
    const spreadsheet = SpreadsheetApp.openById(CONFIG.spreadsheetId);
    const watchlist = readTable_(spreadsheet, CONFIG.watchlistTab);
    const availability = readTable_(spreadsheet, CONFIG.availabilityTab);
    const providersByRecord = new Map();

    for (const row of availability.rows) {
      if (value_(row, availability.columns, "region").toUpperCase() !== "US") continue;
      const accessType = value_(row, availability.columns, "access_type").toLowerCase();
      if (!["flatrate", "free", "ads"].includes(accessType)) continue;
      const recordId = value_(row, availability.columns, "record_id");
      if (!recordId) continue;
      const providers = providersByRecord.get(recordId) || [];
      providers.push({
        provider_id: Number(value_(row, availability.columns, "provider_id")) || 0,
        provider_name: value_(row, availability.columns, "provider_name"),
        access_type: accessType,
      });
      providersByRecord.set(recordId, providers);
    }

    const titles = [];
    const seen = new Set();
    for (const row of watchlist.rows) {
      const title = value_(row, watchlist.columns, "Title").trim();
      if (!title) continue;
      const type = value_(row, watchlist.columns, "Type").trim();
      const year = value_(row, watchlist.columns, "Year").trim();
      const recordId = value_(row, watchlist.columns, "record_id").trim();
      const dedupeKey = recordId || [title, type, year].join("|").toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const serviceHint = value_(row, watchlist.columns, "Network / Service (optional)").trim();
      const providers = providersByRecord.get(recordId) || (serviceHint ? [{
        provider_id: 0,
        provider_name: serviceHint,
        access_type: "flatrate",
      }] : []);

      titles.push({
        id: recordId || "legacy:" + dedupeKey,
        title,
        serviceHint,
        type,
        year,
        status: value_(row, watchlist.columns, "Status").trim() || "Want to Watch",
        notes: value_(row, watchlist.columns, "Notes"),
        availability: value_(row, watchlist.columns, "availability_status").trim() || "needs_review",
        matchStatus: value_(row, watchlist.columns, "match_status").trim() || "needs_review",
        checkedAt: value_(row, watchlist.columns, "checked_at"),
        sourceUrl: value_(row, watchlist.columns, "provider_source_url") || value_(row, watchlist.columns, "Source / Link"),
        downloadableHint: value_(row, watchlist.columns, "downloadable_hint"),
        firstReleaseDate: value_(row, watchlist.columns, "first_release_date"),
        nextReleaseDate: value_(row, watchlist.columns, "next_episode_date"),
        lastReleaseDate: value_(row, watchlist.columns, "last_episode_date"),
        poster: null,
        overview: "",
        genres: [],
        providers,
      });
    }

    return jsonp_(callback, {
      ok: true,
      syncedAt: new Date().toISOString(),
      titles,
    });
  } catch (error) {
    return jsonp_(callback, {
      ok: false,
      error: error && error.message ? error.message : "read_failed",
    });
  }
}

function readTable_(spreadsheet, tabName) {
  const sheet = spreadsheet.getSheetByName(tabName);
  if (!sheet) throw new Error("Missing sheet tab: " + tabName);
  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length) return { columns: {}, rows: [] };
  const columns = {};
  values[0].forEach((header, index) => { columns[String(header).trim()] = index; });
  return { columns, rows: values.slice(1) };
}

function value_(row, columns, name) {
  const index = columns[name];
  return index === undefined ? "" : String(row[index] || "");
}

function jsonp_(callback, value) {
  const json = JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return ContentService.createTextOutput(callback + "(" + json + ");")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
