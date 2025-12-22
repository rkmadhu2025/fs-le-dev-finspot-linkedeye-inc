/**
 * Request Logger Middleware
 * LinkedEye-FinSpot
 */

const logger = require('../utils/logger');

/**
 * Log all incoming requests
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();

  // Log request
  logger.info(`→ ${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'warn' : 'info';

    logger[level](`← ${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`);
  });

  next();
};

module.exports = { requestLogger };
