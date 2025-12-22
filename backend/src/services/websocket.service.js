/**
 * WebSocket Service
 * LinkedEye-FinSpot
 *
 * Real-time updates for the platform
 */

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

/**
 * Initialize WebSocket server
 */
function initializeWebSocket(io) {
  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`WebSocket connected: ${socket.id} (User: ${socket.userId})`);

    // Join user-specific room
    socket.join(`user:${socket.userId}`);

    // Handle room subscriptions
    socket.on('subscribe:incidents', () => {
      socket.join('incidents');
      logger.debug(`Socket ${socket.id} subscribed to incidents`);
    });

    socket.on('unsubscribe:incidents', () => {
      socket.leave('incidents');
    });

    socket.on('subscribe:alerts', () => {
      socket.join('alerts');
      logger.debug(`Socket ${socket.id} subscribed to alerts`);
    });

    socket.on('unsubscribe:alerts', () => {
      socket.leave('alerts');
    });

    socket.on('subscribe:changes', () => {
      socket.join('changes');
    });

    socket.on('unsubscribe:changes', () => {
      socket.leave('changes');
    });

    socket.on('subscribe:dashboard', () => {
      socket.join('dashboard');
      logger.debug(`Socket ${socket.id} subscribed to dashboard`);
    });

    socket.on('unsubscribe:dashboard', () => {
      socket.leave('dashboard');
    });

    // Subscribe to specific incident updates
    socket.on('subscribe:incident', (incidentId) => {
      socket.join(`incident:${incidentId}`);
    });

    socket.on('unsubscribe:incident', (incidentId) => {
      socket.leave(`incident:${incidentId}`);
    });

    // Handle real-time typing indicator for work notes
    socket.on('typing:start', ({ incidentId }) => {
      socket.to(`incident:${incidentId}`).emit('user:typing', {
        userId: socket.userId,
        incidentId
      });
    });

    socket.on('typing:stop', ({ incidentId }) => {
      socket.to(`incident:${incidentId}`).emit('user:stopped-typing', {
        userId: socket.userId,
        incidentId
      });
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info(`WebSocket disconnected: ${socket.id} (Reason: ${reason})`);
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error(`WebSocket error for ${socket.id}:`, error);
    });

    // Send initial connection success
    socket.emit('connected', {
      socketId: socket.id,
      userId: socket.userId,
      timestamp: new Date().toISOString()
    });
  });

  // Broadcast helpers
  io.broadcastIncidentUpdate = (incident) => {
    io.to('incidents').emit('incident:updated', incident);
    io.to(`incident:${incident.id}`).emit('incident:updated', incident);
    io.to('dashboard').emit('stats:updated', { type: 'incident' });
  };

  io.broadcastAlertReceived = (alert) => {
    io.to('alerts').emit('alert:received', alert);
    io.to('dashboard').emit('stats:updated', { type: 'alert' });
  };

  io.broadcastChangeUpdate = (change) => {
    io.to('changes').emit('change:updated', change);
    io.to('dashboard').emit('stats:updated', { type: 'change' });
  };

  io.notifyUser = (userId, notification) => {
    io.to(`user:${userId}`).emit('notification:new', notification);
  };

  logger.info('WebSocket server initialized');

  return io;
}

module.exports = { initializeWebSocket };
