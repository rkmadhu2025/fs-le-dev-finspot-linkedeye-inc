/**
 * Report Routes
 * LinkedEye-FinSpot
 *
 * TRANSFORM Module - Analytics & Reports
 */

const express = require('express');
const router = express.Router();
const { prisma } = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');
const logger = require('../utils/logger');

router.use(authenticate);

// Get SLA compliance report
router.get('/sla', async (req, res) => {
  try {
    const { period = '30d', priority } = req.query;
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const where = { createdAt: { gte: startDate }, state: { in: ['RESOLVED', 'CLOSED'] } };
    if (priority) where.priority = priority;

    const [total, breached, byPriority] = await Promise.all([
      prisma.incident.count({ where }),
      prisma.incident.count({ where: { ...where, slaBreached: true } }),
      prisma.incident.groupBy({
        by: ['priority'],
        where,
        _count: true
      })
    ]);

    const compliance = total > 0 ? ((total - breached) / total * 100).toFixed(1) : 100;

    res.json({
      success: true,
      data: {
        period,
        totalIncidents: total,
        slaBreached: breached,
        slaMet: total - breached,
        complianceRate: parseFloat(compliance),
        byPriority
      }
    });
  } catch (error) {
    logger.error('SLA report error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate report' });
  }
});

// Get MTTR report
router.get('/mttr', async (req, res) => {
  try {
    const { period = '30d', groupBy = 'day' } = req.query;
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const incidents = await prisma.incident.findMany({
      where: {
        state: { in: ['RESOLVED', 'CLOSED'] },
        resolvedAt: { not: null },
        createdAt: { gte: startDate }
      },
      select: { createdAt: true, resolvedAt: true, priority: true }
    });

    // Calculate overall MTTR
    let totalMinutes = 0;
    incidents.forEach(inc => {
      totalMinutes += (new Date(inc.resolvedAt) - new Date(inc.createdAt)) / (1000 * 60);
    });
    const overallMTTR = incidents.length > 0 ? Math.round(totalMinutes / incidents.length) : 0;

    // Calculate MTTR by priority
    const mttrByPriority = { P1: 0, P2: 0, P3: 0, P4: 0 };
    const countByPriority = { P1: 0, P2: 0, P3: 0, P4: 0 };

    incidents.forEach(inc => {
      const mins = (new Date(inc.resolvedAt) - new Date(inc.createdAt)) / (1000 * 60);
      mttrByPriority[inc.priority] += mins;
      countByPriority[inc.priority]++;
    });

    Object.keys(mttrByPriority).forEach(p => {
      mttrByPriority[p] = countByPriority[p] > 0 ? Math.round(mttrByPriority[p] / countByPriority[p]) : 0;
    });

    res.json({
      success: true,
      data: {
        period,
        totalResolved: incidents.length,
        overallMTTR,
        overallMTTRFormatted: overallMTTR < 60 ? `${overallMTTR}m` : `${Math.floor(overallMTTR / 60)}h ${overallMTTR % 60}m`,
        mttrByPriority
      }
    });
  } catch (error) {
    logger.error('MTTR report error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate report' });
  }
});

// Get incident volume report
router.get('/incident-volume', async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [byCategory, byPriority, trend] = await Promise.all([
      prisma.incident.groupBy({ by: ['category'], where: { createdAt: { gte: startDate } }, _count: true }),
      prisma.incident.groupBy({ by: ['priority'], where: { createdAt: { gte: startDate } }, _count: true }),
      prisma.incident.findMany({
        where: { createdAt: { gte: startDate } },
        select: { createdAt: true }
      })
    ]);

    // Group by date
    const dailyTrend = {};
    trend.forEach(inc => {
      const date = inc.createdAt.toISOString().split('T')[0];
      dailyTrend[date] = (dailyTrend[date] || 0) + 1;
    });

    res.json({
      success: true,
      data: { period, byCategory, byPriority, dailyTrend }
    });
  } catch (error) {
    logger.error('Incident volume report error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate report' });
  }
});

// Get change success rate
router.get('/change-success', async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [total, successful, failed, byType] = await Promise.all([
      prisma.change.count({ where: { state: 'CLOSED', createdAt: { gte: startDate } } }),
      prisma.change.count({ where: { state: 'CLOSED', closureCode: 'successful', createdAt: { gte: startDate } } }),
      prisma.change.count({ where: { state: 'CLOSED', closureCode: 'failed', createdAt: { gte: startDate } } }),
      prisma.change.groupBy({ by: ['type'], where: { state: 'CLOSED', createdAt: { gte: startDate } }, _count: true })
    ]);

    const successRate = total > 0 ? (successful / total * 100).toFixed(1) : 100;

    res.json({
      success: true,
      data: { period, total, successful, failed, successRate: parseFloat(successRate), byType }
    });
  } catch (error) {
    logger.error('Change success report error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate report' });
  }
});

// Get team performance
router.get('/team-performance', async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const teams = await prisma.team.findMany({
      where: { isActive: true },
      include: {
        assignedIncidents: {
          where: { createdAt: { gte: startDate } },
          select: { state: true, createdAt: true, resolvedAt: true, slaBreached: true }
        }
      }
    });

    const performance = teams.map(team => {
      const incidents = team.assignedIncidents;
      const resolved = incidents.filter(i => ['RESOLVED', 'CLOSED'].includes(i.state));
      const breached = incidents.filter(i => i.slaBreached);

      let avgResolution = 0;
      if (resolved.length > 0) {
        const totalMins = resolved.reduce((acc, i) => {
          if (i.resolvedAt) return acc + (new Date(i.resolvedAt) - new Date(i.createdAt)) / (1000 * 60);
          return acc;
        }, 0);
        avgResolution = Math.round(totalMins / resolved.length);
      }

      return {
        teamId: team.id,
        teamName: team.name,
        totalIncidents: incidents.length,
        resolved: resolved.length,
        slaBreached: breached.length,
        slaCompliance: incidents.length > 0 ? ((incidents.length - breached.length) / incidents.length * 100).toFixed(1) : 100,
        avgResolutionMinutes: avgResolution
      };
    });

    res.json({ success: true, data: { period, teams: performance } });
  } catch (error) {
    logger.error('Team performance report error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate report' });
  }
});

// Create scheduled report
router.post('/schedule', async (req, res) => {
  try {
    const { name, type, config, schedule, recipients } = req.body;
    const report = await prisma.report.create({
      data: { name, type, config, schedule, recipients, createdById: req.user.id }
    });
    res.status(201).json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create report schedule' });
  }
});

// List scheduled reports
router.get('/scheduled', async (req, res) => {
  try {
    const reports = await prisma.report.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: reports });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch reports' });
  }
});

module.exports = router;
