# Build Plan

Work through these steps in order, in Cursor **Agent mode**. Each step has a prompt you can paste. After each step: run it, check it works, then commit.

## How to use this plan

1. Put `PROJECT.md`, `docs/`, `.cursor/rules/project.mdc`, `docker-compose.yml`, and `.env.example` in an empty folder and open it in Cursor. Run `git init` and make a first commit.
2. Start a **new chat** for each step so the context stays small. Every prompt below tells the AI which files to read.
3. Review the diff before accepting. Reject anything beyond what you asked for.
4. If something breaks, paste the exact terminal or browser console error into chat and say what you expected.
5. Commit after each working step.

---

## Step 1: Scaffold backend, frontend, and database

**Check when done:** `docker compose up -d` starts Postgres, `GET http://localhost:8000/api/health` returns ok, and `http://localhost:5173` shows the starter page.

```
Read @PROJECT.md and @.cursor/rules/project.mdc.

Scaffold the project structure described in PROJECT.md section 5:
- backend/: FastAPI app with app/main.py, config.py (pydantic-settings reading from the root .env), db.py (SQLAlchemy 2.0 engine and session dependency), and a GET /api/health endpoint. Add requirements.txt, Ruff config, and a pytest setup with one health test. Set up Alembic configured to use the DATABASE_URL.
- frontend/: Vite + React + TypeScript, Tailwind CSS, React Router, TanStack Query. Configure the Vite dev proxy so /api goes to http://localhost:8000. Show a simple placeholder home page.
- Add a .gitignore covering .env, .venv, node_modules, uploads/, __pycache__.

Do not implement any features yet. When finished, give me the exact commands to run everything and what I should see.
```

## Step 2: Database models and first migration

**Check when done:** `alembic upgrade head` creates all tables in Postgres; you can see them in a DB client.

```
Read @docs/DATA_MODEL.md and @PROJECT.md.

Implement the SQLAlchemy 2.0 models for users, documents, applications, and status_history exactly as described in docs/DATA_MODEL.md, including enums, foreign keys with the specified ON DELETE behaviour, unique constraint, and indexes. Generate the Alembic migration, review it, and apply it. Add a small test that creates a user, an application, and a status_history row.

Do not build endpoints yet.
```

## Step 3: Authentication backend

**Check when done:** register, login, `/auth/me`, and logout work in Swagger UI (`/docs`) and the cookie is httpOnly.

```
Read @docs/API.md (Auth section), @PROJECT.md section 3.1 and 7.

Implement authentication in the backend:
- argon2 password hashing (pwdlib), JWT in an httpOnly SameSite=Lax cookie named access_token (Secure controlled by COOKIE_SECURE env var).
- Routers: POST /api/auth/register, /login, /logout, GET /api/auth/me.
- A get_current_user dependency used by all protected routes.
- Basic rate limiting on login and register.
- CORS allowing the frontend origin with credentials.
- pytest tests: register, duplicate email, wrong password, me with and without cookie, logout.

Follow the project rules. Keep logic in services/security.py.
```

## Step 4: Authentication frontend

**Check when done:** you can register, log in, refresh the page and stay logged in, and log out. Protected routes redirect to login.

```
Read @docs/API.md (Auth section), @PROJECT.md section 8, and @.cursor/rules/project.mdc.

Build the frontend auth flow:
- src/api/ fetch client with credentials: "include" and typed auth functions.
- LoginPage and RegisterPage using react-hook-form + zod with field-level errors.
- An auth context or TanStack Query hook using GET /api/auth/me to know who is logged in.
- A ProtectedRoute wrapper that redirects to /login.
- An app layout with a top nav showing the user's name and a logout button.
- Clean, minimal Tailwind styling with loading and error states.
```

## Step 5: Documents backend (upload resumes and cover letters)

**Check when done:** you can upload a PDF via Swagger, list it, download it, rename it, delete it; a different user cannot access it.

```
Read @docs/API.md (Documents section), @docs/DATA_MODEL.md, and @PROJECT.md sections 3.4 and 7.

Implement the documents backend:
- services/storage.py: a storage interface with a local-disk implementation writing to UPLOAD_DIR using random UUID keys. Design it so an S3 implementation could be added later.
- Router with GET /documents (with kind filter and used_by_count), POST /documents (multipart), PATCH /documents/{id}, GET /documents/{id}/download, DELETE /documents/{id}.
- Validate PDF or DOCX by extension, MIME type, and magic bytes. Max 5 MB (MAX_UPLOAD_MB).
- Owner-only access, 404 for other users' documents.
- Deleting removes the file and record; applications referencing it get their link set to null.
- pytest tests including ownership, bad file type, and too-large file.
```

## Step 6: Documents frontend

**Check when done:** the /documents page lets you upload, label, rename, download, and delete; deleting a used document asks for confirmation.

```
Read @docs/API.md (Documents section) and @.cursor/rules/project.mdc.

Build the /documents page:
- Two sections or tabs: Resumes and Cover letters.
- Upload form with file picker (PDF/DOCX, 5 MB limit validated client-side too), kind, and label.
- List with label, filename, size, date, "used by N applications", and actions: rename, download, delete.
- Confirm dialog before delete; if used_by_count > 0 mention the applications will lose this link.
- Loading, empty, and error states. Use TanStack Query and invalidate after mutations.
```

