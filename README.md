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

For registration and sign-in, `SUPABASE_URL` and `SUPABASE_ANON_KEY` are required. Get both from Supabase under **Project Settings / API**. The anon key is intended for browser-facing authentication; never put a service-role key in this file.

```powershell
$env:SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_ANON_KEY="your-anon-key"
$env:SUPABASE_DASHBOARD_ENDPOINT="https://your-project.supabase.co/rest/v1/aerosar_dashboard"
$env:SUPABASE_REPORTS_ENDPOINT="https://your-project.supabase.co/rest/v1/sos_rescue_reports"
$env:SUPABASE_ACTIONS_ENDPOINT="https://your-project.supabase.co/rest/v1/mission_actions"
npm run dev
```

The server reads `.env` automatically. `SUPABASE_DASHBOARD_ENDPOINT` should point to a Supabase REST table or view that returns one dashboard JSON record with the fields consumed by `app.js` (`missionName`, `detections`, `tasks`, and telemetry fields). The SOS report endpoint must expose a `mission_id` column. `SUPABASE_ACTIONS_ENDPOINT` should point to the `mission_actions` table created by `supabase-schema.sql`. Enable Row Level Security policies appropriate for the anon key, or use a server-side protected integration for private data. Authentication uses `/api/auth/sign-in` and Supabase password authentication; saved mission actions are associated with the authenticated Supabase user.

## Deploy to Vercel

The repository includes one native Vercel Function per API route under `api/` and requires Node.js 18 or newer. Add the same `SUPABASE_*` variables in Vercel under **Project Settings / Environment Variables**, then redeploy. Do not upload `.env` or commit Supabase keys. After deployment, check `/api/health`; it should return JSON with `ok: true` and all four Supabase flags set to `true`.

Production dashboard data refreshes from Supabase every 10 seconds. This is intentional: Vercel Functions do not provide a persistent WebSocket process. For higher-frequency telemetry, move the realtime socket to a dedicated WebSocket service or use Supabase Realtime with an authenticated browser client.

## Project files

- `index.html`: command dashboard
- `auth.html`: operator sign-in page
- `app.js`: dashboard data binding and interactions
- `server.js`: static server and API proxy routes
- `demo-data.js`: isolated demo/simulation data
- `.env.example`: environment variable template
