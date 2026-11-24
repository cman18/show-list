import { readFile, writeFile } from "node:fs/promises";
import { dirname, } from "node:path";
import { mkdir } from "node:fs/promises";

const API_VERSION = "2026-03-11";
const TOKEN = process.env.NOTION_API_TOKEN;
const DATA_SOURCE_ID = process.env.NOTION_DATA_SOURCE_ID;
const OUTPUT_PATH = process.env.OUTPUT_PATH || "watchlist.json";

if (!TOKEN || !DATA_SOURCE_ID) {
  throw new Error("NOTION_API_TOKEN and NOTION_DATA_SOURCE_ID are required.");
}

async function queryAllPages() {
  const pages = [];
  let startCursor;

  do {
    const response = await fetch(
      `https://api.notion.com/v1/data_sources/${encodeURIComponent(DATA_SOURCE_ID)}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Notion-Version": API_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          page_size: 100,
          ...(startCursor ? { start_cursor: startCursor } : {}),
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Notion query failed (${response.status}): ${detail}`);
    }

    const payload = await response.json();
    pages.push(...(payload.results || []));
    startCursor = payload.has_more ? payload.next_cursor : undefined;
  } while (startCursor);

  return pages;
}

function textProperty(property) {
  if (!property) return "";
  const values = property.title || property.rich_text;
  if (Array.isArray(values)) return values.map((part) => part.plain_text || "").join("");
  if (property.type === "url") return property.url || "";
  if (property.type === "select") return property.select?.name || "";
  if (property.type === "number") return property.number == null ? "" : String(property.number);
  return "";
}

function dateProperty(property) {
  return property?.date?.start || "";
}

function accessType(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("rent") || normalized.includes("buy")) return "rent";
  if (normalized.includes("ad")) return "ads";
  if (normalized.includes("free")) return "free";
  return "flatrate";
}

function makeProviders(properties) {
  const names = textProperty(properties["Where to Watch (verified)"])
    .split(";")
    .map((name) => name.trim())
    .filter(Boolean);
  const access = textProperty(properties["Access (verified)"])
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean);
  const serviceHint = textProperty(properties["Network / Service (optional)"]);
  const providers = (names.length ? names : (serviceHint ? [serviceHint] : []))
    .map((name, index) => ({
      provider_id: 0,
      provider_name: name,
      access_type: accessType(access[index] || access[0] || "Included"),
    }));
  return providers.length ? providers : undefined;
}

function normalizePage(page) {
  if (page.archived || page.in_trash) return null;
  const p = page.properties || {};
  const title = textProperty(p.Title).trim();
  if (!title) return null;

  const id = textProperty(p.record_id).trim() || `notion:${page.id}`;
  const type = textProperty(p.Type);
  const year = p.Year?.number ?? "";
  const serviceHint = textProperty(p["Network / Service (optional)"]);
  const sourceUrl = textProperty(p.provider_source_url) || textProperty(p["Source / Link"]);
  const status = textProperty(p.Status) || "Want to Watch";
  const position = p.Position?.number;
  const result = {
    id,
    title,
    type,
    year,
    serviceHint,
    status,
    notes: textProperty(p.Notes),
    availability: textProperty(p.availability_status) || "needs_review",
    matchStatus: textProperty(p.match_status) || "needs_review",
    checkedAt: dateProperty(p.checked_at),
    sourceUrl,
    firstReleaseDate: dateProperty(p.first_release_date),
    nextReleaseDate: dateProperty(p.next_episode_date),
    lastReleaseDate: dateProperty(p.last_episode_date),
    position: typeof position === "number" ? position : null,
    createdAt: page.created_time || "",
  };

  const providers = makeProviders(p);
  if (providers) result.providers = providers;

  return result;
}

function sortEntries(entries) {
  return entries.sort((a, b) => {
    if (a.position == null && b.position != null) return -1;
    if (a.position != null && b.position == null) return 1;
    if (a.position != null && b.position != null && a.position !== b.position) {
      return a.position - b.position;
    }
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
}

function publicTitle(entry) {
  const { position, createdAt, ...publicFields } = entry;
  return publicFields;
}

const pages = await queryAllPages();
const ids = new Set();
const identities = new Set();
const entries = [];

for (const page of pages) {
  const entry = normalizePage(page);
  if (!entry) continue;
  const identity = [entry.title, entry.type, entry.year]
    .map((value) => String(value || "").trim().toLowerCase())
    .join("|");
  if (ids.has(entry.id) || identities.has(identity)) continue;
  ids.add(entry.id);
  identities.add(identity);
  entries.push(entry);
}

const titles = sortEntries(entries).map(publicTitle);
if (titles.length === 0) {
  throw new Error("Notion returned no titles; refusing to replace the website snapshot with an empty list.");
}

let previous = null;
try {
  previous = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
} catch {
  // First sync creates the file.
}

const unchanged =
  previous?.ok === true &&
  JSON.stringify(previous.titles) === JSON.stringify(titles);

const output = {
  ok: true,
  syncedAt: unchanged && previous.syncedAt ? previous.syncedAt : new Date().toISOString(),
  titles,
};

await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");

console.log(
  unchanged
    ? `No list changes; retained existing snapshot (${titles.length} titles).`
    : `Wrote updated snapshot with ${titles.length} titles.`,
);
