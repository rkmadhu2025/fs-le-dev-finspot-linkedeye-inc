/**
 * Slack Integration Service
 * LinkedEye-FinSpot
 *
 * Production-grade Slack integration for:
 * - Incident notifications
 * - Alert broadcasting
 * - Interactive message actions
 * - Slash command handling
 */

const axios = require('axios');
const crypto = require('crypto');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');

// Priority color mapping for Slack
const PRIORITY_COLORS = {
  P1: '#dc2626', // Red
  P2: '#ea580c', // Orange
  P3: '#ca8a04', // Yellow
  P4: '#16a34a'  // Green
};

const STATE_EMOJI = {
  NEW: ':new:',
  IN_PROGRESS: ':arrow_forward:',
  ON_HOLD: ':pause_button:',
  RESOLVED: ':white_check_mark:',
  CLOSED: ':lock:'
};

class SlackService {
  constructor() {
    this.webhookUrl = process.env.SLACK_WEBHOOK_URL;
    this.botToken = process.env.SLACK_BOT_TOKEN;
    this.signingSecret = process.env.SLACK_SIGNING_SECRET;
    this.defaultChannel = process.env.SLACK_DEFAULT_CHANNEL || '#incidents';
  }

  /**
   * Check if Slack is configured
   */
  isConfigured() {
    return !!(this.webhookUrl || this.botToken);
  }

