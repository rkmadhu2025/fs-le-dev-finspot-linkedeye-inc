# LinkedEye-FinSpot Deployment Guide
## Alert Management Feature Update

This guide will help you deploy the new alert management features to your Kubernetes cluster.

---

## 🎯 Changes Included

### Frontend Changes:
1. **New Alerts Page** (`/frontend/templates/alerts/list.html`)
   - Full-featured alert management interface
   - Filtering by status, severity, and search
   - Edit modal for updating alert details
   - Summary statistics dashboard

2. **Updated Flask Routes** (`/frontend/app.py`)
   - New `/alerts` route handler
   - Properly secured with `@login_required`

3. **Fixed Navigation** (`/frontend/templates/components/layout.html`)
   - Updated sidebar "Alerts" link to point to `/alerts` instead of `#`
   - Added active state highlighting

---

## 📋 Prerequisites

- `kubectl` configured and authenticated to your cluster
- Docker installed and authenticated to GitLab registry
- Git repository access to push changes
- GitLab CI/CD pipeline configured (or manual build capability)

---

## 🚀 Deployment Steps

### **Step 1: Verify Current Deployment Status**

```powershell
# Check current pod status
kubectl get pods -n linkedeye-finspot

# Check current frontend image
kubectl get deployment linkedeye-frontend -n linkedeye-finspot -o jsonpath='{.spec.template.spec.containers[0].image}'
```

Expected output should show running pods and the current image tag.

---

### **Step 2: Build and Push New Frontend Docker Image**

#### Option A: Using GitLab CI/CD (Recommended)

```powershell
# Commit and push your changes
cd frontend
git add templates/alerts/list.html
git add templates/components/layout.html
git add app.py
git commit -m "feat: Add alert management page and fix navigation links"
git push origin main

# GitLab CI/CD will automatically build and push the new image
# Monitor the pipeline at: https://gitlab.com/finspot-le-dev/fs-le-dev-finspot-incident-tool/-/pipelines
```

#### Option B: Manual Docker Build

```powershell
# Navigate to frontend directory
cd frontend

# Build the Docker image
docker build -t registry.gitlab.com/finspot-le-dev/fs-le-dev-finspot-incident-tool/frontend:v1.1.0 .

# Push to registry
docker push registry.gitlab.com/finspot-le-dev/fs-le-dev-finspot-incident-tool/frontend:v1.1.0
```

---

### **Step 3: Update Kubernetes Deployment**

#### Option A: Using Latest Tag (If CI/CD Built)

```powershell
# Restart deployment to pull latest image
kubectl rollout restart deployment linkedeye-frontend -n linkedeye-finspot

# Monitor rollout status
kubectl rollout status deployment linkedeye-frontend -n linkedeye-finspot
```

#### Option B: Update to Specific Version

```powershell
# Update the deployment with new image version
kubectl set image deployment/linkedeye-frontend linkedeye-frontend=registry.gitlab.com/finspot-le-dev/fs-le-dev-finspot-incident-tool/frontend:v1.1.0 -n linkedeye-finspot

# Monitor rollout
kubectl rollout status deployment linkedeye-frontend -n linkedeye-finspot
```

---

### **Step 4: Verify Deployment**

```powershell
# Check pod status (should show 2/2 running with new pods)
kubectl get pods -n linkedeye-finspot -l app=linkedeye-frontend

# Check if alerts template exists in new pods
kubectl exec -n linkedeye-finspot deployment/linkedeye-frontend -- ls -la /app/templates/alerts/

# Expected output: list.html should be present

# View frontend logs for any errors
kubectl logs -n linkedeye-finspot deployment/linkedeye-frontend --tail=50
```

---

### **Step 5: Test the New Features**

1. **Navigate to Alerts Page:**
   - Open: `https://fs-le-dev-inc.finspot.in/alerts`
   - Should load successfully (not 404)

2. **Check Sidebar Link:**
   - Click "Alerts" in the sidebar
   - Should navigate to `/alerts` page
   - Link should be highlighted when on alerts page

3. **Test Alert Filtering:**
   - Use status, severity, and search filters
   - Verify alerts display correctly

4. **Test Alert Editing:**
   - Click edit icon on an alert
   - Modify alert details
   - Save and verify changes persist

---

## 🔧 Troubleshooting

### Issue: Pods show ImagePullBackOff

```powershell
# Check if GitLab registry secret is configured
kubectl get secret gitlab-registry-secret -n linkedeye-finspot

# If missing, create it:
kubectl create secret docker-registry gitlab-registry-secret \
  --docker-server=registry.gitlab.com \
  --docker-username=YOUR_GITLAB_USERNAME \
  --docker-password=YOUR_GITLAB_ACCESS_TOKEN \
  --docker-email=YOUR_EMAIL \
  -n linkedeye-finspot
```

