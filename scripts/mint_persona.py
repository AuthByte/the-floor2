#!/usr/bin/env python3
"""Mint a PersonaPack v1 JSON file from text paste or stub handle (v0 dev script)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.utils.persona_mint import mint_from_text  # noqa: E402

DEFAULT_OUT = ROOT / "data" / "persona_packs"


def main() -> int:
    parser = argparse.ArgumentParser(description="Mint a local PersonaPack JSON (v0)")
    parser.add_argument("--text-file", type=Path, help="Path to source text corpus")
    parser.add_argument("--text", type=str, help="Inline source text")
    parser.add_argument("--handle", type=str, help="Optional X handle for metadata")
    parser.add_argument("--slug", type=str, help="URL-safe slug (default derived)")
    parser.add_argument("--display-name", type=str)
    parser.add_argument("--callsign", type=str)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    if args.text_file:
        corpus = args.text_file.read_text(encoding="utf-8")
    elif args.text:
        corpus = args.text
    else:
        parser.error("Provide --text-file or --text")

    pack = mint_from_text(
        corpus,
        slug=args.slug,
        display_name=args.display_name,
        callsign=args.callsign,
        handle=args.handle,
    )

    args.out_dir.mkdir(parents=True, exist_ok=True)
    out_path = args.out_dir / f"{pack.slug}.json"
    out_path.write_text(json.dumps(pack.to_pack_body(), indent=2), encoding="utf-8")
    print(f"Wrote {out_path}")
    print(f"agent_key={pack.agent_key} id={pack.id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
