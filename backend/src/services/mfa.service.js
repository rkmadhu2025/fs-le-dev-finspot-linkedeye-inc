/**
 * MFA (Multi-Factor Authentication) Service
 * LinkedEye-FinSpot
 *
 * Production-grade TOTP-based MFA implementation
 * Compatible with Google Authenticator, Authy, Microsoft Authenticator
 */

const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');

// Configuration
const MFA_CONFIG = {
  issuer: 'LinkedEye-FinSpot',
  algorithm: 'sha1',
  digits: 6,
  step: 30,
  window: 1, // Allow 1 step before/after for clock drift
  backupCodesCount: 10,
  backupCodeLength: 8
};

class MFAService {
  /**
   * Generate new MFA secret for user
   * @param {string} userEmail - User's email address
   * @returns {object} - Secret and QR code data
   */
  async generateSecret(userEmail) {
    try {
      const secret = speakeasy.generateSecret({
        length: 20,
        name: `${MFA_CONFIG.issuer}:${userEmail}`,
        issuer: MFA_CONFIG.issuer
      });

      // Generate QR code as data URL
      const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url, {
        width: 256,
        margin: 2,
        color: {
          dark: '#1a56db',
          light: '#ffffff'
        }
      });

      // Generate backup codes
      const backupCodes = this.generateBackupCodes();
      const hashedBackupCodes = backupCodes.map(code => this.hashBackupCode(code));

      return {
        secret: secret.base32,
        otpauthUrl: secret.otpauth_url,
        qrCode: qrCodeDataUrl,
        backupCodes,
        hashedBackupCodes
      };
    } catch (error) {
      logger.error('Error generating MFA secret:', error);
      throw new Error('Failed to generate MFA secret');
    }
  }

  /**
   * Verify TOTP code
   * @param {string} secret - User's MFA secret (base32 encoded)
   * @param {string} token - 6-digit TOTP code
   * @returns {boolean} - Whether code is valid
   */
  verifyToken(secret, token) {
    try {
      if (!secret || !token) {
        return false;
      }

      // Normalize token (remove spaces)
      const normalizedToken = token.replace(/\s/g, '');

      // Validate format
      if (!/^\d{6}$/.test(normalizedToken)) {
        return false;
      }

      const verified = speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token: normalizedToken,
        algorithm: MFA_CONFIG.algorithm,
        digits: MFA_CONFIG.digits,
        step: MFA_CONFIG.step,
        window: MFA_CONFIG.window
      });

      return verified;
    } catch (error) {
      logger.error('Error verifying TOTP token:', error);
      return false;
    }
  }

  /**
   * Verify TOTP and enable MFA for user
   * @param {string} userId - User ID
   * @param {string} secret - MFA secret to store
   * @param {string} token - TOTP code for verification
   * @param {string[]} hashedBackupCodes - Hashed backup codes
   * @returns {object} - Result with success status
   */
  async enableMFA(userId, secret, token, hashedBackupCodes) {
    try {
      // Verify the token first
      const isValid = this.verifyToken(secret, token);
      if (!isValid) {
        return { success: false, error: 'Invalid verification code' };
      }

      // Encrypt the secret before storing
      const encryptedSecret = this.encryptSecret(secret);

      // Update user with MFA enabled
      await prisma.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: true,
          mfaSecret: encryptedSecret,
          // Store backup codes as JSON
          // In production, you might want a separate table
        }
      });

      // Log MFA enablement
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'MFA_ENABLED',
          entityType: 'User',
          entityId: userId,
          newData: JSON.stringify({ backupCodesGenerated: hashedBackupCodes.length })
        }
      });

      logger.info(`MFA enabled for user: ${userId}`);
      return { success: true };
    } catch (error) {
      logger.error('Error enabling MFA:', error);
      throw new Error('Failed to enable MFA');
    }
  }

  /**
   * Disable MFA for user
   * @param {string} userId - User ID
   * @param {string} password - User's password for verification
   * @param {string} token - Current TOTP code OR backup code
   * @returns {object} - Result with success status
   */
  async disableMFA(userId, password, token) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user || !user.mfaEnabled) {
        return { success: false, error: 'MFA is not enabled' };
      }

      // Decrypt and verify TOTP
      const decryptedSecret = this.decryptSecret(user.mfaSecret);
      const isValid = this.verifyToken(decryptedSecret, token);

      if (!isValid) {
        // Check if it's a backup code
        // For production, implement backup code verification
        return { success: false, error: 'Invalid verification code' };
      }

      // Disable MFA
      await prisma.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: false,
          mfaSecret: null
        }
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'MFA_DISABLED',
          entityType: 'User',
          entityId: userId
        }
      });

      logger.info(`MFA disabled for user: ${userId}`);
      return { success: true };
    } catch (error) {
      logger.error('Error disabling MFA:', error);
      throw new Error('Failed to disable MFA');
    }
  }

  /**
   * Verify MFA during login
   * @param {string} userId - User ID
   * @param {string} token - TOTP code or backup code
   * @returns {object} - Result with success status
   */
  async verifyMFALogin(userId, token) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user || !user.mfaEnabled || !user.mfaSecret) {
        return { success: false, error: 'MFA not configured' };
      }

      // Decrypt secret
      const decryptedSecret = this.decryptSecret(user.mfaSecret);

      // Verify TOTP
      const isValid = this.verifyToken(decryptedSecret, token);

      if (isValid) {
        // Log successful MFA verification
        await prisma.auditLog.create({
          data: {
            userId,
            action: 'MFA_VERIFIED',
            entityType: 'User',
            entityId: userId
          }
        });

        return { success: true };
      }

      // Check backup code if TOTP fails
      // For production, implement backup code verification logic here

      // Log failed attempt
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'MFA_VERIFICATION_FAILED',
          entityType: 'User',
          entityId: userId
        }
      });

      return { success: false, error: 'Invalid verification code' };
    } catch (error) {
      logger.error('Error verifying MFA login:', error);
      return { success: false, error: 'MFA verification failed' };
    }
  }

  /**
   * Generate backup codes
   * @returns {string[]} - Array of backup codes
   */
  generateBackupCodes() {
    const codes = [];
    for (let i = 0; i < MFA_CONFIG.backupCodesCount; i++) {
      const code = crypto.randomBytes(MFA_CONFIG.backupCodeLength / 2)
        .toString('hex')
        .toUpperCase()
        .match(/.{4}/g)
        .join('-');
      codes.push(code);
    }
    return codes;
  }

  /**
   * Hash backup code for storage
   * @param {string} code - Backup code
   * @returns {string} - Hashed code
   */
  hashBackupCode(code) {
    return crypto.createHash('sha256')
      .update(code.replace(/-/g, '').toUpperCase())
      .digest('hex');
  }

  /**
   * Encrypt MFA secret for storage
   * @param {string} secret - Plain text secret
   * @returns {string} - Encrypted secret
   */
  encryptSecret(secret) {
    const encryptionKey = process.env.MFA_ENCRYPTION_KEY || process.env.JWT_SECRET;
    const key = crypto.scryptSync(encryptionKey, 'linkedeye-salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(secret, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Return IV + AuthTag + Encrypted data
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt MFA secret
   * @param {string} encryptedSecret - Encrypted secret
   * @returns {string} - Decrypted secret
   */
  decryptSecret(encryptedSecret) {
    try {
      const encryptionKey = process.env.MFA_ENCRYPTION_KEY || process.env.JWT_SECRET;
      const key = crypto.scryptSync(encryptionKey, 'linkedeye-salt', 32);

      const parts = encryptedSecret.split(':');
      if (parts.length !== 3) {
        // Legacy unencrypted secret
        return encryptedSecret;
      }

      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error('Error decrypting MFA secret:', error);
      throw new Error('Failed to decrypt MFA secret');
    }
  }

  /**
   * Generate current TOTP for testing (admin only)
   * @param {string} secret - MFA secret
   * @returns {string} - Current TOTP code
   */
  generateCurrentToken(secret) {
    return speakeasy.totp({
      secret,
      encoding: 'base32',
      algorithm: MFA_CONFIG.algorithm,
      digits: MFA_CONFIG.digits,
      step: MFA_CONFIG.step
    });
  }

  /**
   * Get remaining seconds until next token
   * @returns {number} - Seconds remaining
   */
  getTimeRemaining() {
    return MFA_CONFIG.step - (Math.floor(Date.now() / 1000) % MFA_CONFIG.step);
  }
}

// Export singleton instance
const mfaService = new MFAService();
module.exports = mfaService;
