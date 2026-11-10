from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import get_settings
from app.core.db import Base, SessionLocal, engine
from app.services.reports import seed_database


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    Base.metadata.create_all(bind=engine)
    if settings.seed_on_startup:
        db = SessionLocal()
        try:
            seed_database(db)
        finally:
            db.close()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router, prefix=settings.api_prefix)
    return app


app = create_app()
