/**
 * Incident Controller
 * LinkedEye-FinSpot
 *
 * RUN Module - Day-to-day operations
 */

const { validationResult } = require('express-validator');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const {
  generateIncidentNumber,
  calculatePriority,
  calculateSLATargets,
  calculateSLATargetTime,
  paginate,
  paginationResponse,
  sanitizeObject
} = require('../utils/helpers');

/**
 * List Incidents
 * GET /api/v1/incidents
 */
exports.listIncidents = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
    }

    const {
      page = 1,
      limit = 25,
      state,
      priority,
      assignedToId,
      assignmentGroupId,
      configItemId,
      category,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      dateFrom,
      dateTo
    } = req.query;

    // Build where clause
    const where = {};

    if (state) where.state = state;
    if (priority) where.priority = priority;
    if (assignedToId) where.assignedToId = assignedToId;
    if (assignmentGroupId) where.assignmentGroupId = assignmentGroupId;
    if (configItemId) where.configItemId = configItemId;
    if (category) where.category = category;

    if (search) {
      where.OR = [
        { number: { contains: search, mode: 'insensitive' } },
        { shortDescription: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const { skip, take } = paginate(parseInt(page), parseInt(limit));

    // Execute query
    const [incidents, total] = await Promise.all([
      prisma.incident.findMany({
        where,
        skip,
        take,
        orderBy: { [sortBy]: sortOrder },
        include: {
          assignedTo: {
            select: { id: true, firstName: true, lastName: true, email: true, avatar: true }
          },
          assignmentGroup: {
            select: { id: true, name: true }
          },
          configItem: {
            select: { id: true, name: true, type: true }
          },
          createdBy: {
            select: { id: true, firstName: true, lastName: true }
          }
        }
      }),
      prisma.incident.count({ where })
    ]);

    res.json({
      success: true,
      ...paginationResponse(incidents, total, parseInt(page), parseInt(limit))
    });
  } catch (error) {
    logger.error('List incidents error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch incidents' });
  }
};

/**
 * Get Incident Statistics
 * GET /api/v1/incidents/stats
 */
exports.getIncidentStats = async (req, res) => {
  try {
    const { period = '7d' } = req.query;

    // Calculate date range
    const now = new Date();
    let startDate;
    switch (period) {
      case '24h': startDate = new Date(now - 24 * 60 * 60 * 1000); break;
      case '7d': startDate = new Date(now - 7 * 24 * 60 * 60 * 1000); break;
      case '30d': startDate = new Date(now - 30 * 24 * 60 * 60 * 1000); break;
      case '90d': startDate = new Date(now - 90 * 24 * 60 * 60 * 1000); break;
      default: startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
    }

    // Execute parallel queries
    const [
      totalOpen,
      byPriority,
      byState,
      recentlyClosed,
      slaBreached,
      mttrData
    ] = await Promise.all([
      // Total open incidents
      prisma.incident.count({
        where: { state: { in: ['NEW', 'IN_PROGRESS', 'ON_HOLD'] } }
      }),

      // By priority
      prisma.incident.groupBy({
        by: ['priority'],
        where: { state: { in: ['NEW', 'IN_PROGRESS', 'ON_HOLD'] } },
        _count: true
      }),

      // By state
      prisma.incident.groupBy({
        by: ['state'],
        _count: true
      }),

      // Recently closed
      prisma.incident.count({
        where: {
          state: 'CLOSED',
          closedAt: { gte: startDate }
        }
      }),

      // SLA breached
      prisma.incident.count({
        where: {
          slaBreached: true,
          createdAt: { gte: startDate }
        }
      }),

      // MTTR calculation
      prisma.incident.findMany({
        where: {
          state: { in: ['RESOLVED', 'CLOSED'] },
          resolvedAt: { not: null },
          createdAt: { gte: startDate }
        },
        select: {
          createdAt: true,
          resolvedAt: true
        }
      })
    ]);

    // Calculate MTTR
    let mttr = 0;
    if (mttrData.length > 0) {
      const totalMinutes = mttrData.reduce((acc, inc) => {
        return acc + (new Date(inc.resolvedAt) - new Date(inc.createdAt)) / (1000 * 60);
      }, 0);
      mttr = Math.round(totalMinutes / mttrData.length);
    }

    // Format priority counts
    const priorityCounts = {
      P1: 0, P2: 0, P3: 0, P4: 0
    };
    byPriority.forEach(item => {
      priorityCounts[item.priority] = item._count;
    });

    // Format state counts
    const stateCounts = {};
    byState.forEach(item => {
      stateCounts[item.state] = item._count;
    });

    res.json({
      success: true,
      data: {
        totalOpen,
        byPriority: priorityCounts,
        byState: stateCounts,
        recentlyClosed,
        slaBreached,
        mttr, // in minutes
        mttrFormatted: mttr < 60 ? `${mttr}m` : `${Math.round(mttr / 60)}h ${mttr % 60}m`,
        period
      }
    });
  } catch (error) {
    logger.error('Get incident stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch incident statistics' });
  }
};

