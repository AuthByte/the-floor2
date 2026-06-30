"""Add ThesisOutlookFields + finish_from_signal to named investor agents."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENTS = ROOT / "src" / "agents"

SKIP = {"_legendary_investor_utils.py"}

IMPORT_BLOCK = (
    "from src.utils.thesis_outlook import ThesisOutlookFields, latest_close\n"
    "from src.utils.thesis_verdict import finish_from_signal\n"
)


def patch_file(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    if "finish_investor_ticker" not in text:
        return False
    original = text

    if "ThesisOutlookFields" not in text:
        text = text.replace(
            "from src.utils.thesis_verdict import finish_investor_ticker\n",
            IMPORT_BLOCK,
        )

    text = re.sub(
        r"class (\w+Signal)\(BaseModel\):",
        r"class \1(ThesisOutlookFields):",
        text,
    )

    # Multi-line finish_investor_ticker with artifacts
    text = re.sub(
        r"finish_investor_ticker\(\n\s+agent_id,\n\s+ticker,\n\s+(\w+)\.signal,\n\s+\1\.confidence,\n\s+\1\.reasoning,\n\s+state,\n\s+artifacts=artifacts,\n\s*\)",
        r"finish_from_signal(\n            agent_id,\n            ticker,\n            \1,\n            state,\n            artifacts=artifacts,\n            current_price=current_price,\n        )",
        text,
    )

    # Named output variables (lynch_output, etc.)
    text = re.sub(
        r"finish_investor_ticker\(agent_id, ticker, (\w+_output)\.signal, \1\.confidence, \1\.reasoning, state\)",
        r"finish_from_signal(agent_id, ticker, \1, state, current_price=current_price)",
        text,
    )

    # warren-style multiline
    text = re.sub(
        r"finish_investor_ticker\(\n\s+agent_id,\n\s+ticker,\n\s+(\w+_output)\.signal,\n\s+\1\.confidence,\n\s+\1\.reasoning,\n\s+state,\n\s+artifacts=artifacts,\n\s*\)",
        r"finish_from_signal(\n            agent_id,\n            ticker,\n            \1,\n            state,\n            artifacts=artifacts,\n            current_price=current_price,\n        )",
        text,
    )

    if "current_price" not in text and "finish_from_signal" in text:
        if "prices = get_prices" in text:
            text = text.replace(
                "prices = get_prices",
                "current_price = None\n        prices = get_prices",
                1,
            )
            text = text.replace(
                "prices = get_prices",
                "prices = get_prices",
            )
            # After prices fetch, set current_price
            text = re.sub(
                r"(prices = get_prices\([^\n]+\n)",
                r"\1        current_price = latest_close(prices)\n",
                text,
                count=1,
            )
        else:
            # Insert current_price = None at start of ticker loop
            text = re.sub(
                r"(for ticker in tickers:\n)",
                r"\1        current_price = None\n",
                text,
                count=1,
            )

    if text != original:
        path.write_text(text, encoding="utf-8")
        return True
    return False


def main() -> None:
    changed = []
    for path in sorted(AGENTS.glob("*.py")):
        if path.name in SKIP:
            continue
        if patch_file(path):
            changed.append(path.name)
    print("patched:", ", ".join(changed) or "(none)")


if __name__ == "__main__":
    main()
