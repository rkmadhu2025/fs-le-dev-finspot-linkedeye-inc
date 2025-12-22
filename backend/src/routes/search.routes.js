/**
 * Global Search Routes
 * LinkedEye-FinSpot
 */

const express = require('express');
const router = express.Router();
const { prisma } = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');
const logger = require('../utils/logger');

router.use(authenticate);

/**
 * Global Search Across All Entities
 * GET /api/v1/search?q=query
 */
router.get('/', async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || q.length < 2) {
            return res.json({ success: true, data: [] });
        }

        const query = q.toLowerCase();

        // Perform parallel searches across different models
        const [incidents, assets, alerts, changes, problems] = await Promise.all([
            // Search Incidents
            prisma.incident.findMany({
                where: {
                    OR: [
                        { number: { contains: q, mode: 'insensitive' } },
                        { shortDescription: { contains: q, mode: 'insensitive' } }
                    ]
                },
                take: 5,
                select: { id: true, number: true, shortDescription: true }
            }),
            // Search Assets (ConfigurationItems)
            prisma.configurationItem.findMany({
                where: {
                    OR: [
                        { name: { contains: q, mode: 'insensitive' } },
                        { hostname: { contains: q, mode: 'insensitive' } },
                        { ipAddress: { contains: q, mode: 'insensitive' } }
                    ]
                },
                take: 5,
                select: { id: true, name: true, type: true }
            }),
            // Search Alerts
            prisma.alert.findMany({
                where: {
                    OR: [
                        { name: { contains: q, mode: 'insensitive' } },
                        { alertId: { contains: q, mode: 'insensitive' } }
                    ]
                },
                take: 5,
                select: { id: true, name: true, severity: true, alertId: true }
            }),
            // Search Changes
            prisma.change.findMany({
                where: {
                    OR: [
                        { number: { contains: q, mode: 'insensitive' } },
                        { shortDescription: { contains: q, mode: 'insensitive' } }
                    ]
                },
                take: 5,
                select: { id: true, number: true, shortDescription: true }
            }),
            // Search Problems
            prisma.problem.findMany({
                where: {
                    OR: [
                        { number: { contains: q, mode: 'insensitive' } },
                        { shortDescription: { contains: q, mode: 'insensitive' } }
                    ]
                },
                take: 5,
                select: { id: true, number: true, shortDescription: true }
            })
        ]);

        // Format results for frontend
        const results = [
            ...incidents.map(i => ({
                id: i.id,
                type: 'incident',
                title: i.number,
                subtitle: i.shortDescription,
                url: `/incidents/${i.id}`
            })),
            ...assets.map(a => ({
                id: a.id,
                type: 'asset',
                title: a.name,
                subtitle: a.type,
                url: `/assets/${a.id}`
            })),
            ...alerts.map(a => ({
                id: a.id,
                type: 'alert',
                title: a.name,
                subtitle: `${a.severity} - ${a.alertId}`,
                url: `/alerts` // Alerts list page
            })),
            ...changes.map(c => ({
                id: c.id,
                type: 'change',
                title: c.number,
                subtitle: c.shortDescription,
                url: `/changes/${c.id}`
            })),
            ...problems.map(p => ({
                id: p.id,
                type: 'problem',
                title: p.number,
                subtitle: p.shortDescription,
                url: `/problems/${p.id}`
            }))
        ];

        res.json({ success: true, data: results });
    } catch (error) {
        logger.error('Global search error:', error);
        res.status(500).json({ success: false, error: 'Search failed' });
    }
});

module.exports = router;
