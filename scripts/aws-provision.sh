#!/usr/bin/env bash
# Provision THE FLOOR API on AWS (ECS Fargate + ALB + ECR + EFS).
# Run from AWS CloudShell in us-east-1 after cloning the repo or uploading this script.
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
PROJECT="the-floor"
REPO="the-floor-api"
CLUSTER="${PROJECT}"
SERVICE="${PROJECT}-api"

echo "Account: $ACCOUNT_ID  Region: $REGION"

# --- ECR ---
aws ecr describe-repositories --repository-names "$REPO" --region "$REGION" 2>/dev/null \
  || aws ecr create-repository --repository-name "$REPO" --region "$REGION" \
       --image-scanning-configuration scanOnPush=true

# --- CloudWatch logs ---
aws logs create-log-group --log-group-name "/ecs/${REPO}" --region "$REGION" 2>/dev/null || true

# --- ECS cluster ---
aws ecs describe-clusters --clusters "$CLUSTER" --region "$REGION" \
  --query 'clusters[?status==`ACTIVE`].clusterName' --output text | grep -q "$CLUSTER" \
  || aws ecs create-cluster --cluster-name "$CLUSTER" --region "$REGION"

# --- Default VPC + subnets ---
VPC_ID="$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text --region "$REGION")"
SUBNETS="$(aws ec2 describe-subnets --filters Name=vpc-id,Values="$VPC_ID" --query 'Subnets[*].SubnetId' --output text --region "$REGION")"
SUBNET_A="$(echo "$SUBNETS" | awk '{print $1}')"
SUBNET_B="$(echo "$SUBNETS" | awk '{print $2}')"

echo "VPC: $VPC_ID  Subnets: $SUBNET_A $SUBNET_B"

# --- Security groups ---
ALB_SG="$(aws ec2 create-security-group --group-name "${PROJECT}-alb-sg" --description "ALB for THE FLOOR" --vpc-id "$VPC_ID" --region "$REGION" --query GroupId --output text 2>/dev/null \
  || aws ec2 describe-security-groups --filters Name=group-name,Values="${PROJECT}-alb-sg" --query 'SecurityGroups[0].GroupId' --output text --region "$REGION")"
ECS_SG="$(aws ec2 create-security-group --group-name "${PROJECT}-ecs-sg" --description "ECS tasks for THE FLOOR" --vpc-id "$VPC_ID" --region "$REGION" --query GroupId --output text 2>/dev/null \
  || aws ec2 describe-security-groups --filters Name=group-name,Values="${PROJECT}-ecs-sg" --query 'SecurityGroups[0].GroupId' --output text --region "$REGION")"
EFS_SG="$(aws ec2 create-security-group --group-name "${PROJECT}-efs-sg" --description "EFS for THE FLOOR" --vpc-id "$VPC_ID" --region "$REGION" --query GroupId --output text 2>/dev/null \
  || aws ec2 describe-security-groups --filters Name=group-name,Values="${PROJECT}-efs-sg" --query 'SecurityGroups[0].GroupId' --output text --region "$REGION")"

aws ec2 authorize-security-group-ingress --group-id "$ALB_SG" --protocol tcp --port 80 --cidr 0.0.0.0/0 --region "$REGION" 2>/dev/null || true
aws ec2 authorize-security-group-ingress --group-id "$ECS_SG" --protocol tcp --port 8000 --source-group "$ALB_SG" --region "$REGION" 2>/dev/null || true
aws ec2 authorize-security-group-ingress --group-id "$EFS_SG" --protocol tcp --port 2049 --source-group "$ECS_SG" --region "$REGION" 2>/dev/null || true

# --- EFS ---
EFS_ID="$(aws efs describe-file-systems --region "$REGION" --query "FileSystems[?Name=='${PROJECT}-data'].FileSystemId | [0]" --output text)"
if [[ "$EFS_ID" == "None" || -z "$EFS_ID" ]]; then
  EFS_ID="$(aws efs create-file-system --creation-token "${PROJECT}-data" --tags Key=Name,Value="${PROJECT}-data" --region "$REGION" --query FileSystemId --output text)"
  echo "Waiting for EFS $EFS_ID..."
  aws efs describe-file-systems --file-system-id "$EFS_ID" --region "$REGION" --query 'FileSystems[0].LifeCycleState' --output text
  sleep 15
fi

for SUBNET in $SUBNET_A $SUBNET_B; do
  aws efs create-mount-target --file-system-id "$EFS_ID" --subnet-id "$SUBNET" --security-groups "$EFS_SG" --region "$REGION" 2>/dev/null || true
done

