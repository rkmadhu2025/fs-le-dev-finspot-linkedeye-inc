/**
 * Authentication Middleware
 * LinkedEye-FinSpot
 */

const jwt = require('jsonwebtoken');
const { prisma } = require('../config/database');

/**
 * Verify JWT token
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. No token provided.'
      });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from database
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          department: true,
          jobTitle: true,
          timezone: true
        }
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'User not found.'
        });
      }

      if (user.status !== 'ACTIVE') {
        return res.status(401).json({
          success: false,
          error: 'Account is not active.'
        });
      }

      // Attach user to request
      req.user = user;
      next();
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token expired.',
          code: 'TOKEN_EXPIRED'
        });
      }

      return res.status(401).json({
        success: false,
        error: 'Invalid token.'
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed.'
    });
  }
};

/**
 * Check if user has required role
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated.'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Insufficient permissions.'
      });
    }

    next();
  };
};

/**
 * Role-based permission check
 */
const checkPermission = (resource, action) => {
  return (req, res, next) => {
    const permissions = {
      ADMIN: ['*'],
      MANAGER: {
        incidents: ['read', 'create', 'update', 'delete'],
        changes: ['read', 'create', 'update', 'approve'],
        problems: ['read', 'create', 'update', 'delete'],
        assets: ['read'],
        reports: ['read', 'create'],
        users: ['read'],
        teams: ['read', 'update']
      },
      OPERATOR: {
        incidents: ['read', 'create', 'update'],
        changes: ['read', 'create'],
        problems: ['read', 'create'],
        assets: ['read'],
        reports: ['read'],
        users: ['read'],
        teams: ['read']
      },
      VIEWER: {
        incidents: ['read'],
        changes: ['read'],
        problems: ['read'],
        assets: ['read'],
        reports: ['read'],
        users: ['read'],
        teams: ['read']
      },
      ON_CALL: {
        incidents: ['read', 'create', 'update'],
        changes: ['read'],
        problems: ['read'],
        assets: ['read'],
        network: ['read', 'update'],
        reports: ['read'],
        users: ['read'],
        teams: ['read']
      }
    };

    const userRole = req.user?.role;

    if (!userRole) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated.'
      });
    }

    // Admin has all permissions
    if (userRole === 'ADMIN') {
      return next();
    }

    const rolePermissions = permissions[userRole];

    if (!rolePermissions) {
      return res.status(403).json({
        success: false,
        error: 'Access denied.'
      });
    }

    const resourcePermissions = rolePermissions[resource];

    if (!resourcePermissions || !resourcePermissions.includes(action)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Cannot ${action} ${resource}.`
      });
    }

    next();
  };
};

/**
 * Optional authentication - doesn't fail if no token
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            status: true
          }
        });

        if (user && user.status === 'ACTIVE') {
          req.user = user;
        }
      } catch (error) {
        // Token invalid, continue without user
      }
    }

    next();
  } catch (error) {
    next();
  }
};

module.exports = {
  authenticate,
  authorize,
  checkPermission,
  optionalAuth
};
