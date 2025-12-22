/**
 * Asset & CMDB Routes
 * LinkedEye-FinSpot
 *
 * OPERATE Module - Configuration Management Database
 */

const express = require('express');
const router = express.Router();
const { prisma } = require('../config/database');
const { authenticate, checkPermission } = require('../middleware/auth.middleware');
const { paginate, paginationResponse } = require('../utils/helpers');
const logger = require('../utils/logger');

router.use(authenticate);

// List configuration items
router.get('/', checkPermission('assets', 'read'), async (req, res) => {
  try {
    const { page = 1, limit = 25, type, status, search } = req.query;
    const where = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { hostname: { contains: search, mode: 'insensitive' } },
        { ipAddress: { contains: search, mode: 'insensitive' } }
      ];
    }

    const { skip, take } = paginate(parseInt(page), parseInt(limit));
    const [assets, total] = await Promise.all([
      prisma.configurationItem.findMany({ where, skip, take, orderBy: { name: 'asc' } }),
      prisma.configurationItem.count({ where })
    ]);

    res.json({ success: true, ...paginationResponse(assets, total, parseInt(page), parseInt(limit)) });
  } catch (error) {
    logger.error('List assets error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch assets' });
  }
});

// Get asset statistics
router.get('/stats', checkPermission('assets', 'read'), async (req, res) => {
  try {
    const [byType, byStatus] = await Promise.all([
      prisma.configurationItem.groupBy({ by: ['type'], _count: true }),
      prisma.configurationItem.groupBy({ by: ['status'], _count: true })
    ]);
    res.json({ success: true, data: { byType, byStatus } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

// Get CI by ID
router.get('/:id', checkPermission('assets', 'read'), async (req, res) => {
  try {
    const asset = await prisma.configurationItem.findUnique({
      where: { id: req.params.id },
      include: {
        incidents: { take: 10, orderBy: { createdAt: 'desc' }, select: { id: true, number: true, shortDescription: true, state: true } },
        changes: { include: { change: { select: { id: true, number: true, shortDescription: true, state: true } } } },
        alerts: { take: 10, orderBy: { firedAt: 'desc' } },
        activities: { take: 10, orderBy: { createdAt: 'desc' } }
      }
    });
    if (!asset) return res.status(404).json({ success: false, error: 'Asset not found' });
    res.json({ success: true, data: asset });
  } catch (error) {
    logger.error('Get asset error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch asset' });
  }
});

// Create CI
router.post('/', checkPermission('assets', 'create'), async (req, res) => {
  try {
    const asset = await prisma.configurationItem.create({ data: req.body });
    res.status(201).json({ success: true, data: asset });
  } catch (error) {
    logger.error('Create asset error:', error);
    res.status(500).json({ success: false, error: 'Failed to create asset' });
  }
});

// Update CI
router.put('/:id', checkPermission('assets', 'update'), async (req, res) => {
  try {
    const asset = await prisma.configurationItem.update({ where: { id: req.params.id }, data: req.body });
    res.json({ success: true, data: asset });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update asset' });
  }
});

// Create CI relationship
router.post('/:id/relationships', checkPermission('assets', 'update'), async (req, res) => {
  try {
    const { childId, type } = req.body;
    const relationship = await prisma.cIRelationship.create({
      data: { parentId: req.params.id, childId, type }
    });
    res.status(201).json({ success: true, data: relationship });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create relationship' });
  }
});

// Delete CI
router.delete('/:id', checkPermission('assets', 'delete'), async (req, res) => {
  try {
    await prisma.configurationItem.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Asset deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete asset' });
  }
});

module.exports = router;
