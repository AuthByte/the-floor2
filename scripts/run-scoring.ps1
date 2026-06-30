# Trigger daily scoring against local backend
$base = if ($env:API_BASE_URL) { $env:API_BASE_URL } else { "http://localhost:8000" }
$uri = "$base/hedge-fund/scoring/run"
$headers = @{}
if ($env:SCORING_CRON_SECRET) {
  $headers["X-Scoring-Secret"] = $env:SCORING_CRON_SECRET
}
Invoke-RestMethod -Method POST -Uri $uri -Headers $headers
