/**
 * Dashboard Controller
 * LinkedEye-FinSpot
 *
 * RUN Module - Operations Dashboard
 */

const { prisma } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Get Full Dashboard Data
 * GET /api/v1/dashboard
 */
exports.getDashboardData = async (req, res) => {
  try {
    const now = new Date();
    const last24h = new Date(now - 24 * 60 * 60 * 1000);
    const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

    // Execute all queries in parallel
    const [
      incidentStats,
      changeStats,
      alertStats,
      recentIncidents,
      recentActivities,
      slaMetrics,
      priorityBreakdown
    ] = await Promise.all([
      // Incident statistics
      prisma.incident.groupBy({
        by: ['state'],
        _count: true
      }),

      // Change statistics
      prisma.change.groupBy({
        by: ['state'],
        _count: true
      }),

      // Alert statistics
      prisma.alert.groupBy({
        by: ['status'],
        where: { firedAt: { gte: last24h } },
        _count: true
      }),

      // Recent incidents
      prisma.incident.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          assignedTo: { select: { firstName: true, lastName: true } },
          assignmentGroup: { select: { name: true } }
        }
      }),

      // Recent activities
      prisma.activity.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
          incident: { select: { number: true, shortDescription: true } },
          change: { select: { number: true, shortDescription: true } }
        }
      }),

      // SLA metrics - count resolved incidents
      prisma.incident.count({
        where: {
          state: { in: ['RESOLVED', 'CLOSED'] },
          createdAt: { gte: last7d }
        }
      }),

      // Priority breakdown
      prisma.incident.groupBy({
        by: ['priority'],
        where: { state: { in: ['NEW', 'IN_PROGRESS', 'ON_HOLD'] } },
        _count: true
      })
    ]);

    // Process incident stats
    const incidentCounts = {
      total: 0,
      new: 0,
      inProgress: 0,
      onHold: 0,
      resolved: 0,
      closed: 0
    };
    incidentStats.forEach(stat => {
      incidentCounts.total += stat._count;
      switch (stat.state) {
        case 'NEW': incidentCounts.new = stat._count; break;
        case 'IN_PROGRESS': incidentCounts.inProgress = stat._count; break;
        case 'ON_HOLD': incidentCounts.onHold = stat._count; break;
        case 'RESOLVED': incidentCounts.resolved = stat._count; break;
        case 'CLOSED': incidentCounts.closed = stat._count; break;
      }
    });

    // Process priority breakdown
    const priorityCounts = { P1: 0, P2: 0, P3: 0, P4: 0 };
    priorityBreakdown.forEach(item => {
      priorityCounts[item.priority] = item._count;
    });

    // Process alert stats
    const alertCounts = { firing: 0, resolved: 0, acknowledged: 0 };
    alertStats.forEach(stat => {
      switch (stat.status) {
        case 'FIRING': alertCounts.firing = stat._count; break;
        case 'RESOLVED': alertCounts.resolved = stat._count; break;
        case 'ACKNOWLEDGED': alertCounts.acknowledged = stat._count; break;
      }
    });

    res.json({
      success: true,
      data: {
        timestamp: now.toISOString(),
        incidents: incidentCounts,
        priorities: priorityCounts,
        alerts: alertCounts,
        recentIncidents,
        recentActivities,
        openIncidents: incidentCounts.new + incidentCounts.inProgress + incidentCounts.onHold
      }
    });
  } catch (error) {
    logger.error('Dashboard data error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard data' });
  }
};

/**
 * Get KPIs
 * GET /api/v1/dashboard/kpis
 */
