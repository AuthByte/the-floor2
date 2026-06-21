"""Tests for chair interjections and weather synthesis."""

from src.utils.debate_interjections import (
    bind_run,
    clear_run,
    drain_interjections,
    push_interjection,
    wait_for_interjections,
)
from src.utils.weather_report import build_weather_report


def test_interjection_queue_round_trip():
    bind_run("run_a")
    assert push_interjection(run_id="run_a", ticker="AAPL", text="Why ignore margins?")
    batch = drain_interjections("run_a", "AAPL")
    assert len(batch) == 1
    assert batch[0]["text"] == "Why ignore margins?"
    assert drain_interjections("run_a", "AAPL") == []
    clear_run("run_a")


def test_interjection_rejects_inactive_run():
    bind_run("live")
    ok = push_interjection(run_id="stale", ticker="MSFT", text="hello")
    assert ok is False
    clear_run("live")


def test_wait_for_interjections_timeout():
    bind_run("run_b")
    out = wait_for_interjections("run_b", "NVDA", timeout=0.2, poll=0.05)
    assert out == []
    clear_run("run_b")


def test_weather_report_tally():
    signals = {
        "warren_buffett_abc123": {
            "AAPL": {"signal": "bullish", "confidence": 82},
        },
        "michael_burry_def456": {
            "AAPL": {"signal": "bearish", "confidence": 71},
        },
    }
    report = build_weather_report(
        ticker="AAPL",
        analyst_signals=signals,
        decision={"action": "hold", "confidence": 55},
        dossier={"claims": [{"claim": "Quality compounder", "confidence": 80}], "disputes": []},
    )
    assert report["ticker"] == "AAPL"
    assert report["tally"]["bullish"] == 1
    assert report["tally"]["bearish"] == 1
    assert report["boss_action"] == "hold"
    assert report["voice_count"] == 2
