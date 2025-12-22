/**
 * Change Management Routes
 * LinkedEye-FinSpot
 *
 * OPERATE Module - Change Management
 */

const express = require('express');
const router = express.Router();
const changeController = require('../controllers/change.controller');
const { authenticate, checkPermission } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/', checkPermission('changes', 'read'), changeController.listChanges);
router.get('/calendar', checkPermission('changes', 'read'), changeController.getCalendar);
router.get('/stats', checkPermission('changes', 'read'), changeController.getStats);
router.get('/:id', checkPermission('changes', 'read'), changeController.getChangeById);
router.post('/', checkPermission('changes', 'create'), changeController.createChange);
router.put('/:id', checkPermission('changes', 'update'), changeController.updateChange);
router.post('/:id/submit', checkPermission('changes', 'update'), changeController.submitForApproval);
router.post('/:id/approve', checkPermission('changes', 'approve'), changeController.approveChange);
router.post('/:id/reject', checkPermission('changes', 'approve'), changeController.rejectChange);
router.post('/:id/implement', checkPermission('changes', 'update'), changeController.startImplementation);
router.post('/:id/complete', checkPermission('changes', 'update'), changeController.completeChange);
router.post('/:id/rollback', checkPermission('changes', 'update'), changeController.rollbackChange);
router.delete('/:id', checkPermission('changes', 'delete'), changeController.deleteChange);

module.exports = router;
