# Trigger daily watchlist digest against local backend
$base = if ($env:API_BASE_URL) { $env:API_BASE_URL } else { "http://localhost:8000" }
$uri = "$base/hedge-fund/digest/run"
$headers = @{}
if ($env:DIGEST_CRON_SECRET) {
  $headers["X-Digest-Secret"] = $env:DIGEST_CRON_SECRET
}
$cadence = if ($env:DIGEST_CADENCE) { $env:DIGEST_CADENCE } else { "daily" }
$body = @{ cadence = $cadence } | ConvertTo-Json
Invoke-RestMethod -Method POST -Uri $uri -Headers $headers -Body $body -ContentType "application/json"
