/**
 * Authentication Controller
 * LinkedEye-FinSpot
 *
 * Production-grade authentication with MFA, password reset, and session management
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const { generateToken } = require('../utils/helpers');
const mfaService = require('../services/mfa.service');
const emailService = require('../services/email.service');

/**
 * Generate JWT tokens
 */
const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );

  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );

  return { accessToken, refreshToken };
};

/**
 * Login
 * POST /api/v1/auth/login
 */
exports.login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, password, mfaCode } = req.body;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Check if account is locked
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const remainingTime = Math.ceil((new Date(user.lockedUntil) - new Date()) / 60000);
      return res.status(423).json({
        success: false,
        error: `Account is locked. Try again in ${remainingTime} minutes.`
      });
    }

    // Check if account is active
    if (user.status !== 'ACTIVE') {
      return res.status(401).json({
        success: false,
        error: 'Account is not active. Please contact administrator.'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      // Increment login attempts
      const newAttempts = user.loginAttempts + 1;
      const updateData = { loginAttempts: newAttempts };

      // Lock account after 5 failed attempts
      if (newAttempts >= 5) {
        updateData.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
        updateData.loginAttempts = 0;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: updateData
      });

      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
        attemptsRemaining: 5 - newAttempts
      });
    }

    // Check MFA if enabled
    if (user.mfaEnabled) {
      if (!mfaCode) {
        // Return MFA required response
        return res.status(200).json({
          success: true,
          mfaRequired: true,
          userId: user.id, // Include for MFA verification step
          message: 'MFA code required'
        });
      }

      // Verify MFA code using the service
      const mfaResult = await mfaService.verifyMFALogin(user.id, mfaCode);
      if (!mfaResult.success) {
        return res.status(401).json({
          success: false,
          error: mfaResult.error || 'Invalid MFA code'
        });
      }
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);

    // Save session
    await prisma.session.create({
      data: {
        userId: user.id,
        token: accessToken,
        refreshToken,
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      }
    });

    // Update user's last login
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLogin: new Date(),
        loginAttempts: 0,
        lockedUntil: null
      }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        entityType: 'User',
        entityId: user.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
    });

    logger.info(`User logged in: ${user.email}`);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          department: user.department,
          jobTitle: user.jobTitle,
          avatar: user.avatar,
          mfaEnabled: user.mfaEnabled
        },
        accessToken,
        refreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || '24h'
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed. Please try again.'
    });
  }
};

/**
 * Register
 * POST /api/v1/auth/register
 */
exports.register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, password, firstName, lastName, phone, department, jobTitle } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        firstName,
        lastName,
        phone,
        department,
        jobTitle,
        role: 'OPERATOR', // Default role
        status: 'PENDING' // Requires approval
      }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'REGISTER',
        entityType: 'User',
        entityId: user.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
    });

    logger.info(`New user registered: ${user.email}`);

    res.status(201).json({
      success: true,
      message: 'Registration successful. Your account is pending approval.',
      data: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status
      }
    });
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed. Please try again.'
    });
  }
};

/**
 * Get Current User
 * GET /api/v1/auth/me
 */
exports.getCurrentUser = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatar: true,
        role: true,
        status: true,
        department: true,
        jobTitle: true,
        timezone: true,
        mfaEnabled: true,
        lastLogin: true,
        createdAt: true,
        teams: {
          include: {
            team: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user details'
    });
  }
};

/**
 * Logout
 * POST /api/v1/auth/logout
 */
exports.logout = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (token) {
      // Delete session
      await prisma.session.deleteMany({
        where: { token }
      });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'LOGOUT',
        entityType: 'User',
        entityId: req.user.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
    });

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed'
    });
  }
};

