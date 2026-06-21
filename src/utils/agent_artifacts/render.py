"""Matplotlib rendering helpers shared by all chart builders.

Palette and typography mirror the dark "after-hours ops" theme from
`app/frontend/src/index.css` (.dark) and `tailwind.config.ts`:
  ink   — charcoal surfaces
  wire  — cool neutral text / grid
  phos  — emerald long / positive
  brass — brand structure accent
  amber — hold / warning
  siren — bear / error
"""

from __future__ import annotations

import io
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:
    from matplotlib.axes import Axes
    from matplotlib.figure import Figure

# ---- Design tokens (dark theme, rgb → hex) --------------------------------
INK_950 = "#090b0f"
INK_900 = "#0d1015"
INK_800 = "#12161d"
INK_700 = "#191e29"

WIRE_800 = "#2d3441"
WIRE_700 = "#3b4452"
WIRE_600 = "#515b6b"
WIRE_400 = "#8c95a4"
WIRE_300 = "#aab2c1"
WIRE_200 = "#ccd2dc"

PHOS = "#2fd08a"
PHOS_GLOW = "#6ff0bd"
PHOS_DIM = "#1c6b4a"
PHOS_DARK = "#0e3325"

BRASS = "#e3b24b"
BRASS_GLOW = "#f6d489"
BRASS_DIM = "#8a6a2a"

AMBER = "#ffab4d"
SIREN = "#ff5d5d"
SIREN_DIM = "#7a2626"

# Legacy aliases used by builders
FLOOR_BG = INK_950
PANEL_BG = INK_900
GRID = WIRE_800
TEXT = WIRE_200
MUTED = WIRE_600
PALETTE = [PHOS, BRASS, AMBER, WIRE_300, SIREN, PHOS_GLOW, BRASS_GLOW]

# 16:9 desk monitors — ~50% larger than the original 6.4×3.6 @ 120dpi canvas.
DEFAULT_FIG_SIZE = (9.0, 5.0625)
DEFAULT_DPI = 144
CHART_WIDTH_PX = int(DEFAULT_FIG_SIZE[0] * DEFAULT_DPI)
CHART_HEIGHT_PX = int(DEFAULT_FIG_SIZE[1] * DEFAULT_DPI)

_mpl_ready = False


def _ensure_mpl():
    """Import matplotlib on first chart render so the backend can boot without it."""
    global _mpl_ready
    if _mpl_ready:
        return
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    plt.rcParams.update(
        {
            "figure.facecolor": INK_950,
            "axes.facecolor": INK_900,
            "axes.edgecolor": WIRE_800,
            "axes.labelcolor": WIRE_400,
            "axes.titlecolor": WIRE_200,
            "xtick.color": WIRE_600,
            "ytick.color": WIRE_600,
            "grid.color": WIRE_800,
            "grid.linestyle": "-",
            "grid.linewidth": 0.45,
            "grid.alpha": 0.55,
            "text.color": WIRE_200,
            "font.family": "sans-serif",
            "font.sans-serif": ["DejaVu Sans", "Segoe UI", "Helvetica", "Arial"],
            "font.monospace": ["DejaVu Sans Mono", "Consolas", "Courier New"],
            "axes.titlesize": 10,
            "axes.labelsize": 8,
            "xtick.labelsize": 7.5,
            "ytick.labelsize": 7.5,
            "legend.fontsize": 7.5,
        }
    )
    _mpl_ready = True


Signal = Literal["bullish", "bearish", "neutral"]


def signal_color(signal: str) -> str:
    """Map desk signal semantics to chart colors."""
    s = (signal or "neutral").lower()
    if s == "bullish":
        return PHOS
    if s == "bearish":
        return SIREN
    return AMBER


def new_figure(figsize: tuple[float, float] = DEFAULT_FIG_SIZE) -> tuple[Figure, Axes]:
    """Create a single-axis figure with floor panel chrome."""
    _ensure_mpl()
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=figsize, dpi=DEFAULT_DPI)
    apply_floor_style(fig, ax)
    _draw_panel_chrome(fig, ax)
    return fig, ax


