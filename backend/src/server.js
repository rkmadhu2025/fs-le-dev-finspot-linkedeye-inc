/**
 * LinkedEye-FinSpot Backend Server
 * Enterprise ITSM & Incident Management Platform
 *
 * Run. Operate. Transform Infrastructure — Intelligently.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');

// Import routes
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const incidentRoutes = require('./routes/incident.routes');
const changeRoutes = require('./routes/change.routes');
const problemRoutes = require('./routes/problem.routes');
const assetRoutes = require('./routes/asset.routes');
const alertRoutes = require('./routes/alert.routes');
const teamRoutes = require('./routes/team.routes');
const reportRoutes = require('./routes/report.routes');
const integrationRoutes = require('./routes/integration.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const webhookRoutes = require('./routes/webhook.routes');
const bulkRoutes = require('./routes/bulk.routes');
const exportRoutes = require('./routes/export.routes');
const attachmentRoutes = require('./routes/attachment.routes');
const slackRoutes = require('./routes/slack.routes');

// Import middleware
const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');
const { requestLogger } = require('./middleware/logger.middleware');

// Import utilities
const logger = require('./utils/logger');
const { initializeWebSocket } = require('./services/websocket.service');
const schedulerService = require('./services/scheduler.service');
const emailService = require('./services/email.service');

const app = express();
const httpServer = createServer(app);

// Initialize Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:8000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Make io accessible to routes
app.set('io', io);

// ============================================
// MIDDLEWARE CONFIGURATION
// ============================================

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:8000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    success: false,
    error: 'Too many requests, please try again later.'
  }
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}
app.use(requestLogger);

// ============================================
// API ROUTES
// ============================================

const API_VERSION = process.env.API_VERSION || 'v1';
const API_PREFIX = `/api/${API_VERSION}`;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'LinkedEye-FinSpot API is running',
    version: API_VERSION,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// API info endpoint
app.get(API_PREFIX, (req, res) => {
  res.json({
    success: true,
    name: 'LinkedEye-FinSpot API',
    version: API_VERSION,
    tagline: 'Run. Operate. Transform Infrastructure — Intelligently.',
    modules: {
      run: ['dashboard', 'incidents', 'alerts', 'network'],
      operate: ['changes', 'problems', 'assets', 'automation'],
      transform: ['reports', 'ai-insights', 'analytics']
    },
    documentation: '/api/docs',
    timestamp: new Date().toISOString()
  });
});

// Mount routes
app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/users`, userRoutes);
app.use(`${API_PREFIX}/incidents`, incidentRoutes);
app.use(`${API_PREFIX}/changes`, changeRoutes);
app.use(`${API_PREFIX}/problems`, problemRoutes);
app.use(`${API_PREFIX}/assets`, assetRoutes);
app.use(`${API_PREFIX}/alerts`, alertRoutes);
app.use(`${API_PREFIX}/teams`, teamRoutes);
app.use(`${API_PREFIX}/reports`, reportRoutes);
app.use(`${API_PREFIX}/integrations`, integrationRoutes);
app.use(`${API_PREFIX}/dashboard`, dashboardRoutes);
app.use(`${API_PREFIX}/webhooks`, webhookRoutes);
app.use(`${API_PREFIX}/bulk`, bulkRoutes);
app.use(`${API_PREFIX}/export`, exportRoutes);
app.use(`${API_PREFIX}/attachments`, attachmentRoutes);
app.use(`${API_PREFIX}/slack`, slackRoutes);

// Static files for attachments
app.use('/uploads', express.static('uploads'));

// ============================================
// ERROR HANDLING
// ============================================

app.use(notFoundHandler);
app.use(errorHandler);

// ============================================
// WEBSOCKET INITIALIZATION
// ============================================

initializeWebSocket(io);

// ============================================
// SERVICES INITIALIZATION
// ============================================

// Initialize email service
emailService.initialize().catch(err => {
  logger.warn('Email service initialization failed:', err.message);
});

// Initialize scheduler service (background jobs)
if (process.env.ENABLE_SCHEDULER !== 'false') {
  schedulerService.initialize().catch(err => {
    logger.warn('Scheduler initialization failed:', err.message);
  });
}

// ============================================
// SERVER STARTUP
// ============================================

const PORT = process.env.PORT || 5000;

// Only start server if not being required for testing
if (require.main === module || process.env.NODE_ENV !== 'test') {
  httpServer.listen(PORT, () => {
    logger.info(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ██╗     ██╗███╗   ██╗██╗  ██╗███████╗██████╗ ███████╗██╗   ║
║   ██║     ██║████╗  ██║██║ ██╔╝██╔════╝██╔══██╗██╔════╝╚██╗  ║
║   ██║     ██║██╔██╗ ██║█████╔╝ █████╗  ██║  ██║█████╗   ╚██╗ ║
║   ██║     ██║██║╚██╗██║██╔═██╗ ██╔══╝  ██║  ██║██╔══╝   ██╔╝ ║
║   ███████╗██║██║ ╚████║██║  ██╗███████╗██████╔╝███████╗██╔╝  ║
║   ╚══════╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝╚═════╝ ╚══════╝╚═╝   ║
║                                                               ║
║   Enterprise ITSM & Incident Management Platform              ║
║   Run. Operate. Transform Infrastructure — Intelligently.     ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║   🚀 Server running on port ${PORT}                             ║
║   📍 API Endpoint: http://localhost:${PORT}${API_PREFIX}              ║
║   🔌 WebSocket: ws://localhost:${PORT}                          ║
║   🌍 Environment: ${process.env.NODE_ENV || 'development'}                           ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
    `);
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');

  // Stop scheduler
  schedulerService.stop();

  httpServer.close(() => {
    logger.info('Server closed.');
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

module.exports = { app, httpServer, io };
