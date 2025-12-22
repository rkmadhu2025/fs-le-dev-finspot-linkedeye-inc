/**
 * Dashboard Routes E2E Tests
 * LinkedEye-FinSpot
 */

const request = require('supertest');
const { app } = require('../src/server');
const {
  setupAuthenticatedUser,
  cleanupTestData,
  disconnect
} = require('./setup');

const API_PREFIX = '/api/v1';

describe('Dashboard Routes', () => {
  let authToken;

  beforeAll(async () => {
    await cleanupTestData();
    const auth = await setupAuthenticatedUser('admin');
    authToken = auth.token;
  });

  afterAll(async () => {
    await cleanupTestData();
    await disconnect();
  });

  describe('GET /dashboard', () => {
    it('should get main dashboard data', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/dashboard`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject without authentication', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/dashboard`);

      expect(res.status).toBe(401);
    });
  });

  describe('GET /dashboard/kpis', () => {
    it('should get KPI metrics', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/dashboard/kpis`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /dashboard/incident-trends', () => {
    it('should get incident trends', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/dashboard/incident-trends`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /dashboard/sla', () => {
    it('should get SLA metrics', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/dashboard/sla`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /dashboard/activity-feed', () => {
    it('should get activity feed', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/dashboard/activity-feed`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /dashboard/team-workload', () => {
    it('should get team workload', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/dashboard/team-workload`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /dashboard/alerts-summary', () => {
    it('should get alerts summary', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/dashboard/alerts-summary`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /dashboard/quick-stats', () => {
    it('should get quick stats', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/dashboard/quick-stats`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
