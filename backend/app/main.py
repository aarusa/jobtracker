from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routers import applications, auth, documents, health, scrape
from app.services.applications import DuplicateApplicationError

settings = get_settings()

app = FastAPI(title="Job Application Tracker", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(DuplicateApplicationError)
async def duplicate_application_handler(
    _request: object,
    exc: DuplicateApplicationError,
) -> JSONResponse:
    return JSONResponse(
        status_code=409,
        content={
            "detail": "An application with this URL already exists",
            "existing_application_id": str(exc.existing_id),
        },
    )


app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(scrape.router, prefix="/api")
app.include_router(applications.router, prefix="/api")
