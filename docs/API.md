# API Reference

Base path: `/api`. Format: JSON unless noted. Auth: httpOnly cookie named `access_token`, set on login. Interactive docs are available at `/docs` (FastAPI Swagger UI) when running locally.

## Conventions

- All endpoints except `POST /auth/register`, `POST /auth/login`, `POST /auth/forgot-password`, `POST /auth/reset-password`, and `GET /health` require authentication. Unauthenticated requests return `401`.
- Records belonging to other users return `404`.
- Errors use this shape: `{ "detail": "Human readable message" }`. Validation errors (`422`) use FastAPI's default list format.
- Dates are ISO 8601 (`2026-10-05`). Timestamps are UTC ISO 8601.
- List endpoints accept `limit` (default 50, max 100) and `offset` (default 0).

## Health

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Returns `{ "status": "ok" }` |

## Auth

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/register` | `{ name, email, password }` | `201` user object; sets cookie |
| POST | `/auth/login` | `{ email, password, remember_me? }` | `200` user object; sets cookie |
| POST | `/auth/forgot-password` | `{ email }` | `200` `{ detail, dev_reset_url? }` |
| POST | `/auth/reset-password` | `{ token, password }` | `204` |
| POST | `/auth/logout` | none | `204`; clears cookie |
| GET | `/auth/me` | none | `200` current user object |

User object: `{ id, name, email, created_at }`.

Rules: password minimum 8 characters; email unique (case-insensitive); names are stored title-cased; login and register (and password-reset endpoints) are rate limited; login errors never reveal whether the email exists (`401 Invalid email or password`).

- `remember_me` (default `false`): when `true`, the JWT and cookie last `REMEMBER_ME_EXPIRE_DAYS` (default 30 days) instead of `ACCESS_TOKEN_EXPIRE_MINUTES`.
- `forgot-password` always returns the same generic `detail` whether or not the email exists. Reset tokens expire in 1 hour. There is no email provider yet; when `EXPOSE_DEV_RESET_LINK=true`, the response may include `dev_reset_url` for local testing only — keep that flag off in production.
- `reset-password` accepts the one-time token from the reset link and the new password.

## Scrape

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/scrape/preview` | `{ url }` | `200` scrape result (nothing is saved) |

Scrape result:
```json
{
  "job_url": "https://example.com/jobs/123?utm_source=x",
  "job_url_normalized": "https://example.com/jobs/123",
  "source_domain": "example.com",
  "title": "Senior Backend Engineer",
  "company": "Example Pty Ltd",
  "location": "Melbourne, VIC",
  "work_type": "hybrid",
  "employment_type": "full-time",
  "salary_text": "$140k - $160k",
  "description": "Plain text description...",
  "date_posted": "2026-10-01",
  "scrape_status": "success",
  "message": null,
  "existing_application_id": null
}
```

- `scrape_status` on preview responses: `success` (key fields found), `partial` (some fields), `failed` (nothing useful). When saving an application without a scrape, the client may send `manual`.
- `message`: friendly explanation when partial or failed (e.g. "This site blocks automated access. Please fill in the details manually.").
- `existing_application_id`: set if the user already saved this normalised URL.
- Errors: `400` for invalid, blocked, or unresolvable URLs (non-http, private IP, DNS failure, etc.), `422` malformed body. A resolvable site that cannot be fetched (timeout, connection error, empty parse) returns `200` with `scrape_status: "failed"` and a message, not a 5xx.

## Applications

| Method | Path | Description |
|---|---|---|
| GET | `/applications` | List with filters |
| POST | `/applications` | Create (status starts as `applied`) |
| GET | `/applications/{id}` | Detail including status history |
| PATCH | `/applications/{id}` | Update any editable field, including `status` |
| DELETE | `/applications/{id}` | Delete (`204`) |
| GET | `/applications/stats` | Counts per status |

### GET /applications
Query params: `q` (search company or title), `status` (repeatable), `sort` (`applied_at`, `updated_at`; prefix `-` for descending, default `-applied_at`), `limit`, `offset`.

