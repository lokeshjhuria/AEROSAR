# AEROSAR

AI Emergency Response & Search And Rescue command dashboard.

## Run locally

Requires Node.js 18 or newer.

```powershell
npm run dev
```

Open http://localhost:8000. Use `?demo=true` to run the isolated simulation data source.

## Supabase configuration

Copy `.env.example` to `.env` and provide values through your local environment. Do not commit `.env` or real credentials.

```powershell
$env:SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_ANON_KEY="your-anon-key"
$env:SUPABASE_DASHBOARD_ENDPOINT="https://your-project.supabase.co/rest/v1/aerosar_dashboard"
$env:SUPABASE_REPORTS_ENDPOINT="https://your-project.supabase.co/rest/v1/sos_rescue_reports"
npm run dev
```

The server reads `.env` automatically. `SUPABASE_DASHBOARD_ENDPOINT` should point to a Supabase REST table or view that returns one dashboard JSON record with the fields consumed by `app.js` (`missionName`, `detections`, `tasks`, and telemetry fields). The SOS report endpoint must expose a `mission_id` column. Enable Row Level Security policies appropriate for the anon key, or use a server-side protected integration for private data. Authentication uses `/api/auth/sign-in` and Supabase password authentication.

## Project files

- `index.html`: command dashboard
- `auth.html`: operator sign-in page
- `app.js`: dashboard data binding and interactions
- `server.js`: static server and API proxy routes
- `demo-data.js`: isolated demo/simulation data
- `.env.example`: environment variable template
