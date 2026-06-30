"""Supabase REST + Storage client for server-side persistence."""

from __future__ import annotations

import logging
import os
from contextvars import ContextVar
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_user_access_token: ContextVar[str | None] = ContextVar("supabase_user_access_token", default=None)


def set_user_access_token(token: str | None) -> None:
    _user_access_token.set(token)


def get_user_access_token() -> str | None:
    return _user_access_token.get()


class SupabaseClient:
    def __init__(self) -> None:
        self.url = (os.getenv("SUPABASE_URL") or "").rstrip("/")
        self.service_key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
        self.anon_key = (os.getenv("SUPABASE_ANON_KEY") or "").strip()
        self.bucket = (os.getenv("SUPABASE_ARTIFACT_BUCKET") or "shift-artifacts").strip()
        self._pg_client: Any | None = None

    @property
    def configured(self) -> bool:
        return bool(self.url and (self.service_key or self.anon_key))

    @property
    def client(self) -> Any:
        """PostgREST client (service role) for server-side table access."""
        if not self.configured:
            raise RuntimeError("Supabase is not configured")
        if not self.service_key:
            raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY required for server table access")
        if self._pg_client is None:
            from supabase import create_client

            self._pg_client = create_client(self.url, self.service_key)
        return self._pg_client

    def _bearer(self, user_jwt: str | None = None) -> str | None:
        return user_jwt or get_user_access_token() or self.service_key or None

    def _headers(self, *, json: bool = True, user_jwt: str | None = None) -> dict[str, str]:
        bearer = self._bearer(user_jwt)
        if not bearer:
            raise RuntimeError("No Supabase auth token available")
        apikey = self.anon_key or bearer
        headers = {
            "Authorization": f"Bearer {bearer}",
            "apikey": apikey,
        }
        if json:
            headers["Content-Type"] = "application/json"
        return headers

    def upload_artifact(
        self,
        storage_path: str,
        data: bytes,
        *,
        content_type: str = "image/png",
        upsert: bool = True,
        user_jwt: str | None = None,
    ) -> str:
        """Upload bytes to Supabase Storage and return the public URL."""
        if not self.configured:
            raise RuntimeError("Supabase is not configured")
        path = storage_path.lstrip("/")
        upload_url = f"{self.url}/storage/v1/object/{self.bucket}/{path}"
        headers = self._headers(json=False, user_jwt=user_jwt)
        headers["Content-Type"] = content_type
        if upsert:
            headers["x-upsert"] = "true"
        with httpx.Client(timeout=60.0) as client:
            res = client.post(upload_url, content=data, headers=headers)
            res.raise_for_status()
        return f"{self.url}/storage/v1/object/public/{self.bucket}/{path}"

    def insert_artifact_file(self, row: dict[str, Any], user_jwt: str | None = None) -> None:
        if not self.configured:
            return
        with httpx.Client(timeout=30.0) as client:
            res = client.post(
                f"{self.url}/rest/v1/shift_artifact_files",
                headers={**self._headers(user_jwt=user_jwt), "Prefer": "return=minimal"},
                json=row,
            )
            if res.status_code >= 400:
                logger.warning("Failed to index artifact file: %s %s", res.status_code, res.text)

    def upsert_shift(self, row: dict[str, Any], user_jwt: str | None = None) -> dict[str, Any] | None:
        if not self.configured:
            return None
        with httpx.Client(timeout=30.0) as client:
            res = client.post(
                f"{self.url}/rest/v1/shifts",
                headers={
                    **self._headers(user_jwt=user_jwt),
                    "Prefer": "resolution=merge-duplicates,return=representation",
                },
                params={"on_conflict": "user_id,run_id"},
                json=row,
            )
            if res.status_code >= 400:
                logger.warning("Failed to upsert shift: %s %s", res.status_code, res.text)
                return None
            data = res.json()
            return data[0] if isinstance(data, list) and data else None

    def _service_headers(self) -> dict[str, str]:
        if not self.service_key:
            raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY required for server reads")
        apikey = self.anon_key or self.service_key
        return {
            "Authorization": f"Bearer {self.service_key}",
            "apikey": apikey,
            "Content-Type": "application/json",
        }

    def _rest_headers(self) -> dict[str, str]:
        """Prefer service role; fall back to anon for read-only public surfaces."""
        if self.service_key:
            return self._service_headers()
        if self.anon_key:
            return {
                "Authorization": f"Bearer {self.anon_key}",
                "apikey": self.anon_key,
                "Content-Type": "application/json",
            }
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY required for server reads")

    def rest_select_one(
        self,
        table: str,
        *,
        select: str,
        filters: dict[str, str],
    ) -> dict[str, Any] | None:
        """Service-role GET returning the first matching row (anon fallback for public reads)."""
        if not self.configured:
            return None
        params: dict[str, str] = {"select": select, "limit": "1"}
        for key, value in filters.items():
            params[key] = f"eq.{value}"
        with httpx.Client(timeout=30.0) as client:
            res = client.get(
                f"{self.url}/rest/v1/{table}",
                headers=self._rest_headers(),
                params=params,
            )
            if res.status_code == 404:
                return None
            if res.status_code >= 400:
                logger.warning("Supabase select %s failed: %s %s", table, res.status_code, res.text)
                return None
            data = res.json()
            if isinstance(data, list) and data:
                return data[0]
            return None


_client: SupabaseClient | None = None


def get_supabase() -> SupabaseClient:
    global _client
    if _client is None:
        _client = SupabaseClient()
    return _client
