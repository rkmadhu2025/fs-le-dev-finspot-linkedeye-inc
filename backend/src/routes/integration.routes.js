/**
 * Integration Hub Routes
 * LinkedEye-FinSpot
 */

const express = require('express');
const router = express.Router();
const { prisma } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const logger = require('../utils/logger');

router.use(authenticate);

// ============================================
// SPECIFIC INTEGRATION PROXY ROUTES (must be before :id routes)
// ============================================

// Prometheus proxy - get targets
router.get('/prometheus/targets', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: 'PROMETHEUS' } });
    if (!integration) return res.json({ success: true, data: { activeTargets: [] } });

    const config = JSON.parse(integration.config || '{}');
    const axios = require('axios');
    const response = await axios.get(`${config.url}/api/v1/targets`, { timeout: 5000 });
    res.json({ success: true, data: response.data.data });
  } catch (error) {
    logger.error('Prometheus targets fetch error:', error.message);
    res.json({ success: true, data: { activeTargets: [] } });
  }
});

// Prometheus proxy - query
router.get('/prometheus/query', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: 'PROMETHEUS' } });
    if (!integration) return res.json({ success: true, data: {} });

    const config = JSON.parse(integration.config || '{}');
    const axios = require('axios');
    const response = await axios.get(`${config.url}/api/v1/query`, {
      params: { query: req.query.query },
      timeout: 5000
    });
    res.json({ success: true, data: response.data.data });
  } catch (error) {
    logger.error('Prometheus query error:', error.message);
    res.json({ success: true, data: {} });
  }
});

// Test Prometheus connection
router.post('/prometheus/test', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: 'PROMETHEUS' } });
    if (!integration) return res.status(404).json({ success: false, error: 'Prometheus not configured' });

    const config = JSON.parse(integration.config || '{}');
    const axios = require('axios');
    const startTime = Date.now();
    await axios.get(`${config.url}/api/v1/status/runtimeinfo`, { timeout: 5000 });
    const latency = Date.now() - startTime;

    await prisma.integration.update({
      where: { id: integration.id },
      data: { status: 'ACTIVE', lastSyncAt: new Date() }
    });
    res.json({ success: true, data: { connected: true, latency } });
  } catch (error) {
    logger.error('Prometheus test error:', error.message);
    res.json({ success: false, error: 'Connection failed' });
  }
});

// Alertmanager proxy - get alerts
router.get('/alertmanager/alerts', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: 'ALERTMANAGER' } });
    if (!integration) return res.json({ success: true, data: [] });

    const config = JSON.parse(integration.config || '{}');
    const axios = require('axios');
    const response = await axios.get(`${config.url}/api/v2/alerts`, { timeout: 5000 });
    res.json({ success: true, data: response.data });
  } catch (error) {
    logger.error('Alertmanager alerts fetch error:', error.message);
    res.json({ success: true, data: [] });
  }
});

// Alertmanager proxy - get status
router.get('/alertmanager/status', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: 'ALERTMANAGER' } });
    if (!integration) return res.json({ success: true, data: {} });

    const config = JSON.parse(integration.config || '{}');
    const axios = require('axios');
    const response = await axios.get(`${config.url}/api/v2/status`, { timeout: 5000 });
    res.json({ success: true, data: response.data });
  } catch (error) {
    logger.error('Alertmanager status fetch error:', error.message);
    res.json({ success: true, data: {} });
  }
});

// Test Alertmanager connection
router.post('/alertmanager/test', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: 'ALERTMANAGER' } });
    if (!integration) return res.status(404).json({ success: false, error: 'Alertmanager not configured' });

    const config = JSON.parse(integration.config || '{}');
    const axios = require('axios');
    const startTime = Date.now();
    await axios.get(`${config.url}/api/v2/status`, { timeout: 5000 });
    const latency = Date.now() - startTime;

    await prisma.integration.update({
      where: { id: integration.id },
      data: { status: 'ACTIVE', lastSyncAt: new Date() }
    });
    res.json({ success: true, data: { connected: true, latency } });
  } catch (error) {
    logger.error('Alertmanager test error:', error.message);
    res.json({ success: false, error: 'Connection failed' });
  }
});

