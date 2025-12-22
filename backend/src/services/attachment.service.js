/**
 * Attachment Service
 * LinkedEye-FinSpot
 *
 * Production-grade file attachment handling with:
 * - Secure file upload/download
 * - File validation
 * - Storage management (local/S3)
 * - Virus scanning integration ready
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');

// Configuration
const UPLOAD_CONFIG = {
  maxFileSize: 25 * 1024 * 1024, // 25MB
  maxFiles: 10,
  allowedMimeTypes: [
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/json',
    'application/xml',
    'text/xml',
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    // Archives
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'application/gzip',
    // Logs
    'text/x-log',
    'application/octet-stream' // For generic files
  ],
  uploadDir: process.env.UPLOAD_DIR || './uploads'
};

// Ensure upload directory exists
async function ensureUploadDir() {
  try {
    await fs.mkdir(UPLOAD_CONFIG.uploadDir, { recursive: true });
    await fs.mkdir(path.join(UPLOAD_CONFIG.uploadDir, 'incidents'), { recursive: true });
    await fs.mkdir(path.join(UPLOAD_CONFIG.uploadDir, 'changes'), { recursive: true });
    await fs.mkdir(path.join(UPLOAD_CONFIG.uploadDir, 'problems'), { recursive: true });
    await fs.mkdir(path.join(UPLOAD_CONFIG.uploadDir, 'temp'), { recursive: true });
  } catch (error) {
    logger.error('Failed to create upload directories:', error);
  }
}

// Initialize upload directory
ensureUploadDir();

/**
 * Generate unique filename
 */
function generateFilename(originalName) {
  const ext = path.extname(originalName);
  const hash = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  return `${timestamp}-${hash}${ext}`;
}

/**
 * Validate file type
 */
function validateFileType(file) {
  // Check MIME type
  if (!UPLOAD_CONFIG.allowedMimeTypes.includes(file.mimetype)) {
    return { valid: false, error: `File type not allowed: ${file.mimetype}` };
  }

  // Check extension
  const ext = path.extname(file.originalname).toLowerCase();
  const dangerousExts = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs', '.js', '.msi', '.dll'];

  if (dangerousExts.includes(ext)) {
    return { valid: false, error: `File extension not allowed: ${ext}` };
  }

  return { valid: true };
}

/**
 * Multer storage configuration
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let subDir = 'temp';
    if (req.params.incidentId) subDir = 'incidents';
    else if (req.params.changeId) subDir = 'changes';
    else if (req.params.problemId) subDir = 'problems';

    cb(null, path.join(UPLOAD_CONFIG.uploadDir, subDir));
  },
  filename: (req, file, cb) => {
    cb(null, generateFilename(file.originalname));
  }
});

/**
 * Multer file filter
 */
const fileFilter = (req, file, cb) => {
  const validation = validateFileType(file);
  if (!validation.valid) {
    cb(new Error(validation.error), false);
  } else {
    cb(null, true);
  }
};

/**
 * Multer upload middleware
 */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: UPLOAD_CONFIG.maxFileSize,
    files: UPLOAD_CONFIG.maxFiles
  }
});

class AttachmentService {
  /**
   * Upload attachment for incident
   */
  async uploadForIncident(incidentId, files, userId) {
    const attachments = [];

    for (const file of files) {
      try {
        // Move file to incidents folder if needed
        const finalPath = path.join(UPLOAD_CONFIG.uploadDir, 'incidents', file.filename);

        // Create database record
        const attachment = await prisma.attachment.create({
          data: {
            filename: file.filename,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            path: finalPath,
            incidentId,
            uploadedBy: userId
          }
        });

        // Create activity
        await prisma.activity.create({
          data: {
            incidentId,
            userId,
            action: 'ATTACHMENT_ADDED',
            description: `Uploaded file: ${file.originalname}`
          }
        });

        attachments.push(attachment);
        logger.info(`Attachment uploaded: ${file.originalname} for incident ${incidentId}`);
      } catch (error) {
        logger.error('Failed to save attachment:', error);
        // Clean up file if database save failed
        try {
          await fs.unlink(file.path);
        } catch (e) {}
      }
    }

    return attachments;
  }

  /**
   * Upload attachment for change
   */
  async uploadForChange(changeId, files, userId) {
    const attachments = [];

    for (const file of files) {
      try {
        const finalPath = path.join(UPLOAD_CONFIG.uploadDir, 'changes', file.filename);

        const attachment = await prisma.attachment.create({
          data: {
            filename: file.filename,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            path: finalPath,
            changeId,
            uploadedBy: userId
          }
        });

        await prisma.activity.create({
          data: {
            changeId,
            userId,
            action: 'ATTACHMENT_ADDED',
            description: `Uploaded file: ${file.originalname}`
          }
        });

        attachments.push(attachment);
        logger.info(`Attachment uploaded: ${file.originalname} for change ${changeId}`);
      } catch (error) {
        logger.error('Failed to save attachment:', error);
        try {
          await fs.unlink(file.path);
        } catch (e) {}
      }
    }

    return attachments;
  }

