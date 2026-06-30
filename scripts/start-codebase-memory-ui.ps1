# Keeps codebase-memory-mcp UI server alive on localhost:9749
$ErrorActionPreference = "Stop"
$exe = "C:\Users\finnd\AppData\Local\Programs\codebase-memory-mcp\codebase-memory-mcp.exe"
if (-not (Test-Path $exe)) {
  Write-Error "codebase-memory-mcp not found at $exe"
}

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $exe
$psi.Arguments = "--ui=true --port=9749"
$psi.UseShellExecute = $false
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.CreateNoWindow = $true

$proc = [System.Diagnostics.Process]::Start($psi)
$init = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"ui-bootstrap","version":"1"}}}'
$ready = '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}'
$proc.StandardInput.WriteLine($init)
$proc.StandardInput.WriteLine($ready)
$proc.StandardInput.Flush()

Write-Host "codebase-memory UI bootstrap PID $($proc.Id) - http://localhost:9749"
$proc.WaitForExit()