/**
 * Get Incident by ID
 * GET /api/v1/incidents/:id
 */
exports.getIncidentById = async (req, res) => {
  try {
    const { id } = req.params;

    const incident = await prisma.incident.findUnique({
      where: { id },
      include: {
        assignedTo: {
          select: { id: true, firstName: true, lastName: true, email: true, avatar: true, phone: true }
        },
        assignmentGroup: {
          select: { id: true, name: true, email: true, slackChannel: true }
        },
        configItem: {
          select: {
            id: true, name: true, type: true, status: true,
            ipAddress: true, hostname: true, location: true,
            prometheusJob: true, grafanaDashboard: true
          }
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true }
        },
        workNotes: {
          orderBy: { createdAt: 'desc' },
          include: {
            author: {
              select: { id: true, firstName: true, lastName: true, avatar: true }
            }
          }
        },
        relatedAlerts: {
          orderBy: { firedAt: 'desc' },
          take: 10
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 20
        },
        attachments: true
      }
    });

    if (!incident) {
      return res.status(404).json({ success: false, error: 'Incident not found' });
    }

    res.json({ success: true, data: incident });
  } catch (error) {
    logger.error('Get incident error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch incident' });
  }
};

/**
 * Get Incident by Number
 * GET /api/v1/incidents/number/:number
 */
exports.getIncidentByNumber = async (req, res) => {
  try {
    const { number } = req.params;

    const incident = await prisma.incident.findUnique({
      where: { number: number.toUpperCase() },
      include: {
        assignedTo: {
          select: { id: true, firstName: true, lastName: true, email: true, avatar: true }
        },
        assignmentGroup: {
          select: { id: true, name: true }
        },
        configItem: {
          select: { id: true, name: true, type: true, ipAddress: true }
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true }
        }
      }
    });

    if (!incident) {
      return res.status(404).json({ success: false, error: 'Incident not found' });
    }

    res.json({ success: true, data: incident });
  } catch (error) {
    logger.error('Get incident by number error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch incident' });
  }
};

/**
 * Create Incident
 * POST /api/v1/incidents
 */
exports.createIncident = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
    }

    const {
      shortDescription,
      description,
      impact = 'MEDIUM',
      urgency = 'MEDIUM',
      category,
      subcategory,
      assignedToId,
      assignmentGroupId,
      configItemId,
      source = 'MANUAL',
      sourceAlertId,
      sourceAlertName
    } = req.body;

    // Get last incident number
    const lastIncident = await prisma.incident.findFirst({
      orderBy: { number: 'desc' },
      select: { number: true }
    });

    const number = generateIncidentNumber(lastIncident?.number);
    const priority = calculatePriority(impact, urgency);
    const slaTargets = calculateSLATargets(priority);

    const now = new Date();

    // Create incident
    const incident = await prisma.incident.create({
      data: {
        number,
        shortDescription,
        description,
        state: 'NEW',
        impact,
        urgency,
        priority,
        category,
        subcategory,
        assignedToId,
        assignmentGroupId,
        createdById: req.user.id,
        configItemId,
        source,
        sourceAlertId,
        sourceAlertName,
        slaTargetResponse: calculateSLATargetTime(now, slaTargets.response),
        slaTargetResolution: calculateSLATargetTime(now, slaTargets.resolution)
      },
      include: {
        assignedTo: {
          select: { id: true, firstName: true, lastName: true, email: true }
        },
        assignmentGroup: {
          select: { id: true, name: true }
        },
        configItem: {
          select: { id: true, name: true, type: true }
        }
      }
    });

    // Create activity
    await prisma.activity.create({
      data: {
        incidentId: incident.id,
        action: 'CREATED',
        description: `Incident created by ${req.user.firstName} ${req.user.lastName}`,
        userId: req.user.id
      }
    });

    // Emit websocket event
    const io = req.app.get('io');
    if (io) {
      io.emit('incident:created', incident);
    }

    logger.info(`Incident created: ${number}`);

    res.status(201).json({
      success: true,
      message: 'Incident created successfully',
      data: incident
    });
  } catch (error) {
    logger.error('Create incident error:', error);
    res.status(500).json({ success: false, error: 'Failed to create incident' });
  }
};