  /**
   * Verify Slack request signature
   */
  verifySignature(signature, timestamp, body) {
    if (!this.signingSecret) return false;

    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
    if (parseInt(timestamp) < fiveMinutesAgo) {
      return false;
    }

    const sigBasestring = `v0:${timestamp}:${body}`;
    const mySignature = 'v0=' + crypto
      .createHmac('sha256', this.signingSecret)
      .update(sigBasestring)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(mySignature),
      Buffer.from(signature)
    );
  }

  /**
   * Send message via webhook
   */
  async sendWebhook(message) {
    if (!this.webhookUrl) {
      logger.warn('Slack webhook URL not configured');
      return null;
    }

    try {
      const response = await axios.post(this.webhookUrl, message, {
        headers: { 'Content-Type': 'application/json' }
      });
      return response.data;
    } catch (error) {
      logger.error('Slack webhook error:', error.message);
      throw error;
    }
  }

  /**
   * Send message via Bot API
   */
  async sendMessage(channel, blocks, text = '') {
    if (!this.botToken) {
      logger.warn('Slack bot token not configured');
      return null;
    }

    try {
      const response = await axios.post('https://slack.com/api/chat.postMessage', {
        channel,
        blocks,
        text
      }, {
        headers: {
          'Authorization': `Bearer ${this.botToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.data.ok) {
        throw new Error(response.data.error);
      }

      return response.data;
    } catch (error) {
      logger.error('Slack API error:', error.message);
      throw error;
    }
  }

  /**
   * Notify new incident
   */
  async notifyIncidentCreated(incident) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8000';

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `🚨 New Incident: ${incident.number}`,
          emoji: true
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Priority:*\n${incident.priority}`
          },
          {
            type: 'mrkdwn',
            text: `*State:*\n${incident.state}`
          },
          {
            type: 'mrkdwn',
            text: `*Impact:*\n${incident.impact}`
          },
          {
            type: 'mrkdwn',
            text: `*Urgency:*\n${incident.urgency}`
          }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${incident.shortDescription}*\n${incident.description || ''}`
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Created by ${incident.createdBy?.firstName || 'System'} ${incident.createdBy?.lastName || ''}`
          }
        ]
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View Incident',
              emoji: true
            },
            url: `${frontendUrl}/incidents/${incident.id}`,
            action_id: 'view_incident'
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Acknowledge',
              emoji: true
            },
            style: 'primary',
            action_id: `ack_incident_${incident.id}`
          }
        ]
      }
    ];

    const message = {
      attachments: [{
        color: PRIORITY_COLORS[incident.priority] || '#6b7280',
        blocks
      }]
    };

    // Send to webhook
    if (this.webhookUrl) {
      await this.sendWebhook(message);
    }

    // Also send to configured channel if bot token available
    if (this.botToken && this.defaultChannel) {
      await this.sendMessage(this.defaultChannel, blocks, `New ${incident.priority} Incident: ${incident.shortDescription}`);
    }

    logger.info(`Slack notification sent for incident ${incident.number}`);
  }

  /**
   * Notify incident updated
   */
  async notifyIncidentUpdated(incident, updateType, updatedBy) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8000';

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${STATE_EMOJI[incident.state] || '📋'} *Incident ${incident.number} ${updateType}*\n${incident.shortDescription}`
        },
        accessory: {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View',
            emoji: true
          },
          url: `${frontendUrl}/incidents/${incident.id}`,
          action_id: 'view_incident'
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Updated by ${updatedBy.firstName} ${updatedBy.lastName} | State: ${incident.state} | Priority: ${incident.priority}`
          }
        ]
      }
    ];

    const message = {
      attachments: [{
        color: PRIORITY_COLORS[incident.priority] || '#6b7280',
        blocks
      }]
    };

    if (this.webhookUrl) {
      await this.sendWebhook(message);
    }
  }

  /**
   * Notify SLA breach
   */
  async notifySLABreach(incident, slaType) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8000';

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '⚠️ SLA BREACH ALERT',
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${incident.number}* has breached its *${slaType} SLA*\n\n*${incident.shortDescription}*`
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Priority:*\n${incident.priority}`
          },
          {
            type: 'mrkdwn',
            text: `*Assigned To:*\n${incident.assignedTo ? `${incident.assignedTo.firstName} ${incident.assignedTo.lastName}` : 'Unassigned'}`
          }
        ]
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '🔥 Take Action Now',
              emoji: true
            },
            style: 'danger',
            url: `${frontendUrl}/incidents/${incident.id}`,
            action_id: 'view_breach'
          }
        ]
      }
    ];

    const message = {
      attachments: [{
        color: '#dc2626',
        blocks
      }]
    };

    if (this.webhookUrl) {
      await this.sendWebhook(message);
    }

    logger.warn(`SLA breach notification sent for incident ${incident.number}`);
  }

  /**
   * Notify alert received
   */
  async notifyAlert(alert) {
    const severityColors = {
      CRITICAL: '#dc2626',
      WARNING: '#ea580c',
      INFO: '#3b82f6'
    };

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `🔔 Alert: ${alert.name}`,
          emoji: true
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Severity:*\n${alert.severity}`
          },
          {
            type: 'mrkdwn',
            text: `*Source:*\n${alert.source}`
          },
          {
            type: 'mrkdwn',
            text: `*Status:*\n${alert.status}`
          },
          {
            type: 'mrkdwn',
            text: `*Fired At:*\n${new Date(alert.firedAt).toLocaleString()}`
          }
        ]
      }
    ];

    if (alert.description) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: alert.description
        }
      });
    }

    const message = {
      attachments: [{
        color: severityColors[alert.severity] || '#6b7280',
        blocks
      }]
    };

    if (this.webhookUrl) {
      await this.sendWebhook(message);
    }
  }

  /**
   * Notify change approval required
   */
  async notifyChangeApproval(change, approvers) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8000';

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📋 Change Approval Required: ${change.number}`,
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${change.shortDescription}*\n\nType: ${change.type} | Risk: ${change.riskLevel}`
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Planned Start:*\n${change.plannedStartDate ? new Date(change.plannedStartDate).toLocaleString() : 'TBD'}`
          },
          {
            type: 'mrkdwn',
            text: `*Planned End:*\n${change.plannedEndDate ? new Date(change.plannedEndDate).toLocaleString() : 'TBD'}`
          }
        ]
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Requested by ${change.createdBy?.firstName || 'Unknown'} ${change.createdBy?.lastName || ''}`
          }
        ]
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '✅ Approve',
              emoji: true
            },
            style: 'primary',
            action_id: `approve_change_${change.id}`
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '❌ Reject',
              emoji: true
            },
            style: 'danger',
            action_id: `reject_change_${change.id}`
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View Details',
              emoji: true
            },
            url: `${frontendUrl}/changes/${change.id}`,
            action_id: 'view_change'
          }
        ]
      }
    ];

    const message = {
      attachments: [{
        color: '#7c3aed',
        blocks
      }]
    };

    if (this.webhookUrl) {
      await this.sendWebhook(message);
    }
  }

  /**
   * Handle slash command
   */
  async handleSlashCommand(command, text, userId, responseUrl) {
    try {
      switch (command) {
        case '/incident':
          return await this.handleIncidentCommand(text, userId);

        case '/oncall':
          return await this.handleOnCallCommand(text);

        case '/status':
          return await this.handleStatusCommand();

        default:
          return {
            response_type: 'ephemeral',
            text: `Unknown command: ${command}`
          };
      }
    } catch (error) {
      logger.error('Slash command error:', error);
      return {
        response_type: 'ephemeral',
        text: `Error: ${error.message}`
      };
    }
  }

  /**
   * Handle /incident command
   */
  async handleIncidentCommand(text, userId) {
    const args = text.split(' ');
    const subCommand = args[0];

    switch (subCommand) {
      case 'list':
        const incidents = await prisma.incident.findMany({
          where: { state: { in: ['NEW', 'IN_PROGRESS'] } },
          take: 10,
          orderBy: { priority: 'asc' },
          include: { assignedTo: { select: { firstName: true, lastName: true } } }
        });

        const incidentList = incidents.map(inc =>
          `• *${inc.number}* (${inc.priority}) - ${inc.shortDescription.substring(0, 50)}...`
        ).join('\n');

        return {
          response_type: 'ephemeral',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Open Incidents (${incidents.length}):*\n${incidentList || 'No open incidents'}`
              }
            }
          ]
        };

      case 'stats':
        const [total, open, p1, slaBreached] = await Promise.all([
          prisma.incident.count(),
          prisma.incident.count({ where: { state: { in: ['NEW', 'IN_PROGRESS'] } } }),
          prisma.incident.count({ where: { priority: 'P1', state: { not: 'CLOSED' } } }),
          prisma.incident.count({ where: { slaBreached: true } })
        ]);

        return {
          response_type: 'ephemeral',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Incident Statistics:*\n• Total: ${total}\n• Open: ${open}\n• P1 Active: ${p1}\n• SLA Breached: ${slaBreached}`
              }
            }
          ]
        };

      default:
        return {
          response_type: 'ephemeral',
          text: 'Usage: /incident [list|stats]'
        };
    }
  }

  /**
   * Handle /oncall command
   */
  async handleOnCallCommand(text) {
    const now = new Date();

    const onCallSchedules = await prisma.onCallSchedule.findMany({
      where: {
        startTime: { lte: now },
        endTime: { gte: now }
      },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        team: { select: { name: true } }
      }
    });

    if (onCallSchedules.length === 0) {
      return {
        response_type: 'ephemeral',
        text: 'No one is currently on-call.'
      };
    }

    const onCallList = onCallSchedules.map(s =>
      `• *${s.team.name}:* ${s.user.firstName} ${s.user.lastName} ${s.isPrimary ? '(Primary)' : '(Backup)'}`
    ).join('\n');

    return {
      response_type: 'in_channel',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Current On-Call:*\n${onCallList}`
          }
        }
      ]
    };
  }

  /**
   * Handle /status command
   */
  async handleStatusCommand() {
    const [incidents, alerts, changes] = await Promise.all([
      prisma.incident.count({ where: { state: { in: ['NEW', 'IN_PROGRESS'] } } }),
      prisma.alert.count({ where: { status: 'FIRING' } }),
      prisma.change.count({ where: { state: 'PENDING_APPROVAL' } })
    ]);

    return {
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*LinkedEye-FinSpot Status:*\n• Open Incidents: ${incidents}\n• Active Alerts: ${alerts}\n• Pending Changes: ${changes}`
          }
        }
      ]
    };
  }

  /**
   * Handle interactive actions (button clicks)
   */
  async handleInteraction(payload) {
    const action = payload.actions[0];
    const actionId = action.action_id;

    if (actionId.startsWith('ack_incident_')) {
      const incidentId = actionId.replace('ack_incident_', '');
      // Update incident state
      await prisma.incident.update({
        where: { id: incidentId },
        data: { state: 'IN_PROGRESS' }
      });

      return {
        text: `Incident acknowledged by <@${payload.user.id}>`
      };
    }

    if (actionId.startsWith('approve_change_')) {
      const changeId = actionId.replace('approve_change_', '');
      await prisma.change.update({
        where: { id: changeId },
        data: { state: 'APPROVED' }
      });

      return {
        text: `Change approved by <@${payload.user.id}>`
      };
    }

    if (actionId.startsWith('reject_change_')) {
      const changeId = actionId.replace('reject_change_', '');
      await prisma.change.update({
        where: { id: changeId },
        data: { state: 'REJECTED' }
      });

      return {
        text: `Change rejected by <@${payload.user.id}>`
      };
    }

    return { text: 'Action processed' };
  }
}

// Export singleton
const slackService = new SlackService();
module.exports = slackService;
