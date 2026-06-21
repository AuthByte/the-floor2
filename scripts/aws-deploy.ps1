# THE FLOOR — one-shot AWS deploy helper (PowerShell)
# Prerequisites: AWS CLI configured (`aws configure`) and Docker Desktop running.
param(
  [string]$Region = "us-east-1",
  [string]$Project = "the-floor",
  [string]$RepoName = "the-floor-api",
  [string]$EnvFile = ".env",
  [string]$FrontendOrigin = "http://localhost:5173"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Require-Command($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $name"
  }
}

Require-Command aws
Require-Command docker

$AccountId = (aws sts get-caller-identity --query Account --output text).Trim()
Write-Host "Deploying to account $AccountId in $Region"

# --- ECR ---
$ecrUri = "$AccountId.dkr.ecr.$Region.amazonaws.com/$RepoName"
aws ecr describe-repositories --repository-names $RepoName --region $Region 2>$null `
  | Out-Null
if ($LASTEXITCODE -ne 0) {
  aws ecr create-repository --repository-name $RepoName --region $Region | Out-Null
}

# --- Build & push image ---
$login = aws ecr get-login-password --region $Region
$login | docker login --username AWS --password-stdin "$AccountId.dkr.ecr.$Region.amazonaws.com" | Out-Null
docker build -f docker/Dockerfile.api -t "${ecrUri}:latest" .
docker push "${ecrUri}:latest"

# --- Secrets Manager from .env ---
$secretName = "the-floor/prod"
$envPath = Join-Path $Root $EnvFile
if (-not (Test-Path $envPath)) { throw "Missing $EnvFile" }

$map = @{}
Get-Content $envPath | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $k, $v = $_ -split '=', 2
  $map[$k.Trim()] = $v.Trim()
}

$json = ($map | ConvertTo-Json -Compress)
aws secretsmanager describe-secret --secret-id $secretName --region $Region 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  aws secretsmanager put-secret-value --secret-id $secretName --secret-string $json --region $Region | Out-Null
} else {
  aws secretsmanager create-secret --name $secretName --secret-string $json --region $Region | Out-Null
}
$secretArn = (aws secretsmanager describe-secret --secret-id $secretName --region $Region --query ARN --output text).Trim()

# --- Provision networking + ALB + EFS via bash script if Git Bash/WSL available ---
$bash = Get-Command bash -ErrorAction SilentlyContinue
if ($bash) {
  bash scripts/aws-provision.sh
  if (Test-Path "/tmp/the-floor-infra.env") {
    Get-Content "/tmp/the-floor-infra.env"
  }
} else {
  Write-Warning "bash not found — run scripts/aws-provision.sh from Git Bash or WSL, then re-run task registration below."
}

Write-Host @"

Next manual steps if provision script did not finish:
1. Fill EFS IDs in .aws/task-definition.json (fs-REPLACE_ME, fsap-REPLACE_ME)
2. Update secret ARNs in task definition to: $secretArn
3. Set CORS_ORIGINS to: $FrontendOrigin
4. Register task + create ECS service in console, or run:
   aws ecs register-task-definition --cli-input-json file://.aws/task-definition.json --region $Region

Image URI: ${ecrUri}:latest
ALB health check path: /health
"@