/**
 * Update Incident
 * PUT /api/v1/incidents/:id
 */
exports.updateIncident = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
    }

    const { id } = req.params;
    const updateData = sanitizeObject(req.body);

    // Get current incident
    const currentIncident = await prisma.incident.findUnique({ where: { id } });
    if (!currentIncident) {
      return res.status(404).json({ success: false, error: 'Incident not found' });
    }

    // Recalculate priority if impact or urgency changed
    if (updateData.impact || updateData.urgency) {
      const impact = updateData.impact || currentIncident.impact;
      const urgency = updateData.urgency || currentIncident.urgency;
      updateData.priority = calculatePriority(impact, urgency);
    }

    // Update incident
    const incident = await prisma.incident.update({
      where: { id },
      data: updateData,
      include: {
        assignedTo: {
          select: { id: true, firstName: true, lastName: true, email: true }
        },
        assignmentGroup: {
          select: { id: true, name: true }
        }
      }
    });

    // Create activity for changes
    const changes = [];
    Object.keys(updateData).forEach(key => {
      if (currentIncident[key] !== updateData[key]) {
        changes.push(`${key}: ${currentIncident[key]} → ${updateData[key]}`);
      }
    });

    if (changes.length > 0) {
      await prisma.activity.create({
        data: {
          incidentId: id,
          action: 'UPDATED',
          description: `Updated by ${req.user.firstName} ${req.user.lastName}: ${changes.join(', ')}`,
          oldValue: JSON.stringify(currentIncident),
          newValue: JSON.stringify(updateData),
          userId: req.user.id
        }
      });
    }

    // Emit websocket event
    const io = req.app.get('io');
    if (io) {
      io.emit('incident:updated', incident);
    }

    res.json({
      success: true,
      message: 'Incident updated successfully',
      data: incident
    });
  } catch (error) {
    logger.error('Update incident error:', error);
    res.status(500).json({ success: false, error: 'Failed to update incident' });
  }
};

/**
 * Assign Incident
 * POST /api/v1/incidents/:id/assign
 */
exports.assignIncident = async (req, res) => {
  try {
    const { id } = req.params;
    const { assignedToId, assignmentGroupId } = req.body;

    const incident = await prisma.incident.update({
      where: { id },
      data: {
        assignedToId,
        assignmentGroupId,
        state: 'IN_PROGRESS',
        responseTime: new Date()
      },
      include: {
        assignedTo: {
          select: { id: true, firstName: true, lastName: true, email: true }
        },
        assignmentGroup: {
          select: { id: true, name: true }
        }
      }
    });

    // Create activity
    await prisma.activity.create({
      data: {
        incidentId: id,
        action: 'ASSIGNED',
        description: `Assigned to ${incident.assignedTo?.firstName || 'group'} by ${req.user.firstName} ${req.user.lastName}`,
        userId: req.user.id
      }
    });

    // Create notification for assigned user
    if (assignedToId) {
      await prisma.notification.create({
        data: {
          userId: assignedToId,
          type: 'INCIDENT_ASSIGNED',
          title: `Incident ${incident.number} assigned to you`,
          message: incident.shortDescription,
          link: `/incidents/${id}`
        }
      });
    }

    // Emit websocket event
    const io = req.app.get('io');
    if (io) {
      io.emit('incident:assigned', incident);
      if (assignedToId) {
        io.to(`user:${assignedToId}`).emit('notification:new', {
          type: 'INCIDENT_ASSIGNED',
          incident
        });
      }
    }

    res.json({
      success: true,
      message: 'Incident assigned successfully',
      data: incident
    });
  } catch (error) {
    logger.error('Assign incident error:', error);
    res.status(500).json({ success: false, error: 'Failed to assign incident' });
  }
};