EFS_AP="$(aws efs describe-access-points --file-system-id "$EFS_ID" --region "$REGION" --query 'AccessPoints[0].AccessPointId' --output text)"
if [[ "$EFS_AP" == "None" || -z "$EFS_AP" ]]; then
  EFS_AP="$(aws efs create-access-point \
    --file-system-id "$EFS_ID" \
    --posix-user Uid=0,Gid=0 \
    --root-directory Path=/data,CreationInfo={OwnerUid=0,OwnerGid=0,Permissions=0777} \
    --region "$REGION" --query AccessPointId --output text)"
fi

echo "EFS: $EFS_ID  AccessPoint: $EFS_AP"

# --- Secrets (skip if exists) ---
SECRET_NAME="the-floor/prod"
if ! aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$REGION" >/dev/null 2>&1; then
  echo "Create secret $SECRET_NAME in console or run:"
  echo "  aws secretsmanager create-secret --name $SECRET_NAME --secret-string file://secrets.json"
fi

SECRET_ARN="$(aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$REGION" --query ARN --output text 2>/dev/null || echo "")"

# --- IAM roles (execution + task) ---
cat > /tmp/trust-ecs.json <<'EOF'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}
EOF

EXEC_ROLE="ecsTaskExecutionRole"
aws iam get-role --role-name "$EXEC_ROLE" >/dev/null 2>&1 || {
  aws iam create-role --role-name "$EXEC_ROLE" --assume-role-policy-document file:///tmp/trust-ecs.json
  aws iam attach-role-policy --role-name "$EXEC_ROLE" --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
}

TASK_ROLE="${PROJECT}-api-task"
aws iam get-role --role-name "$TASK_ROLE" >/dev/null 2>&1 || {
  aws iam create-role --role-name "$TASK_ROLE" --assume-role-policy-document file:///tmp/trust-ecs.json
  aws iam attach-role-policy --role-name "$TASK_ROLE" --policy-arn arn:aws:iam::aws:policy/AmazonElasticFileSystemClientFullAccess
}

# --- ALB ---
ALB_ARN="$(aws elbv2 describe-load-balancers --names "${PROJECT}-alb" --region "$REGION" --query 'LoadBalancers[0].LoadBalancerArn' --output text 2>/dev/null || echo "None")"
if [[ "$ALB_ARN" == "None" || -z "$ALB_ARN" ]]; then
  ALB_ARN="$(aws elbv2 create-load-balancer \
    --name "${PROJECT}-alb" \
    --subnets "$SUBNET_A" "$SUBNET_B" \
    --security-groups "$ALB_SG" \
    --scheme internet-facing \
    --type application \
    --region "$REGION" --query 'LoadBalancers[0].LoadBalancerArn' --output text)"
fi

TG_ARN="$(aws elbv2 describe-target-groups --names "${PROJECT}-tg" --region "$REGION" --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || echo "None")"
if [[ "$TG_ARN" == "None" || -z "$TG_ARN" ]]; then
  TG_ARN="$(aws elbv2 create-target-group \
    --name "${PROJECT}-tg" \
    --protocol HTTP --port 8000 \
    --vpc-id "$VPC_ID" \
    --target-type ip \
    --health-check-path /health \
    --health-check-interval-seconds 30 \
    --region "$REGION" --query 'TargetGroups[0].TargetGroupArn' --output text)"
  aws elbv2 modify-target-group-attributes \
    --target-group-arn "$TG_ARN" \
    --attributes Key=idle_timeout.timeout_seconds,Value=4000 \
    --region "$REGION" 2>/dev/null || true
fi

aws elbv2 describe-listeners --load-balancer-arn "$ALB_ARN" --region "$REGION" --query 'Listeners[?Port==`80`].ListenerArn' --output text | grep -q . \
  || aws elbv2 create-listener --load-balancer-arn "$ALB_ARN" --protocol HTTP --port 80 \
       --default-actions Type=forward,TargetGroupArn="$TG_ARN" --region "$REGION"

ALB_DNS="$(aws elbv2 describe-load-balancers --load-balancer-arns "$ALB_ARN" --region "$REGION" --query 'LoadBalancers[0].DNSName' --output text)"

echo "ALB DNS: http://$ALB_DNS"

# Save outputs for task definition
cat > /tmp/the-floor-infra.env <<EOF
ACCOUNT_ID=$ACCOUNT_ID
REGION=$REGION
EFS_ID=$EFS_ID
EFS_AP=$EFS_AP
EXEC_ROLE_ARN=arn:aws:iam::${ACCOUNT_ID}:role/${EXEC_ROLE}
TASK_ROLE_ARN=arn:aws:iam::${ACCOUNT_ID}:role/${TASK_ROLE}
SUBNET_A=$SUBNET_A
SUBNET_B=$SUBNET_B
ECS_SG=$ECS_SG
TG_ARN=$TG_ARN
ALB_DNS=$ALB_DNS
SECRET_ARN=$SECRET_ARN
EOF

echo "Wrote /tmp/the-floor-infra.env"
cat /tmp/the-floor-infra.env