exports.getKPIs = async (req, res) => {
  try {
    const now = new Date();
    const last24h = new Date(now - 24 * 60 * 60 * 1000);
    const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const prev7d = new Date(now - 14 * 24 * 60 * 60 * 1000);

    const [
      openIncidents,
      criticalIncidents,
      resolvedToday,
      slaBreached,
      openChanges,
      pendingApprovals,
      activeAlerts,
      // Previous period for comparison
      prevOpenIncidents,
      prevCritical
    ] = await Promise.all([
      // Open incidents
      prisma.incident.count({
        where: { state: { in: ['NEW', 'IN_PROGRESS', 'ON_HOLD'] } }
      }),

      // Critical (P1) incidents
      prisma.incident.count({
        where: {
          priority: 'P1',
          state: { in: ['NEW', 'IN_PROGRESS', 'ON_HOLD'] }
        }
      }),

      // Resolved in last 24h
      prisma.incident.count({
        where: {
          state: 'RESOLVED',
          resolvedAt: { gte: last24h }
        }
      }),

      // SLA breached
      prisma.incident.count({
        where: {
          slaBreached: true,
          createdAt: { gte: last7d }
        }
      }),

      // Open changes
      prisma.change.count({
        where: { state: { in: ['DRAFT', 'ASSESS', 'AUTHORIZE', 'SCHEDULED'] } }
      }),

      // Pending approvals
      prisma.approval.count({
        where: { state: 'PENDING' }
      }),

      // Active alerts
      prisma.alert.count({
        where: { status: 'FIRING' }
      }),

      // Previous period open incidents (for trend)
      prisma.incident.count({
        where: {
          state: { in: ['NEW', 'IN_PROGRESS', 'ON_HOLD'] },
          createdAt: { lte: last7d, gte: prev7d }
        }
      }),

      // Previous period critical
      prisma.incident.count({
        where: {
          priority: 'P1',
          state: { in: ['NEW', 'IN_PROGRESS', 'ON_HOLD'] },
          createdAt: { lte: last7d, gte: prev7d }
        }
      })
    ]);

    // Calculate MTTR
    const resolvedIncidents = await prisma.incident.findMany({
      where: {
        state: { in: ['RESOLVED', 'CLOSED'] },
        resolvedAt: { not: null },
        createdAt: { gte: last7d }
      },
      select: { createdAt: true, resolvedAt: true }
    });

    let mttr = 0;
    if (resolvedIncidents.length > 0) {
      const totalMinutes = resolvedIncidents.reduce((acc, inc) => {
        return acc + (new Date(inc.resolvedAt) - new Date(inc.createdAt)) / (1000 * 60);
      }, 0);
      mttr = Math.round(totalMinutes / resolvedIncidents.length);
    }

    res.json({
      success: true,
      data: {
        openIncidents: {
          value: openIncidents,
          change: openIncidents - prevOpenIncidents,
          trend: openIncidents > prevOpenIncidents ? 'up' : openIncidents < prevOpenIncidents ? 'down' : 'stable'
        },
        criticalIncidents: {
          value: criticalIncidents,
          change: criticalIncidents - prevCritical,
          trend: criticalIncidents > prevCritical ? 'up' : criticalIncidents < prevCritical ? 'down' : 'stable'
        },
        resolvedToday: {
          value: resolvedToday
        },
        slaBreached: {
          value: slaBreached
        },
        openChanges: {
          value: openChanges
        },
        pendingApprovals: {
          value: pendingApprovals
        },
        activeAlerts: {
          value: activeAlerts
        },
        mttr: {
          value: mttr,
          formatted: mttr < 60 ? `${mttr}m` : `${Math.floor(mttr / 60)}h ${mttr % 60}m`
        }
      }
    });
  } catch (error) {
    logger.error('KPIs error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch KPIs' });
  }
};

/**
 * Get Incident Trends
 * GET /api/v1/dashboard/incident-trends
 */
exports.getIncidentTrends = async (req, res) => {
  try {
    const { period = '7d' } = req.query;

    let days;
    switch (period) {
      case '24h': days = 1; break;
      case '7d': days = 7; break;
      case '30d': days = 30; break;
      case '90d': days = 90; break;
      default: days = 7;
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get incidents grouped by date
    const incidents = await prisma.incident.findMany({
      where: { createdAt: { gte: startDate } },
      select: { createdAt: true, priority: true, state: true }
    });

    // Group by date
    const trendData = {};
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      trendData[dateKey] = { date: dateKey, total: 0, P1: 0, P2: 0, P3: 0, P4: 0, resolved: 0 };
    }

    incidents.forEach(inc => {
      const dateKey = inc.createdAt.toISOString().split('T')[0];
      if (trendData[dateKey]) {
        trendData[dateKey].total++;
        trendData[dateKey][inc.priority]++;
        if (inc.state === 'RESOLVED' || inc.state === 'CLOSED') {
          trendData[dateKey].resolved++;
        }
      }
    });

    // Convert to array and sort
    const trends = Object.values(trendData).sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      success: true,
      data: trends
    });
  } catch (error) {
    logger.error('Incident trends error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch incident trends' });
  }
};

/**
 * Get SLA Metrics
 * GET /api/v1/dashboard/sla
 */
