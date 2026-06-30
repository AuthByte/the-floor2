import pytest
from unittest.mock import Mock, patch, call

from src.tools.api import _make_api_request, get_prices

# Rate limiting now lives in the shared HTTP helper (src.tools.http). The public
# ``_make_api_request`` in src.tools.api is a re-export of that helper, so the
# ``requests``/``time`` symbols to patch live on the http module.
HTTP_MODULE = "src.tools.http"


class TestRateLimiting:
    """Test suite for API rate limiting functionality."""

    @patch(f"{HTTP_MODULE}.time.sleep")
    @patch(f"{HTTP_MODULE}.requests.get")
    def test_handles_single_rate_limit(self, mock_get, mock_sleep):
        """Test that API retries once after a 429 and succeeds."""
        mock_429_response = Mock()
        mock_429_response.status_code = 429

        mock_200_response = Mock()
        mock_200_response.status_code = 200
        mock_200_response.text = "Success"

        mock_get.side_effect = [mock_429_response, mock_200_response]

        headers = {"X-API-KEY": "test-key"}
        url = "https://api.financialdatasets.ai/test"

        result = _make_api_request(url, headers)

        assert result.status_code == 200
        assert result.text == "Success"

        assert mock_get.call_count == 2
        mock_get.assert_has_calls([
            call(url, headers=headers, timeout=30),
            call(url, headers=headers, timeout=30),
        ])

        # First retry waits 60 seconds.
        mock_sleep.assert_called_once_with(60)

    @patch(f"{HTTP_MODULE}.time.sleep")
    @patch(f"{HTTP_MODULE}.requests.get")
    def test_handles_multiple_rate_limits(self, mock_get, mock_sleep):
        """Test that API retries multiple times after 429s."""
        mock_429_response = Mock()
        mock_429_response.status_code = 429

        mock_200_response = Mock()
        mock_200_response.status_code = 200
        mock_200_response.text = "Success"

        mock_get.side_effect = [
            mock_429_response,
            mock_429_response,
            mock_429_response,
            mock_200_response,
        ]

        headers = {"X-API-KEY": "test-key"}
        url = "https://api.financialdatasets.ai/test"

        result = _make_api_request(url, headers)

        assert result.status_code == 200
        assert result.text == "Success"

        assert mock_get.call_count == 4

        # Linear backoff: 60s, 90s, 120s.
        assert mock_sleep.call_count == 3
        mock_sleep.assert_has_calls([call(60), call(90), call(120)])

    @patch(f"{HTTP_MODULE}.time.sleep")
    @patch(f"{HTTP_MODULE}.requests.post")
    def test_handles_post_rate_limiting(self, mock_post, mock_sleep):
        """Test that POST requests handle rate limiting."""
        mock_429_response = Mock()
        mock_429_response.status_code = 429

        mock_200_response = Mock()
        mock_200_response.status_code = 200
        mock_200_response.text = "Success"

        mock_post.side_effect = [mock_429_response, mock_200_response]

        headers = {"X-API-KEY": "test-key"}
        url = "https://api.financialdatasets.ai/test"
        json_data = {"test": "data"}

        result = _make_api_request(url, headers, method="POST", json_data=json_data)

        assert result.status_code == 200
        assert result.text == "Success"

        assert mock_post.call_count == 2
        mock_post.assert_has_calls([
            call(url, headers=headers, json=json_data, timeout=30),
            call(url, headers=headers, json=json_data, timeout=30),
        ])

        mock_sleep.assert_called_once_with(60)

    @patch(f"{HTTP_MODULE}.time.sleep")
    @patch(f"{HTTP_MODULE}.requests.get")
    def test_ignores_other_errors(self, mock_get, mock_sleep):
        """Test that non-429 errors are returned without retrying."""
        mock_500_response = Mock()
        mock_500_response.status_code = 500
        mock_500_response.text = "Internal Server Error"

        mock_get.return_value = mock_500_response

        headers = {"X-API-KEY": "test-key"}
        url = "https://api.financialdatasets.ai/test"

        result = _make_api_request(url, headers)

        assert result.status_code == 500
        assert result.text == "Internal Server Error"

        assert mock_get.call_count == 1
        mock_sleep.assert_not_called()

    @patch(f"{HTTP_MODULE}.time.sleep")
    @patch(f"{HTTP_MODULE}.requests.get")
    def test_normal_success_requests(self, mock_get, mock_sleep):
        """Test that successful requests return immediately without retry."""
        mock_200_response = Mock()
        mock_200_response.status_code = 200
        mock_200_response.text = "Success"

        mock_get.return_value = mock_200_response

        headers = {"X-API-KEY": "test-key"}
        url = "https://api.financialdatasets.ai/test"

        result = _make_api_request(url, headers)

        assert result.status_code == 200
        assert result.text == "Success"

        assert mock_get.call_count == 1
        mock_sleep.assert_not_called()

    @patch("src.tools.api._cache")
    def test_get_prices_serves_from_cache(self, mock_cache):
        """get_prices should return cached candles without hitting the network."""
        mock_cache.get_prices.return_value = [
            {
                "time": "2024-01-01T00:00:00Z",
                "open": 100.0,
                "close": 101.0,
                "high": 102.0,
                "low": 99.0,
                "volume": 1000,
            }
        ]

        with patch(f"{HTTP_MODULE}.requests.get") as mock_get:
            result = get_prices("AAPL", "2024-01-01", "2024-01-02")

        assert len(result) == 1
        assert result[0].open == 100.0
        assert result[0].close == 101.0

        mock_cache.get_prices.assert_called_once()
        # Cache hit must short-circuit before any HTTP call.
        mock_get.assert_not_called()

    @patch(f"{HTTP_MODULE}.time.sleep")
    @patch(f"{HTTP_MODULE}.requests.get")
    def test_max_retries_exceeded(self, mock_get, mock_sleep):
        """Test that function stops retrying after max_retries and returns final 429."""
        mock_429_response = Mock()
        mock_429_response.status_code = 429
        mock_429_response.text = "Too Many Requests"

        mock_get.return_value = mock_429_response

        headers = {"X-API-KEY": "test-key"}
        url = "https://api.financialdatasets.ai/test"

        result = _make_api_request(url, headers, max_retries=2)

        assert result.status_code == 429
        assert result.text == "Too Many Requests"

        # 1 initial + 2 retries.
        assert mock_get.call_count == 3

        # Linear backoff: 60s, 90s.
        assert mock_sleep.call_count == 2
        mock_sleep.assert_has_calls([call(60), call(90)])


if __name__ == "__main__":
    pytest.main([__file__])
