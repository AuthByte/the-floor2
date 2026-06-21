"""Regression tests for the LLM custom-chart sandbox.

Several models double-escape newlines when returning the chart `code` inside a
JSON string, producing a single physical line full of literal ``\\n`` that
``ast.parse`` rejects ("unexpected character after line continuation
character"). This previously broke the custom chart for nearly every agent.
"""

import matplotlib

matplotlib.use("Agg")

from src.utils.agent_artifacts.sandbox import normalize_chart_code, run_custom_chart


# A single physical line with literal escaped newlines, as emitted by models.
ESCAPED_CODE = (
    'fig, ax = new_figure()\\nax.plot([1, 2, 3], color=PHOS)\\n'
    'style_chart_title(ax, "tape", kicker="DESK")'
)

REAL_MULTILINE = 'fig, ax = new_figure()\nax.plot([1, 2, 3], color=PHOS)'


def test_normalize_unescapes_only_when_no_real_newlines():
    assert "\n" not in ESCAPED_CODE
    fixed = normalize_chart_code(ESCAPED_CODE)
    assert "\n" in fixed
    assert "\\n" not in fixed


def test_normalize_leaves_real_multiline_untouched():
    assert normalize_chart_code(REAL_MULTILINE) == REAL_MULTILINE


def test_escaped_code_renders_a_figure():
    fig = run_custom_chart(ESCAPED_CODE, {})
    assert fig is not None
    assert type(fig).__name__ == "Figure"
