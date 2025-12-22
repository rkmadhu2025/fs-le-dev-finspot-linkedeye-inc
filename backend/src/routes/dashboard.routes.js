/**
 * Dashboard Routes
 * LinkedEye-FinSpot
 *
 * RUN Module - Operations Dashboard
 */

const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { authenticate, checkPermission } = require('../middleware/auth.middleware');

// Apply authentication to all routes
router.use(authenticate);

// Main dashboard data
router.get('/', dashboardController.getDashboardData);

// KPI metrics
router.get('/kpis', dashboardController.getKPIs);

// Incident trends
router.get('/incident-trends', dashboardController.getIncidentTrends);

// SLA metrics
router.get('/sla', dashboardController.getSLAMetrics);

// Activity feed
router.get('/activity-feed', dashboardController.getActivityFeed);

// Team workload
router.get('/team-workload', dashboardController.getTeamWorkload);

// Alerts summary
router.get('/alerts-summary', dashboardController.getAlertsSummary);

// Quick stats (for header/sidebar)
router.get('/quick-stats', dashboardController.getQuickStats);

module.exports = router;