/**
 * Resolve Incident
 * POST /api/v1/incidents/:id/resolve
 */
exports.resolveIncident = async (req, res) => {
  try {
    const { id } = req.params;
    const { resolutionCode, resolutionNotes } = req.body;

    const now = new Date();

    const incident = await prisma.incident.update({
      where: { id },
      data: {
        state: 'RESOLVED',
        resolutionCode,
        resolutionNotes,
        resolvedAt: now,
        resolutionTime: now
      }
    });

    // Check SLA breach
    if (incident.slaTargetResolution && now > new Date(incident.slaTargetResolution)) {
      await prisma.incident.update({
        where: { id },
        data: { slaBreached: true }
      });
    }

    // Create activity
    await prisma.activity.create({
      data: {
        incidentId: id,
        action: 'RESOLVED',
        description: `Resolved by ${req.user.firstName} ${req.user.lastName}. Code: ${resolutionCode}`,
        userId: req.user.id
      }
    });

    // Emit websocket event
    const io = req.app.get('io');
    if (io) {
      io.emit('incident:resolved', incident);
    }

    res.json({
      success: true,
      message: 'Incident resolved successfully',
      data: incident
    });
  } catch (error) {
    logger.error('Resolve incident error:', error);
    res.status(500).json({ success: false, error: 'Failed to resolve incident' });
  }
};

/**
 * Close Incident
 * POST /api/v1/incidents/:id/close
 */
exports.closeIncident = async (req, res) => {
  try {
    const { id } = req.params;

    const currentIncident = await prisma.incident.findUnique({ where: { id } });

    if (!currentIncident) {
      return res.status(404).json({ success: false, error: 'Incident not found' });
    }

    if (currentIncident.state !== 'RESOLVED') {
      return res.status(400).json({ success: false, error: 'Incident must be resolved before closing' });
    }

    const incident = await prisma.incident.update({
      where: { id },
      data: {
        state: 'CLOSED',
        closedAt: new Date()
      }
    });

    // Create activity
    await prisma.activity.create({
      data: {
        incidentId: id,
        action: 'CLOSED',
        description: `Closed by ${req.user.firstName} ${req.user.lastName}`,
        userId: req.user.id
      }
    });

    res.json({
      success: true,
      message: 'Incident closed successfully',
      data: incident
    });
  } catch (error) {
    logger.error('Close incident error:', error);
    res.status(500).json({ success: false, error: 'Failed to close incident' });
  }
};

/**
 * Reopen Incident
 * POST /api/v1/incidents/:id/reopen
 */
exports.reopenIncident = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const incident = await prisma.incident.update({
      where: { id },
      data: {
        state: 'IN_PROGRESS',
        resolvedAt: null,
        closedAt: null,
        resolutionCode: null,
        resolutionNotes: null
      }
    });

    // Create activity
    await prisma.activity.create({
      data: {
        incidentId: id,
        action: 'REOPENED',
        description: `Reopened by ${req.user.firstName} ${req.user.lastName}. Reason: ${reason || 'Not specified'}`,
        userId: req.user.id
      }
    });

    res.json({
      success: true,
      message: 'Incident reopened successfully',
      data: incident
    });
  } catch (error) {
    logger.error('Reopen incident error:', error);
    res.status(500).json({ success: false, error: 'Failed to reopen incident' });
  }
};

/**
 * Add Work Note
 * POST /api/v1/incidents/:id/notes
 */
