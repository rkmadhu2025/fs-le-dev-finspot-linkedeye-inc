/**
 * Problem Management Controller
 * LinkedEye-FinSpot
 *
 * OPERATE Module
 */

const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const { generateProblemNumber, generateKnownErrorId, paginate, paginationResponse } = require('../utils/helpers');

exports.listProblems = async (req, res) => {
  try {
    const { page = 1, limit = 25, state, priority } = req.query;
    const where = {};
    if (state) where.state = state;
    if (priority) where.priority = priority;

    const { skip, take } = paginate(parseInt(page), parseInt(limit));
    const [problems, total] = await Promise.all([
      prisma.problem.findMany({
        where, skip, take,
        orderBy: { createdAt: 'desc' },
        include: {
          assignedTo: { select: { firstName: true, lastName: true } },
          assignmentGroup: { select: { name: true } }
        }
      }),
      prisma.problem.count({ where })
    ]);

    res.json({ success: true, ...paginationResponse(problems, total, parseInt(page), parseInt(limit)) });
  } catch (error) {
    logger.error('List problems error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch problems' });
  }
};

exports.listKnownErrors = async (req, res) => {
  try {
    // KnownError model not yet implemented - return problems marked as known errors
    const knownErrors = await prisma.problem.findMany({
      where: { isKnownError: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: knownErrors });
  } catch (error) {
    logger.error('List known errors error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch known errors' });
  }
};

exports.getStats = async (req, res) => {
  try {
    const [byState, knownErrorCount] = await Promise.all([
      prisma.problem.groupBy({ by: ['state'], _count: true }),
      prisma.problem.count({ where: { isKnownError: true } })
    ]);
    res.json({ success: true, data: { byState, knownErrorCount } });
  } catch (error) {
    logger.error('Get problem stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
};

exports.getProblemById = async (req, res) => {
  try {
    const problem = await prisma.problem.findUnique({
      where: { id: req.params.id },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignmentGroup: { select: { id: true, name: true } },
        createdBy: { select: { firstName: true, lastName: true } },
        workNotes: { orderBy: { createdAt: 'desc' }, include: { author: { select: { firstName: true, lastName: true } } } },
        activities: { orderBy: { createdAt: 'desc' } }
      }
    });

    if (!problem) return res.status(404).json({ success: false, error: 'Problem not found' });
    res.json({ success: true, data: problem });
  } catch (error) {
    logger.error('Get problem error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch problem' });
  }
};

exports.createProblem = async (req, res) => {
  try {
    const lastProblem = await prisma.problem.findFirst({ orderBy: { number: 'desc' }, select: { number: true } });
    const number = generateProblemNumber(lastProblem?.number);

    const problem = await prisma.problem.create({
      data: { number, ...req.body, createdById: req.user.id, state: 'NEW' }
    });

    await prisma.activity.create({
      data: { problemId: problem.id, action: 'CREATED', description: `Problem created by ${req.user.firstName} ${req.user.lastName}`, userId: req.user.id }
    });

    res.status(201).json({ success: true, data: problem });
  } catch (error) {
    logger.error('Create problem error:', error);
    res.status(500).json({ success: false, error: 'Failed to create problem' });
  }
};

exports.updateProblem = async (req, res) => {
  try {
    const problem = await prisma.problem.update({ where: { id: req.params.id }, data: req.body });
    res.json({ success: true, data: problem });
  } catch (error) {
    logger.error('Update problem error:', error);
    res.status(500).json({ success: false, error: 'Failed to update problem' });
  }
};

exports.updateRCA = async (req, res) => {
  try {
    const { rootCause, rootCauseAnalysis } = req.body;
    const problem = await prisma.problem.update({
      where: { id: req.params.id },
      data: { rootCause, rootCauseAnalysis, state: 'ROOT_CAUSE_ANALYSIS' }
    });

    await prisma.activity.create({
      data: { problemId: problem.id, action: 'RCA_UPDATED', description: `RCA updated by ${req.user.firstName}`, userId: req.user.id }
    });

    res.json({ success: true, data: problem });
  } catch (error) {
    logger.error('Update RCA error:', error);
    res.status(500).json({ success: false, error: 'Failed to update RCA' });
  }
};

exports.addWorkaround = async (req, res) => {
  try {
    const { workaround } = req.body;
    const problem = await prisma.problem.update({
      where: { id: req.params.id },
      data: { workaround, workaroundEffective: true }
    });
    res.json({ success: true, data: problem });
  } catch (error) {
    logger.error('Add workaround error:', error);
    res.status(500).json({ success: false, error: 'Failed to add workaround' });
  }
};

exports.createKnownError = async (req, res) => {
  try {
    const problem = await prisma.problem.findUnique({ where: { id: req.params.id } });
    if (!problem) return res.status(404).json({ success: false, error: 'Problem not found' });

    // Generate known error ID
    const errorId = generateKnownErrorId(problem.knownErrorId);

    // Mark problem as known error (KnownError model not yet implemented)
    const updatedProblem = await prisma.problem.update({
      where: { id: req.params.id },
      data: { isKnownError: true, knownErrorId: errorId }
    });

    res.status(201).json({ success: true, data: updatedProblem, message: 'Problem marked as known error' });
  } catch (error) {
    logger.error('Create known error error:', error);
    res.status(500).json({ success: false, error: 'Failed to create known error' });
  }
};

exports.resolveProblem = async (req, res) => {
  try {
    const { permanentFix, relatedChangeId } = req.body;
    const problem = await prisma.problem.update({
      where: { id: req.params.id },
      data: { state: 'RESOLVED', permanentFix, fixImplemented: true, relatedChangeId, resolvedAt: new Date() }
    });
    res.json({ success: true, data: problem });
  } catch (error) {
    logger.error('Resolve problem error:', error);
    res.status(500).json({ success: false, error: 'Failed to resolve problem' });
  }
};

exports.deleteProblem = async (req, res) => {
  try {
    await prisma.problem.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Problem deleted' });
  } catch (error) {
    logger.error('Delete problem error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete problem' });
  }
};