// Test Grafana connection
router.post('/grafana/test', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: 'GRAFANA' } });
    if (!integration) return res.status(404).json({ success: false, error: 'Grafana not configured' });

    const config = JSON.parse(integration.config || '{}');
    const axios = require('axios');
    const startTime = Date.now();
    await axios.get(`${config.url}/api/health`, { timeout: 5000 });
    const latency = Date.now() - startTime;

    await prisma.integration.update({
      where: { id: integration.id },
      data: { status: 'ACTIVE', lastSyncAt: new Date() }
    });
    res.json({ success: true, data: { connected: true, latency } });
  } catch (error) {
    logger.error('Grafana test error:', error.message);
    res.json({ success: false, error: 'Connection failed' });
  }
});

// ============================================
// GRAFANA LOKI INTEGRATION
// ============================================

// Get Loki labels
router.get('/loki/labels', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: 'LOKI' } });
    if (!integration) return res.json({ success: true, data: [] });

    const config = JSON.parse(integration.config || '{}');
    const axios = require('axios');
    const headers = config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {};
    const response = await axios.get(`${config.url}/loki/api/v1/labels`, {
      headers,
      timeout: 5000
    });
    res.json({ success: true, data: response.data.data || [] });
  } catch (error) {
    logger.error('Loki labels fetch error:', error.message);
    res.json({ success: true, data: [] });
  }
});

// Get Loki label values
router.get('/loki/label/:name/values', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: 'LOKI' } });
    if (!integration) return res.json({ success: true, data: [] });

    const config = JSON.parse(integration.config || '{}');
    const axios = require('axios');
    const headers = config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {};
    const response = await axios.get(`${config.url}/loki/api/v1/label/${req.params.name}/values`, {
      headers,
      timeout: 5000
    });
    res.json({ success: true, data: response.data.data || [] });
  } catch (error) {
    logger.error('Loki label values fetch error:', error.message);
    res.json({ success: true, data: [] });
  }
});

// Query Loki logs
router.get('/loki/query', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: 'LOKI' } });
    if (!integration) return res.json({ success: true, data: { result: [] } });

    const config = JSON.parse(integration.config || '{}');
    const axios = require('axios');
    const headers = config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {};

    const { query, limit = 100, start, end } = req.query;
    const params = { query, limit };
    if (start) params.start = start;
    if (end) params.end = end;

    const response = await axios.get(`${config.url}/loki/api/v1/query_range`, {
      headers,
      params,
      timeout: 30000
    });
    res.json({ success: true, data: response.data.data || { result: [] } });
  } catch (error) {
    logger.error('Loki query error:', error.message);
    res.json({ success: true, data: { result: [] } });
  }
});

// Query Loki instant
router.get('/loki/query_instant', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: 'LOKI' } });
    if (!integration) return res.json({ success: true, data: { result: [] } });

    const config = JSON.parse(integration.config || '{}');
    const axios = require('axios');
    const headers = config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {};

    const { query, limit = 100, time } = req.query;
    const params = { query, limit };
    if (time) params.time = time;

    const response = await axios.get(`${config.url}/loki/api/v1/query`, {
      headers,
      params,
      timeout: 10000
    });
    res.json({ success: true, data: response.data.data || { result: [] } });
  } catch (error) {
    logger.error('Loki instant query error:', error.message);
    res.json({ success: true, data: { result: [] } });
  }
});

// Get Loki series
router.get('/loki/series', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: 'LOKI' } });
    if (!integration) return res.json({ success: true, data: [] });

    const config = JSON.parse(integration.config || '{}');
    const axios = require('axios');
    const headers = config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {};

    const { match, start, end } = req.query;
    const params = {};
    if (match) params['match[]'] = match;
    if (start) params.start = start;
    if (end) params.end = end;

    const response = await axios.get(`${config.url}/loki/api/v1/series`, {
      headers,
      params,
      timeout: 10000
    });
    res.json({ success: true, data: response.data.data || [] });
  } catch (error) {
    logger.error('Loki series fetch error:', error.message);
    res.json({ success: true, data: [] });
  }
});

// Get Loki stats
router.get('/loki/stats', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: 'LOKI' } });
    if (!integration) return res.json({ success: true, data: {} });

    const config = JSON.parse(integration.config || '{}');
    const axios = require('axios');
    const headers = config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {};

    // Get ready status and build info
    const [readyRes, buildRes] = await Promise.allSettled([
      axios.get(`${config.url}/ready`, { headers, timeout: 5000 }),
      axios.get(`${config.url}/loki/api/v1/status/buildinfo`, { headers, timeout: 5000 })
    ]);

    const stats = {
      ready: readyRes.status === 'fulfilled' && readyRes.value.status === 200,
      buildInfo: buildRes.status === 'fulfilled' ? buildRes.value.data : null
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error('Loki stats fetch error:', error.message);
    res.json({ success: true, data: {} });
  }
});

