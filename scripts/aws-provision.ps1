# Provision THE FLOOR on AWS (PowerShell)
$ErrorActionPreference = "Stop"
$aws = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$Region = "us-east-1"
$Project = "the-floor"
$Repo = "the-floor-api"

function Invoke-Aws([string[]]$Args) {
  $out = & $aws @Args --region $Region --output json 2>&1
  if ($LASTEXITCODE -ne 0) { throw ($out | Out-String) }
  if ($out) { return $out | ConvertFrom-Json }
  return $null
}

$identity = Invoke-Aws @("sts", "get-caller-identity")
$AccountId = $identity.Account
Write-Host "Account $AccountId"

$vpc = Invoke-Aws @("ec2", "describe-vpcs", "--filters", "Name=isDefault,Values=true")
$VpcId = $vpc.Vpcs[0].VpcId
$subnets = Invoke-Aws @("ec2", "describe-subnets", "--filters", "Name=vpc-id,Values=$VpcId")
$subnetIds = @($subnets.Subnets | Select-Object -ExpandProperty SubnetId)
$SubnetA = $subnetIds[0]
$SubnetB = $subnetIds[1]
Write-Host "VPC $VpcId subnets $SubnetA $SubnetB"

function Get-OrCreate-Sg($Name, $Desc) {
  try {
    $sg = Invoke-Aws @("ec2", "create-security-group", "--group-name", $Name, "--description", $Desc, "--vpc-id", $VpcId)
    return $sg.GroupId
  } catch {
    $existing = Invoke-Aws @("ec2", "describe-security-groups", "--filters", "Name=group-name,Values=$Name")
    return $existing.SecurityGroups[0].GroupId
  }
}

$AlbSg = Get-OrCreate-Sg "${Project}-alb-sg" "ALB for THE FLOOR"
$EcsSg = Get-OrCreate-Sg "${Project}-ecs-sg" "ECS tasks for THE FLOOR"
$EfsSg = Get-OrCreate-Sg "${Project}-efs-sg" "EFS for THE FLOOR"

& $aws ec2 authorize-security-group-ingress --group-id $AlbSg --protocol tcp --port 80 --cidr 0.0.0.0/0 --region $Region 2>$null
& $aws ec2 authorize-security-group-ingress --group-id $EcsSg --protocol tcp --port 8000 --source-group $AlbSg --region $Region 2>$null
& $aws ec2 authorize-security-group-ingress --group-id $EfsSg --protocol tcp --port 2049 --source-group $EcsSg --region $Region 2>$null

$efsList = Invoke-Aws @("efs", "describe-file-systems")
$efsMatch = $efsList.FileSystems | Where-Object { $_.Name -eq "${Project}-data" } | Select-Object -First 1
if ($efsMatch) {
  $EfsId = $efsMatch.FileSystemId
} else {
  $efs = Invoke-Aws @("efs", "create-file-system", "--creation-token", "${Project}-data", "--tags", "Key=Name,Value=${Project}-data")
  $EfsId = $efs.FileSystemId
  Start-Sleep -Seconds 20
}

foreach ($sn in @($SubnetA, $SubnetB)) {
  & $aws efs create-mount-target --file-system-id $EfsId --subnet-id $sn --security-groups $EfsSg --region $Region 2>$null
}

$apList = Invoke-Aws @("efs", "describe-access-points", "--file-system-id", $EfsId)
if ($apList.AccessPoints.Count -gt 0) {
  $EfsAp = $apList.AccessPoints[0].AccessPointId
} else {
  $ap = Invoke-Aws @(
    "efs", "create-access-point",
    "--file-system-id", $EfsId,
    "--posix-user", "Uid=0,Gid=0",
    "--root-directory", "Path=/data,CreationInfo={OwnerUid=0,OwnerGid=0,Permissions=0777}"
  )
  $EfsAp = $ap.AccessPointId
}