Response: `{ "items": [Application], "total": 42 }`.

### POST /applications
```json
{
  "job_url": "https://example.com/jobs/123",
  "title": "Senior Backend Engineer",
  "company": "Example Pty Ltd",
  "location": "Melbourne, VIC",
  "work_type": "hybrid",
  "employment_type": "full-time",
  "salary_text": "$140k - $160k",
  "description": "Plain text...",
  "date_posted": "2026-10-01",
  "applied_at": "2026-10-05",
  "resume_id": "uuid-or-null",
  "cover_letter_id": "uuid-or-null",
  "scrape_status": "success",
  "notes": null
}
```
- Only `job_url` is required. `status` is always set to `applied` by the server. `applied_at` defaults to today.
- `resume_id` must be one of the user's documents with kind `resume`; `cover_letter_id` must be kind `cover_letter`. Otherwise `400`.
- Duplicate normalised URL for this user returns `409` with `{ "detail": "...", "existing_application_id": "uuid" }`.
- Creates the first `status_history` row (null to `applied`). Returns `201` with the Application.

### PATCH /applications/{id}
Partial update. Any field from the create body plus `status` and `notes`. When `status` changes, the server adds a `status_history` row. Optional `status_note` in the body is saved on that row. Returns `200` with the Application.

### Application object
```json
{
  "id": "uuid",
  "job_url": "...",
  "title": "...",
  "company": "...",
  "location": "...",
  "work_type": "hybrid",
  "employment_type": "full-time",
  "salary_text": "...",
  "description": "...",
  "date_posted": "2026-10-01",
  "source_domain": "example.com",
  "status": "applied",
  "applied_at": "2026-10-05",
  "resume": { "id": "uuid", "label": "Backend resume v3" },
  "cover_letter": { "id": "uuid", "label": "Generic cover letter" },
  "scrape_status": "success",
  "notes": "...",
  "created_at": "...",
  "updated_at": "...",
  "status_history": [
    { "from_status": null, "to_status": "applied", "note": null, "changed_at": "..." }
  ]
}
```
`status_history` is only included on the detail endpoint. `description` is omitted from list responses to keep them small.

### GET /applications/stats
`{ "applied": 12, "screening": 3, "interviewing": 2, "offer": 0, "accepted": 0, "rejected": 5, "withdrawn": 1, "total": 23 }`

## Documents

| Method | Path | Description |
|---|---|---|
| GET | `/documents` | List the user's documents; optional `kind` filter (`resume` or `cover_letter`) |
| POST | `/documents` | Upload (`multipart/form-data`) |
| PATCH | `/documents/{id}` | Rename: `{ label }` |
| GET | `/documents/{id}/view` | Stream the file for inline preview (`Content-Disposition: inline`; owner only) |
| GET | `/documents/{id}/download` | Download the file (`Content-Disposition: attachment`; owner only) |
| DELETE | `/documents/{id}` | Delete file and record (`204`) |

### POST /documents
Form fields: `file` (PDF or DOCX, max 5 MB), `kind` (`resume` or `cover_letter`), `label` (optional; defaults to the filename without extension).

Errors: `400` wrong type or failed magic-byte check, `413` file too large.

Response `201`:
```json
{
  "id": "uuid",
  "kind": "resume",
  "label": "Backend resume v3",
  "original_filename": "arusha_resume.pdf",
  "mime_type": "application/pdf",
  "size_bytes": 182340,
  "created_at": "...",
  "used_by_count": 0
}
```

### GET /documents/{id}/view
Returns the raw file bytes with `Content-Disposition: inline` so the browser (or an in-app preview) can display it. Same ownership rules as download: other users get `404`. PDFs preview well in-browser; DOCX may need to be downloaded.

### DELETE /documents/{id}
Applications referencing the document have `resume_id` or `cover_letter_id` set to null. The frontend should confirm first using `used_by_count` from the list response.
