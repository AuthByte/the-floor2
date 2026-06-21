"""Restricted execution environment for LLM-authored matplotlib charts."""

from __future__ import annotations

import ast
import math
import statistics
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from typing import Any

from src.utils.agent_artifacts.render import (
    AMBER,
    BRASS,
    BRASS_DIM,
    BRASS_GLOW,
    DEFAULT_DPI,
    DEFAULT_FIG_SIZE,
    INK_700,
    INK_800,
    INK_900,
    INK_950,
    MUTED,
    PHOS,
    PHOS_DIM,
    PHOS_GLOW,
    SIREN,
    SIREN_DIM,
    TEXT,
    WIRE_200,
    WIRE_300,
    WIRE_400,
    WIRE_600,
    WIRE_800,
    _ensure_mpl,
    apply_floor_style,
    new_figure,
    signal_color,
    style_chart_title,
    style_legend,
    style_twin_axis,
)
from src.utils.agent_artifacts.serialize import serialize_metrics_ctx

DEFAULT_TIMEOUT_SEC = 5.0
MAX_CODE_CHARS = 6000

_FORBIDDEN_NAMES = frozenset(
    {
        "__import__",
        "open",
        "exec",
        "eval",
        "compile",
        "getattr",
        "setattr",
        "delattr",
        "globals",
        "locals",
        "vars",
        "dir",
        "help",
        "input",
        "breakpoint",
        "memoryview",
        "bytearray",
        "exit",
        "quit",
        "type",
        "super",
        "object",
        "classmethod",
        "staticmethod",
        "property",
        "isinstance",
        "issubclass",
        "hasattr",
        "callable",
        "format",
        "__build_class__",
    }
)

_FORBIDDEN_ATTRS = frozenset(
    {
        "__class__",
        "__bases__",
        "__subclasses__",
        "__globals__",
        "__code__",
        "__dict__",
        "__getattribute__",
        "__setattr__",
        "__delattr__",
    }
)

_ALLOWED_IMPORT_ROOTS = frozenset({"matplotlib", "numpy", "pandas", "math", "statistics"})


class UnsafeChartCodeError(ValueError):
    """Raised when generated chart code fails static validation."""


class ChartCodeValidator(ast.NodeVisitor):
    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            root = (alias.name or "").split(".")[0]
            if root not in _ALLOWED_IMPORT_ROOTS:
                raise UnsafeChartCodeError(f"import not allowed: {alias.name}")
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        root = (node.module or "").split(".")[0]
        if root and root not in _ALLOWED_IMPORT_ROOTS:
            raise UnsafeChartCodeError(f"import not allowed: {node.module}")
        self.generic_visit(node)

    def visit_Name(self, node: ast.Name) -> None:
        if node.id in _FORBIDDEN_NAMES:
            raise UnsafeChartCodeError(f"name not allowed: {node.id}")
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute) -> None:
        if node.attr in _FORBIDDEN_ATTRS or node.attr.startswith("__"):
            raise UnsafeChartCodeError(f"attribute not allowed: {node.attr}")
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:
        if isinstance(node.func, ast.Name) and node.func.id in _FORBIDDEN_NAMES:
            raise UnsafeChartCodeError(f"call not allowed: {node.func.id}")
        self.generic_visit(node)


def normalize_chart_code(code: str) -> str:
    """Recover code whose newlines were double-escaped inside a JSON string.

    Several models return the ``code`` field as a single physical line full of
    literal ``\\n``/``\\t`` sequences (double-escaped), which ``ast.parse`` rejects
    with "unexpected character after line continuation character". Only unescape
    when there are no real newlines, so genuine multi-line code is left untouched.
    """
    if not code or "\n" in code:
        return code
    if "\\n" in code:
        code = code.replace("\\r\\n", "\n").replace("\\n", "\n").replace("\\t", "\t")
    return code


