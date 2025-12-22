/**
 * Bulk Operations Controller
 * LinkedEye-FinSpot
 *
 * Production-grade bulk operations for incidents, changes, and assets
 */

const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const emailService = require('../services/email.service');

/**
 * Bulk update incidents
 * POST /api/v1/incidents/bulk
 */
exports.bulkUpdateIncidents = async (req, res) => {
  try {
    const { incidentIds, action, data } = req.body;

    if (!incidentIds || !Array.isArray(incidentIds) || incidentIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'incidentIds array is required'
      });
    }

    if (incidentIds.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 100 incidents can be updated at once'
      });
    }

    if (!action) {
      return res.status(400).json({
        success: false,
        error: 'action is required'
      });
    }

    const results = {
      success: [],
      failed: [],
      total: incidentIds.length
    };

    // Process based on action type
    switch (action) {
      case 'ASSIGN':
        await bulkAssign(incidentIds, data, req.user, results);
        break;

      case 'UPDATE_STATE':
        await bulkUpdateState(incidentIds, data, req.user, results);
        break;

      case 'UPDATE_PRIORITY':
        await bulkUpdatePriority(incidentIds, data, req.user, results);
        break;

      case 'ADD_NOTE':
        await bulkAddNote(incidentIds, data, req.user, results);
        break;

      case 'CLOSE':
        await bulkClose(incidentIds, data, req.user, results);
        break;

      default:
        return res.status(400).json({
          success: false,
          error: `Unknown action: ${action}`
        });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: `BULK_${action}`,
        entityType: 'Incident',
        entityId: incidentIds.join(','),
        newData: JSON.stringify({ action, data, results: { success: results.success.length, failed: results.failed.length } })
      }
    });

    logger.info(`Bulk ${action}: ${results.success.length}/${results.total} succeeded`);

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    logger.error('Bulk update error:', error);
    res.status(500).json({
      success: false,
      error: 'Bulk operation failed'
    });
  }
};

/**
 * Bulk assign incidents
 */
async function bulkAssign(incidentIds, data, user, results) {
  const { assignedToId, assignmentGroupId } = data;

  for (const id of incidentIds) {
    try {
      const incident = await prisma.incident.update({
        where: { id },
        data: {
          assignedToId,
          assignmentGroupId,
          state: 'IN_PROGRESS'
        },
        include: {
          assignedTo: { select: { id: true, email: true, firstName: true, lastName: true } }
        }
      });

      // Create activity
      await prisma.activity.create({
        data: {
          incidentId: id,
          userId: user.id,
          action: 'BULK_ASSIGNED',
          description: `Bulk assigned by ${user.firstName} ${user.lastName}`
        }
      });

      // Send notification to assignee
      if (incident.assignedTo) {
        await emailService.sendIncidentAssigned(incident, incident.assignedTo);
      }

      results.success.push(id);
    } catch (error) {
      results.failed.push({ id, error: error.message });
    }
  }
}

/**
 * Bulk update state
 */
