/**
 * Integration Routes E2E Tests
 * LinkedEye-FinSpot
 */

const request = require('supertest');
const { app } = require('../src/server');
const {
  prisma,
  setupAuthenticatedUser,
  createTestIntegration,
  cleanupTestData,
  disconnect
} = require('./setup');

const API_PREFIX = '/api/v1';

describe('Integration Routes', () => {
  let adminToken;
  let operatorToken;

  beforeAll(async () => {
    await cleanupTestData();
    const adminAuth = await setupAuthenticatedUser('admin');
    adminToken = adminAuth.token;

    const operatorAuth = await setupAuthenticatedUser('operator');
    operatorToken = operatorAuth.token;
  });

  afterAll(async () => {
    await cleanupTestData();
    await disconnect();
  });

  describe('POST /integrations', () => {
    it('should create a new integration (admin)', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/integrations`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Production Prometheus',
          type: 'PROMETHEUS',
          config: JSON.stringify({ url: 'http://prometheus:9090' })
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Production Prometheus');
      expect(res.body.data.status).toBe('INACTIVE');
    });

    it('should reject integration creation by non-admin', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/integrations`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          name: 'Unauthorized Integration',
          type: 'GRAFANA'
        });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /integrations', () => {
    it('should list all integrations', async () => {
      await createTestIntegration();

      const res = await request(app)
        .get(`${API_PREFIX}/integrations`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /integrations/:id', () => {
    it('should get integration by ID', async () => {
      const integration = await createTestIntegration();

      const res = await request(app)
        .get(`${API_PREFIX}/integrations/${integration.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(integration.id);
    });

    it('should return 404 for non-existent integration', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/integrations/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /integrations/:id', () => {
    it('should update integration', async () => {
      const integration = await createTestIntegration();

      const res = await request(app)
        .put(`${API_PREFIX}/integrations/${integration.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated Integration Name',
          config: JSON.stringify({ url: 'http://new-prometheus:9090' })
        });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated Integration Name');
    });
  });

  describe('POST /integrations/:id/test', () => {
    it('should test integration connection', async () => {
      const integration = await createTestIntegration();

      const res = await request(app)
        .post(`${API_PREFIX}/integrations/${integration.id}/test`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.latency).toBeDefined();
    });
  });

  describe('POST /integrations/:id/enable', () => {
    it('should enable integration', async () => {
      const integration = await createTestIntegration();

      const res = await request(app)
        .post(`${API_PREFIX}/integrations/${integration.id}/enable`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ACTIVE');
    });
  });

  describe('POST /integrations/:id/disable', () => {
    it('should disable integration', async () => {
      const integration = await prisma.integration.create({
        data: {
          name: 'Active Integration',
          type: 'GRAFANA',
          status: 'ACTIVE',
          config: JSON.stringify({})
        }
      });

      const res = await request(app)
        .post(`${API_PREFIX}/integrations/${integration.id}/disable`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('INACTIVE');
    });
  });

  describe('POST /integrations/:id/webhooks', () => {
    it('should create webhook for integration', async () => {
      const integration = await createTestIntegration();

      const res = await request(app)
        .post(`${API_PREFIX}/integrations/${integration.id}/webhooks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Alert Webhook',
          url: 'https://example.com/webhook',
          secret: 'webhook-secret',
          events: 'alert.firing,alert.resolved'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Alert Webhook');
    });
  });

  describe('DELETE /integrations/:id/webhooks/:webhookId', () => {
    it('should delete webhook', async () => {
      const integration = await createTestIntegration();
      const webhook = await prisma.integrationWebhook.create({
        data: {
          integrationId: integration.id,
          name: 'To Delete',
          url: 'https://example.com/delete',
          events: 'test'
        }
      });

      const res = await request(app)
        .delete(`${API_PREFIX}/integrations/${integration.id}/webhooks/${webhook.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('POST /integrations/:id/sync', () => {
    it('should start integration sync', async () => {
      const integration = await createTestIntegration();

      const res = await request(app)
        .post(`${API_PREFIX}/integrations/${integration.id}/sync`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Sync started');
    });
  });

  describe('DELETE /integrations/:id', () => {
    it('should delete integration', async () => {
      const integration = await createTestIntegration();

      const res = await request(app)
        .delete(`${API_PREFIX}/integrations/${integration.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // Specific integration proxy routes
  describe('GET /integrations/prometheus/targets', () => {
    it('should return empty targets if not configured', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/integrations/prometheus/targets`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('GET /integrations/alertmanager/alerts', () => {
    it('should return empty alerts if not configured', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/integrations/alertmanager/alerts`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });
  });
});
