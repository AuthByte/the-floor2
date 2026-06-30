# Trigger scheduled shift cron against local backend
$base = if ($env:API_BASE_URL) { $env:API_BASE_URL } else { "http://localhost:8000" }
$uri = "$base/hedge-fund/schedules/run"
$headers = @{}
if ($env:SCHEDULE_CRON_SECRET) {
  $headers["X-Schedule-Secret"] = $env:SCHEDULE_CRON_SECRET
}
Invoke-RestMethod -Method POST -Uri $uri -Headers $headers -ContentType "application/json"