/**
 * Refresh Token
 * POST /api/v1/auth/refresh-token
 */
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token is required'
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Check if session exists
    const session = await prisma.session.findFirst({
      where: { refreshToken, userId: decoded.userId }
    });

    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token'
      });
    }

    // Generate new tokens
    const tokens = generateTokens(decoded.userId);

    // Update session
    await prisma.session.update({
      where: { id: session.id },
      data: {
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });

    res.json({
      success: true,
      data: tokens
    });
  } catch (error) {
    logger.error('Refresh token error:', error);
    res.status(401).json({
      success: false,
      error: 'Invalid or expired refresh token'
    });
  }
};

/**
 * Forgot Password
 * POST /api/v1/auth/forgot-password
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({
        success: true,
        message: 'If the email exists, a password reset link will be sent.'
      });
    }

    // Generate reset token
    const resetToken = generateToken(32);
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Delete any existing reset tokens for this user
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id }
    });

    // Save reset token to database (expires in 1 hour)
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: resetTokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
      }
    });

    // Send password reset email
    try {
      await emailService.sendPasswordReset(user, resetToken, '1 hour');
    } catch (emailError) {
      logger.error('Failed to send password reset email:', emailError);
      // Don't fail the request if email fails
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_RESET_REQUESTED',
        entityType: 'User',
        entityId: user.id,
        ipAddress: req.ip
      }
    });

    logger.info(`Password reset requested for: ${email}`);

    res.json({
      success: true,
      message: 'If the email exists, a password reset link will be sent.'
    });
  } catch (error) {
    logger.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process password reset request'
    });
  }
};

/**
 * Reset Password
 * POST /api/v1/auth/reset-password
 */
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        error: 'Token and password are required'
      });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters long'
      });
    }

    // Hash the token to compare with stored hash
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find valid reset token
    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        token: tokenHash,
        expiresAt: { gt: new Date() },
        usedAt: null
      },
      include: { user: true }
    });

    if (!resetToken) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update user password
    await prisma.user.update({
      where: { id: resetToken.userId },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date(),
        loginAttempts: 0,
        lockedUntil: null
      }
    });

    // Mark token as used
    await prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() }
    });

    // Invalidate all sessions for this user
    await prisma.session.deleteMany({
      where: { userId: resetToken.userId }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: resetToken.userId,
        action: 'PASSWORD_RESET_COMPLETED',
        entityType: 'User',
        entityId: resetToken.userId,
        ipAddress: req.ip
      }
    });

    logger.info(`Password reset completed for user: ${resetToken.user.email}`);

    res.json({
      success: true,
      message: 'Password has been reset successfully. Please login with your new password.'
    });
  } catch (error) {
    logger.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset password'
    });
  }
};

/**
 * Change Password
 * POST /api/v1/auth/change-password
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 8 characters long'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // Check if new password is same as current
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        error: 'New password must be different from current password'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date()
      }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'PASSWORD_CHANGED',
        entityType: 'User',
        entityId: req.user.id,
        ipAddress: req.ip
      }
    });

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change password'
    });
  }
};

/**
 * Enable MFA - Step 1: Generate secret and QR code
 * POST /api/v1/auth/enable-mfa
 */
exports.enableMFA = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (user.mfaEnabled) {
      return res.status(400).json({
        success: false,
        error: 'MFA is already enabled'
      });
    }

    // Generate MFA secret and QR code
    const mfaData = await mfaService.generateSecret(user.email);

    res.json({
      success: true,
      message: 'Scan the QR code with your authenticator app, then verify with a code',
      data: {
        secret: mfaData.secret,
        qrCode: mfaData.qrCode,
        backupCodes: mfaData.backupCodes,
        otpauthUrl: mfaData.otpauthUrl
      }
    });
  } catch (error) {
    logger.error('Enable MFA error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate MFA setup'
    });
  }
};

/**
 * Verify MFA - Step 2: Verify code and enable MFA
 * POST /api/v1/auth/verify-mfa
 */