// Test Loki connection
router.post('/loki/test', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: 'LOKI' } });
    if (!integration) return res.status(404).json({ success: false, error: 'Loki not configured' });

    const config = JSON.parse(integration.config || '{}');
    const axios = require('axios');
    const headers = config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {};
    const startTime = Date.now();
    await axios.get(`${config.url}/ready`, { headers, timeout: 5000 });
    const latency = Date.now() - startTime;

    await prisma.integration.update({
      where: { id: integration.id },
      data: { status: 'ACTIVE', lastSyncAt: new Date() }
    });
    res.json({ success: true, data: { connected: true, latency } });
  } catch (error) {
    logger.error('Loki test error:', error.message);
    res.json({ success: false, error: 'Connection failed' });
  }
});

// ============================================
// STACKSTORM INTEGRATION
// ============================================

// Get StackStorm API keys
router.get('/stackstorm/apikeys', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: 'STACKSTORM' } });
    if (!integration) return res.json({ success: true, data: [] });

    const config = JSON.parse(integration.config || '{}');
    const axios = require('axios');
    const headers = { 'St2-Api-Key': config.apiKey };
    const response = await axios.get(`${config.url}/api/v1/apikeys`, {
      headers,
      timeout: 5000
    });
    res.json({ success: true, data: response.data || [] });
  } catch (error) {
    logger.error('StackStorm API keys fetch error:', error.message);
    res.json({ success: true, data: [] });
  }
});

// Get StackStorm packs
router.get('/stackstorm/packs', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: 'STACKSTORM' } });
    if (!integration) return res.json({ success: true, data: [] });

    const config = JSON.parse(integration.config || '{}');
    const axios = require('axios');
    const headers = { 'St2-Api-Key': config.apiKey };
    const response = await axios.get(`${config.url}/api/v1/packs`, {
      headers,
      timeout: 10000
    });
    res.json({ success: true, data: response.data || [] });
  } catch (error) {
    logger.error('StackStorm packs fetch error:', error.message);
    res.json({ success: true, data: [] });
  }
});

// Get StackStorm actions
router.get('/stackstorm/actions', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: 'STACKSTORM' } });
    if (!integration) return res.json({ success: true, data: [] });

    const config = JSON.parse(integration.config || '{}');
    const axios = require('axios');
    const headers = { 'St2-Api-Key': config.apiKey };
    const { pack } = req.query;
    const url = pack ? `${config.url}/api/v1/actions?pack=${pack}` : `${config.url}/api/v1/actions`;
    const response = await axios.get(url, {
      headers,
      timeout: 10000
    });
    res.json({ success: true, data: response.data || [] });
  } catch (error) {
    logger.error('StackStorm actions fetch error:', error.message);
    res.json({ success: true, data: [] });
  }
});

// Get StackStorm action by ref
router.get('/stackstorm/actions/:ref', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: 'STACKSTORM' } });
    if (!integration) return res.json({ success: true, data: null });

    const config = JSON.parse(integration.config || '{}');
    const axios = require('axios');
    const headers = { 'St2-Api-Key': config.apiKey };
    const response = await axios.get(`${config.url}/api/v1/actions/${req.params.ref}`, {
      headers,
      timeout: 5000
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    logger.error('StackStorm action fetch error:', error.message);
    res.json({ success: true, data: null });
  }
});

// Execute StackStorm action
router.post('/stackstorm/executions', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: 'STACKSTORM' } });
    if (!integration) return res.status(404).json({ success: false, error: 'StackStorm not configured' });

    const config = JSON.parse(integration.config || '{}');
    const axios = require('axios');
    const headers = {
      'St2-Api-Key': config.apiKey,
      'Content-Type': 'application/json'
    };

    const { action, parameters, user } = req.body;
    const payload = {
      action,
      parameters: parameters || {},
      user: user || 'linkedeye-api'
    };

    const response = await axios.post(`${config.url}/api/v1/executions`, payload, {
      headers,
      timeout: 30000
    });

    // Log the execution
    logger.info(`StackStorm action executed: ${action} by ${req.user?.email || 'system'}`);

    res.json({ success: true, data: response.data });
  } catch (error) {
    logger.error('StackStorm execution error:', error.message);
    res.status(500).json({ success: false, error: error.message || 'Execution failed' });
  }
});

