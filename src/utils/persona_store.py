"""In-memory PersonaPack cache for local dev and ingest jobs."""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

from src.utils.persona_models import PersonaPack

_PACKS_DIR = Path(__file__).resolve().parents[2] / "data" / "persona_packs"
_pack_cache: dict[str, PersonaPack] = {}


def cache_pack(pack: PersonaPack) -> None:
    _pack_cache[pack.agent_key] = pack


def save_pack_to_dir(pack: PersonaPack, directory: Path | str | None = None) -> Path:
    """Persist a PersonaPack JSON under data/persona_packs (local dev)."""
    import json

    root = Path(directory) if directory else _PACKS_DIR
    root.mkdir(parents=True, exist_ok=True)
    out_path = root / f"{pack.slug}.json"
    out_path.write_text(json.dumps(pack.to_pack_body(), indent=2), encoding="utf-8")
    cache_pack(pack)
    return out_path


def get_pack_for_agent_key(agent_key: str) -> PersonaPack | None:
    return _pack_cache.get(agent_key)


def load_pack_from_json(path: Path | str) -> PersonaPack:
    import json

    raw_path = Path(path)
    pack = PersonaPack.from_pack_body(json.loads(raw_path.read_text(encoding="utf-8")))
    cache_pack(pack)
    return pack


def load_packs_from_dir(directory: Path | str | None = None) -> list[PersonaPack]:
    import logging

    logger = logging.getLogger(__name__)
    root = Path(directory) if directory else _PACKS_DIR
    if not root.is_dir():
        return []
    packs: list[PersonaPack] = []
    for path in sorted(root.glob("*.json")):
        try:
            packs.append(load_pack_from_json(path))
        except Exception:
            logger.exception("Failed to load persona pack %s", path)
    return packs


def load_packs_by_ids(pack_ids: list[str]) -> list[PersonaPack]:
    if not pack_ids:
        return []

    wanted = {str(pid).strip() for pid in pack_ids if str(pid).strip()}
    found: dict[str, PersonaPack] = {}

    try:
        from app.backend.services.persona_store_db import db_available, load_packs_by_ids as load_from_db

        if db_available():
            for pack in load_from_db(list(wanted)):
                found[str(pack.id)] = pack
    except Exception:
        import logging

        logging.getLogger(__name__).exception("Supabase persona pack load failed; using local fallback")

    for pack in load_packs_from_dir():
        if str(pack.id) in wanted and str(pack.id) not in found:
            found[str(pack.id)] = pack

    for pid in wanted:
        if pid in found:
            continue
        for pack in _pack_cache.values():
            if str(pack.id) == pid:
                found[pid] = pack
                break

    missing = wanted - set(found)
    if missing:
        raise KeyError(f"Persona pack(s) not found: {', '.join(sorted(missing))}")

    return [found[pid] for pid in pack_ids if str(pid).strip() in found]


def load_pack_by_slug(slug: str) -> PersonaPack | None:
    from src.utils.persona_models import agent_key_for_slug

    key = agent_key_for_slug(slug)
    if key in _pack_cache:
        return _pack_cache[key]
    path = _PACKS_DIR / f"{slug.strip().lower()}.json"
    if path.is_file():
        return load_pack_from_json(path)
    return None


def invalidate_pack_cache(pack_id: UUID | str | None = None) -> None:
    if pack_id is None:
        _pack_cache.clear()
        return
    pid = str(pack_id)
    for key, pack in list(_pack_cache.items()):
        if str(pack.id) == pid:
            del _pack_cache[key]