exports.addWorkNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { content, isInternal = false } = req.body;

    const workNote = await prisma.workNote.create({
      data: {
        incidentId: id,
        content,
        isInternal,
        authorId: req.user.id
      },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, avatar: true }
        }
      }
    });

    // Emit websocket event
    const io = req.app.get('io');
    if (io) {
      io.emit('incident:note-added', { incidentId: id, workNote });
    }

    res.status(201).json({
      success: true,
      message: 'Work note added successfully',
      data: workNote
    });
  } catch (error) {
    logger.error('Add work note error:', error);
    res.status(500).json({ success: false, error: 'Failed to add work note' });
  }
};

/**
 * Get Work Notes
 * GET /api/v1/incidents/:id/notes
 */
exports.getWorkNotes = async (req, res) => {
  try {
    const { id } = req.params;

    const workNotes = await prisma.workNote.findMany({
      where: { incidentId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, avatar: true }
        }
      }
    });

    res.json({ success: true, data: workNotes });
  } catch (error) {
    logger.error('Get work notes error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch work notes' });
  }
};

/**
 * Get Activities
 * GET /api/v1/incidents/:id/activities
 */
exports.getActivities = async (req, res) => {
  try {
    const { id } = req.params;

    const activities = await prisma.activity.findMany({
      where: { incidentId: id },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, data: activities });
  } catch (error) {
    logger.error('Get activities error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch activities' });
  }
};

/**
 * Link to Change
 * POST /api/v1/incidents/:id/link-change
 */
exports.linkToChange = async (req, res) => {
  try {
    const { id } = req.params;
    const { changeId, linkType, notes } = req.body;

    // Create proper link using IncidentChange model
    const link = await prisma.incidentChange.create({
      data: {
        incidentId: id,
        changeId,
        linkType: linkType || 'RELATED',
        notes,
        linkedById: req.user.id
      },
      include: {
        change: {
          select: {
            number: true,
            shortDescription: true,
            state: true
          }
        }
      }
    });

    // Also add an activity log for audit trail
    await prisma.activity.create({
      data: {
        action: 'LINKED_CHANGE',
        description: `Linked to change ${link.change.number}: ${link.change.shortDescription}`,
        incidentId: id,
        userId: req.user.id
      }
    });

    res.json({
      success: true,
      message: 'Incident linked to change successfully',
      data: link
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ success: false, error: 'Incident is already linked to this change' });
    }
    logger.error('Link to change error:', error);
    res.status(500).json({ success: false, error: 'Failed to link incident to change' });
  }
};

/**
 * Link to Problem
 * POST /api/v1/incidents/:id/link-problem
 */
exports.linkToProblem = async (req, res) => {
  try {
    const { id } = req.params;
    const { problemId, linkType, notes } = req.body;

    // Create proper link using IncidentProblem model
    const link = await prisma.incidentProblem.create({
      data: {
        incidentId: id,
        problemId,
        linkType: linkType || 'RELATED',
        notes,
        linkedById: req.user.id
      },
      include: {
        problem: {
          select: {
            number: true,
            shortDescription: true,
            state: true
          }
        }
      }
    });

    // Also add an activity log for audit trail
    await prisma.activity.create({
      data: {
        action: 'LINKED_PROBLEM',
        description: `Linked to problem ${link.problem.number}: ${link.problem.shortDescription}`,
        incidentId: id,
        userId: req.user.id
      }
    });

    res.json({
      success: true,
      message: 'Incident linked to problem successfully',
      data: link
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ success: false, error: 'Incident is already linked to this problem' });
    }
    logger.error('Link to problem error:', error);
    res.status(500).json({ success: false, error: 'Failed to link incident to problem' });
  }
};

/**
 * Get Related Alerts
 * GET /api/v1/incidents/:id/alerts
 */
exports.getRelatedAlerts = async (req, res) => {
  try {
    const { id } = req.params;

    const alerts = await prisma.alert.findMany({
      where: { incidentId: id },
      orderBy: { firedAt: 'desc' }
    });

    res.json({ success: true, data: alerts });
  } catch (error) {
    logger.error('Get related alerts error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch related alerts' });
  }
};

/**
 * Delete Incident
 * DELETE /api/v1/incidents/:id
 */
exports.deleteIncident = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.incident.delete({ where: { id } });

    logger.info(`Incident deleted: ${id} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Incident deleted successfully'
    });
  } catch (error) {
    logger.error('Delete incident error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete incident' });
  }
};