# IAM roles
$trust = '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
$trustFile = [IO.Path]::GetTempFileName()
Set-Content -Path $trustFile -Value $trust -NoNewline
try {
  & $aws iam get-role --role-name ecsTaskExecutionRole 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Invoke-Aws @("iam", "create-role", "--role-name", "ecsTaskExecutionRole", "--assume-role-policy-document", "file://$trustFile") | Out-Null
    & $aws iam attach-role-policy --role-name ecsTaskExecutionRole --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
  }
  $taskRole = "${Project}-api-task"
  & $aws iam get-role --role-name $taskRole 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Invoke-Aws @("iam", "create-role", "--role-name", $taskRole, "--assume-role-policy-document", "file://$trustFile") | Out-Null
    & $aws iam attach-role-policy --role-name $taskRole --policy-arn arn:aws:iam::aws:policy/AmazonElasticFileSystemClientFullAccess
  }
} finally { Remove-Item $trustFile -Force }

# Secrets from .env
$envPath = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
$map = @{}
Get-Content $envPath | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $k, $v = $_ -split '=', 2
  $map[$k.Trim()] = $v.Trim()
}
$secretJson = ($map | ConvertTo-Json -Compress)
$secretName = "the-floor/prod"
& $aws secretsmanager describe-secret --secret-id $secretName --region $Region 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  & $aws secretsmanager put-secret-value --secret-id $secretName --secret-string $secretJson --region $Region | Out-Null
} else {
  & $aws secretsmanager create-secret --name $secretName --secret-string $secretJson --region $Region | Out-Null
}
$secretArn = (& $aws secretsmanager describe-secret --secret-id $secretName --region $Region --query ARN --output text).Trim()
$secretSuffix = $secretArn.Split(":secret:")[1]

# ALB
try {
  $alb = Invoke-Aws @("elbv2", "describe-load-balancers", "--names", "${Project}-alb")
  $AlbArn = $alb.LoadBalancers[0].LoadBalancerArn
} catch {
  $alb = Invoke-Aws @(
    "elbv2", "create-load-balancer",
    "--name", "${Project}-alb",
    "--subnets", $SubnetA, $SubnetB,
    "--security-groups", $AlbSg,
    "--scheme", "internet-facing",
    "--type", "application"
  )
  $AlbArn = $alb.LoadBalancers[0].LoadBalancerArn
}

& $aws elbv2 modify-load-balancer-attributes `
  --load-balancer-arn $AlbArn `
  --attributes Key=idle_timeout.timeout_seconds,Value=4000 `
  --region $Region | Out-Null

try {
  $tg = Invoke-Aws @("elbv2", "describe-target-groups", "--names", "${Project}-tg")
  $TgArn = $tg.TargetGroups[0].TargetGroupArn
} catch {
  $tg = Invoke-Aws @(
    "elbv2", "create-target-group",
    "--name", "${Project}-tg",
    "--protocol", "HTTP",
    "--port", "8000",
    "--vpc-id", $VpcId,
    "--target-type", "ip",
    "--health-check-path", "/health"
  )
  $TgArn = $tg.TargetGroups[0].TargetGroupArn
}

$listeners = Invoke-Aws @("elbv2", "describe-listeners", "--load-balancer-arn", $AlbArn)
if (-not ($listeners.Listeners | Where-Object { $_.Port -eq 80 })) {
  Invoke-Aws @(
    "elbv2", "create-listener",
    "--load-balancer-arn", $AlbArn,
    "--protocol", "HTTP",
    "--port", "80",
    "--default-actions", "Type=forward,TargetGroupArn=$TgArn"
  ) | Out-Null
}

$AlbDns = (Invoke-Aws @("elbv2", "describe-load-balancers", "--load-balancer-arns", $AlbArn)).LoadBalancers[0].DNSName

$out = @{
  ACCOUNT_ID = $AccountId
  REGION = $Region
  EFS_ID = $EfsId
  EFS_AP = $EfsAp
  SUBNET_A = $SubnetA
  SUBNET_B = $SubnetB
  ECS_SG = $EcsSg
  TG_ARN = $TgArn
  ALB_DNS = $AlbDns
  SECRET_ARN = $secretArn
  SECRET_SUFFIX = $secretSuffix
}
$outPath = Join-Path (Split-Path $PSScriptRoot -Parent) ".aws\infra.env.json"
$out | ConvertTo-Json | Set-Content $outPath
Write-Host "Saved $outPath"
Write-Host "API URL (after deploy): http://$AlbDns"
$out | Format-List
