"""The Desk Engine — shared evidence, declarative lenses, and a conviction ensemble.

Every analyst on the floor reads the same numbered evidence ledger for a ticker,
scores it through its own lens (factor weights + dealbreakers), and only then
asks the LLM to argue the case. The LLM may adjust the desk prior but must cite
ledger facts to do so, which keeps theses grounded and comparable across agents.
"""

from src.desk.evidence import EvidenceLedger, get_evidence, reset_evidence
from src.desk.lenses import LENSES, Lens, lens_for
from src.desk.engine import run_lens_agent

__all__ = [
    "EvidenceLedger",
    "get_evidence",
    "reset_evidence",
    "LENSES",
    "Lens",
    "lens_for",
    "run_lens_agent",
]
