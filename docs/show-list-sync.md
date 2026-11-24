# Show List data synchronization

Notion is the official source of truth for the Show List. The private Notion database is queried by a scheduled GitHub Actions workflow, which publishes a small public JSON snapshot to the GitHub Pages branch. The website loads that snapshot when opened, refreshes it every 60 seconds while open, and keeps the last known good copy in browser storage if the snapshot is unavailable.

## Data flow

1. Add, edit, or archive a title in the private Notion **Show List** database.
2. GitHub Actions runs `.github/workflows/notion-watchlist-sync.yml` every five minutes and queries the Notion data source.
3. The workflow writes only the fields used by the public site to `gh-pages/watchlist.json`. It commits and triggers a Pages update only when the list changes.
4. The site fetches `watchlist.json` without browser caching. It merges those entries with the embedded catalog so artwork, descriptions, and genres remain available.

The feed contains website-facing title, type, year, status, service, notes, release dates, availability, and provider fields. It does not expose the Notion API token or provide write access. The Notion database itself stays private.

## One-time setup

The Notion data source ID is already configured in the workflow. To allow GitHub Actions to read the private database:

1. In Notion, create an internal integration with **read content** capability only.
2. Share the **Show List** database with that integration using the database's connections menu.
3. In GitHub, open **cman18/show-list → Settings → Secrets and variables → Actions**.
4. Select **New repository secret**. Name it `NOTION_API_TOKEN`, paste the integration secret as its value, and save it. Do not put the secret in source files or chat.
5. Open **Actions → Sync Notion Show List → Run workflow** to perform the first sync.

If the Notion integration is not shared with the database, the workflow will fail with an access error. If the GitHub secret is missing, it will fail before publishing. The existing published snapshot stays in place.

## Updating the list

You can add, change, or remove titles directly in the Notion database, or ask ChatGPT to make the change through its connected Notion integration. New rows without a Position appear first; existing rows retain their explicit Position ordering. Duplicate title/type/year entries are ignored. Blank statuses are shown as **Want to Watch** on the website.

Automatic changes usually appear after the next five-minute workflow run, plus GitHub Actions and Pages processing time. An open page checks for a newly published snapshot once a minute. The **Refresh** button reloads the current public snapshot; **Force sync** opens the GitHub Actions workflow page, where an authorized repository user can select **Run workflow**. This trigger is authenticated by GitHub and does not expose any credential on the public site.

## Failure recovery and troubleshooting

- The browser uses the last known good snapshot from local storage when a fetch fails. If none is cached, it falls back to the embedded catalog and labels the status **Saved copy**.
- A failed Notion query or empty database never replaces the published snapshot.
- If the page shows **Saved copy**, check the latest run under **GitHub → Actions → Sync Notion Show List**. Common causes are a missing `NOTION_API_TOKEN`, an integration not connected to the database, or missing read-content access.
- The version badge at the top right links to the Pages deployment history. Routine Notion edits do not require source commits or manual website builds.
- Google Sheets remains an optional backup during the transition. It is no longer read by the website sync.

## Manual synchronization

1. Open the repository's **Actions** tab.
2. Choose **Sync Notion Show List**.
3. Select **Run workflow**, then run it on `main`.
4. Wait for the run to complete and for GitHub Pages to publish. Refresh the website after it finishes.

