/**
 * Email Notification Service
 * LinkedEye-FinSpot
 *
 * Production-grade email service with queue management,
 * templating, and retry logic
 */

const nodemailer = require('nodemailer');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');

// Email templates
const EMAIL_TEMPLATES = {
  INCIDENT_ASSIGNED: {
    subject: '[LinkedEye] Incident {{incidentNumber}} Assigned to You',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a56db; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">LinkedEye-FinSpot</h1>
        </div>
        <div style="padding: 20px; background: #f9fafb;">
          <h2 style="color: #1f2937;">Incident Assigned</h2>
          <p>You have been assigned to incident <strong>{{incidentNumber}}</strong>.</p>
          <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin: 15px 0;">
            <p><strong>Short Description:</strong> {{shortDescription}}</p>
            <p><strong>Priority:</strong> <span style="color: {{priorityColor}};">{{priority}}</span></p>
            <p><strong>Impact:</strong> {{impact}}</p>
            <p><strong>Urgency:</strong> {{urgency}}</p>
            <p><strong>Created By:</strong> {{createdBy}}</p>
            <p><strong>Created At:</strong> {{createdAt}}</p>
          </div>
          <a href="{{incidentUrl}}" style="display: inline-block; background: #1a56db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 10px;">View Incident</a>
        </div>
        <div style="padding: 15px; background: #e5e7eb; text-align: center; font-size: 12px; color: #6b7280;">
          <p>This is an automated message from LinkedEye-FinSpot ITSM Platform</p>
        </div>
      </div>
    `
  },

  INCIDENT_UPDATED: {
    subject: '[LinkedEye] Incident {{incidentNumber}} Updated',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a56db; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">LinkedEye-FinSpot</h1>
        </div>
        <div style="padding: 20px; background: #f9fafb;">
          <h2 style="color: #1f2937;">Incident Updated</h2>
          <p>Incident <strong>{{incidentNumber}}</strong> has been updated.</p>
          <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin: 15px 0;">
            <p><strong>Short Description:</strong> {{shortDescription}}</p>
            <p><strong>State:</strong> {{state}}</p>
            <p><strong>Updated By:</strong> {{updatedBy}}</p>
            <p><strong>Change:</strong> {{changeDescription}}</p>
          </div>
          <a href="{{incidentUrl}}" style="display: inline-block; background: #1a56db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 10px;">View Incident</a>
        </div>
        <div style="padding: 15px; background: #e5e7eb; text-align: center; font-size: 12px; color: #6b7280;">
          <p>This is an automated message from LinkedEye-FinSpot ITSM Platform</p>
        </div>
      </div>
    `
  },

  SLA_BREACH_WARNING: {
    subject: '[URGENT] SLA Breach Warning - Incident {{incidentNumber}}',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #dc2626; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">⚠️ SLA BREACH WARNING</h1>
        </div>
        <div style="padding: 20px; background: #fef2f2;">
          <h2 style="color: #991b1b;">Immediate Action Required</h2>
          <p>Incident <strong>{{incidentNumber}}</strong> is at risk of SLA breach.</p>
          <div style="background: white; border: 2px solid #dc2626; border-radius: 8px; padding: 15px; margin: 15px 0;">
            <p><strong>Short Description:</strong> {{shortDescription}}</p>
            <p><strong>Priority:</strong> <span style="color: #dc2626; font-weight: bold;">{{priority}}</span></p>
            <p><strong>SLA Type:</strong> {{slaType}}</p>
            <p><strong>Time Remaining:</strong> <span style="color: #dc2626; font-weight: bold;">{{timeRemaining}}</span></p>
            <p><strong>Target Time:</strong> {{targetTime}}</p>
            <p><strong>Assigned To:</strong> {{assignedTo}}</p>
          </div>
          <a href="{{incidentUrl}}" style="display: inline-block; background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 10px;">Take Action Now</a>
        </div>
        <div style="padding: 15px; background: #fecaca; text-align: center; font-size: 12px; color: #991b1b;">
          <p>Please prioritize this incident to avoid SLA breach</p>
        </div>
      </div>
    `
  },

  SLA_BREACHED: {
    subject: '[CRITICAL] SLA Breached - Incident {{incidentNumber}}',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #7f1d1d; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">🚨 SLA BREACHED</h1>
        </div>
        <div style="padding: 20px; background: #fef2f2;">
          <h2 style="color: #7f1d1d;">SLA Has Been Breached</h2>
          <p>Incident <strong>{{incidentNumber}}</strong> has breached its SLA target.</p>
          <div style="background: white; border: 2px solid #7f1d1d; border-radius: 8px; padding: 15px; margin: 15px 0;">
            <p><strong>Short Description:</strong> {{shortDescription}}</p>
            <p><strong>Priority:</strong> {{priority}}</p>
            <p><strong>SLA Type:</strong> {{slaType}}</p>
            <p><strong>Breached At:</strong> {{breachedAt}}</p>
            <p><strong>Time Overdue:</strong> {{timeOverdue}}</p>
            <p><strong>Assigned To:</strong> {{assignedTo}}</p>
          </div>
          <a href="{{incidentUrl}}" style="display: inline-block; background: #7f1d1d; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 10px;">View Incident</a>
        </div>
        <div style="padding: 15px; background: #fecaca; text-align: center; font-size: 12px; color: #7f1d1d;">
          <p>This SLA breach will be reported in the next management review</p>
        </div>
      </div>
    `
  },

  CHANGE_APPROVAL_REQUIRED: {
    subject: '[LinkedEye] Change {{changeNumber}} Requires Your Approval',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #7c3aed; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">LinkedEye-FinSpot</h1>
        </div>
        <div style="padding: 20px; background: #f9fafb;">
          <h2 style="color: #1f2937;">Change Approval Required</h2>
          <p>Change <strong>{{changeNumber}}</strong> requires your approval.</p>
          <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin: 15px 0;">
            <p><strong>Short Description:</strong> {{shortDescription}}</p>
            <p><strong>Type:</strong> {{type}}</p>
            <p><strong>Risk Level:</strong> {{riskLevel}}</p>
            <p><strong>Planned Start:</strong> {{plannedStart}}</p>
            <p><strong>Planned End:</strong> {{plannedEnd}}</p>
            <p><strong>Requested By:</strong> {{requestedBy}}</p>
          </div>
          <div style="margin-top: 15px;">
            <a href="{{approveUrl}}" style="display: inline-block; background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-right: 10px;">Approve</a>
            <a href="{{rejectUrl}}" style="display: inline-block; background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Reject</a>
          </div>
        </div>
        <div style="padding: 15px; background: #e5e7eb; text-align: center; font-size: 12px; color: #6b7280;">
          <p>This is an automated message from LinkedEye-FinSpot ITSM Platform</p>
        </div>
      </div>
    `
  },

  PASSWORD_RESET: {
    subject: '[LinkedEye] Password Reset Request',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a56db; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">LinkedEye-FinSpot</h1>
        </div>
        <div style="padding: 20px; background: #f9fafb;">
          <h2 style="color: #1f2937;">Password Reset Request</h2>
          <p>We received a request to reset your password. Click the button below to proceed:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="{{resetUrl}}" style="display: inline-block; background: #1a56db; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-size: 16px;">Reset Password</a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">This link will expire in {{expiresIn}}.</p>
          <p style="color: #6b7280; font-size: 14px;">If you didn't request this, please ignore this email or contact support if you have concerns.</p>
        </div>
        <div style="padding: 15px; background: #e5e7eb; text-align: center; font-size: 12px; color: #6b7280;">
          <p>This is an automated message from LinkedEye-FinSpot ITSM Platform</p>
        </div>
      </div>
    `
  },

  WELCOME: {
    subject: '[LinkedEye] Welcome to LinkedEye-FinSpot',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a56db; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">Welcome to LinkedEye-FinSpot</h1>
        </div>
        <div style="padding: 20px; background: #f9fafb;">
          <h2 style="color: #1f2937;">Hello {{firstName}}!</h2>
          <p>Your account has been created and is now active.</p>
          <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin: 15px 0;">
            <p><strong>Email:</strong> {{email}}</p>
            <p><strong>Role:</strong> {{role}}</p>
          </div>
          <a href="{{loginUrl}}" style="display: inline-block; background: #1a56db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 10px;">Login Now</a>
        </div>
        <div style="padding: 15px; background: #e5e7eb; text-align: center; font-size: 12px; color: #6b7280;">
          <p>This is an automated message from LinkedEye-FinSpot ITSM Platform</p>
        </div>
      </div>
    `
  },

  STALE_INCIDENT_REMINDER: {
    subject: '[LinkedEye] Reminder: Incident {{incidentNumber}} Needs Attention',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #d97706; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">Incident Reminder</h1>
        </div>
        <div style="padding: 20px; background: #fffbeb;">
          <h2 style="color: #92400e;">Action Required</h2>
          <p>Incident <strong>{{incidentNumber}}</strong> has not been updated for {{daysSinceUpdate}} days.</p>
          <div style="background: white; border: 1px solid #fcd34d; border-radius: 8px; padding: 15px; margin: 15px 0;">
            <p><strong>Short Description:</strong> {{shortDescription}}</p>
            <p><strong>State:</strong> {{state}}</p>
            <p><strong>Priority:</strong> {{priority}}</p>
            <p><strong>Last Updated:</strong> {{lastUpdated}}</p>
          </div>
          <a href="{{incidentUrl}}" style="display: inline-block; background: #d97706; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 10px;">Update Incident</a>
        </div>
        <div style="padding: 15px; background: #fef3c7; text-align: center; font-size: 12px; color: #92400e;">
          <p>Please update this incident or close it if resolved</p>
        </div>
      </div>
    `
  }
};

