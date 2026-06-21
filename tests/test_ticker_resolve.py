from src.utils.ticker_resolve import (
    _extract_alias_tickers,
    _extract_explicit_tickers,
    normalize_ticker_list,
    parse_direct_tickers,
)


def test_extract_explicit_tickers():
    assert _extract_explicit_tickers("AAPL, MSFT, NVDA") == ["AAPL", "MSFT", "NVDA"]
    assert _extract_explicit_tickers("aapl msft") == ["AAPL", "MSFT"]


def test_is_pure_ticker_query():
    assert parse_direct_tickers("AAPL, MSFT") == ["AAPL", "MSFT"]
    assert parse_direct_tickers("aapl msft") == ["AAPL", "MSFT"]
    assert parse_direct_tickers("analyze apple and microsoft") is None


def test_alias_tickers():
    assert "AAPL" in _extract_alias_tickers("apple and microsoft")
    assert "MSFT" in _extract_alias_tickers("apple and microsoft")


def test_normalize_dedupes():
    assert normalize_ticker_list(["aapl", "AAPL", "MSFT"]) == ["AAPL", "MSFT"]


def test_natural_language_does_not_extract_small_cap():
    assert _extract_explicit_tickers("small cap peptide stocks") == []
    assert "SMALL" not in normalize_ticker_list(
        ["SMALL", "CAP", "PTN", "PALI", "TLPH"]
    )
    assert normalize_ticker_list(["SMALL", "CAP", "PTN", "PALI"]) == ["PTN", "PALI"]