def apply_floor_style(fig: Figure, ax: Axes) -> None:
    fig.patch.set_facecolor(INK_950)
    ax.set_facecolor(INK_900)
    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)
    for spine in ("bottom", "left"):
        ax.spines[spine].set_color(WIRE_800)
        ax.spines[spine].set_linewidth(0.9)
    ax.tick_params(colors=WIRE_600, labelsize=7.5, length=2.5, width=0.55, pad=3)
    ax.grid(True, color=WIRE_800, linestyle="-", linewidth=0.45, alpha=0.55)
    ax.set_axisbelow(True)
    ax.xaxis.label.set_color(WIRE_400)
    ax.yaxis.label.set_color(WIRE_400)


def _draw_panel_chrome(fig: Figure, ax: Axes) -> None:
    """Brass hairline frame + left accent bar like RoomDetailPanel."""
    from matplotlib.patches import Rectangle

    fig.subplots_adjust(left=0.11, right=0.94, top=0.86, bottom=0.16)
    accent = Rectangle(
        (0.0, 0.0),
        0.004,
        1.0,
        transform=fig.transFigure,
        facecolor=BRASS,
        edgecolor="none",
        alpha=0.85,
        zorder=10,
    )
    frame = Rectangle(
        (0.0, 0.0),
        1.0,
        1.0,
        transform=fig.transFigure,
        facecolor="none",
        edgecolor=WIRE_800,
        linewidth=0.8,
        zorder=9,
    )
    fig.patches.extend([frame, accent])


def style_chart_title(
    ax: Axes,
    title: str,
    *,
    kicker: str = "DESK ARTIFACT",
) -> None:
    """Title block matching the room detail panel micro-label style."""
    ax.set_title("")
    ax.text(
        0.0,
        1.06,
        kicker,
        transform=ax.transAxes,
        fontsize=6.5,
        fontweight="medium",
        color=BRASS,
        alpha=0.9,
        va="bottom",
        ha="left",
        fontfamily="monospace",
        clip_on=False,
    )
    ax.text(
        0.0,
        1.01,
        title,
        transform=ax.transAxes,
        fontsize=10,
        fontweight="semibold",
        color=WIRE_200,
        va="bottom",
        ha="left",
        clip_on=False,
    )


def style_legend(ax: Axes, **kwargs) -> None:
    leg = ax.legend(
        frameon=True,
        facecolor=INK_800,
        edgecolor=WIRE_800,
        labelcolor=WIRE_300,
        framealpha=0.92,
        **kwargs,
    )
    if leg:
        for line in leg.get_lines():
            line.set_linewidth(1.4)


def style_twin_axis(ax2: Axes, accent: str) -> None:
    ax2.set_facecolor(INK_900)
    ax2.tick_params(colors=WIRE_600, labelsize=7.5, length=0)
    ax2.yaxis.label.set_color(accent)
    ax2.spines["top"].set_visible(False)
    ax2.spines["left"].set_visible(False)
    ax2.spines["right"].set_color(WIRE_800)
    ax2.spines["right"].set_linewidth(0.9)
    ax2.spines["bottom"].set_visible(False)
    ax2.grid(False)


def figure_pixel_size(fig: Figure) -> tuple[int, int]:
    """Return rendered pixel dimensions for a figure at its current dpi."""
    w_in, h_in = fig.get_size_inches()
    dpi = fig.dpi or DEFAULT_DPI
    return int(round(w_in * dpi)), int(round(h_in * dpi))


def figure_to_png_bytes(fig: Figure) -> bytes:
    """Serialize a figure to PNG bytes and close the figure."""
    _ensure_mpl()
    import matplotlib.pyplot as plt

    buf = io.BytesIO()
    fig.savefig(
        buf,
        format="png",
        facecolor=fig.get_facecolor(),
        bbox_inches="tight",
        pad_inches=0.14,
        dpi=fig.dpi or DEFAULT_DPI,
    )
    plt.close(fig)
    return buf.getvalue()
