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
$env:SUPABASE_REPORTS_ENDPOINT="https://your-project.supabase.co/rest/v1/sos_rescue_reports"
npm run dev
```

The dashboard requests production data from `/api/dashboard`. The SOS report action requests `/api/reports/sos` and reads the report record from the configured Supabase endpoint. Authentication uses `/api/auth/sign-in` and Supabase password authentication.

## Project files

- `index.html`: command dashboard
- `auth.html`: operator sign-in page
- `app.js`: dashboard data binding and interactions
- `server.js`: static server and API proxy routes
- `demo-data.js`: isolated demo/simulation data
- `.env.example`: environment variable template
