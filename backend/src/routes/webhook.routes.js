/**
 * Webhook Routes
 * LinkedEye-FinSpot
 *
 * External webhook endpoints for integrations
 */

const express = require('express');
const router = express.Router();
const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const {
  generateIncidentNumber,
  generateAlertId,
  calculatePriority,
  calculateSLATargets,
  calculateSLATargetTime
} = require('../utils/helpers');

/**
 * Prometheus Alertmanager Webhook
 * POST /api/v1/webhooks/alertmanager
 */
router.post('/alertmanager', async (req, res) => {
  try {
    const { alerts } = req.body;

    if (!alerts || !Array.isArray(alerts)) {
      return res.status(400).json({ success: false, error: 'Invalid payload' });
    }

    const createdAlerts = [];

    for (const alert of alerts) {
      const alertId = generateAlertId();
      const severity = alert.labels?.severity?.toUpperCase() || 'WARNING';

      // Find related CI
      let configItem = null;
      if (alert.labels?.instance) {
        const hostname = alert.labels.instance.split(':')[0];
        configItem = await prisma.configurationItem.findFirst({
          where: {
            OR: [
              { hostname: { contains: hostname, mode: 'insensitive' } },
              { ipAddress: hostname },
              { name: { contains: hostname, mode: 'insensitive' } }
            ]
          }
        });
      }

      // Parse dates with fallback to current time
      const firedAtDate = alert.startsAt ? new Date(alert.startsAt) : new Date();
      const resolvedAtDate = alert.status === 'resolved' && alert.endsAt ? new Date(alert.endsAt) : null;

      // Create or update alert
      const dbAlert = await prisma.alert.upsert({
        where: { alertId: alert.fingerprint || alertId },
        create: {
          alertId: alert.fingerprint || alertId,
          name: alert.labels?.alertname || 'Unknown Alert',
          severity: severity === 'CRITICAL' ? 'CRITICAL' : severity === 'WARNING' ? 'WARNING' : 'INFO',
          status: alert.status === 'resolved' ? 'RESOLVED' : 'FIRING',
          source: 'prometheus',
          description: alert.annotations?.description || alert.annotations?.summary,
          metric: alert.labels?.alertname,
          currentValue: alert.annotations?.value,
          labels: JSON.stringify(alert.labels),
          annotations: JSON.stringify(alert.annotations),
          configItemId: configItem?.id,
          firedAt: firedAtDate,
          resolvedAt: resolvedAtDate
        },
        update: {
          status: alert.status === 'resolved' ? 'RESOLVED' : 'FIRING',
          resolvedAt: resolvedAtDate
        }
      });

      createdAlerts.push(dbAlert);

      // Auto-create incident for critical alerts
      if (severity === 'CRITICAL' && alert.status !== 'resolved') {
        // Check if incident already exists for this alert
        const existingIncident = await prisma.incident.findFirst({
          where: { sourceAlertId: dbAlert.alertId }
        });

        if (!existingIncident) {
          const lastIncident = await prisma.incident.findFirst({
            orderBy: { number: 'desc' },
            select: { number: true }
          });

          const number = generateIncidentNumber(lastIncident?.number);
          const priority = calculatePriority('CRITICAL', 'CRITICAL');
          const slaTargets = calculateSLATargets(priority);
          const now = new Date();

          // Get system user for auto-creation
          let systemUser = await prisma.user.findFirst({
            where: { email: 'system@linkedeye.local' }
          });

          if (!systemUser) {
            systemUser = await prisma.user.create({
              data: {
                email: 'system@linkedeye.local',
                firstName: 'System',
                lastName: 'Auto',
                role: 'ADMIN',
                status: 'ACTIVE',
                password: 'not-used'
              }
            });
          }

          const incident = await prisma.incident.create({
            data: {
              number,
              shortDescription: `${dbAlert.name} - ${alert.labels?.instance || 'Unknown'}`,
              description: `Auto-created from Prometheus alert.\n\n${alert.annotations?.description || ''}\n\nLabels: ${JSON.stringify(alert.labels, null, 2)}`,
              state: 'NEW',
              impact: 'CRITICAL',
              urgency: 'CRITICAL',
              priority,
              source: 'PROMETHEUS',
              sourceAlertId: dbAlert.alertId,
              sourceAlertName: dbAlert.name,
              configItemId: configItem?.id,
              createdById: systemUser.id,
              slaTargetResponse: calculateSLATargetTime(now, slaTargets.response),
              slaTargetResolution: calculateSLATargetTime(now, slaTargets.resolution)
            }
          });

          // Link alert to incident & Send Notifications
          await prisma.alert.update({
            where: { id: dbAlert.id },
            data: { incidentId: incident.id }
          });

          const notificationService = require('../services/notification.service');
          await notificationService.notifyIncidentCreated(incident.id).catch(err => {
            logger.error('Failed to send auto-incident notifications:', err.message);
          });

          // Create activity
          await prisma.activity.create({
            data: {
              incidentId: incident.id,
              action: 'CREATED',
              description: 'Auto-created from Prometheus Alertmanager webhook'
            }
          });

          logger.info(`Auto-created incident ${number} from alert ${dbAlert.alertId}`);
        }
      }
    }

    // Emit WebSocket events
    const io = req.app.get('io');
    if (io) {
      createdAlerts.forEach(alert => {
        io.emit('alert:received', alert);
      });
    }

    res.json({
      success: true,
      message: `Processed ${alerts.length} alerts`,
      data: { alertsProcessed: createdAlerts.length }
    });
  } catch (error) {
    logger.error('Alertmanager webhook error:', error);
    res.status(500).json({ success: false, error: 'Failed to process alerts' });
  }
});