exports.verifyMFA = async (req, res) => {
  try {
    const { code, secret } = req.body;

    if (!code || !secret) {
      return res.status(400).json({
        success: false,
        error: 'Verification code and secret are required'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (user.mfaEnabled) {
      return res.status(400).json({
        success: false,
        error: 'MFA is already enabled'
      });
    }

    // Generate backup codes for this setup
    const backupCodes = mfaService.generateBackupCodes();
    const hashedBackupCodes = backupCodes.map(c => mfaService.hashBackupCode(c));

    // Enable MFA using the service
    const result = await mfaService.enableMFA(req.user.id, secret, code, hashedBackupCodes);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || 'Invalid verification code'
      });
    }

    res.json({
      success: true,
      message: 'MFA enabled successfully',
      data: {
        backupCodes // Return backup codes one time only
      }
    });
  } catch (error) {
    logger.error('Verify MFA error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify MFA'
    });
  }
};

/**
 * Disable MFA
 * POST /api/v1/auth/disable-mfa
 */
exports.disableMFA = async (req, res) => {
  try {
    const { code, password } = req.body;

    if (!code || !password) {
      return res.status(400).json({
        success: false,
        error: 'MFA code and password are required'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (!user.mfaEnabled) {
      return res.status(400).json({
        success: false,
        error: 'MFA is not enabled'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid password'
      });
    }

    // Verify MFA code and disable
    const result = await mfaService.disableMFA(req.user.id, password, code);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || 'Invalid MFA code'
      });
    }

    res.json({
      success: true,
      message: 'MFA disabled successfully'
    });
  } catch (error) {
    logger.error('Disable MFA error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disable MFA'
    });
  }
};

/**
 * Get MFA Status
 * GET /api/v1/auth/mfa-status
 */
exports.getMFAStatus = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { mfaEnabled: true }
    });

    res.json({
      success: true,
      data: {
        mfaEnabled: user.mfaEnabled
      }
    });
  } catch (error) {
    logger.error('Get MFA status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get MFA status'
    });
  }
};

/**
 * Azure SSO
 * GET /api/v1/auth/sso/azure
 */
exports.azureSSO = (req, res) => {
  // Azure AD OAuth2 authorization URL
  const clientId = process.env.AZURE_CLIENT_ID;
  const tenantId = process.env.AZURE_TENANT_ID || 'common';
  const redirectUri = encodeURIComponent(`${process.env.API_URL}/api/v1/auth/sso/azure/callback`);
  const scope = encodeURIComponent('openid profile email');
  const state = generateToken(16);

  if (!clientId) {
    return res.status(503).json({
      success: false,
      error: 'Azure SSO is not configured'
    });
  }

  const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;

  res.redirect(authUrl);
};

exports.azureSSOCallback = async (req, res) => {
  try {
    const { code, error } = req.query;

    if (error) {
      logger.error('Azure SSO error:', error);
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=sso_failed`);
    }

    // Exchange code for tokens (implement Azure token exchange)
    // For now, redirect to frontend
    res.redirect(process.env.FRONTEND_URL);
  } catch (error) {
    logger.error('Azure SSO callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=sso_failed`);
  }
};

/**
 * Google SSO
 * GET /api/v1/auth/sso/google
 */
exports.googleSSO = (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = encodeURIComponent(`${process.env.API_URL}/api/v1/auth/sso/google/callback`);
  const scope = encodeURIComponent('openid profile email');
  const state = generateToken(16);

  if (!clientId) {
    return res.status(503).json({
      success: false,
      error: 'Google SSO is not configured'
    });
  }

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;

  res.redirect(authUrl);
};

exports.googleSSOCallback = async (req, res) => {
  try {
    const { code, error } = req.query;

    if (error) {
      logger.error('Google SSO error:', error);
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=sso_failed`);
    }

    // Exchange code for tokens (implement Google token exchange)
    // For now, redirect to frontend
    res.redirect(process.env.FRONTEND_URL);
  } catch (error) {
    logger.error('Google SSO callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=sso_failed`);
  }
};
