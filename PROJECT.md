# Job Application Tracker

A web app for tracking job applications. Paste a job URL, the app pulls out the key details, saves the application as **Applied**, and lets you track it through the hiring process. Keep multiple resumes and cover letters and choose which ones you used for each application.

Related docs (read these before changing the area they cover):
- `docs/DATA_MODEL.md` — tables, columns, enums, relationships
- `docs/API.md` — REST endpoints and payloads
- `docs/BUILD_PLAN.md` — ordered build steps and prompts
- `.cursor/rules/project.mdc` — coding conventions for the AI

---

## 1. Goals and non-goals

**Goals**
- Make adding an application take under 10 seconds: paste URL, review, save.
- Give a clear, current view of every application and its status.
- Keep each application linked to the exact resume and cover letter used.
- Be simple, fast, and safe with personal documents.

**Non-goals (MVP)**
- No automatic job searching or auto-applying.
- No browser extension, email parsing, or calendar integration.
- No multi-user teams or sharing. Every user only sees their own data.
- No bypassing login walls, CAPTCHAs, or bot protection when scraping.

## 2. Users and user stories

Primary user: a job seeker managing many applications at once.

1. As a user, I can register and log in so my data is private.
2. As a user, I can paste a job URL and see the scraped details prefilled so I can confirm or fix them.
3. As a user, I can save the application and it starts with status **Applied**.
4. As a user, I can change an application's status as it progresses and see the history.
5. As a user, I can upload multiple resumes and cover letters and give each a label.
6. As a user, I can pick which resume and cover letter I used for each application from a dropdown.
7. As a user, I can search, filter, and sort my applications.
8. As a user, I can add notes to an application and edit any scraped field.

## 3. MVP features and acceptance criteria

### 3.1 Authentication
- Register with name, email, password. Login with email and password. Logout.
- Passwords are hashed (argon2). Minimum 8 characters.
- Session is a JWT stored in an **httpOnly, SameSite=Lax cookie**. No tokens in localStorage.
- Public endpoints: register, login, forgot-password, reset-password, and health. Everything else requires auth.
- Profile: update name/password; delete account. Email cannot be changed.
- Changing or resetting a password invalidates existing sessions.
- Every query is scoped to the current user. Accessing another user's record returns 404.

### 3.2 Add application from URL
- User pastes a URL into an input and clicks "Fetch details".
- Backend scrapes and returns: title, company, location, work type, employment type, salary text, description, date posted, source domain. Any field may be empty.
- Frontend shows an editable form prefilled with the result, plus resume and cover letter dropdowns and an "applied date" (defaults to today).
- Clicking **Save** creates the application with status `applied`.
- If scraping fails or is partial, the form still works. User fills the rest manually and sees a clear, friendly message about what could not be fetched.
- If the same URL (normalised) is already saved for that user, show a warning with a link to the existing application instead of creating a duplicate.

### 3.3 Status tracking
- Statuses: `applied`, `screening`, `interviewing`, `offer`, `accepted`, `rejected`, `withdrawn`.
- Status can be changed from the list view and the detail view via a dropdown.
- Every change is recorded in a status history (from, to, timestamp, optional note) and shown on the detail page.

### 3.4 Documents (resumes and cover letters)
- Upload PDF or DOCX, max 5 MB each. User gives a label (e.g. "Backend resume v3") and chooses kind: `resume` or `cover_letter`.
- User can upload many of each, rename, download, and delete.
- Deleting a document that is used by applications asks for confirmation, then clears the link on those applications (it does not delete the applications).
- Files are only downloadable by their owner.

### 3.5 Application list and detail
- List: company/title, work type, employment type, applied date, status dropdown. Search by company or title. Filter by status. Sort by applied date or last updated. Open detail via the company name.
- Detail: all fields editable, notes, resume and cover letter dropdowns, status history, link to the original job URL, and delete.
- Simple summary counts per status at the top of the list.

## 4. Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + TypeScript, Vite, React Router, TanStack Query, Tailwind CSS, react-hook-form + zod |
| Backend | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.0, Alembic |
| Database | PostgreSQL 16 (run locally with Docker Compose) |
| Scraping | httpx, BeautifulSoup4 (lxml) |
| Auth | JWT in httpOnly cookie, argon2 password hashing (pwdlib) |
| File storage | Local disk behind a storage interface (`storage.py`), swappable for S3-compatible storage later |
| Testing | pytest + FastAPI TestClient (backend) |
| Tooling | Ruff (Python lint/format), oxlint (frontend) |

Why PostgreSQL: the data is relational (users, applications, documents, status history), needs enums, constraints, and indexes, and Postgres is easy to host later.

## 5. Project structure

