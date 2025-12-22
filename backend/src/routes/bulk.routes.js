/**
 * Bulk Operations Routes
 * LinkedEye-FinSpot
 */

const express = require('express');
const router = express.Router();
const bulkController = require('../controllers/bulk.controller');
const { authenticate, authorize, checkPermission } = require('../middleware/auth.middleware');

router.use(authenticate);

// Bulk incident operations
router.post('/incidents',
  checkPermission('incidents', 'update'),
  bulkController.bulkUpdateIncidents
);

router.delete('/incidents',
  authorize('ADMIN', 'MANAGER'),
  bulkController.bulkDeleteIncidents
);

// Bulk change operations
router.post('/changes',
  checkPermission('changes', 'approve'),
  bulkController.bulkUpdateChanges
);

module.exports = router;
