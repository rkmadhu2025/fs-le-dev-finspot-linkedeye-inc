/**
 * Unified Notification Service
 * LinkedEye-FinSpot
 */

const slackService = require('./slack.service');
const emailService = require('./email.service');
const logger = require('../utils/logger');
const { prisma } = require('../config/database');

class NotificationService {
    /**
     * Notify about a new incident
     */
    async notifyIncidentCreated(incidentId) {
        try {
            const incident = await prisma.incident.findUnique({
                where: { id: incidentId },
                include: {
                    assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
                    assignmentGroup: { select: { id: true, name: true, slackChannel: true, email: true } },
                    createdBy: { select: { firstName: true, lastName: true } }
                }
            });

            if (!incident) return;

            // 1. Notify Slack (Channel or Webhook)
            if (slackService.isConfigured()) {
                await slackService.notifyIncidentCreated(incident).catch(err =>
                    logger.error('Slack notification failed:', err.message)
                );
            }

            // 2. Notify via Email
            // Notify assigned user
            if (incident.assignedTo?.email) {
                await emailService.sendIncidentAssignment(incident.assignedTo.email, incident).catch(err =>
                    logger.error('Email notification failed for user:', err.message)
                );
            }

            // Notify team email if configured
            if (incident.assignmentGroup?.email) {
                await emailService.sendTeamNotification(incident.assignmentGroup.email, incident).catch(err =>
                    logger.error('Email notification failed for team:', err.message)
                );
            }

            logger.info(`Unified notifications sent for incident ${incident.number}`);
        } catch (error) {
            logger.error('Unified notification failed:', error);
        }
    }

    /**
     * Notify about incident update
     */
    async notifyIncidentUpdated(incidentId, updateType, updatedBy) {
        try {
            const incident = await prisma.incident.findUnique({
                where: { id: incidentId },
                include: {
                    assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } }
                }
            });

            if (!incident) return;

            // Notify Slack
            if (slackService.isConfigured()) {
                await slackService.notifyIncidentUpdated(incident, updateType, updatedBy).catch(err =>
                    logger.error('Slack update notification failed:', err.message)
                );
            }

            // Notify Assigned User via Email
            if (incident.assignedTo?.email) {
                // You could add an email template for updates here
                // await emailService.sendIncidentUpdate(incident.assignedTo.email, incident, updateType);
            }
        } catch (error) {
            logger.error('Incident update notification failed:', error);
        }
    }

    /**
     * Notify about a new Alert
     */
    async notifyAlert(alert) {
        if (slackService.isConfigured()) {
            await slackService.notifyAlert(alert).catch(err =>
                logger.error('Slack alert notification failed:', err.message)
            );
        }
    }
}

module.exports = new NotificationService();