def validate_chart_code(code: str) -> str:
    text = (code or "").strip()
    if not text:
        raise UnsafeChartCodeError("empty chart code")
    if len(text) > MAX_CODE_CHARS:
        raise UnsafeChartCodeError("chart code too long")
    if "```" in text:
        raise UnsafeChartCodeError("markdown fences not allowed in chart code")
    tree = ast.parse(text, mode="exec")
    ChartCodeValidator().visit(tree)
    return text


def _safe_builtins() -> dict[str, Any]:
    return {
        "range": range,
        "len": len,
        "min": min,
        "max": max,
        "sum": sum,
        "float": float,
        "int": int,
        "str": str,
        "bool": bool,
        "list": list,
        "dict": dict,
        "tuple": tuple,
        "set": set,
        "enumerate": enumerate,
        "zip": zip,
        "abs": abs,
        "round": round,
        "sorted": sorted,
        "reversed": reversed,
        "any": any,
        "all": all,
        "print": lambda *_a, **_k: None,
        "True": True,
        "False": False,
        "None": None,
    }


def build_sandbox_namespace(metrics_ctx: dict[str, Any]) -> dict[str, Any]:
    _ensure_mpl()
    import matplotlib.pyplot as plt
    import numpy as np
    import pandas as pd

    serialized = serialize_metrics_ctx(metrics_ctx)
    prices = serialized.get("prices") or []
    prices_df = pd.DataFrame(prices) if prices else pd.DataFrame()
    metrics_df = pd.DataFrame(serialized.get("metrics") or [])
    line_items_df = pd.DataFrame(serialized.get("line_items") or [])

    return {
        "ctx": serialized,
        "prices_df": prices_df,
        "metrics_df": metrics_df,
        "line_items_df": line_items_df,
        "plt": plt,
        "np": np,
        "pd": pd,
        "math": math,
        "statistics": statistics,
        "new_figure": new_figure,
        "style_chart_title": style_chart_title,
        "style_legend": style_legend,
        "style_twin_axis": style_twin_axis,
        "apply_floor_style": apply_floor_style,
        "signal_color": signal_color,
        "PHOS": PHOS,
        "PHOS_GLOW": PHOS_GLOW,
        "PHOS_DIM": PHOS_DIM,
        "BRASS": BRASS,
        "BRASS_GLOW": BRASS_GLOW,
        "BRASS_DIM": BRASS_DIM,
        "AMBER": AMBER,
        "SIREN": SIREN,
        "SIREN_DIM": SIREN_DIM,
        "TEXT": TEXT,
        "MUTED": MUTED,
        "WIRE_200": WIRE_200,
        "WIRE_300": WIRE_300,
        "WIRE_400": WIRE_400,
        "WIRE_600": WIRE_600,
        "WIRE_800": WIRE_800,
        "INK_700": INK_700,
        "INK_800": INK_800,
        "INK_900": INK_900,
        "INK_950": INK_950,
        "DEFAULT_FIG_SIZE": DEFAULT_FIG_SIZE,
        "DEFAULT_DPI": DEFAULT_DPI,
        "__builtins__": _safe_builtins(),
    }


def _exec_chart_code(code: str, namespace: dict[str, Any]) -> Any:
    code = normalize_chart_code(code)
    validate_chart_code(code)
    exec(code, namespace, namespace)  # noqa: S102 — sandboxed namespace
    fig = namespace.get("fig")
    if fig is None:
        raise ValueError("custom chart code must assign a matplotlib Figure to `fig`")
    return fig


def run_custom_chart(
    code: str,
    metrics_ctx: dict[str, Any],
    *,
    timeout_sec: float = DEFAULT_TIMEOUT_SEC,
) -> Any:
    """Execute validated LLM chart code and return a matplotlib Figure."""
    namespace = build_sandbox_namespace(metrics_ctx)
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(_exec_chart_code, code, namespace)
        try:
            return future.result(timeout=timeout_sec)
        except FuturesTimeout as exc:
            raise TimeoutError("custom chart execution timed out") from exc