  /**
   * Upload attachment for problem
   */
  async uploadForProblem(problemId, files, userId) {
    const attachments = [];

    for (const file of files) {
      try {
        const finalPath = path.join(UPLOAD_CONFIG.uploadDir, 'problems', file.filename);

        const attachment = await prisma.attachment.create({
          data: {
            filename: file.filename,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            path: finalPath,
            problemId,
            uploadedBy: userId
          }
        });

        await prisma.activity.create({
          data: {
            problemId,
            userId,
            action: 'ATTACHMENT_ADDED',
            description: `Uploaded file: ${file.originalname}`
          }
        });

        attachments.push(attachment);
        logger.info(`Attachment uploaded: ${file.originalname} for problem ${problemId}`);
      } catch (error) {
        logger.error('Failed to save attachment:', error);
        try {
          await fs.unlink(file.path);
        } catch (e) {}
      }
    }

    return attachments;
  }

  /**
   * Get attachment by ID
   */
  async getById(attachmentId) {
    return prisma.attachment.findUnique({
      where: { id: attachmentId }
    });
  }

  /**
   * Get attachments for incident
   */
  async getForIncident(incidentId) {
    return prisma.attachment.findMany({
      where: { incidentId },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Get attachments for change
   */
  async getForChange(changeId) {
    return prisma.attachment.findMany({
      where: { changeId },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Get attachments for problem
   */
  async getForProblem(problemId) {
    return prisma.attachment.findMany({
      where: { problemId },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Download attachment
   */
  async download(attachmentId) {
    const attachment = await this.getById(attachmentId);
    if (!attachment) {
      throw new Error('Attachment not found');
    }

    // Check if file exists
    try {
      await fs.access(attachment.path);
    } catch (error) {
      throw new Error('File not found on disk');
    }

    return {
      path: attachment.path,
      filename: attachment.originalName,
      mimeType: attachment.mimeType
    };
  }

  /**
   * Delete attachment
   */
  async delete(attachmentId, userId) {
    const attachment = await this.getById(attachmentId);
    if (!attachment) {
      throw new Error('Attachment not found');
    }

    // Delete file from disk
    try {
      await fs.unlink(attachment.path);
    } catch (error) {
      logger.warn('File not found on disk:', attachment.path);
    }

    // Delete database record
    await prisma.attachment.delete({
      where: { id: attachmentId }
    });

    // Create activity
    if (attachment.incidentId) {
      await prisma.activity.create({
        data: {
          incidentId: attachment.incidentId,
          userId,
          action: 'ATTACHMENT_DELETED',
          description: `Deleted file: ${attachment.originalName}`
        }
      });
    }

    logger.info(`Attachment deleted: ${attachment.originalName}`);
    return true;
  }

  /**
   * Get storage statistics
   */
  async getStorageStats() {
    const attachments = await prisma.attachment.findMany({
      select: { size: true, mimeType: true }
    });

    const totalSize = attachments.reduce((sum, a) => sum + a.size, 0);
    const byType = {};

    attachments.forEach(a => {
      const type = a.mimeType.split('/')[0];
      byType[type] = (byType[type] || 0) + a.size;
    });

    return {
      totalFiles: attachments.length,
      totalSize,
      totalSizeMB: Math.round(totalSize / (1024 * 1024) * 100) / 100,
      byType
    };
  }

  /**
   * Cleanup orphaned files
   */
  async cleanupOrphans() {
    const dirs = ['incidents', 'changes', 'problems'];
    let cleaned = 0;

    for (const dir of dirs) {
      const dirPath = path.join(UPLOAD_CONFIG.uploadDir, dir);

      try {
        const files = await fs.readdir(dirPath);

        for (const file of files) {
          const filePath = path.join(dirPath, file);

          // Check if file exists in database
          const attachment = await prisma.attachment.findFirst({
            where: { filename: file }
          });

          if (!attachment) {
            // Orphaned file - delete it
            await fs.unlink(filePath);
            cleaned++;
            logger.info(`Cleaned orphaned file: ${file}`);
          }
        }
      } catch (error) {
        logger.error(`Error cleaning directory ${dir}:`, error);
      }
    }

    return cleaned;
  }
}

// Export
const attachmentService = new AttachmentService();

module.exports = {
  attachmentService,
  upload,
  UPLOAD_CONFIG
};
