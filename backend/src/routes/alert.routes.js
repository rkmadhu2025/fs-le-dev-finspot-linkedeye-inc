/**
 * Alert Routes
 * LinkedEye-FinSpot
 *
 * RUN Module - Monitoring & Alerts
 */

const express = require('express');
const router = express.Router();
const { prisma } = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');
const { paginate, paginationResponse, generateAlertId } = require('../utils/helpers');
const logger = require('../utils/logger');

router.use(authenticate);

// List alerts
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 25, status, severity, source } = req.query;
    const where = {};
    if (status) where.status = status;
    if (severity) where.severity = severity;
    if (source) where.source = source;

    const { skip, take } = paginate(parseInt(page), parseInt(limit));
    const [alerts, total] = await Promise.all([
      prisma.alert.findMany({
        where, skip, take,
        orderBy: { firedAt: 'desc' },
        include: { configItem: { select: { id: true, name: true, type: true } } }
      }),
      prisma.alert.count({ where })
    ]);

    res.json({ success: true, ...paginationResponse(alerts, total, parseInt(page), parseInt(limit)) });
  } catch (error) {
    logger.error('List alerts error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch alerts' });
  }
});

// Get alert statistics
router.get('/stats', async (req, res) => {
  try {
    const [bySeverity, byStatus, bySource] = await Promise.all([
      prisma.alert.groupBy({ by: ['severity'], where: { status: 'FIRING' }, _count: true }),
      prisma.alert.groupBy({ by: ['status'], _count: true }),
      prisma.alert.groupBy({ by: ['source'], where: { status: 'FIRING' }, _count: true })
    ]);
    res.json({ success: true, data: { bySeverity, byStatus, bySource } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

// Get alert by ID
router.get('/:id', async (req, res) => {
  try {
    const alert = await prisma.alert.findUnique({
      where: { id: req.params.id },
      include: {
        configItem: true,
        incident: { select: { id: true, number: true, shortDescription: true, state: true } }
      }
    });
    if (!alert) return res.status(404).json({ success: false, error: 'Alert not found' });
    res.json({ success: true, data: alert });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch alert' });
  }
});

// Update alert details
router.put('/:id', async (req, res) => {
  try {
    const { status, severity, description, name } = req.body;
    const data = {};
    if (status) data.status = status;
    if (severity) data.severity = severity;
    if (description) data.description = description;
    if (name) data.name = name; // Alert name/short description

    const alert = await prisma.alert.update({
      where: { id: req.params.id },
      data
    });
    res.json({ success: true, data: alert });
  } catch (error) {
    logger.error('Update alert error:', error);
    res.status(500).json({ success: false, error: 'Failed to update alert' });
  }
});

// Acknowledge alert
router.post('/:id/acknowledge', async (req, res) => {
  try {
    const alert = await prisma.alert.update({
      where: { id: req.params.id },
      data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date(), acknowledgedBy: req.user.id }
    });
    res.json({ success: true, data: alert });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to acknowledge alert' });
  }
});

// Resolve alert
router.post('/:id/resolve', async (req, res) => {
  try {
    const alert = await prisma.alert.update({
      where: { id: req.params.id },
      data: { status: 'RESOLVED', resolvedAt: new Date() }
    });
    res.json({ success: true, data: alert });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to resolve alert' });
  }
});

// Silence alert
router.post('/:id/silence', async (req, res) => {
  try {
    const alert = await prisma.alert.update({
      where: { id: req.params.id },
      data: { status: 'SILENCED' }
    });
    res.json({ success: true, data: alert });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to silence alert' });
  }
});

// Create incident from alert
router.post('/:id/create-incident', async (req, res) => {
  try {
    const alert = await prisma.alert.findUnique({ where: { id: req.params.id } });
    if (!alert) return res.status(404).json({ success: false, error: 'Alert not found' });

    const lastIncident = await prisma.incident.findFirst({ orderBy: { number: 'desc' }, select: { number: true } });
    const { generateIncidentNumber, calculatePriority, calculateSLATargets, calculateSLATargetTime } = require('../utils/helpers');
    const number = generateIncidentNumber(lastIncident?.number);

    const impact = alert.severity === 'CRITICAL' ? 'CRITICAL' : alert.severity === 'WARNING' ? 'HIGH' : 'MEDIUM';
    const priority = calculatePriority(impact, impact);
    const slaTargets = calculateSLATargets(priority);
    const now = new Date();

    const incident = await prisma.incident.create({
      data: {
        number,
        shortDescription: alert.name,
        description: `Auto-created from alert: ${alert.description || alert.name}`,
        state: 'NEW',
        impact,
        urgency: impact,
        priority,
        source: alert.source.toUpperCase(),
        sourceAlertId: alert.alertId,
        sourceAlertName: alert.name,
        configItemId: alert.configItemId,
        createdById: req.user.id,
        slaTargetResponse: calculateSLATargetTime(now, slaTargets.response),
        slaTargetResolution: calculateSLATargetTime(now, slaTargets.resolution)
      }
    });

    await prisma.alert.update({
      where: { id: req.params.id },
      data: { incidentId: incident.id }
    });

    res.status(201).json({ success: true, data: incident });
  } catch (error) {
    logger.error('Create incident from alert error:', error);
    res.status(500).json({ success: false, error: 'Failed to create incident' });
  }
});

module.exports = router;