## Step 7: Scraper service

**Check when done:** `pytest` passes the scraper tests; `POST /api/scrape/preview` returns sensible data for a real job URL that has JSON-LD, and a friendly partial/failed result for sites that block bots.

```
Read @PROJECT.md section 6 and @docs/API.md (Scrape section).

Implement the scraper:
- services/scraper.py with a pure function parse_job_html(html: str, url: str) -> ScrapedJob (dataclass). Extraction order: JSON-LD JobPosting, then OpenGraph/meta tags, then light heuristics. Convert descriptions to clean plain text.
- A separate fetch function using httpx with: http/https only, SSRF protection (resolve host and block private, loopback, link-local, reserved IPs, also on redirects), max 5 redirects, 10s timeout, 2 MB size cap, descriptive User-Agent.
- URL normalisation that strips utm_* and other tracking params and fragments.
- POST /api/scrape/preview that returns the result in the format in docs/API.md, including existing_application_id if the normalised URL is already saved by the current user.
- Never try to bypass logins, CAPTCHAs, or bot protection; return scrape_status "partial" or "failed" with a friendly message.
- Tests using saved HTML fixtures in backend/tests/fixtures/ (no live network calls): one with JSON-LD, one with only OpenGraph, one empty page, plus SSRF and URL normalisation tests.
```

## Step 8: Applications backend

**Check when done:** create, list with filters, update status, view history, delete, and stats all work in Swagger and tests pass.

```
Read @docs/API.md (Applications section), @docs/DATA_MODEL.md, and @PROJECT.md section 3.2, 3.3, 3.5.

Implement the applications endpoints:
- POST creates with status "applied", normalises the URL, rejects duplicates with 409 and existing_application_id, validates resume_id (kind resume) and cover_letter_id (kind cover_letter) belong to the user, and writes the first status_history row.
- GET list with q, status filters, sort, limit, offset, returning items and total; GET detail with status_history; PATCH with automatic status_history on status change; DELETE; GET /applications/stats.
- All queries scoped to the current user.
- pytest tests for each endpoint including ownership, duplicates, invalid document links, and status history.
```

## Step 9: Applications frontend

**Check when done:** you can paste a URL, see prefilled fields, pick resume and cover letter, save, change status from the list, and open the detail page.

```
Read @docs/API.md, @PROJECT.md sections 3.2, 3.3, 3.5, and 8, and @.cursor/rules/project.mdc.

Build the applications UI:
1. Applications list page (/):
   - Status summary counts at the top (from /applications/stats).
   - Search box, status filter, sort select.
   - Table (cards on mobile) with company, title, status dropdown (inline update), applied date, resume, cover letter, source.
   - "Add application" button.
2. Add application flow (modal or page):
   - URL input + "Fetch details" calling /scrape/preview.
   - Editable form prefilled with the result; show the friendly message when scrape is partial or failed; show a warning with a link if existing_application_id is set.
   - Dropdowns for resume and cover letter loaded from /documents (with a "None" option and a link to upload new ones), applied date defaulting to today.
   - Save calls POST /applications, then goes to the list or detail.
3. Detail page (/applications/:id): editable fields, notes, status dropdown with optional note, resume and cover letter dropdowns, status history timeline, link to original job posting, delete with confirmation.

Use react-hook-form + zod, TanStack Query, loading/empty/error states, and keep API calls in src/api/.
```

## Step 10: Polish and hardening

```
Review the whole project against @PROJECT.md (section 7 security and section 12 definition of done) and @.cursor/rules/project.mdc. List any gaps first, then fix them in small steps:
- Accessibility pass (labels, focus states, keyboard navigation, colour contrast).
- Responsive layout check at mobile, tablet, desktop widths.
- Confirm every endpoint enforces auth and ownership.
- Confirm no secrets or tokens are logged or stored in localStorage.
- Make sure docs/API.md and docs/DATA_MODEL.md match the code.
- Add a README.md with setup and run instructions.
Do not add new features.
```

## Step 11: Deploy (optional, after MVP works)

```
Read @PROJECT.md section 11. Prepare the app for deployment: production Dockerfiles for backend and frontend (or a static frontend build), environment variable documentation, COOKIE_SECURE=true and correct CORS for production, and a managed Postgres connection. Suggest a simple hosting setup (e.g. Vercel/Netlify for the frontend, Render/Fly.io for the backend) with step-by-step instructions. Do not change application logic.
```

---

## Useful prompts when things go wrong

**Error in the terminal or browser**
```
I got this error when doing <what you did>:
<paste full error>
Expected: <what should have happened>. Find the root cause in @<file>, explain it in one or two sentences, then fix it with the smallest change.
```

**AI went off-track**
```
Stop. Revert to the plan. You changed files outside the scope of this step. Only modify what is needed for: <step>. List which files you will touch before editing.
```

**Before moving on**
```
Summarise what changed in this step, list how I can verify it manually, and suggest a commit message.
```
