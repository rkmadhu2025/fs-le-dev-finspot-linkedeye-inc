/**
 * User Routes
 * LinkedEye-FinSpot
 */

const express = require('express');
const router = express.Router();
const { prisma } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { paginate, paginationResponse } = require('../utils/helpers');

router.use(authenticate);

// List users
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 25, role, status, search } = req.query;
    const where = {};
    if (role) where.role = role;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }

    const { skip, take } = paginate(parseInt(page), parseInt(limit));
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where, skip, take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, email: true, firstName: true, lastName: true,
          role: true, status: true, department: true, jobTitle: true,
          lastLogin: true, avatar: true, createdAt: true
        }
      }),
      prisma.user.count({ where })
    ]);

    res.json({ success: true, ...paginationResponse(users, total, parseInt(page), parseInt(limit)) });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
});

// Get user by ID
router.get('/:id', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, email: true, firstName: true, lastName: true, phone: true,
        role: true, status: true, department: true, jobTitle: true, timezone: true,
        lastLogin: true, avatar: true, createdAt: true,
        teams: { include: { team: { select: { id: true, name: true } } } }
      }
    });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch user' });
  }
});

// Update user (admin only)
router.put('/:id', authorize('ADMIN'), async (req, res) => {
  try {
    const { firstName, lastName, role, status, department, jobTitle } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { firstName, lastName, role, status, department, jobTitle }
    });
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update user' });
  }
});

// Delete user (admin only)
router.delete('/:id', authorize('ADMIN'), async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete user' });
  }
});

// Get user notifications
router.get('/:id/notifications', async (req, res) => {
  try {
    if (req.params.id !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    const notifications = await prisma.notification.findMany({
      where: { userId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json({ success: true, data: notifications });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
});

// Mark notification as read
router.put('/notifications/:notificationId/read', async (req, res) => {
  try {
    await prisma.notification.update({
      where: { id: req.params.notificationId },
      data: { isRead: true, readAt: new Date() }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update notification' });
  }
});

module.exports = router;
