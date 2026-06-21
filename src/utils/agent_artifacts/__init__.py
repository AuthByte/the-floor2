"""Per-agent chart artifacts: deterministic templates + optional LLM custom slot.

Public API:
    attach_artifacts() — agent hook that plans, renders, saves, returns artifact dicts.
    set_run_artifact_root() — backend route sets the on-disk root per shift.
    cleanup_old_runs() — called at shift start to remove stale artifact dirs.

Set CUSTOM_ARTIFACT_CHARTS=0 to disable the bespoke matplotlib slot.
"""

from src.utils.agent_artifacts.publish import attach_artifacts, cleanup_old_runs, set_run_artifact_root

__all__ = ["attach_artifacts", "cleanup_old_runs", "set_run_artifact_root"]
