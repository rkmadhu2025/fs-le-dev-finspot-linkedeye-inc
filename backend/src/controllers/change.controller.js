/**
 * Change Management Controller
 * LinkedEye-FinSpot
 *
 * OPERATE Module
 */

const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const { generateChangeNumber, paginate, paginationResponse } = require('../utils/helpers');

exports.listChanges = async (req, res) => {
  try {
    const { page = 1, limit = 25, state, type, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const where = {};
    if (state) where.state = state;
    if (type) where.type = type;

    const { skip, take } = paginate(parseInt(page), parseInt(limit));

    const [changes, total] = await Promise.all([
      prisma.change.findMany({
        where, skip, take,
        orderBy: { [sortBy]: sortOrder },
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
          assignmentGroup: { select: { id: true, name: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          approvals: { include: { approver: { select: { firstName: true, lastName: true } } } }
        }
      }),
      prisma.change.count({ where })
    ]);

    res.json({ success: true, ...paginationResponse(changes, total, parseInt(page), parseInt(limit)) });
  } catch (error) {
    logger.error('List changes error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch changes' });
  }
};

exports.getCalendar = async (req, res) => {
  try {
    const { start, end } = req.query;
    const where = {
      plannedStartDate: { not: null }
    };
    if (start) where.plannedStartDate = { ...where.plannedStartDate, gte: new Date(start) };
    if (end) where.plannedEndDate = { lte: new Date(end) };

    const changes = await prisma.change.findMany({
      where,
      select: {
        id: true, number: true, shortDescription: true, type: true, state: true,
        plannedStartDate: true, plannedEndDate: true, riskLevel: true
      }
    });

    res.json({ success: true, data: changes });
  } catch (error) {
    logger.error('Get calendar error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch calendar' });
  }
};

exports.getStats = async (req, res) => {
  try {
    const [byState, byType, successRate] = await Promise.all([
      prisma.change.groupBy({ by: ['state'], _count: true }),
      prisma.change.groupBy({ by: ['type'], _count: true }),
      prisma.change.count({ where: { state: 'CLOSED', closureCode: 'successful' } })
    ]);

    res.json({ success: true, data: { byState, byType, successRate } });
  } catch (error) {
    logger.error('Get stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
};

exports.getChangeById = async (req, res) => {
  try {
    const change = await prisma.change.findUnique({
      where: { id: req.params.id },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignmentGroup: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        approvals: { include: { approver: { select: { id: true, firstName: true, lastName: true } } } },
        affectedCIs: { include: { configItem: true } },
        workNotes: { orderBy: { createdAt: 'desc' }, include: { author: { select: { firstName: true, lastName: true } } } },
        activities: { orderBy: { createdAt: 'desc' } }
      }
    });

    if (!change) return res.status(404).json({ success: false, error: 'Change not found' });
    res.json({ success: true, data: change });
  } catch (error) {
    logger.error('Get change error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch change' });
  }
};

exports.createChange = async (req, res) => {
  try {
    const lastChange = await prisma.change.findFirst({ orderBy: { number: 'desc' }, select: { number: true } });
    const number = generateChangeNumber(lastChange?.number);

    const change = await prisma.change.create({
      data: {
        number,
        ...req.body,
        createdById: req.user.id,
        state: 'DRAFT'
      }
    });

    await prisma.activity.create({
      data: { changeId: change.id, action: 'CREATED', description: `Change created by ${req.user.firstName} ${req.user.lastName}`, userId: req.user.id }
    });

    res.status(201).json({ success: true, message: 'Change created successfully', data: change });
  } catch (error) {
    logger.error('Create change error:', error);
    res.status(500).json({ success: false, error: 'Failed to create change' });
  }
};

exports.updateChange = async (req, res) => {
  try {
    const change = await prisma.change.update({ where: { id: req.params.id }, data: req.body });
    res.json({ success: true, data: change });
  } catch (error) {
    logger.error('Update change error:', error);
    res.status(500).json({ success: false, error: 'Failed to update change' });
  }
};

exports.submitForApproval = async (req, res) => {
  try {
    const { approverIds } = req.body;
    const change = await prisma.change.update({
      where: { id: req.params.id },
      data: { state: 'AUTHORIZE' }
    });

    // Create approval records
    if (approverIds && approverIds.length > 0) {
      await prisma.approval.createMany({
        data: approverIds.map(approverId => ({
          changeId: change.id,
          approverId,
          state: 'PENDING'
        }))
      });
    }

    res.json({ success: true, message: 'Change submitted for approval', data: change });
  } catch (error) {
    logger.error('Submit for approval error:', error);
    res.status(500).json({ success: false, error: 'Failed to submit for approval' });
  }
};

exports.approveChange = async (req, res) => {
  try {
    const { comments } = req.body;

    await prisma.approval.updateMany({
      where: { changeId: req.params.id, approverId: req.user.id },
      data: { state: 'APPROVED', comments, approvedAt: new Date() }
    });

    // Check if all approvals are complete
    const pendingApprovals = await prisma.approval.count({
      where: { changeId: req.params.id, state: 'PENDING' }
    });

    if (pendingApprovals === 0) {
      await prisma.change.update({
        where: { id: req.params.id },
        data: { state: 'SCHEDULED' }
      });
    }

    res.json({ success: true, message: 'Change approved successfully' });
  } catch (error) {
    logger.error('Approve change error:', error);
    res.status(500).json({ success: false, error: 'Failed to approve change' });
  }
};

exports.rejectChange = async (req, res) => {
  try {
    const { comments } = req.body;

    await prisma.approval.updateMany({
      where: { changeId: req.params.id, approverId: req.user.id },
      data: { state: 'REJECTED', comments, approvedAt: new Date() }
    });

    await prisma.change.update({
      where: { id: req.params.id },
      data: { state: 'CANCELLED' }
    });

    res.json({ success: true, message: 'Change rejected' });
  } catch (error) {
    logger.error('Reject change error:', error);
    res.status(500).json({ success: false, error: 'Failed to reject change' });
  }
};

exports.startImplementation = async (req, res) => {
  try {
    const change = await prisma.change.update({
      where: { id: req.params.id },
      data: { state: 'IMPLEMENT', actualStartDate: new Date() }
    });
    res.json({ success: true, data: change });
  } catch (error) {
    logger.error('Start implementation error:', error);
    res.status(500).json({ success: false, error: 'Failed to start implementation' });
  }
};

exports.completeChange = async (req, res) => {
  try {
    const { closureCode, reviewNotes } = req.body;
    const change = await prisma.change.update({
      where: { id: req.params.id },
      data: { state: 'CLOSED', closureCode, reviewNotes, actualEndDate: new Date() }
    });
    res.json({ success: true, data: change });
  } catch (error) {
    logger.error('Complete change error:', error);
    res.status(500).json({ success: false, error: 'Failed to complete change' });
  }
};

exports.rollbackChange = async (req, res) => {
  try {
    const { reason } = req.body;
    const change = await prisma.change.update({
      where: { id: req.params.id },
      data: { state: 'REVIEW', reviewNotes: `Rolled back: ${reason}` }
    });
    res.json({ success: true, data: change });
  } catch (error) {
    logger.error('Rollback change error:', error);
    res.status(500).json({ success: false, error: 'Failed to rollback change' });
  }
};

exports.deleteChange = async (req, res) => {
  try {
    await prisma.change.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Change deleted' });
  } catch (error) {
    logger.error('Delete change error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete change' });
  }
};
