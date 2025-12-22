/**
 * Slack Integration Routes
 * LinkedEye-FinSpot
 */

const express = require('express');
const router = express.Router();
const slackService = require('../services/slack.service');
const logger = require('../utils/logger');

/**
 * Slack slash command handler
 * POST /api/v1/slack/command
 */
router.post('/command', async (req, res) => {
  try {
    // Verify Slack signature
    const signature = req.headers['x-slack-signature'];
    const timestamp = req.headers['x-slack-request-timestamp'];

    if (slackService.signingSecret && !slackService.verifySignature(signature, timestamp, JSON.stringify(req.body))) {
      logger.warn('Invalid Slack signature');
      return res.status(401).send('Invalid signature');
    }

    const { command, text, user_id, response_url } = req.body;

    logger.info(`Slack command received: ${command} ${text} from ${user_id}`);

    const response = await slackService.handleSlashCommand(command, text, user_id, response_url);

    res.json(response);
  } catch (error) {
    logger.error('Slack command error:', error);
    res.json({
      response_type: 'ephemeral',
      text: `Error: ${error.message}`
    });
  }
});

/**
 * Slack interactive component handler
 * POST /api/v1/slack/interactive
 */
router.post('/interactive', async (req, res) => {
  try {
    // Parse payload (sent as form-encoded)
    if (!req.body.payload) {
      return res.status(400).json({ error: 'Payload is required' });
    }

    let payload;
    try {
      payload = JSON.parse(req.body.payload);
    } catch (parseError) {
      return res.status(400).json({ error: 'Invalid payload format' });
    }

    // Verify signature
    const signature = req.headers['x-slack-signature'];
    const timestamp = req.headers['x-slack-request-timestamp'];

    if (slackService.signingSecret && !slackService.verifySignature(signature, timestamp, req.body.payload)) {
      logger.warn('Invalid Slack signature');
      return res.status(401).send('Invalid signature');
    }

    logger.info(`Slack interaction: ${payload.type} from ${payload.user?.id}`);

    const response = await slackService.handleInteraction(payload);

    res.json(response || { ok: true });
  } catch (error) {
    logger.error('Slack interaction error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Slack events handler
 * POST /api/v1/slack/events
 */
router.post('/events', async (req, res) => {
  try {
    const { type, challenge, event } = req.body;

    // Handle URL verification challenge
    if (type === 'url_verification') {
      return res.send(challenge);
    }

    // Verify signature
    const signature = req.headers['x-slack-signature'];
    const timestamp = req.headers['x-slack-request-timestamp'];

    if (slackService.signingSecret && !slackService.verifySignature(signature, timestamp, JSON.stringify(req.body))) {
      logger.warn('Invalid Slack signature');
      return res.status(401).send('Invalid signature');
    }

    logger.info(`Slack event: ${event?.type}`);

    // Acknowledge immediately
    res.status(200).send();

    // Handle event asynchronously
    if (event) {
      // Process different event types
      switch (event.type) {
        case 'app_mention':
          // Bot was mentioned
          logger.info(`Bot mentioned by ${event.user}: ${event.text}`);
          break;

        case 'message':
          // Direct message to bot
          if (event.channel_type === 'im') {
            logger.info(`DM from ${event.user}: ${event.text}`);
          }
          break;
      }
    }
  } catch (error) {
    logger.error('Slack event error:', error);
    res.status(500).send();
  }
});

/**
 * Test Slack connection
 * GET /api/v1/slack/test
 */
router.get('/test', async (req, res) => {
  try {
    if (!slackService.isConfigured()) {
      return res.json({
        success: false,
        configured: false,
        message: 'Slack is not configured'
      });
    }

    // Try to send a test message
    await slackService.sendWebhook({
      text: '🔗 LinkedEye-FinSpot connection test successful!'
    });

    res.json({
      success: true,
      configured: true,
      message: 'Slack connection successful'
    });
  } catch (error) {
    res.json({
      success: false,
      configured: slackService.isConfigured(),
      error: error.message
    });
  }
});

module.exports = router;