/**
 * Grafana Webhook
 * POST /api/v1/webhooks/grafana
 */
router.post('/grafana', async (req, res) => {
  try {
    const { state, ruleName, ruleUrl, message, evalMatches } = req.body;

    const alertId = generateAlertId();
    const isResolved = state === 'ok' || state === 'no_data';

    const alert = await prisma.alert.create({
      data: {
        alertId,
        name: ruleName || 'Grafana Alert',
        severity: state === 'alerting' ? 'WARNING' : 'INFO',
        status: isResolved ? 'RESOLVED' : 'FIRING',
        source: 'grafana',
        description: message,
        annotations: JSON.stringify({ ruleUrl, evalMatches }),
        firedAt: new Date(),
        resolvedAt: isResolved ? new Date() : null
      }
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('alert:received', alert);
    }

    res.json({ success: true, data: alert });
  } catch (error) {
    logger.error('Grafana webhook error:', error);
    res.status(500).json({ success: false, error: 'Failed to process alert' });
  }
});

/**
 * PagerDuty Webhook
 * POST /api/v1/webhooks/pagerduty
 */
router.post('/pagerduty', async (req, res) => {
  try {
    const { messages } = req.body;

    for (const msg of messages || []) {
      const event = msg.event;
      const incident = msg.incident;

      if (event === 'incident.trigger') {
        const alertId = generateAlertId();
        await prisma.alert.create({
          data: {
            alertId,
            name: incident?.title || 'PagerDuty Incident',
            severity: incident?.urgency === 'high' ? 'CRITICAL' : 'WARNING',
            status: 'FIRING',
            source: 'pagerduty',
            description: incident?.description,
            firedAt: new Date()
          }
        });
      }
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('PagerDuty webhook error:', error);
    res.status(500).json({ success: false, error: 'Failed to process webhook' });
  }
});

/**
 * Generic Webhook
 * POST /api/v1/webhooks/generic
 */
router.post('/generic', async (req, res) => {
  try {
    const { title, description, severity, source, instance } = req.body;

    const alertId = generateAlertId();
    const alert = await prisma.alert.create({
      data: {
        alertId,
        name: title || 'Generic Alert',
        severity: severity?.toUpperCase() || 'INFO',
        status: 'FIRING',
        source: source || 'webhook',
        description,
        firedAt: new Date()
      }
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('alert:received', alert);
    }

    res.json({ success: true, data: alert });
  } catch (error) {
    logger.error('Generic webhook error:', error);
    res.status(500).json({ success: false, error: 'Failed to process webhook' });
  }
});

/**
 * StackStorm Webhook
 * POST /api/v1/webhooks/stackstorm
 */
router.post('/stackstorm', async (req, res) => {
  try {
    const { trigger, payload } = req.body;

    logger.info(`StackStorm webhook received: ${trigger}`);

    // Process based on trigger type
    // This would be customized based on your StackStorm rules

    res.json({ success: true, message: 'Webhook received' });
  } catch (error) {
    logger.error('StackStorm webhook error:', error);
    res.status(500).json({ success: false, error: 'Failed to process webhook' });
  }
});

module.exports = router;
