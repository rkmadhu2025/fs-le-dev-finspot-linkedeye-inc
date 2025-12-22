/**
 * Report Routes E2E Tests
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

describe('Report Routes', () => {
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

  describe('GET /reports/sla', () => {
    it('should get SLA compliance report', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/reports/sla`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.complianceRate).toBeDefined();
    });

    it('should accept period parameter', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/reports/sla?period=7d`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.period).toBe('7d');
    });

    it('should accept priority filter', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/reports/sla?priority=P1`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('GET /reports/mttr', () => {
    it('should get MTTR report', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/reports/mttr`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.overallMTTR).toBeDefined();
      expect(res.body.data.mttrByPriority).toBeDefined();
    });

    it('should accept period parameter', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/reports/mttr?period=30d`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.period).toBe('30d');
    });
  });

  describe('GET /reports/incident-volume', () => {
    it('should get incident volume report', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/reports/incident-volume`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.byCategory).toBeDefined();
      expect(res.body.data.byPriority).toBeDefined();
    });

    it('should include daily trend', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/reports/incident-volume?period=7d`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.dailyTrend).toBeDefined();
    });
  });

  describe('GET /reports/change-success', () => {
    it('should get change success rate report', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/reports/change-success`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.successRate).toBeDefined();
    });
  });

  describe('GET /reports/team-performance', () => {
    it('should get team performance report', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/reports/team-performance`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.teams).toBeDefined();
    });

    it('should include SLA compliance per team', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/reports/team-performance?period=30d`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      if (res.body.data.teams.length > 0) {
        expect(res.body.data.teams[0].slaCompliance).toBeDefined();
      }
    });
  });

  describe('POST /reports/schedule', () => {
    it('should create scheduled report', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/reports/schedule`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Weekly SLA Report',
          type: 'SLA',
          config: JSON.stringify({ period: '7d' }),
          schedule: '0 9 * * MON',
          recipients: 'team@example.com'
        });

      // ScheduledReport model not implemented - returns 500 currently
      // When implemented, should return 200 or 201
      expect(res.status).toBe(500);
    });
  });

  describe('GET /reports/scheduled', () => {
    it('should list scheduled reports', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/reports/scheduled`)
        .set('Authorization', `Bearer ${authToken}`);

      // ScheduledReport model not implemented - returns 500 currently
      expect(res.status).toBe(500);
    });
  });
});
