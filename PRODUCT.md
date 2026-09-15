# Show List
<!-- impeccable:product-schema 1 -->
## Platform
web
## Stack
delegated: React/Vinext with server-side routes, selected for a working dashboard and secure Google Sheets integration.
## Users
The user maintains a personal show/movie watchlist and wants a quick way to choose what to watch.
## Product Purpose
Browse the existing Show List Google Sheet, find titles with US subscription/free/ad-supported streaming, and add titles or update watched status from the dashboard.
## Operating Context
Google Sheets is the source of truth. Title and optional network/service are the manual entry fields. Existing original Sheet1 must remain unchanged. Availability is checked through TMDB/JustWatch; only unavailable matched titles are automatically rechecked every 15 days.
## Capabilities and Constraints
Search, filter by service/type/watch status/availability, inspect a title, add a title, edit watched status. Real data includes 210 titles and normalized Availability records. Rental/purchase-only providers are excluded. Display exact user-requested text No Steam Currently for confirmed non-streaming titles; unresolved matches are distinct. Stable record IDs and separate verified data are required. Credentials must stay server-side. A runtime Google Sheets credential/bridge is not yet configured and must be clearly distinguished from the chat's connected Drive.
## Brand Commitments
Name: Show List. Clear concise text, obvious actions and questions. The user approved working-page-first design and delegated technology choices.
## Evidence on Hand
Connected Google Sheet and existing TMDB metadata in parent workspace. No poster artwork yet. Do not invent ratings or streaming providers.
## Product Principles
Keep choosing something to watch quick. Preserve the sheet as the master database. Represent unknown availability honestly. Keep manual input minimal.
