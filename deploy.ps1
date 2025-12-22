# LinkedEye-FinSpot Quick Deployment Script
# Deploys the new alert management features to Kubernetes

param(
    [Parameter(Mandatory=$false)]
    [string]$ImageTag = "latest",
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipBuild,
    
    [Parameter(Mandatory=$false)]
    [switch]$WatchLogs
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " LinkedEye-FinSpot Deployment Script" -ForegroundColor Cyan
Write-Host " Alert Management Feature Update" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$NAMESPACE = "linkedeye-finspot"
$DEPLOYMENT = "linkedeye-frontend"
$REGISTRY = "registry.gitlab.com/finspot-le-dev/fs-le-dev-finspot-incident-tool"

# Step 1: Check prerequisites
Write-Host "[1/6] Checking prerequisites..." -ForegroundColor Yellow

# Check kubectl
try {
    $kubectlVersion = kubectl version --client --short 2>$null
    Write-Host "  ✓ kubectl is installed: $kubectlVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ kubectl is not installed or not in PATH" -ForegroundColor Red
    exit 1
}

# Check cluster connectivity
try {
    kubectl cluster-info | Out-Null
    Write-Host "  ✓ Connected to Kubernetes cluster" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Cannot connect to Kubernetes cluster" -ForegroundColor Red
    exit 1
}

# Check namespace
try {
    kubectl get namespace $NAMESPACE | Out-Null
    Write-Host "  ✓ Namespace '$NAMESPACE' exists" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Namespace '$NAMESPACE' not found" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 2: Show current deployment status
Write-Host "[2/6] Checking current deployment status..." -ForegroundColor Yellow

try {
    $currentImage = kubectl get deployment $DEPLOYMENT -n $NAMESPACE -o jsonpath='{.spec.template.spec.containers[0].image}'
    Write-Host "  Current image: $currentImage" -ForegroundColor Cyan
    
    $pods = kubectl get pods -n $NAMESPACE -l app=$DEPLOYMENT --no-headers
    Write-Host "  Current pods:" -ForegroundColor Cyan
    Write-Host $pods
} catch {
    Write-Host "  ✗ Deployment '$DEPLOYMENT' not found" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 3: Build Docker image (optional)
if (-not $SkipBuild) {
    Write-Host "[3/6] Building Docker image..." -ForegroundColor Yellow
    Write-Host "  Note: Building locally. For production, use GitLab CI/CD pipeline." -ForegroundColor Cyan
    Write-Host "  Skipping build step. Use GitLab CI/CD or set -SkipBuild to skip this." -ForegroundColor Yellow
} else {
    Write-Host "[3/6] Skipping Docker build (using existing image)..." -ForegroundColor Yellow
}

Write-Host ""

# Step 4: Update deployment
Write-Host "[4/6] Updating Kubernetes deployment..." -ForegroundColor Yellow

$newImage = "${REGISTRY}/frontend:${ImageTag}"
Write-Host "  Target image: $newImage" -ForegroundColor Cyan

$confirmation = Read-Host "  Do you want to proceed with deployment? (yes/no)"
if ($confirmation -ne "yes") {
    Write-Host "  Deployment cancelled by user" -ForegroundColor Yellow
    exit 0
}

try {
    if ($ImageTag -eq "latest") {
        # Force restart to pull latest
        Write-Host "  Restarting deployment to pull latest image..." -ForegroundColor Cyan
        kubectl rollout restart deployment/$DEPLOYMENT -n $NAMESPACE
    } else {
        # Update to specific version
        Write-Host "  Updating to specific image version..." -ForegroundColor Cyan
        kubectl set image deployment/$DEPLOYMENT $DEPLOYMENT=$newImage -n $NAMESPACE
    }
    
    Write-Host "  ✓ Deployment update initiated" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Failed to update deployment: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 5: Wait for rollout
Write-Host "[5/6] Waiting for rollout to complete..." -ForegroundColor Yellow

try {
    kubectl rollout status deployment/$DEPLOYMENT -n $NAMESPACE --timeout=5m
    Write-Host "  ✓ Rollout completed successfully" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Rollout failed or timed out" -ForegroundColor Red
    Write-Host "  Run 'kubectl get pods -n $NAMESPACE' to check pod status" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Step 6: Verify deployment
Write-Host "[6/6] Verifying deployment..." -ForegroundColor Yellow

try {
    # Check pod status
    $runningPods = kubectl get pods -n $NAMESPACE -l app=$DEPLOYMENT --field-selector=status.phase=Running --no-headers | Measure-Object | Select-Object -ExpandProperty Count
    Write-Host "  ✓ Running pods: $runningPods" -ForegroundColor Green
    
    # Check if alerts template exists
    $podName = kubectl get pods -n $NAMESPACE -l app=$DEPLOYMENT -o jsonpath='{.items[0].metadata.name}'
    Write-Host "  Checking for alerts template in pod: $podName" -ForegroundColor Cyan
    
    $templateCheck = kubectl exec -n $NAMESPACE $podName -- ls /app/templates/alerts/ 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Alerts template found: $templateCheck" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ Alerts template not found (image may not be updated)" -ForegroundColor Yellow
    }
    
    # Show recent logs
    Write-Host "`n  Recent logs from new pods:" -ForegroundColor Cyan
    kubectl logs -n $NAMESPACE deployment/$DEPLOYMENT --tail=10
    
} catch {
    Write-Host "  ⚠ Verification encountered issues: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Test the alerts page: https://fs-le-dev-inc.finspot.in/alerts" -ForegroundColor Cyan
Write-Host "  2. Click 'Alerts' in sidebar to verify navigation" -ForegroundColor Cyan
Write-Host "  3. Test alert filtering and editing features" -ForegroundColor Cyan
Write-Host ""
Write-Host "Useful commands:" -ForegroundColor Yellow
Write-Host "  View logs:    kubectl logs -n $NAMESPACE deployment/$DEPLOYMENT -f" -ForegroundColor Cyan
Write-Host "  Check pods:   kubectl get pods -n $NAMESPACE -l app=$DEPLOYMENT" -ForegroundColor Cyan
Write-Host "  Rollback:     kubectl rollout undo deployment/$DEPLOYMENT -n $NAMESPACE" -ForegroundColor Cyan
Write-Host ""

# Watch logs if requested
if ($WatchLogs) {
    Write-Host "Watching logs (Ctrl+C to exit)..." -ForegroundColor Yellow
    kubectl logs -n $NAMESPACE deployment/$DEPLOYMENT -f
}
