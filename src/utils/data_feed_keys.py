"""Tier-0 data-feed agent keys (shared across graph, debate, and prompts)."""

DATA_FEED_KEYS = frozenset(
    {
        "fundamentals_analyst",
        "technical_analyst",
        "valuation_analyst",
        "sentiment_analyst",
        "news_sentiment_analyst",
        "growth_analyst",
    }
)

TIER0_DESK_NAMES: dict[str, str] = {
    "fundamentals_analyst": "Earnings & fundamentals (EPS)",
    "technical_analyst": "Technical tape (CHRT)",
    "valuation_analyst": "Valuation models (DCF)",
    "sentiment_analyst": "Crowd & insider mood (MOOD)",
    "news_sentiment_analyst": "Press wire sentiment (WIRE)",
    "growth_analyst": "Growth metrics (GROW)",
}
