"""Integration test: shift archive passes shift_id to outcomes."""

from unittest.mock import MagicMock, patch


def test_archive_shift_passes_shift_id_to_outcomes():
    payload = {
        "analyst_signals": {
            "warren_buffett": {
                "NVDA": {"signal": "bullish", "reference_price": 100},
            },
        },
        "current_prices": {"NVDA": 100},
        "decisions": {},
    }

    mock_sb = MagicMock()
    mock_sb.configured = True
    mock_sb.upsert_shift.return_value = {"id": "shift-uuid-123"}

    with patch("app.backend.services.supabase_client.get_supabase", return_value=mock_sb), patch(
        "app.backend.services.scoring_service.store_outcomes_from_payload"
    ) as store_mock:
        from app.backend.services.shift_archive import archive_shift_to_supabase

        archive_shift_to_supabase(
            user_id="user-1",
            run_id="run-1",
            tickers=["NVDA"],
            model="test",
            initial_cash=100000,
            analyst_count=1,
            payload=payload,
        )

    store_mock.assert_called_once()
    assert store_mock.call_args.kwargs["shift_id"] == "shift-uuid-123"