### Issue: 404 Error on /alerts Still Persists

```powershell
# Verify new pods are running
kubectl get pods -n linkedeye-finspot -l app=linkedeye-frontend

# Check if old pods are still terminating
kubectl get pods -n linkedeye-finspot -o wide

# Force delete old pods if needed
kubectl delete pod <OLD_POD_NAME> -n linkedeye-finspot --grace-period=0 --force

# Clear browser cache and hard refresh (Ctrl+Shift+R)
```

### Issue: Alerts Not Loading (Empty List)

This is expected if there are no alerts in the database. To test:

1. **Create Test Alerts via Webhook:**
```powershell
# From your local machine or a pod
kubectl port-forward -n linkedeye-finspot svc/linkedeye-backend-service 5000:5000

# Then send test alert (in another terminal):
curl -X POST http://localhost:5000/api/v1/webhooks/alertmanager \
  -H "Content-Type: application/json" \
  -d '{
    "alerts": [{
      "labels": {
        "alertname": "HighCPUUsage",
        "severity": "critical",
        "instance": "server-01"
      },
      "annotations": {
        "summary": "CPU usage above 90%",
        "description": "Server CPU has been above 90% for 5 minutes"
      },
      "startsAt": "2025-12-23T00:00:00Z",
      "status": "firing"
    }]
  }'
```

2. **Verify in Database:**
```powershell
# Connect to backend pod
kubectl exec -it -n linkedeye-finspot deployment/linkedeye-backend -- sh

# Inside pod:
npx prisma studio
# Or check via Node REPL:
node
> const { PrismaClient } = require('@prisma/client')
> const prisma = new PrismaClient()
> prisma.alert.count().then(console.log)
```

---

## 🔍 Database Connection Verification

The database connection is already working in K8s. To verify:

```powershell
# Test database connectivity
kubectl exec -n linkedeye-finspot deployment/linkedeye-backend -- npx prisma db pull --print | Select-String "Alert"

# Should show Alert model structure
```

Current configuration:
- **Database:** `postgresql-leadmin-service.postgresql-leadmin.svc.cluster.local:5432`
- **Database Name:** `linkedeye_finspot`
- **User:** `root`
- **Schema:** Fully deployed ✅

---

## 📊 Rollback Procedure

If issues occur after deployment:

```powershell
# Rollback to previous deployment
kubectl rollout undo deployment/linkedeye-frontend -n linkedeye-finspot

# Verify rollback
kubectl rollout status deployment/linkedeye-frontend -n linkedeye-finspot

# Check current revision history
kubectl rollout history deployment/linkedeye-frontend -n linkedeye-finspot
```

---

## ✅ Post-Deployment Checklist

- [ ] Frontend pods are running (2/2 READY)
- [ ] `/alerts` page loads without 404
- [ ] Sidebar "Alerts" link navigates correctly
- [ ] Alert filters work (status, severity, search)
- [ ] Alert editing modal opens and saves changes
- [ ] Backend logs show no errors
- [ ] Database connection remains stable

---

## 📝 Quick Command Reference

```powershell
# View frontend pods
kubectl get pods -n linkedeye-finspot -l app=linkedeye-frontend

# View frontend logs
kubectl logs -n linkedeye-finspot -l app=linkedeye-frontend --tail=100 -f

# Restart frontend
kubectl rollout restart deployment/linkedeye-frontend -n linkedeye-finspot

# Get deployment details
kubectl describe deployment linkedeye-frontend -n linkedeye-finspot

# Check service endpoints
kubectl get endpoints -n linkedeye-finspot

# View ingress
kubectl get ingress -n linkedeye-finspot -o yaml
```

---

## 🎉 Success Criteria

Your deployment is successful when:

1. ✅ `https://fs-le-dev-inc.finspot.in/alerts` loads the new alerts management page
2. ✅ Sidebar "Alerts" link is functional and highlighted when active
3. ✅ Alert filters and search work correctly
4. ✅ Alert editing modal opens and saves successfully
5. ✅ No errors in frontend/backend logs

---

## 🆘 Need Help?

If you encounter issues:

1. Check pod logs: `kubectl logs -n linkedeye-finspot deployment/linkedeye-frontend`
2. Verify image tag: `kubectl get deployment linkedeye-frontend -n linkedeye-finspot -o yaml | grep image:`
3. Test database connection: See "Database Connection Verification" section
4. Review this guide's troubleshooting section

---

**Last Updated:** 2025-12-23  
**Version:** 1.1.0  
**Author:** LinkedEye DevOps Team