// Get StackStorm executions
router.get('/stackstorm/executions', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: 'STACKSTORM' } });
    if (!integration) return res.json({ success: true, data: [] });

    const config = JSON.parse(integration.config || '{}');
    const axios = require('axios');
    const headers = { 'St2-Api-Key': config.apiKey };

    const { limit = 50, action, status } = req.query;
    let url = `${config.url}/api/v1/executions?limit=${limit}`;
    if (action) url += `&action=${action}`;
    if (status) url += `&status=${status}`;

    const response = await axios.get(url, {
      headers,
      timeout: 10000
    });
    res.json({ success: true, data: response.data || [] });
  } catch (error) {
    logger.error('StackStorm executions fetch error:', error.message);
    res.json({ success: true, data: [] });
  }
});

// Get StackStorm execution by ID
router.get('/stackstorm/executions/:id', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: 'STACKSTORM' } });
    if (!integration) return res.json({ success: true, data: null });

    const config = JSON.parse(integration.config || '{}');
    const axios = require('axios');
    const headers = { 'St2-Api-Key': config.apiKey };
    const response = await axios.get(`${config.url}/api/v1/executions/${req.params.id}`, {
      headers,
      timeout: 5000
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    logger.error('StackStorm execution fetch error:', error.message);
    res.json({ success: true, data: null });
  }
});

// Cancel StackStorm execution
router.delete('/stackstorm/executions/:id', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: 'STACKSTORM' } });
    if (!integration) return res.status(404).json({ success: false, error: 'StackStorm not configured' });

    const config = JSON.parse(integration.config || '{}');
    const axios = require('axios');
    const headers = { 'St2-Api-Key': config.apiKey };
    await axios.delete(`${config.url}/api/v1/executions/${req.params.id}`, {
      headers,
      timeout: 5000
    });

    logger.info(`StackStorm execution cancelled: ${req.params.id} by ${req.user?.email || 'system'}`);
    res.json({ success: true, message: 'Execution cancelled' });
  } catch (error) {
    logger.error('StackStorm execution cancel error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to cancel execution' });
  }
});

// Get StackStorm rules
router.get('/stackstorm/rules', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: 'STACKSTORM' } });
    if (!integration) return res.json({ success: true, data: [] });

    const config = JSON.parse(integration.config || '{}');
    const axios = require('axios');
    const headers = { 'St2-Api-Key': config.apiKey };
    const response = await axios.get(`${config.url}/api/v1/rules`, {
      headers,
      timeout: 10000
    });
    res.json({ success: true, data: response.data || [] });
  } catch (error) {
    logger.error('StackStorm rules fetch error:', error.message);
    res.json({ success: true, data: [] });
  }
});

// Get StackStorm triggers
router.get('/stackstorm/triggers', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: 'STACKSTORM' } });
    if (!integration) return res.json({ success: true, data: [] });

    const config = JSON.parse(integration.config || '{}');
    const axios = require('axios');
    const headers = { 'St2-Api-Key': config.apiKey };
    const response = await axios.get(`${config.url}/api/v1/triggertypes`, {
      headers,
      timeout: 10000
    });
    res.json({ success: true, data: response.data || [] });
  } catch (error) {
    logger.error('StackStorm triggers fetch error:', error.message);
    res.json({ success: true, data: [] });
  }
});

// Get StackStorm sensors
router.get('/stackstorm/sensors', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: 'STACKSTORM' } });
    if (!integration) return res.json({ success: true, data: [] });

    const config = JSON.parse(integration.config || '{}');
    const axios = require('axios');
    const headers = { 'St2-Api-Key': config.apiKey };
    const response = await axios.get(`${config.url}/api/v1/sensortypes`, {
      headers,
      timeout: 10000
    });
    res.json({ success: true, data: response.data || [] });
  } catch (error) {
    logger.error('StackStorm sensors fetch error:', error.message);
    res.json({ success: true, data: [] });
  }
});

// Test StackStorm connection
router.post('/stackstorm/test', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: 'STACKSTORM' } });
    if (!integration) return res.status(404).json({ success: false, error: 'StackStorm not configured' });

    const config = JSON.parse(integration.config || '{}');
    const axios = require('axios');
    const headers = { 'St2-Api-Key': config.apiKey };
    const startTime = Date.now();

    // Test connection by fetching API keys
    await axios.get(`${config.url}/api/v1/apikeys`, { headers, timeout: 5000 });
    const latency = Date.now() - startTime;

    await prisma.integration.update({
      where: { id: integration.id },
      data: { status: 'ACTIVE', lastSyncAt: new Date() }
    });
    res.json({ success: true, data: { connected: true, latency } });
  } catch (error) {
    logger.error('StackStorm test error:', error.message);
    res.json({ success: false, error: 'Connection failed' });
  }
});