// Priority color mapping
const PRIORITY_COLORS = {
  P1: '#dc2626',
  P2: '#ea580c',
  P3: '#ca8a04',
  P4: '#16a34a'
};

class EmailService {
  constructor() {
    this.transporter = null;
    this.isInitialized = false;
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 seconds
  }

  /**
   * Initialize email transporter
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      const config = {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        },
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        rateDelta: 1000,
        rateLimit: 10
      };

      // Skip if no SMTP credentials
      if (!config.auth.user || !config.auth.pass) {
        logger.warn('SMTP credentials not configured. Email service disabled.');
        return;
      }

      this.transporter = nodemailer.createTransport(config);

      // Verify connection
      await this.transporter.verify();
      this.isInitialized = true;
      logger.info('Email service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize email service:', error);
    }
  }

  /**
   * Render template with data
   */
  renderTemplate(templateId, data) {
    const template = EMAIL_TEMPLATES[templateId];
    if (!template) {
      throw new Error(`Email template not found: ${templateId}`);
    }

    let subject = template.subject;
    let html = template.html;

    // Replace placeholders
    Object.keys(data).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      subject = subject.replace(regex, data[key] || '');
      html = html.replace(regex, data[key] || '');
    });

    return { subject, html };
  }

  /**
   * Queue email for sending
   */
  async queueEmail(to, templateId, data, priority = 0, scheduledAt = null) {
    try {
      const { subject, html } = this.renderTemplate(templateId, data);

      const email = await prisma.emailQueue.create({
        data: {
          to,
          subject,
          body: html,
          templateId,
          templateData: JSON.stringify(data),
          priority,
          scheduledAt: scheduledAt || new Date()
        }
      });

      logger.info(`Email queued: ${email.id} to ${to}`);
      return email;
    } catch (error) {
      logger.error('Failed to queue email:', error);
      throw error;
    }
  }

  /**
   * Send email directly (bypassing queue)
   */
  async sendDirect(to, subject, html) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.transporter) {
      logger.warn('Email transporter not available. Skipping email send.');
      return null;
    }

    try {
      const mailOptions = {
        from: `"LinkedEye-FinSpot" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
        to,
        subject,
        html
      };

      const result = await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent: ${result.messageId} to ${to}`);
      return result;
    } catch (error) {
      logger.error('Failed to send email:', error);
      throw error;
    }
  }

  /**
   * Process email queue
   */
  async processQueue(batchSize = 10) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.transporter) {
      return { processed: 0, failed: 0 };
    }

    try {
      // Get pending emails
      const emails = await prisma.emailQueue.findMany({
        where: {
          status: 'PENDING',
          scheduledAt: { lte: new Date() },
          attempts: { lt: this.maxRetries }
        },
        orderBy: [
          { priority: 'desc' },
          { scheduledAt: 'asc' }
        ],
        take: batchSize
      });

      let processed = 0;
      let failed = 0;

      for (const email of emails) {
        try {
          await this.sendDirect(email.to, email.subject, email.body);

          await prisma.emailQueue.update({
            where: { id: email.id },
            data: {
              status: 'SENT',
              sentAt: new Date(),
              attempts: email.attempts + 1
            }
          });

          processed++;
        } catch (error) {
          const newAttempts = email.attempts + 1;
          const status = newAttempts >= this.maxRetries ? 'FAILED' : 'PENDING';

          await prisma.emailQueue.update({
            where: { id: email.id },
            data: {
              status,
              attempts: newAttempts,
              lastError: error.message
            }
          });

          if (status === 'FAILED') {
            failed++;
          }
        }
      }

      return { processed, failed };
    } catch (error) {
      logger.error('Error processing email queue:', error);
      return { processed: 0, failed: 0 };
    }
  }

  /**
   * Send incident assignment notification
   */
  async sendIncidentAssigned(incident, assignee) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8000';

    return this.queueEmail(assignee.email, 'INCIDENT_ASSIGNED', {
      incidentNumber: incident.number,
      shortDescription: incident.shortDescription,
      priority: incident.priority,
      priorityColor: PRIORITY_COLORS[incident.priority] || '#6b7280',
      impact: incident.impact,
      urgency: incident.urgency,
      createdBy: incident.createdBy ? `${incident.createdBy.firstName} ${incident.createdBy.lastName}` : 'System',
      createdAt: new Date(incident.createdAt).toLocaleString(),
      incidentUrl: `${frontendUrl}/incidents/${incident.id}`
    }, incident.priority === 'P1' ? 10 : 5);
  }

  /**
   * Send incident update notification
   */
  async sendIncidentUpdated(incident, updatedBy, changeDescription) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8000';

    // Notify assignee if different from updater
    if (incident.assignedTo && incident.assignedTo.id !== updatedBy.id) {
      await this.queueEmail(incident.assignedTo.email, 'INCIDENT_UPDATED', {
        incidentNumber: incident.number,
        shortDescription: incident.shortDescription,
        state: incident.state,
        updatedBy: `${updatedBy.firstName} ${updatedBy.lastName}`,
        changeDescription,
        incidentUrl: `${frontendUrl}/incidents/${incident.id}`
      });
    }

    // Notify creator if different from updater and assignee
    if (incident.createdBy &&
        incident.createdBy.id !== updatedBy.id &&
        incident.createdBy.id !== incident.assignedTo?.id) {
      await this.queueEmail(incident.createdBy.email, 'INCIDENT_UPDATED', {
        incidentNumber: incident.number,
        shortDescription: incident.shortDescription,
        state: incident.state,
        updatedBy: `${updatedBy.firstName} ${updatedBy.lastName}`,
        changeDescription,
        incidentUrl: `${frontendUrl}/incidents/${incident.id}`
      });
    }
  }

  /**
   * Send SLA breach warning
   */
  async sendSLABreachWarning(incident, slaType, timeRemaining, targetTime) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8000';
    const recipients = [];

    // Notify assignee
    if (incident.assignedTo) {
      recipients.push(incident.assignedTo.email);
    }

    // Notify team lead/manager if assignment group exists
    if (incident.assignmentGroup?.email) {
      recipients.push(incident.assignmentGroup.email);
    }

    for (const email of recipients) {
      await this.queueEmail(email, 'SLA_BREACH_WARNING', {
        incidentNumber: incident.number,
        shortDescription: incident.shortDescription,
        priority: incident.priority,
        slaType,
        timeRemaining,
        targetTime: new Date(targetTime).toLocaleString(),
        assignedTo: incident.assignedTo ? `${incident.assignedTo.firstName} ${incident.assignedTo.lastName}` : 'Unassigned',
        incidentUrl: `${frontendUrl}/incidents/${incident.id}`
      }, 10); // High priority
    }
  }

  /**
   * Send SLA breached notification
   */
  async sendSLABreached(incident, slaType, breachedAt, timeOverdue) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8000';
    const recipients = [];

    // Notify assignee
    if (incident.assignedTo) {
      recipients.push(incident.assignedTo.email);
    }

    // Notify team
    if (incident.assignmentGroup?.email) {
      recipients.push(incident.assignmentGroup.email);
    }

    // Notify managers
    const managers = await prisma.user.findMany({
      where: { role: 'MANAGER', status: 'ACTIVE' },
      select: { email: true }
    });
    managers.forEach(m => recipients.push(m.email));

    const uniqueRecipients = [...new Set(recipients)];

    for (const email of uniqueRecipients) {
      await this.queueEmail(email, 'SLA_BREACHED', {
        incidentNumber: incident.number,
        shortDescription: incident.shortDescription,
        priority: incident.priority,
        slaType,
        breachedAt: new Date(breachedAt).toLocaleString(),
        timeOverdue,
        assignedTo: incident.assignedTo ? `${incident.assignedTo.firstName} ${incident.assignedTo.lastName}` : 'Unassigned',
        incidentUrl: `${frontendUrl}/incidents/${incident.id}`
      }, 10); // Highest priority
    }
  }

  /**
   * Send change approval request
   */
  async sendChangeApprovalRequired(change, approvers) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8000';

    for (const approver of approvers) {
      await this.queueEmail(approver.email, 'CHANGE_APPROVAL_REQUIRED', {
        changeNumber: change.number,
        shortDescription: change.shortDescription,
        type: change.type,
        riskLevel: change.riskLevel,
        plannedStart: change.plannedStartDate ? new Date(change.plannedStartDate).toLocaleString() : 'TBD',
        plannedEnd: change.plannedEndDate ? new Date(change.plannedEndDate).toLocaleString() : 'TBD',
        requestedBy: change.createdBy ? `${change.createdBy.firstName} ${change.createdBy.lastName}` : 'Unknown',
        approveUrl: `${frontendUrl}/changes/${change.id}?action=approve`,
        rejectUrl: `${frontendUrl}/changes/${change.id}?action=reject`
      }, 5);
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(user, resetToken, expiresIn = '1 hour') {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8000';

    return this.queueEmail(user.email, 'PASSWORD_RESET', {
      resetUrl: `${frontendUrl}/reset-password?token=${resetToken}`,
      expiresIn
    }, 10); // High priority
  }

  /**
   * Send welcome email
   */
  async sendWelcome(user) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8000';

    return this.queueEmail(user.email, 'WELCOME', {
      firstName: user.firstName,
      email: user.email,
      role: user.role,
      loginUrl: `${frontendUrl}/login`
    });
  }

  /**
   * Send stale incident reminder
   */
  async sendStaleIncidentReminder(incident, daysSinceUpdate) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8000';

    if (incident.assignedTo) {
      return this.queueEmail(incident.assignedTo.email, 'STALE_INCIDENT_REMINDER', {
        incidentNumber: incident.number,
        shortDescription: incident.shortDescription,
        state: incident.state,
        priority: incident.priority,
        daysSinceUpdate,
        lastUpdated: new Date(incident.updatedAt).toLocaleString(),
        incidentUrl: `${frontendUrl}/incidents/${incident.id}`
      });
    }
  }

  /**
   * Get email statistics
   */
  async getStats() {
    const [pending, sent, failed] = await Promise.all([
      prisma.emailQueue.count({ where: { status: 'PENDING' } }),
      prisma.emailQueue.count({ where: { status: 'SENT' } }),
      prisma.emailQueue.count({ where: { status: 'FAILED' } })
    ]);

    return { pending, sent, failed, total: pending + sent + failed };
  }

  /**
   * Cleanup old sent emails
   */
  async cleanupOldEmails(daysToKeep = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await prisma.emailQueue.deleteMany({
      where: {
        status: 'SENT',
        sentAt: { lt: cutoffDate }
      }
    });

    logger.info(`Cleaned up ${result.count} old emails`);
    return result.count;
  }
}

// Export singleton instance
const emailService = new EmailService();
module.exports = emailService;