```
job-tracker/
├── PROJECT.md
├── docker-compose.yml
├── .env.example
├── .cursor/rules/project.mdc
├── docs/
│   ├── DATA_MODEL.md
│   ├── API.md
│   └── BUILD_PLAN.md
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, CORS, router registration
│   │   ├── config.py            # settings from env (pydantic-settings)
│   │   ├── db.py                # engine, session dependency
│   │   ├── models/              # SQLAlchemy models
│   │   ├── schemas/             # Pydantic request/response models
│   │   ├── routers/             # auth.py, applications.py, documents.py, scrape.py
│   │   ├── services/            # scraper.py, storage.py, security.py
│   │   └── deps.py              # get_current_user, get_db
│   ├── alembic/                 # migrations
│   ├── tests/
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── api/                 # fetch client + typed endpoint functions
    │   ├── components/          # shared UI (Button, Select, Modal, StatusBadge...)
    │   ├── features/            # auth/, applications/, documents/
    │   ├── pages/               # Landing, Login, Register, Forgot/Reset password, Applications, Detail, Documents, Profile
    │   ├── hooks/
    │   ├── lib/                 # utils, constants (status list), zod schemas
    │   └── main.tsx
    └── vite.config.ts           # dev proxy: /api -> http://localhost:8000
```

## 6. Scraping behaviour

Goal: get useful data reliably without being abusive.

Extraction order (stop filling a field once found):
1. **JSON-LD** `JobPosting` structured data (`<script type="application/ld+json">`). Most job boards include this.
2. **OpenGraph and meta tags** (`og:title`, `og:site_name`, `og:description`, `<title>`).
3. **Light heuristics** on common selectors for headings and description blocks.
4. If nothing useful is found, return what we have plus `scrape_status: "failed"`.

Rules:
- Only `http` and `https` URLs. Normalise the URL (strip `utm_*`, tracking params, fragments).
- **SSRF protection:** resolve the host and reject private, loopback, link-local, and reserved IP ranges. Re-check on redirects. Limit redirects to 5.
- 10 second timeout, 2 MB max response size, descriptive User-Agent, no cookies.
- Convert the description to clean plain text (keep paragraph and bullet breaks). Never store raw HTML.
- Some sites (LinkedIn, Seek, Indeed and others) require JavaScript, logins, or block bots. Do not try to bypass this. Return a partial result and let the user fill in the gaps. Optional later: headless browser rendering or LLM-based extraction as a fallback.
- Scraping is a service function (`services/scraper.py`) that takes HTML and URL and returns a dataclass, so it can be unit tested with saved HTML fixtures without network access.

## 7. Security requirements

- Hash passwords with argon2. Never log passwords, tokens, or document contents.
- httpOnly + SameSite=Lax cookies; `Secure` in production. CORS restricted to the configured frontend origin with credentials.
- Rate limit login and register endpoints.
- Validate uploads by extension, MIME type, and magic bytes. Max 5 MB. Store under a random UUID key, never use the client filename in a path.
- Authorisation check on every resource by `user_id`.
- SSRF protection on scraping (see section 6).
- Secrets only in environment variables. `.env` is gitignored; `.env.example` is committed.

## 8. UI and design

- Clean, minimal, calm. Light theme first, one accent colour, lots of whitespace, readable type (Inter or similar).
- Responsive from mobile to desktop. Keyboard accessible, visible focus states, labelled form fields.
- Status shown as a coloured badge and editable via a dropdown.
- Show loading, empty, and error states for every list and form.
- Pages: `/` (landing), `/login`, `/register`, `/forgot-password`, `/reset-password`, `/applications`, `/applications/:id`, `/documents`, `/profile`.
- "Add application" is a prominent button that opens a modal or page with the paste-URL flow.

## 9. Conventions

- Small, focused changes. Do not rewrite unrelated files.
- Backend: type hints everywhere, routers thin, logic in `services/`, DB access via SQLAlchemy sessions injected with `Depends`.
- Frontend: function components and hooks, server state with TanStack Query, no `any`, validation with zod.
- API changes must update `docs/API.md`. Schema changes need an Alembic migration and an update to `docs/DATA_MODEL.md`.
- Add tests for new backend endpoints and the scraper.
- Do not add dependencies without saying why.
- Commit after each working step with a clear message.

## 10. Running locally

```bash
# 1. Start Postgres
docker compose up -d

# 2. Backend
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp ../.env.example ../.env
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# 3. Frontend
cd frontend
npm install
npm run dev     # http://localhost:5173
```

## 11. Roadmap (after MVP)

- Kanban board view with drag and drop between statuses
- Reminders and follow-up dates
- Interview and contact tracking per application
- Dashboard charts (applications per week, response rate)
- Headless-browser or LLM-assisted scraping fallback
- S3-compatible file storage and production deployment (Vercel/Netlify frontend, Fly.io/Render backend, managed Postgres)
- Export to CSV

## 12. Definition of done (for any feature)

- Works end to end in the browser.
- Handles loading, empty, and error states.
- Backend tests pass; new endpoints have tests.
- Docs updated if API or data model changed.
- No secrets committed; lint passes.