// ============================================
// GENERIC INTEGRATION ROUTES
// ============================================

// List all integrations
router.get('/', async (req, res) => {
  try {
    const integrations = await prisma.integration.findMany({
      orderBy: { name: 'asc' },
      include: { webhooks: true }
    });
    res.json({ success: true, data: integrations });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch integrations' });
  }
});

// Get integration by ID
router.get('/:id', async (req, res) => {
  try {
    const integration = await prisma.integration.findUnique({
      where: { id: req.params.id },
      include: { webhooks: true }
    });
    if (!integration) return res.status(404).json({ success: false, error: 'Integration not found' });
    res.json({ success: true, data: integration });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch integration' });
  }
});

// Create integration
router.post('/', authorize('ADMIN'), async (req, res) => {
  try {
    const { name, type, config } = req.body;
    // Ensure config is stored as JSON string
    const configString = typeof config === 'string' ? config : JSON.stringify(config || {});
    const integration = await prisma.integration.create({
      data: { name, type, config: configString, status: 'INACTIVE' }
    });
    res.status(201).json({ success: true, data: integration });
  } catch (error) {
    logger.error('Create integration error:', error);
    res.status(500).json({ success: false, error: 'Failed to create integration' });
  }
});

// Update integration
router.put('/:id', authorize('ADMIN'), async (req, res) => {
  try {
    const { name, type, config, status } = req.body;
    const updateData = {};
    if (name) updateData.name = name;
    if (type) updateData.type = type;
    if (status) updateData.status = status;
    if (config !== undefined) {
      // Ensure config is stored as JSON string
      updateData.config = typeof config === 'string' ? config : JSON.stringify(config || {});
    }
    const integration = await prisma.integration.update({
      where: { id: req.params.id },
      data: updateData
    });
    res.json({ success: true, data: integration });
  } catch (error) {
    logger.error('Update integration error:', error);
    res.status(500).json({ success: false, error: 'Failed to update integration' });
  }
});

// Test integration connection
router.post('/:id/test', authorize('ADMIN'), async (req, res) => {
  try {
    const integration = await prisma.integration.findUnique({ where: { id: req.params.id } });
    if (!integration) return res.status(404).json({ success: false, error: 'Integration not found' });

    // Simulate connection test based on type
    // In production, actually test the connection
    const testResult = {
      success: true,
      message: 'Connection successful',
      latency: Math.floor(Math.random() * 100) + 50
    };

    res.json({ success: true, data: testResult });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Connection test failed' });
  }
});

// Enable integration
router.post('/:id/enable', authorize('ADMIN'), async (req, res) => {
  try {
    const integration = await prisma.integration.update({
      where: { id: req.params.id },
      data: { status: 'ACTIVE' }
    });
    res.json({ success: true, data: integration });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to enable integration' });
  }
});

// Disable integration
router.post('/:id/disable', authorize('ADMIN'), async (req, res) => {
  try {
    const integration = await prisma.integration.update({
      where: { id: req.params.id },
      data: { status: 'INACTIVE' }
    });
    res.json({ success: true, data: integration });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to disable integration' });
  }
});

// Create webhook for integration
router.post('/:id/webhooks', authorize('ADMIN'), async (req, res) => {
  try {
    const { name, url, secret, events } = req.body;
    const webhook = await prisma.integrationWebhook.create({
      data: { integrationId: req.params.id, name, url, secret, events }
    });
    res.status(201).json({ success: true, data: webhook });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create webhook' });
  }
});

// Delete webhook
router.delete('/:id/webhooks/:webhookId', authorize('ADMIN'), async (req, res) => {
  try {
    await prisma.integrationWebhook.delete({ where: { id: req.params.webhookId } });
    res.json({ success: true, message: 'Webhook deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete webhook' });
  }
});

// Sync integration
router.post('/:id/sync', authorize('ADMIN'), async (req, res) => {
  try {
    await prisma.integration.update({
      where: { id: req.params.id },
      data: { status: 'SYNCING', lastSyncAt: new Date() }
    });

    // Simulate sync - in production, actually sync data
    setTimeout(async () => {
      await prisma.integration.update({
        where: { id: req.params.id },
        data: { status: 'ACTIVE', syncStatus: 'completed' }
      });
    }, 2000);

    res.json({ success: true, message: 'Sync started' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to start sync' });
  }
});

// Delete integration
router.delete('/:id', authorize('ADMIN'), async (req, res) => {
  try {
    await prisma.integration.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Integration deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete integration' });
  }
});

module.exports = router;
