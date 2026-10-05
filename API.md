# API Reference

Base path: `/api`. Format: JSON unless noted. Auth: httpOnly cookie named `access_token`, set on login. Interactive docs are available at `/docs` (FastAPI Swagger UI) when running locally.

## Conventions

- All endpoints except `POST /auth/register`, `POST /auth/login`, and `GET /health` require authentication. Unauthenticated requests return `401`.
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
| POST | `/auth/login` | `{ email, password }` | `200` user object; sets cookie |
| POST | `/auth/logout` | none | `204`; clears cookie |
| GET | `/auth/me` | none | `200` current user object |

User object: `{ id, name, email, created_at }`.

Rules: password minimum 8 characters; email unique (case-insensitive); login and register are rate limited; login errors never reveal whether the email exists (`401 Invalid email or password`).

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

- `scrape_status`: `success` (key fields found), `partial` (some fields), `failed` (nothing useful).
- `message`: friendly explanation when partial or failed (e.g. "This site blocks automated access. Please fill in the details manually.").
- `existing_application_id`: set if the user already saved this normalised URL.
- Errors: `400` invalid or blocked URL (non-http, private IP, etc.), `422` malformed body. A site being unreachable returns `200` with `scrape_status: "failed"` and a message, not a 5xx.

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
| GET | `/documents/{id}/download` | Download the file (owner only) |
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

### DELETE /documents/{id}
Applications referencing the document have `resume_id` or `cover_letter_id` set to null. The frontend should confirm first using `used_by_count` from the list response.
