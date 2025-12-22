/**
 * Problem Management Routes
 * LinkedEye-FinSpot
 *
 * OPERATE Module - Problem Management
 */

const express = require('express');
const router = express.Router();
const problemController = require('../controllers/problem.controller');
const { authenticate, checkPermission } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/', checkPermission('problems', 'read'), problemController.listProblems);
router.get('/known-errors', checkPermission('problems', 'read'), problemController.listKnownErrors);
router.get('/stats', checkPermission('problems', 'read'), problemController.getStats);
router.get('/:id', checkPermission('problems', 'read'), problemController.getProblemById);
router.post('/', checkPermission('problems', 'create'), problemController.createProblem);
router.put('/:id', checkPermission('problems', 'update'), problemController.updateProblem);
router.post('/:id/rca', checkPermission('problems', 'update'), problemController.updateRCA);
router.post('/:id/workaround', checkPermission('problems', 'update'), problemController.addWorkaround);
router.post('/:id/known-error', checkPermission('problems', 'update'), problemController.createKnownError);
router.post('/:id/resolve', checkPermission('problems', 'update'), problemController.resolveProblem);
router.delete('/:id', checkPermission('problems', 'delete'), problemController.deleteProblem);

module.exports = router;