async function bulkUpdateState(incidentIds, data, user, results) {
  const { state } = data;
  const validStates = ['NEW', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED'];

  if (!validStates.includes(state)) {
    results.failed = incidentIds.map(id => ({ id, error: 'Invalid state' }));
    return;
  }

  const updateData = { state };

  if (state === 'RESOLVED') {
    updateData.resolvedAt = new Date();
  } else if (state === 'CLOSED') {
    updateData.closedAt = new Date();
  }

  for (const id of incidentIds) {
    try {
      await prisma.incident.update({
        where: { id },
        data: updateData
      });

      await prisma.activity.create({
        data: {
          incidentId: id,
          userId: user.id,
          action: 'BULK_STATE_CHANGE',
          description: `State changed to ${state} via bulk operation`,
          newValue: state
        }
      });

      results.success.push(id);
    } catch (error) {
      results.failed.push({ id, error: error.message });
    }
  }
}

/**
 * Bulk update priority
 */
async function bulkUpdatePriority(incidentIds, data, user, results) {
  const { priority, impact, urgency } = data;

  for (const id of incidentIds) {
    try {
      const updateData = {};
      if (priority) updateData.priority = priority;
      if (impact) updateData.impact = impact;
      if (urgency) updateData.urgency = urgency;

      await prisma.incident.update({
        where: { id },
        data: updateData
      });

      await prisma.activity.create({
        data: {
          incidentId: id,
          userId: user.id,
          action: 'BULK_PRIORITY_CHANGE',
          description: `Priority updated via bulk operation`,
          newValue: JSON.stringify(updateData)
        }
      });

      results.success.push(id);
    } catch (error) {
      results.failed.push({ id, error: error.message });
    }
  }
}

/**
 * Bulk add work note
 */
async function bulkAddNote(incidentIds, data, user, results) {
  const { content, isInternal = false } = data;

  if (!content) {
    results.failed = incidentIds.map(id => ({ id, error: 'Note content required' }));
    return;
  }

  for (const id of incidentIds) {
    try {
      await prisma.workNote.create({
        data: {
          incidentId: id,
          authorId: user.id,
          content,
          isInternal
        }
      });

      // Update incident timestamp
      await prisma.incident.update({
        where: { id },
        data: { updatedAt: new Date() }
      });

      results.success.push(id);
    } catch (error) {
      results.failed.push({ id, error: error.message });
    }
  }
}

/**
 * Bulk close incidents
 */
async function bulkClose(incidentIds, data, user, results) {
  const { resolutionCode, resolutionNotes } = data;

  for (const id of incidentIds) {
    try {
      await prisma.incident.update({
        where: { id },
        data: {
          state: 'CLOSED',
          closedAt: new Date(),
          resolutionCode: resolutionCode || 'BULK_CLOSED',
          resolutionNotes: resolutionNotes || 'Closed via bulk operation'
        }
      });

      await prisma.activity.create({
        data: {
          incidentId: id,
          userId: user.id,
          action: 'BULK_CLOSED',
          description: 'Closed via bulk operation'
        }
      });

      results.success.push(id);
    } catch (error) {
      results.failed.push({ id, error: error.message });
    }
  }
}

/**
 * Bulk delete incidents (admin only)
 * DELETE /api/v1/incidents/bulk
 */
exports.bulkDeleteIncidents = async (req, res) => {
  try {
    const { incidentIds } = req.body;

    if (!incidentIds || !Array.isArray(incidentIds) || incidentIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'incidentIds array is required'
      });
    }

    if (incidentIds.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 50 incidents can be deleted at once'
      });
    }

    // Delete incidents
    const result = await prisma.incident.deleteMany({
      where: { id: { in: incidentIds } }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'BULK_DELETE',
        entityType: 'Incident',
        entityId: incidentIds.join(','),
        oldData: JSON.stringify({ count: result.count })
      }
    });

    logger.info(`Bulk deleted ${result.count} incidents by ${req.user.email}`);

    res.json({
      success: true,
      data: { deleted: result.count }
    });
  } catch (error) {
    logger.error('Bulk delete error:', error);
    res.status(500).json({
      success: false,
      error: 'Bulk delete failed'
    });
  }
};

/**
 * Bulk update changes
 * POST /api/v1/changes/bulk
 */
exports.bulkUpdateChanges = async (req, res) => {
  try {
    const { changeIds, action, data } = req.body;

    if (!changeIds || !Array.isArray(changeIds) || changeIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'changeIds array is required'
      });
    }

    if (changeIds.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 50 changes can be updated at once'
      });
    }

    const results = {
      success: [],
      failed: [],
      total: changeIds.length
    };

    switch (action) {
      case 'APPROVE':
        for (const id of changeIds) {
          try {
            await prisma.change.update({
              where: { id },
              data: { state: 'APPROVED' }
            });

            await prisma.approval.updateMany({
              where: { changeId: id, approverId: req.user.id },
              data: { state: 'APPROVED', approvedAt: new Date() }
            });

            results.success.push(id);
          } catch (error) {
            results.failed.push({ id, error: error.message });
          }
        }
        break;

      case 'REJECT':
        for (const id of changeIds) {
          try {
            await prisma.change.update({
              where: { id },
              data: { state: 'REJECTED' }
            });

            await prisma.approval.updateMany({
              where: { changeId: id, approverId: req.user.id },
              data: { state: 'REJECTED', comments: data?.comments || 'Rejected via bulk operation' }
            });

            results.success.push(id);
          } catch (error) {
            results.failed.push({ id, error: error.message });
          }
        }
        break;

      default:
        return res.status(400).json({
          success: false,
          error: `Unknown action: ${action}`
        });
    }

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    logger.error('Bulk change update error:', error);
    res.status(500).json({
      success: false,
      error: 'Bulk operation failed'
    });
  }
};
