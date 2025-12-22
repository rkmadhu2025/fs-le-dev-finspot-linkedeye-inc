/**
 * Scheduler Service
 * LinkedEye-FinSpot
 *
 * Production-grade job scheduler for:
 * - SLA breach monitoring and alerts
 * - Stale incident reminders
 * - Email queue processing
 * - Report generation
 * - Data cleanup tasks
 */

const cron = require('node-cron');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const emailService = require('./email.service');
const { formatDuration, getMinutesDifference } = require('../utils/helpers');

// Job definitions
const JOBS = {
  SLA_BREACH_CHECK: {
    name: 'SLA Breach Check',
    cronPattern: '*/5 * * * *', // Every 5 minutes
    description: 'Check for incidents approaching or breaching SLA'
  },
  STALE_INCIDENT_REMINDER: {
    name: 'Stale Incident Reminder',
    cronPattern: '0 9 * * 1-5', // 9 AM Mon-Fri
    description: 'Send reminders for incidents not updated in 3+ days'
  },
  EMAIL_QUEUE_PROCESSOR: {
    name: 'Email Queue Processor',
    cronPattern: '*/1 * * * *', // Every minute
    description: 'Process pending emails in queue'
  },
  SESSION_CLEANUP: {
    name: 'Session Cleanup',
    cronPattern: '0 2 * * *', // 2 AM daily
    description: 'Clean up expired sessions'
  },
  EMAIL_CLEANUP: {
    name: 'Email Cleanup',
    cronPattern: '0 3 * * 0', // 3 AM on Sundays
    description: 'Clean up old sent emails'
  },
  RESET_TOKEN_CLEANUP: {
    name: 'Reset Token Cleanup',
    cronPattern: '0 4 * * *', // 4 AM daily
    description: 'Clean up expired password reset tokens'
  },
  DASHBOARD_STATS_CACHE: {
    name: 'Dashboard Stats Cache',
    cronPattern: '*/10 * * * *', // Every 10 minutes
    description: 'Pre-calculate dashboard statistics'
  }
};

class SchedulerService {
  constructor() {
    this.jobs = new Map();
    this.isRunning = false;
  }

  /**
   * Initialize all scheduled jobs
   */
  async initialize() {
    if (this.isRunning) {
      logger.warn('Scheduler is already running');
      return;
    }

    try {
      // Initialize email service
      await emailService.initialize();

      // Register all jobs
      await this.registerJob('SLA_BREACH_CHECK', this.checkSLABreaches.bind(this));
      await this.registerJob('STALE_INCIDENT_REMINDER', this.sendStaleIncidentReminders.bind(this));
      await this.registerJob('EMAIL_QUEUE_PROCESSOR', this.processEmailQueue.bind(this));
      await this.registerJob('SESSION_CLEANUP', this.cleanupSessions.bind(this));
      await this.registerJob('EMAIL_CLEANUP', this.cleanupEmails.bind(this));
      await this.registerJob('RESET_TOKEN_CLEANUP', this.cleanupResetTokens.bind(this));
      await this.registerJob('DASHBOARD_STATS_CACHE', this.cacheDashboardStats.bind(this));

      this.isRunning = true;
      logger.info('Scheduler service initialized with ' + this.jobs.size + ' jobs');

      // Sync job definitions to database
      await this.syncJobDefinitions();
    } catch (error) {
      logger.error('Failed to initialize scheduler:', error);
    }
  }

  /**
   * Register a cron job
   */
  async registerJob(jobKey, handler) {
    const jobConfig = JOBS[jobKey];
    if (!jobConfig) {
      logger.error(`Unknown job: ${jobKey}`);
      return;
    }

    if (!cron.validate(jobConfig.cronPattern)) {
      logger.error(`Invalid cron pattern for ${jobKey}: ${jobConfig.cronPattern}`);
      return;
    }

    const task = cron.schedule(jobConfig.cronPattern, async () => {
      await this.executeJob(jobKey, handler);
    }, {
      scheduled: true,
      timezone: 'Asia/Kolkata'
    });

    this.jobs.set(jobKey, {
      config: jobConfig,
      task,
      handler,
      lastRun: null,
      lastStatus: null
    });

    logger.info(`Registered job: ${jobConfig.name} (${jobConfig.cronPattern})`);
  }

