from enum import StrEnum


class ApplicationStatus(StrEnum):
    applied = "applied"
    screening = "screening"
    interviewing = "interviewing"
    offer = "offer"
    accepted = "accepted"
    rejected = "rejected"
    withdrawn = "withdrawn"


class DocumentKind(StrEnum):
    resume = "resume"
    cover_letter = "cover_letter"


class WorkType(StrEnum):
    remote = "remote"
    hybrid = "hybrid"
    onsite = "onsite"
    unknown = "unknown"


class ScrapeStatus(StrEnum):
    success = "success"
    partial = "partial"
    failed = "failed"
    manual = "manual"
