from __future__ import annotations

import os

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from app.backend.paths import database_path

DATABASE_PATH = database_path()
DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)

_db_url = (os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL") or "").strip()
if _db_url:
    DATABASE_URL = _db_url
    _engine_kwargs: dict = {"pool_pre_ping": True}
elif (os.getenv("SUPABASE_URL") or "").strip():
    DATABASE_URL = "sqlite:///:memory:"
    _engine_kwargs = {"connect_args": {"check_same_thread": False}}
else:
    DATABASE_URL = f"sqlite:///{DATABASE_PATH}"
    _engine_kwargs = {"connect_args": {"check_same_thread": False}}

engine = create_engine(DATABASE_URL, **_engine_kwargs)

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create Base class for models
Base = declarative_base()

# Dependency for FastAPI
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close() 