exports.getSLAMetrics = async (req, res) => {
  try {
    const { period = '30d' } = req.query;

    let days;
    switch (period) {
      case '7d': days = 7; break;
      case '30d': days = 30; break;
      case '90d': days = 90; break;
      default: days = 30;
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [totalIncidents, slaMetIncidents, slaBreachedIncidents] = await Promise.all([
      prisma.incident.count({
        where: {
          createdAt: { gte: startDate },
          state: { in: ['RESOLVED', 'CLOSED'] }
        }
      }),
      prisma.incident.count({
        where: {
          createdAt: { gte: startDate },
          state: { in: ['RESOLVED', 'CLOSED'] },
          slaBreached: false
        }
      }),
      prisma.incident.count({
        where: {
          createdAt: { gte: startDate },
          slaBreached: true
        }
      })
    ]);

    const complianceRate = totalIncidents > 0
      ? Math.round((slaMetIncidents / totalIncidents) * 100 * 10) / 10
      : 100;

    res.json({
      success: true,
      data: {
        totalIncidents,
        slaMetIncidents,
        slaBreachedIncidents,
        complianceRate,
        period
      }
    });
  } catch (error) {
    logger.error('SLA metrics error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch SLA metrics' });
  }
};

/**
 * Get Activity Feed
 * GET /api/v1/dashboard/activity-feed
 */
exports.getActivityFeed = async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const activities = await prisma.activity.findMany({
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        incident: { select: { number: true, shortDescription: true } },
        change: { select: { number: true, shortDescription: true } },
        problem: { select: { number: true, shortDescription: true } }
      }
    });

    res.json({
      success: true,
      data: activities
    });
  } catch (error) {
    logger.error('Activity feed error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch activity feed' });
  }
};

/**
 * Get Team Workload
 * GET /api/v1/dashboard/team-workload
 */
exports.getTeamWorkload = async (req, res) => {
  try {
    const teams = await prisma.team.findMany({
      where: { isActive: true },
      include: {
        assignedIncidents: {
          where: { state: { in: ['NEW', 'IN_PROGRESS', 'ON_HOLD'] } },
          select: { id: true, priority: true }
        },
        assignedChanges: {
          where: { state: { in: ['DRAFT', 'ASSESS', 'AUTHORIZE', 'SCHEDULED', 'IMPLEMENT'] } },
          select: { id: true }
        },
        members: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true }
            }
          }
        }
      }
    });

    const workload = teams.map(team => ({
      id: team.id,
      name: team.name,
      memberCount: team.members.length,
      openIncidents: team.assignedIncidents.length,
      criticalIncidents: team.assignedIncidents.filter(i => i.priority === 'P1').length,
      openChanges: team.assignedChanges.length
    }));

    res.json({
      success: true,
      data: workload
    });
  } catch (error) {
    logger.error('Team workload error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch team workload' });
  }
};

/**
 * Get Alerts Summary
 * GET /api/v1/dashboard/alerts-summary
 */
exports.getAlertsSummary = async (req, res) => {
  try {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [bySeverity, bySource, recentAlerts] = await Promise.all([
      prisma.alert.groupBy({
        by: ['severity'],
        where: { status: 'FIRING' },
        _count: true
      }),
      prisma.alert.groupBy({
        by: ['source'],
        where: { status: 'FIRING' },
        _count: true
      }),
      prisma.alert.findMany({
        where: { firedAt: { gte: last24h } },
        orderBy: { firedAt: 'desc' },
        take: 10,
        include: {
          configItem: { select: { name: true, type: true } }
        }
      })
    ]);

    res.json({
      success: true,
      data: {
        bySeverity: bySeverity.reduce((acc, item) => {
          acc[item.severity] = item._count;
          return acc;
        }, {}),
        bySource: bySource.reduce((acc, item) => {
          acc[item.source] = item._count;
          return acc;
        }, {}),
        recentAlerts
      }
    });
  } catch (error) {
    logger.error('Alerts summary error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch alerts summary' });
  }
};

/**
 * Get Quick Stats (for header/sidebar)
 * GET /api/v1/dashboard/quick-stats
 */
exports.getQuickStats = async (req, res) => {
  try {
    const [
      openIncidents,
      criticalIncidents,
      activeAlerts,
      pendingChanges
    ] = await Promise.all([
      prisma.incident.count({
        where: { state: { in: ['NEW', 'IN_PROGRESS', 'ON_HOLD'] } }
      }),
      prisma.incident.count({
        where: { priority: 'P1', state: { in: ['NEW', 'IN_PROGRESS'] } }
      }),
      prisma.alert.count({
        where: { status: 'FIRING' }
      }),
      prisma.change.count({
        where: { state: { in: ['AUTHORIZE', 'SCHEDULED'] } }
      })
    ]);

    res.json({
      success: true,
      data: {
        openIncidents,
        criticalIncidents,
        activeAlerts,
        pendingChanges
      }
    });
  } catch (error) {
    logger.error('Quick stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch quick stats' });
  }
};