  /**
   * Execute a job with error handling and logging
   */
  async executeJob(jobKey, handler) {
    const startTime = Date.now();
    const job = this.jobs.get(jobKey);

    try {
      logger.info(`Starting job: ${job.config.name}`);

      await handler();

      const duration = Date.now() - startTime;
      job.lastRun = new Date();
      job.lastStatus = 'SUCCESS';

      // Update database
      await this.updateJobStatus(jobKey, 'SUCCESS', null);

      logger.info(`Completed job: ${job.config.name} (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      job.lastRun = new Date();
      job.lastStatus = 'FAILED';

      // Update database
      await this.updateJobStatus(jobKey, 'FAILED', error.message);

      logger.error(`Failed job: ${job.config.name} (${duration}ms)`, error);
    }
  }

  /**
   * Sync job definitions to database
   */
  async syncJobDefinitions() {
    try {
      for (const [key, jobConfig] of Object.entries(JOBS)) {
        await prisma.scheduledJob.upsert({
          where: { name: key },
          create: {
            name: key,
            description: jobConfig.description,
            cronPattern: jobConfig.cronPattern,
            isActive: true
          },
          update: {
            description: jobConfig.description,
            cronPattern: jobConfig.cronPattern
          }
        });
      }
    } catch (error) {
      logger.error('Failed to sync job definitions:', error);
    }
  }

  /**
   * Update job status in database
   */
  async updateJobStatus(jobKey, status, error) {
    try {
      await prisma.scheduledJob.update({
        where: { name: jobKey },
        data: {
          lastRunAt: new Date(),
          lastStatus: status,
          lastError: error,
          nextRunAt: this.calculateNextRun(JOBS[jobKey].cronPattern)
        }
      });
    } catch (err) {
      logger.error('Failed to update job status:', err);
    }
  }

  /**
   * Calculate next run time from cron pattern
   */
  calculateNextRun(cronPattern) {
    try {
      const interval = cron.schedule(cronPattern, () => {}, { scheduled: false });
      // This is a simplified calculation - in production use a proper cron parser
      return new Date(Date.now() + 5 * 60 * 1000); // Approximate
    } catch (error) {
      return null;
    }
  }

  // ============================================
  // JOB HANDLERS
  // ============================================

  /**
   * Check for SLA breaches and send warnings
   */
  async checkSLABreaches() {
    const now = new Date();

    // Get active incidents with SLA targets
    const incidents = await prisma.incident.findMany({
      where: {
        state: { in: ['NEW', 'IN_PROGRESS', 'ON_HOLD'] },
        slaBreached: false
      },
      include: {
        assignedTo: { select: { id: true, email: true, firstName: true, lastName: true } },
        assignmentGroup: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } }
      }
    });

    let breachWarnings = 0;
    let breaches = 0;

    for (const incident of incidents) {
      // Check response SLA
      if (!incident.responseTime && incident.slaTargetResponse) {
        const targetTime = new Date(incident.slaTargetResponse);
        const minutesRemaining = getMinutesDifference(now, targetTime);

        if (minutesRemaining <= 0) {
          // SLA breached
          await this.handleSLABreach(incident, 'RESPONSE', targetTime);
          breaches++;
        } else if (minutesRemaining <= 15) {
          // Warning (15 minutes before breach)
          await emailService.sendSLABreachWarning(
            incident,
            'Response',
            formatDuration(minutesRemaining),
            targetTime
          );
          breachWarnings++;
        }
      }

      // Check resolution SLA
      if (!incident.resolvedAt && incident.slaTargetResolution) {
        const targetTime = new Date(incident.slaTargetResolution);
        const minutesRemaining = getMinutesDifference(now, targetTime);

        if (minutesRemaining <= 0) {
          // SLA breached
          await this.handleSLABreach(incident, 'RESOLUTION', targetTime);
          breaches++;
        } else if (minutesRemaining <= 30) {
          // Warning (30 minutes before breach)
          await emailService.sendSLABreachWarning(
            incident,
            'Resolution',
            formatDuration(minutesRemaining),
            targetTime
          );
          breachWarnings++;
        }
      }
    }

    logger.info(`SLA check complete: ${breachWarnings} warnings, ${breaches} breaches`);
  }

  /**
   * Handle SLA breach
   */
  async handleSLABreach(incident, slaType, targetTime) {
    // Mark incident as breached
    await prisma.incident.update({
      where: { id: incident.id },
      data: { slaBreached: true }
    });

    // Create activity log
    await prisma.activity.create({
      data: {
        incidentId: incident.id,
        action: 'SLA_BREACHED',
        description: `${slaType} SLA breached. Target was ${targetTime.toISOString()}`
      }
    });

    // Calculate time overdue
    const minutesOverdue = getMinutesDifference(targetTime, new Date());
    const timeOverdue = formatDuration(minutesOverdue);

    // Send notifications
    await emailService.sendSLABreached(incident, slaType, new Date(), timeOverdue);

    logger.warn(`SLA BREACH: Incident ${incident.number} - ${slaType} SLA breached by ${timeOverdue}`);
  }

  /**
   * Send reminders for stale incidents
   */
  async sendStaleIncidentReminders() {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    // Find incidents not updated in 3+ days
    const staleIncidents = await prisma.incident.findMany({
      where: {
        state: { in: ['NEW', 'IN_PROGRESS', 'ON_HOLD'] },
        updatedAt: { lt: threeDaysAgo }
      },
      include: {
        assignedTo: { select: { id: true, email: true, firstName: true, lastName: true } }
      }
    });

    let reminders = 0;

    for (const incident of staleIncidents) {
      const daysSinceUpdate = Math.floor(
        (Date.now() - new Date(incident.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
      );

      await emailService.sendStaleIncidentReminder(incident, daysSinceUpdate);
      reminders++;
    }

    logger.info(`Sent ${reminders} stale incident reminders`);
  }

  /**
   * Process email queue
   */
  async processEmailQueue() {
    const result = await emailService.processQueue(20);
    if (result.processed > 0 || result.failed > 0) {
      logger.info(`Email queue processed: ${result.processed} sent, ${result.failed} failed`);
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupSessions() {
    const result = await prisma.session.deleteMany({
      where: {
        expiresAt: { lt: new Date() }
      }
    });

    logger.info(`Cleaned up ${result.count} expired sessions`);
  }

  /**
   * Clean up old emails
   */
  async cleanupEmails() {
    const count = await emailService.cleanupOldEmails(30);
    logger.info(`Cleaned up ${count} old emails`);
  }

  /**
   * Clean up expired password reset tokens
   */
  async cleanupResetTokens() {
    const result = await prisma.passwordResetToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { usedAt: { not: null } }
        ]
      }
    });

    logger.info(`Cleaned up ${result.count} password reset tokens`);
  }

  /**
   * Cache dashboard statistics
   */
  async cacheDashboardStats() {
    try {
      // Calculate and cache stats (could use Redis in production)
      const stats = await this.calculateDashboardStats();

      // Store in a simple cache table or Redis
      // For now, just log the stats
      logger.debug('Dashboard stats cached:', JSON.stringify(stats));
    } catch (error) {
      logger.error('Failed to cache dashboard stats:', error);
    }
  }

  /**
   * Calculate dashboard statistics
   */
  async calculateDashboardStats() {
    const [
      totalIncidents,
      openIncidents,
      criticalIncidents,
      slaBreachedCount,
      totalChanges,
      pendingApprovals,
      totalProblems,
      totalAlerts
    ] = await Promise.all([
      prisma.incident.count(),
      prisma.incident.count({ where: { state: { in: ['NEW', 'IN_PROGRESS', 'ON_HOLD'] } } }),
      prisma.incident.count({ where: { priority: 'P1', state: { not: 'CLOSED' } } }),
      prisma.incident.count({ where: { slaBreached: true, state: { not: 'CLOSED' } } }),
      prisma.change.count(),
      prisma.change.count({ where: { state: 'PENDING_APPROVAL' } }),
      prisma.problem.count({ where: { state: { not: 'CLOSED' } } }),
      prisma.alert.count({ where: { status: 'FIRING' } })
    ]);

    return {
      incidents: { total: totalIncidents, open: openIncidents, critical: criticalIncidents, slaBreached: slaBreachedCount },
      changes: { total: totalChanges, pendingApproval: pendingApprovals },
      problems: { open: totalProblems },
      alerts: { firing: totalAlerts },
      generatedAt: new Date()
    };
  }

  // ============================================
  // CONTROL METHODS
  // ============================================

  /**
   * Stop all jobs
   */
  stop() {
    for (const [key, job] of this.jobs) {
      job.task.stop();
      logger.info(`Stopped job: ${job.config.name}`);
    }
    this.isRunning = false;
    logger.info('Scheduler service stopped');
  }

  /**
   * Start all jobs
   */
  start() {
    for (const [key, job] of this.jobs) {
      job.task.start();
      logger.info(`Started job: ${job.config.name}`);
    }
    this.isRunning = true;
    logger.info('Scheduler service started');
  }

  /**
   * Run a specific job manually
   */
  async runJob(jobKey) {
    const job = this.jobs.get(jobKey);
    if (!job) {
      throw new Error(`Unknown job: ${jobKey}`);
    }

    await this.executeJob(jobKey, job.handler);
  }

  /**
   * Get status of all jobs
   */
  getStatus() {
    const status = [];
    for (const [key, job] of this.jobs) {
      status.push({
        key,
        name: job.config.name,
        description: job.config.description,
        cronPattern: job.config.cronPattern,
        lastRun: job.lastRun,
        lastStatus: job.lastStatus,
        isRunning: this.isRunning
      });
    }
    return status;
  }
}

// Export singleton instance
const schedulerService = new SchedulerService();
module.exports = schedulerService;
