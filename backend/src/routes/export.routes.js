/**
 * Export/Import Routes
 * LinkedEye-FinSpot
 */

const express = require('express');
const router = express.Router();
const exportController = require('../controllers/export.controller');
const { authenticate, authorize, checkPermission } = require('../middleware/auth.middleware');
const { upload } = require('../services/attachment.service');

router.use(authenticate);

// Export routes
router.get('/incidents',
  checkPermission('incidents', 'read'),
  exportController.exportIncidents
);

router.get('/changes',
  checkPermission('changes', 'read'),
  exportController.exportChanges
);

router.get('/assets',
  checkPermission('assets', 'read'),
  exportController.exportAssets
);

// Import routes (admin only)
router.post('/assets',
  authorize('ADMIN'),
  upload.single('file'),
  exportController.importAssets
);

// Templates
router.get('/template/:type',
  authenticate,
  exportController.getTemplate
);

module.exports = router;
