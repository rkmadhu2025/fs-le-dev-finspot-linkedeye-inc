/**
 * Incident Routes
 * LinkedEye-FinSpot
 *
 * RUN Module - Day-to-day operations
 */

const express = require('express');
const router = express.Router();
const incidentController = require('../controllers/incident.controller');
const { authenticate, checkPermission } = require('../middleware/auth.middleware');
const { body, query, param } = require('express-validator');

// Validation rules
const createIncidentValidation = [
  body('shortDescription')
    .trim()
    .notEmpty()
    .withMessage('Short description is required')
    .isLength({ max: 255 })
    .withMessage('Short description must be less than 255 characters'),
  body('description').optional().trim(),
  body('impact').optional().isIn(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  body('urgency').optional().isIn(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  body('category').optional().trim(),
  body('subcategory').optional().trim(),
  body('assignedToId').optional().isUUID(),
  body('assignmentGroupId').optional().isUUID(),
  body('configItemId').optional().isUUID()
];

const updateIncidentValidation = [
  body('shortDescription').optional().trim().isLength({ max: 255 }),
  body('description').optional().trim(),
  body('state').optional().isIn(['NEW', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED', 'CANCELLED']),
  body('impact').optional().isIn(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  body('urgency').optional().isIn(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  body('assignedToId').optional().isUUID(),
  body('assignmentGroupId').optional().isUUID(),
  body('resolutionCode').optional().trim(),
  body('resolutionNotes').optional().trim()
];

const listQueryValidation = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('state').optional().isIn(['NEW', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED', 'CANCELLED']),
  query('priority').optional().isIn(['P1', 'P2', 'P3', 'P4']),
  query('assignedToId').optional().isUUID(),
  query('assignmentGroupId').optional().isUUID(),
  query('sortBy').optional().isIn(['createdAt', 'updatedAt', 'priority', 'state', 'number']),
  query('sortOrder').optional().isIn(['asc', 'desc'])
];

// Apply authentication to all routes
router.use(authenticate);

// List incidents
router.get('/',
  checkPermission('incidents', 'read'),
  listQueryValidation,
  incidentController.listIncidents
);

// Get incident statistics
router.get('/stats',
  checkPermission('incidents', 'read'),
  incidentController.getIncidentStats
);

// Get incident by number (INC0000001)
router.get('/number/:number',
  checkPermission('incidents', 'read'),
  incidentController.getIncidentByNumber
);

// Get incident by ID
router.get('/:id',
  checkPermission('incidents', 'read'),
  param('id').isUUID(),
  incidentController.getIncidentById
);

// Create incident
router.post('/',
  checkPermission('incidents', 'create'),
  createIncidentValidation,
  incidentController.createIncident
);

// Update incident
router.put('/:id',
  checkPermission('incidents', 'update'),
  param('id').isUUID(),
  updateIncidentValidation,
  incidentController.updateIncident
);

// Assign incident
router.post('/:id/assign',
  checkPermission('incidents', 'update'),
  param('id').isUUID(),
  body('assignedToId').optional().isUUID(),
  body('assignmentGroupId').optional().isUUID(),
  incidentController.assignIncident
);

// Resolve incident
router.post('/:id/resolve',
  checkPermission('incidents', 'update'),
  param('id').isUUID(),
  body('resolutionCode').notEmpty().withMessage('Resolution code is required'),
  body('resolutionNotes').notEmpty().withMessage('Resolution notes are required'),
  incidentController.resolveIncident
);

// Close incident
router.post('/:id/close',
  checkPermission('incidents', 'update'),
  param('id').isUUID(),
  incidentController.closeIncident
);

// Reopen incident
router.post('/:id/reopen',
  checkPermission('incidents', 'update'),
  param('id').isUUID(),
  incidentController.reopenIncident
);

// Add work note
router.post('/:id/notes',
  checkPermission('incidents', 'update'),
  param('id').isUUID(),
  body('content').notEmpty().withMessage('Note content is required'),
  body('isInternal').optional().isBoolean(),
  incidentController.addWorkNote
);

// Get work notes
router.get('/:id/notes',
  checkPermission('incidents', 'read'),
  param('id').isUUID(),
  incidentController.getWorkNotes
);

// Get incident timeline/activities
router.get('/:id/activities',
  checkPermission('incidents', 'read'),
  param('id').isUUID(),
  incidentController.getActivities
);

// Link incident to change
router.post('/:id/link-change',
  checkPermission('incidents', 'update'),
  param('id').isUUID(),
  body('changeId').isUUID(),
  incidentController.linkToChange
);

// Link incident to problem
router.post('/:id/link-problem',
  checkPermission('incidents', 'update'),
  param('id').isUUID(),
  body('problemId').isUUID(),
  incidentController.linkToProblem
);

// Get related alerts
router.get('/:id/alerts',
  checkPermission('incidents', 'read'),
  param('id').isUUID(),
  incidentController.getRelatedAlerts
);

// Delete incident (admin only)
router.delete('/:id',
  checkPermission('incidents', 'delete'),
  param('id').isUUID(),
  incidentController.deleteIncident
);

module.exports = router;
