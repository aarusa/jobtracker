# Deployment

Production prep for the Job Application Tracker: Docker images, environment variables, and a simple split hosting setup (Vercel frontend + Render backend + managed Postgres).

Application behaviour is unchanged; this guide only covers packaging and configuration.

## Recommended architecture

| Piece | Suggested host | Notes |
|---|---|---|
| Frontend (static Vite build) | [Vercel](https://vercel.com) or [Netlify](https://www.netlify.com) | Set `VITE_API_BASE_URL` at build time |
| Backend (FastAPI) | [Render](https://render.com) or [Fly.io](https://fly.io) | Use the `backend/Dockerfile` |
| Database | Managed Postgres (Render Postgres, Neon, Supabase, etc.) | Never use SQLite |
| Uploads | Persistent disk on the API host (MVP) | Or move to S3 later |

Because the session cookie is httpOnly and set by the API origin, **cross-origin** frontends (e.g. `app.vercel.app` → `api.onrender.com`) need:

- `COOKIE_SECURE=true` (HTTPS)
- `COOKIE_SAMESITE=none` (cross-site credentialed requests)
- `CORS_ORIGINS` exactly matching the frontend origin (no trailing slash)
- Frontend built with `VITE_API_BASE_URL=https://your-api-host`

If you reverse-proxy `/api` onto the same origin as the SPA, keep `COOKIE_SAMESITE=lax` and leave `VITE_API_BASE_URL` empty.

## Environment variables

Copy from [`.env.example`](../.env.example). Production checklist:

| Variable | Production value |
|---|---|
| `DATABASE_URL` | Managed Postgres URL using the **psycopg** driver, e.g. `postgresql+psycopg://user:pass@host:5432/db` (convert `postgresql://` → `postgresql+psycopg://`) |
| `SECRET_KEY` | Long random string (`python -c "import secrets; print(secrets.token_urlsafe(64))"`) |
| `COOKIE_SECURE` | `true` |
| `COOKIE_SAMESITE` | `none` for split origins; `lax` for same-origin |
| `CORS_ORIGINS` | Exact frontend origin, e.g. `https://your-app.vercel.app` |
| `FRONTEND_BASE_URL` | Same as the public frontend URL (used in password-reset links) |
| `EXPOSE_DEV_RESET_LINK` | `false` |
| `UPLOAD_DIR` | Writable path on a persistent volume (e.g. `/var/data/uploads`) |
| `VITE_API_BASE_URL` | Absolute API origin for the frontend build (no trailing slash) |

Optional: `ACCESS_TOKEN_EXPIRE_MINUTES`, `REMEMBER_ME_EXPIRE_DAYS`, `MAX_UPLOAD_MB`, scrape limits.

## Docker images

### Backend

```bash
docker build -t jobtracker-api ./backend
docker run --rm -p 8000:8000 \
  -e DATABASE_URL='postgresql+psycopg://...' \
  -e SECRET_KEY='...' \
  -e COOKIE_SECURE=true \
  -e COOKIE_SAMESITE=none \
  -e CORS_ORIGINS='https://your-frontend.example' \
  -e FRONTEND_BASE_URL='https://your-frontend.example' \
  -e EXPOSE_DEV_RESET_LINK=false \
  -e UPLOAD_DIR=/app/uploads \
  -v jobtracker-uploads:/app/uploads \
  jobtracker-api
```

The entrypoint runs `alembic upgrade head`, then starts Uvicorn on `$PORT` (default `8000`).

### Frontend (static via nginx)

```bash
docker build \
  --build-arg VITE_API_BASE_URL=https://your-api.example \
  -t jobtracker-web ./frontend
docker run --rm -p 8080:80 jobtracker-web
```

### Local production-like compose

```bash
export SECRET_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(64))')"
export POSTGRES_PASSWORD=choose-a-strong-password
docker compose -f docker-compose.prod.yml up --build
```

- Frontend: http://localhost:8080  
- API: http://localhost:8000/api/health  

For this local compose stack, cookies are not Secure by default (`COOKIE_SECURE=false`) so HTTP works. Turn Secure on only behind HTTPS.

---

## Step-by-step: Vercel + Render + managed Postgres

### 1. Managed Postgres

1. Create a Postgres 16 database (Render Postgres, Neon, or Supabase).
2. Copy the connection string.
3. Rewrite the scheme for this app:

   ```text
   postgresql://...     →  postgresql+psycopg://...
   postgres://...       →  postgresql+psycopg://...
   ```

4. If the provider requires SSL, keep query params such as `?sslmode=require`.

### 2. Backend on Render

1. New **Web Service** → connect this repo → Docker.
2. Root / Dockerfile path: `backend` / `backend/Dockerfile`.
3. Set env vars from the table above (`COOKIE_SECURE=true`, `COOKIE_SAMESITE=none`, etc.).
4. Attach a **persistent disk** mounted at `/app/uploads` and set `UPLOAD_DIR=/app/uploads`.
5. Deploy. Confirm `https://<your-api>.onrender.com/api/health` returns ok.
6. Note the public API URL for the frontend build.

Render sets `PORT`; the entrypoint already binds to it.

### 3. Frontend on Vercel

1. New project → this repo → **Root Directory** = `frontend`.
2. Build command: `npm run build` (default). Output: `dist`.
3. Environment variable (Production):

   ```text
   VITE_API_BASE_URL=https://<your-api>.onrender.com
   ```

4. Deploy. Note the frontend URL (e.g. `https://jobtracker.vercel.app`).
5. Update the **backend** env:

   ```text
   CORS_ORIGINS=https://jobtracker.vercel.app
   FRONTEND_BASE_URL=https://jobtracker.vercel.app
   ```

6. Redeploy the backend so CORS and reset links match.

### 4. Smoke test

1. Open the Vercel URL → Register → log in (cookie set on the API host).
2. Upload a small PDF under Documents.
3. Add an application (scrape may be partial on bot-blocked sites).
4. Log out and confirm `/api/auth/me` is unauthorized.

### Netlify alternative (frontend)

Same as Vercel: base directory `frontend`, publish `dist`, set `VITE_API_BASE_URL`. Add a redirect for SPA routes if needed:

```toml
# frontend/public/_redirects  (Netlify)
/*    /index.html   200
```

### Fly.io alternative (backend)

```bash
cd backend
fly launch --dockerfile Dockerfile --no-deploy
fly secrets set SECRET_KEY=... DATABASE_URL=postgresql+psycopg://... \
  COOKIE_SECURE=true COOKIE_SAMESITE=none \
  CORS_ORIGINS=https://your-frontend.example \
  FRONTEND_BASE_URL=https://your-frontend.example \
  EXPOSE_DEV_RESET_LINK=false UPLOAD_DIR=/data/uploads
fly volumes create uploads --size 1
# mount /data in fly.toml [[mounts]]
fly deploy
```

---

## Checklist

- [ ] Strong `SECRET_KEY`; never commit `.env`
- [ ] `COOKIE_SECURE=true` behind HTTPS
- [ ] `COOKIE_SAMESITE` matches hosting topology (`none` vs `lax`)
- [ ] `CORS_ORIGINS` matches the real frontend origin
- [ ] `EXPOSE_DEV_RESET_LINK=false`
- [ ] `DATABASE_URL` uses `postgresql+psycopg://`
- [ ] Migrations run on boot (Docker entrypoint) or as a release command
- [ ] Upload directory is on persistent storage
- [ ] Frontend built with the correct `VITE_API_BASE_URL` when origins differ
