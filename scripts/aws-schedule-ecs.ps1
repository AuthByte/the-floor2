# Scale THE FLOOR API ECS service on a daily schedule (saves Fargate compute overnight).
# Default: OFF 6:00 PM – 7:00 AM America/New_York; ON 7:00 AM – 6:00 PM.
#
# Usage:
#   .\scripts\aws-schedule-ecs.ps1
#   .\scripts\aws-schedule-ecs.ps1 -Remove   # delete scheduled actions

param(
    [string]$Region = "us-east-1",
    [string]$Cluster = "the-floor",
    [string]$Service = "the-floor-api",
    [string]$Timezone = "America/New_York",
    [string]$OpenCron = "cron(0 7 * * ? *)",   # 7:00 AM — scale up
    [string]$CloseCron = "cron(0 18 * * ? *)", # 6:00 PM — scale down
    [switch]$Remove
)

$aws = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
if (-not (Test-Path $aws)) { $aws = "aws" }

$ResourceId = "service/$Cluster/$Service"
$StopAction = "the-floor-night-stop"
$StartAction = "the-floor-morning-start"

if ($Remove) {
    foreach ($name in @($StopAction, $StartAction)) {
        & $aws application-autoscaling delete-scheduled-action `
            --service-namespace ecs `
            --scheduled-action-name $name `
            --resource-id $ResourceId `
            --scalable-dimension ecs:service:DesiredCount `
            --region $Region 2>$null
    }
    Write-Host "Removed scheduled scaling actions for $ResourceId"
    exit 0
}

Write-Host "Allowing ECS service to scale to zero..."
& $aws ecs update-service `
    --cluster $Cluster `
    --service $Service `
    --deployment-configuration "minimumHealthyPercent=0,maximumPercent=200" `
    --region $Region `
    --query "service.serviceName" `
    --output text | Out-Null

Write-Host "Registering scalable target (0-1 tasks)..."
& $aws application-autoscaling register-scalable-target `
    --service-namespace ecs `
    --resource-id $ResourceId `
    --scalable-dimension ecs:service:DesiredCount `
    --min-capacity 0 `
    --max-capacity 1 `
    --region $Region

Write-Host "Scheduling scale DOWN at 6:00 PM $Timezone..."
& $aws application-autoscaling put-scheduled-action `
    --service-namespace ecs `
    --scheduled-action-name $StopAction `
    --resource-id $ResourceId `
    --scalable-dimension ecs:service:DesiredCount `
    --schedule $CloseCron `
    --timezone $Timezone `
    --scalable-target-action MinCapacity=0,MaxCapacity=0 `
    --region $Region

Write-Host "Scheduling scale UP at 7:00 AM $Timezone..."
& $aws application-autoscaling put-scheduled-action `
    --service-namespace ecs `
    --scheduled-action-name $StartAction `
    --resource-id $ResourceId `
    --scalable-dimension ecs:service:DesiredCount `
    --schedule $OpenCron `
    --timezone $Timezone `
    --scalable-target-action MinCapacity=1,MaxCapacity=1 `
    --region $Region

Write-Host ""
Write-Host "Done. Floor API schedule:"
Write-Host "  OPEN  7:00 AM - 6:00 PM  ($Timezone)"
Write-Host "  CLOSED 6:00 PM - 7:00 AM (desiredCount = 0, ~2-4 min cold start at open)"
Write-Host ""
Write-Host "Note: ALB (~`$18/mo) still runs 24/7. Fargate compute is what you save."
