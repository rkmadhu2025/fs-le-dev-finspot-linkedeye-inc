/**
 * Team & On-Call Routes
 * LinkedEye-FinSpot
 */

const express = require('express');
const router = express.Router();
const { prisma } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const logger = require('../utils/logger');

router.use(authenticate);

// List teams
router.get('/', async (req, res) => {
  try {
    const teams = await prisma.team.findMany({
      where: { isActive: true },
      include: {
        members: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } } } },
        _count: { select: { assignedIncidents: true, assignedChanges: true } }
      }
    });
    res.json({ success: true, data: teams });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch teams' });
  }
});

// Get team by ID
router.get('/:id', async (req, res) => {
  try {
    const team = await prisma.team.findUnique({
      where: { id: req.params.id },
      include: {
        members: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true, jobTitle: true } } } },
        onCallSchedules: {
          where: { endTime: { gte: new Date() } },
          orderBy: { startTime: 'asc' },
          include: { user: { select: { firstName: true, lastName: true } } }
        },
        escalationPolicies: { include: { rules: true } },
        assignedIncidents: { where: { state: { in: ['NEW', 'IN_PROGRESS'] } }, take: 10 }
      }
    });
    if (!team) return res.status(404).json({ success: false, error: 'Team not found' });
    res.json({ success: true, data: team });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch team' });
  }
});

// Create team
router.post('/', authorize('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const team = await prisma.team.create({ data: req.body });
    res.status(201).json({ success: true, data: team });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create team' });
  }
});

// Update team
router.put('/:id', authorize('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const team = await prisma.team.update({ where: { id: req.params.id }, data: req.body });
    res.json({ success: true, data: team });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update team' });
  }
});

// Add member to team
router.post('/:id/members', authorize('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { userId, role = 'MEMBER' } = req.body;
    const member = await prisma.teamMember.create({
      data: { teamId: req.params.id, userId, role }
    });
    res.status(201).json({ success: true, data: member });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to add member' });
  }
});

// Remove member from team
router.delete('/:id/members/:userId', authorize('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    await prisma.teamMember.deleteMany({
      where: { teamId: req.params.id, userId: req.params.userId }
    });
    res.json({ success: true, message: 'Member removed' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to remove member' });
  }
});

// Get current on-call
router.get('/:id/on-call', async (req, res) => {
  try {
    const now = new Date();
    const onCall = await prisma.onCallSchedule.findFirst({
      where: {
        teamId: req.params.id,
        startTime: { lte: now },
        endTime: { gte: now }
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } }
    });
    res.json({ success: true, data: onCall });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch on-call' });
  }
});

// Create on-call schedule
router.post('/:id/on-call', authorize('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { userId, startTime, endTime, isPrimary = true } = req.body;
    const schedule = await prisma.onCallSchedule.create({
      data: { teamId: req.params.id, userId, startTime: new Date(startTime), endTime: new Date(endTime), isPrimary }
    });
    res.status(201).json({ success: true, data: schedule });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create schedule' });
  }
});

// Get on-call schedule
router.get('/:id/on-call/schedule', async (req, res) => {
  try {
    const { start, end } = req.query;
    const where = { teamId: req.params.id };
    if (start) where.startTime = { gte: new Date(start) };
    if (end) where.endTime = { lte: new Date(end) };

    const schedules = await prisma.onCallSchedule.findMany({
      where,
      orderBy: { startTime: 'asc' },
      include: { user: { select: { firstName: true, lastName: true, avatar: true } } }
    });
    res.json({ success: true, data: schedules });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch schedule' });
  }
});

// Create escalation policy
router.post('/:id/escalation-policy', authorize('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { name, description, rules } = req.body;
    const policy = await prisma.escalationPolicy.create({
      data: {
        teamId: req.params.id,
        name,
        description,
        rules: { create: rules }
      },
      include: { rules: true }
    });
    res.status(201).json({ success: true, data: policy });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create policy' });
  }
});

// Delete team
router.delete('/:id', authorize('ADMIN'), async (req, res) => {
  try {
    await prisma.team.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ success: true, message: 'Team deactivated' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete team' });
  }
});

module.exports = router;
