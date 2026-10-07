# Job Application Tracker

Track job applications from paste-URL to offer. The app scrapes public job details when it can, links each application to the resume and cover letter you used, and records status history as roles move through the pipeline.

## Stack

- **Frontend:** React 18, TypeScript, Vite, React Router, TanStack Query, Tailwind CSS
- **Backend:** FastAPI, SQLAlchemy 2, Alembic, PostgreSQL 16
- **Auth:** JWT in an httpOnly cookie; argon2 password hashing

## Prerequisites

- Docker (for Postgres)
- Python 3.12+
- Node.js 20+

## Setup

```bash
# 1. Environment
cp .env.example .env
# Edit SECRET_KEY in .env before any real use

# 2. Database
docker compose up -d

# 3. Backend
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# 4. Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) for the landing page.

Main routes after setup:

| Path | Purpose |
|---|---|
| `/` | Landing page |
| `/login`, `/register` | Auth |
| `/forgot-password`, `/reset-password` | Password reset |
| `/applications`, `/applications/:id` | Application list and detail |
| `/documents` | Resumes and cover letters |
| `/profile` | Update name/password or delete account |

API docs: [http://localhost:8000/docs](http://localhost:8000/docs). Health check: [http://localhost:8000/api/health](http://localhost:8000/api/health).

Password reset works without email in local/dev when `EXPOSE_DEV_RESET_LINK=true` (the forgot-password response includes a one-time link). Turn that flag off in production and wire a real mailer later.

## Verify

```bash
# Backend tests
cd backend && source .venv/bin/activate && pytest

# Frontend production build
cd frontend && npm run build
```

## Project docs

| Doc | Purpose |
|---|---|
| [PROJECT.md](PROJECT.md) | Product goals, stack, security, definition of done |
| [docs/API.md](docs/API.md) | REST endpoints and payloads |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Tables, enums, relationships |
| [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) | Ordered build steps |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Production Docker and hosting |
| [.cursor/rules/project.mdc](.cursor/rules/project.mdc) | Coding conventions for the AI |

## Production / deploy

See **[docs/DEPLOY.md](docs/DEPLOY.md)** for:

- Production Dockerfiles (`backend/Dockerfile`, `frontend/Dockerfile`)
- Environment variable checklist (`COOKIE_SECURE`, `COOKIE_SAMESITE`, `CORS_ORIGINS`, managed Postgres)
- Step-by-step hosting (Vercel/Netlify frontend + Render/Fly.io backend)

Optional local production-like stack:

```bash
export SECRET_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(64))')"
export POSTGRES_PASSWORD=choose-a-strong-password
docker compose -f docker-compose.prod.yml up --build
```

## Security notes

- Never commit `.env`, `uploads/`, `.venv/`, or `node_modules/`
- Set a strong `SECRET_KEY` and use `COOKIE_SECURE=true` behind HTTPS in production
- For a frontend on a different origin than the API, set `COOKIE_SAMESITE=none` and build the frontend with `VITE_API_BASE_URL`
- Tokens stay in the httpOnly cookie — not in `localStorage`
