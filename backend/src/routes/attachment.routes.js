/**
 * Attachment Routes
 * LinkedEye-FinSpot
 */

const express = require('express');
const router = express.Router();
const { authenticate, checkPermission } = require('../middleware/auth.middleware');
const { attachmentService, upload } = require('../services/attachment.service');
const logger = require('../utils/logger');

router.use(authenticate);

// Upload attachments for incident
router.post('/incidents/:incidentId',
  checkPermission('incidents', 'update'),
  upload.array('files', 10),
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No files uploaded'
        });
      }

      const attachments = await attachmentService.uploadForIncident(
        req.params.incidentId,
        req.files,
        req.user.id
      );

      res.json({
        success: true,
        data: attachments,
        message: `${attachments.length} file(s) uploaded successfully`
      });
    } catch (error) {
      logger.error('Upload error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Upload failed'
      });
    }
  }
);

// Upload attachments for change
router.post('/changes/:changeId',
  checkPermission('changes', 'update'),
  upload.array('files', 10),
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No files uploaded'
        });
      }

      const attachments = await attachmentService.uploadForChange(
        req.params.changeId,
        req.files,
        req.user.id
      );

      res.json({
        success: true,
        data: attachments,
        message: `${attachments.length} file(s) uploaded successfully`
      });
    } catch (error) {
      logger.error('Upload error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Upload failed'
      });
    }
  }
);

// Upload attachments for problem
router.post('/problems/:problemId',
  checkPermission('problems', 'update'),
  upload.array('files', 10),
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No files uploaded'
        });
      }

      const attachments = await attachmentService.uploadForProblem(
        req.params.problemId,
        req.files,
        req.user.id
      );

      res.json({
        success: true,
        data: attachments,
        message: `${attachments.length} file(s) uploaded successfully`
      });
    } catch (error) {
      logger.error('Upload error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Upload failed'
      });
    }
  }
);

// Get attachments for incident
router.get('/incidents/:incidentId',
  checkPermission('incidents', 'read'),
  async (req, res) => {
    try {
      const attachments = await attachmentService.getForIncident(req.params.incidentId);
      res.json({ success: true, data: attachments });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Get attachments for change
router.get('/changes/:changeId',
  checkPermission('changes', 'read'),
  async (req, res) => {
    try {
      const attachments = await attachmentService.getForChange(req.params.changeId);
      res.json({ success: true, data: attachments });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Get attachments for problem
router.get('/problems/:problemId',
  checkPermission('problems', 'read'),
  async (req, res) => {
    try {
      const attachments = await attachmentService.getForProblem(req.params.problemId);
      res.json({ success: true, data: attachments });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Download attachment
router.get('/:id/download',
  async (req, res) => {
    try {
      const file = await attachmentService.download(req.params.id);
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      res.sendFile(file.path, { root: '.' });
    } catch (error) {
      res.status(404).json({ success: false, error: error.message });
    }
  }
);

// Delete attachment
router.delete('/:id',
  async (req, res) => {
    try {
      await attachmentService.delete(req.params.id, req.user.id);
      res.json({ success: true, message: 'Attachment deleted' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Get storage stats (admin only)
router.get('/stats',
  async (req, res) => {
    try {
      const stats = await attachmentService.getStorageStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

module.exports = router;
