from fastapi import APIRouter

from config import settings

router = APIRouter()


@router.get("/")
def root():
    return {
        "name": f"{settings.app_name} API",
        "status": "running",
        "mode": "demo" if settings.demo_mode else "live",
        "docs": "/docs",
    }


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/api/config/status")
def config_status():
    """Safe status for the UI. Never returns hosts, tokens or endpoint names."""
    return {
        "status": "ok",
        "app_name": settings.app_name,
        "mode": "demo" if settings.demo_mode else "live",
        "databricks_configured": settings.databricks_configured,
        "genie_agents": settings.genie_agent_count,
    }
