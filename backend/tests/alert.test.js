/**
 * Alert Routes E2E Tests
 * LinkedEye-FinSpot
 */

const request = require('supertest');
const { app } = require('../src/server');
const {
  prisma,
  setupAuthenticatedUser,
  createTestAlert,
  createTestAsset,
  cleanupTestData,
  disconnect
} = require('./setup');

const API_PREFIX = '/api/v1';

describe('Alert Routes', () => {
  let authToken;
  let testUser;

  beforeAll(async () => {
    await cleanupTestData();
    const auth = await setupAuthenticatedUser('admin');
    authToken = auth.token;
    testUser = auth.user;
  });

  afterAll(async () => {
    await cleanupTestData();
    await disconnect();
  });

  describe('GET /alerts', () => {
    it('should list all alerts', async () => {
      await createTestAlert();

      const res = await request(app)
        .get(`${API_PREFIX}/alerts`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should filter by status', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/alerts?status=FIRING`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      res.body.data.forEach(alert => {
        expect(alert.status).toBe('FIRING');
      });
    });

    it('should filter by severity', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/alerts?severity=WARNING`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
    });

    it('should filter by source', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/alerts?source=test`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
    });

    it('should paginate results', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/alerts?page=1&limit=10`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination).toBeDefined();
    });
  });

  describe('GET /alerts/stats', () => {
    it('should get alert statistics', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/alerts/stats`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.bySeverity).toBeDefined();
      expect(res.body.data.byStatus).toBeDefined();
    });
  });

  describe('GET /alerts/:id', () => {
    it('should get alert by ID', async () => {
      const alert = await createTestAlert();

      const res = await request(app)
        .get(`${API_PREFIX}/alerts/${alert.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(alert.id);
    });

    it('should return 404 for non-existent alert', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/alerts/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /alerts/:id/acknowledge', () => {
    it('should acknowledge alert', async () => {
      const alert = await createTestAlert();

      const res = await request(app)
        .post(`${API_PREFIX}/alerts/${alert.id}/acknowledge`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ACKNOWLEDGED');
      expect(res.body.data.acknowledgedBy).toBe(testUser.id);
    });
  });

  describe('POST /alerts/:id/resolve', () => {
    it('should resolve alert', async () => {
      const alert = await createTestAlert();

      const res = await request(app)
        .post(`${API_PREFIX}/alerts/${alert.id}/resolve`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('RESOLVED');
      expect(res.body.data.resolvedAt).toBeDefined();
    });
  });

  describe('POST /alerts/:id/silence', () => {
    it('should silence alert', async () => {
      const alert = await createTestAlert();

      const res = await request(app)
        .post(`${API_PREFIX}/alerts/${alert.id}/silence`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('SILENCED');
    });
  });

  describe('POST /alerts/:id/create-incident', () => {
    it('should create incident from alert', async () => {
      const alert = await createTestAlert();

      const res = await request(app)
        .post(`${API_PREFIX}/alerts/${alert.id}/create-incident`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(201);
      expect(res.body.data.number).toMatch(/^INC\d{7}$/);
      expect(res.body.data.sourceAlertId).toBe(alert.alertId);
    });

    it('should link CI to incident when alert has CI', async () => {
      const asset = await createTestAsset();
      const alert = await createTestAlert(asset.id);

      const res = await request(app)
        .post(`${API_PREFIX}/alerts/${alert.id}/create-incident`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(201);
      expect(res.body.data.configItemId).toBe(asset.id);
    });
  });
});
