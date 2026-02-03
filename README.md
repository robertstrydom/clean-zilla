# Clean Zilla

Clean Zilla marketing site for Azure Static Web Apps.

## Function App environment variables

- `STORAGE_CONNECTION_STRING` (Blob + Table Storage)
- `BLOB_CONTAINER` (optional, default `kleanzilla`)
- `SENDGRID_API_KEY`
- `SENDGRID_FROM`
- `NOTIFY_EMAIL` (optional)
- `MAGIC_LINK_BASE_URL` (optional, default `https://www.kleanzilla.co.za`)
- `MAGIC_LINK_TTL_HOURS` (optional, default `168`)
- `ADMIN_UPLOAD_KEY` (required for admin photo uploads)
- `ADMIN_EMAILS` (comma/semicolon separated list for admin links)
- `ADMIN_LINK_BASE_URL` (optional, admin link host, defaults to `MAGIC_LINK_BASE_URL`)
- `TABLE_CUSTOMERS` / `TABLE_BOOKINGS` / `TABLE_TOKENS` (optional table names)
