/**
 * Change Routes E2E Tests
 * LinkedEye-FinSpot
 */

const request = require('supertest');
const { app } = require('../src/server');
const {
  prisma,
  setupAuthenticatedUser,
  createTestTeam,
  createTestChange,
  cleanupTestData,
  disconnect
} = require('./setup');

const API_PREFIX = '/api/v1';

describe('Change Routes', () => {
  let authToken;
  let testUser;
  let testTeam;

  beforeAll(async () => {
    await cleanupTestData();
    const auth = await setupAuthenticatedUser('admin');
    authToken = auth.token;
    testUser = auth.user;
    testTeam = await createTestTeam();
  });

  afterAll(async () => {
    await cleanupTestData();
    await disconnect();
  });

  describe('POST /changes', () => {
    it('should create a new change', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/changes`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          shortDescription: 'Database migration',
          description: 'Migrate database to new schema',
          type: 'NORMAL',
          riskLevel: 'MEDIUM',
          justification: 'Performance improvement',
          implementationPlan: 'Step 1: Backup, Step 2: Migrate',
          rollbackPlan: 'Restore from backup',
          testPlan: 'Verify data integrity'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.number).toMatch(/^CHG\d{7}$/);
      expect(res.body.data.shortDescription).toBe('Database migration');
    });

    it('should reject change without authentication', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/changes`)
        .send({
          shortDescription: 'Unauthorized change'
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /changes', () => {
    it('should list all changes', async () => {
      await createTestChange(testUser.id);

      const res = await request(app)
        .get(`${API_PREFIX}/changes`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /changes/calendar', () => {
    it('should get change calendar', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/changes/calendar`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /changes/stats', () => {
    it('should get change statistics', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/changes/stats`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /changes/:id', () => {
    it('should get change by ID', async () => {
      const change = await createTestChange(testUser.id);

      const res = await request(app)
        .get(`${API_PREFIX}/changes/${change.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(change.id);
    });

    it('should return 404 for non-existent change', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/changes/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /changes/:id', () => {
    it('should update change', async () => {
      const change = await createTestChange(testUser.id);

      const res = await request(app)
        .put(`${API_PREFIX}/changes/${change.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          shortDescription: 'Updated change description',
          riskLevel: 'HIGH'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.shortDescription).toBe('Updated change description');
      expect(res.body.data.riskLevel).toBe('HIGH');
    });
  });

  describe('POST /changes/:id/submit', () => {
    it('should submit change for approval', async () => {
      const change = await createTestChange(testUser.id);

      const res = await request(app)
        .post(`${API_PREFIX}/changes/${change.id}/submit`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /changes/:id/approve', () => {
    it('should approve change', async () => {
      const change = await createTestChange(testUser.id);

      // Submit first
      await prisma.change.update({
        where: { id: change.id },
        data: { state: 'PENDING_APPROVAL' }
      });

      const res = await request(app)
        .post(`${API_PREFIX}/changes/${change.id}/approve`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ comments: 'Approved' });

      expect(res.status).toBe(200);
    });
  });

  describe('POST /changes/:id/reject', () => {
    it('should reject change', async () => {
      const change = await createTestChange(testUser.id);

      await prisma.change.update({
        where: { id: change.id },
        data: { state: 'PENDING_APPROVAL' }
      });

      const res = await request(app)
        .post(`${API_PREFIX}/changes/${change.id}/reject`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ comments: 'Rejected - incomplete plan' });

      expect(res.status).toBe(200);
    });
  });

  describe('POST /changes/:id/implement', () => {
    it('should start implementation', async () => {
      const change = await createTestChange(testUser.id);

      await prisma.change.update({
        where: { id: change.id },
        data: { state: 'APPROVED' }
      });

      const res = await request(app)
        .post(`${API_PREFIX}/changes/${change.id}/implement`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('POST /changes/:id/complete', () => {
    it('should complete change', async () => {
      const change = await createTestChange(testUser.id);

      await prisma.change.update({
        where: { id: change.id },
        data: { state: 'IN_PROGRESS' }
      });

      const res = await request(app)
        .post(`${API_PREFIX}/changes/${change.id}/complete`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ closureCode: 'successful' });

      expect(res.status).toBe(200);
    });
  });

  describe('POST /changes/:id/rollback', () => {
    it('should rollback change', async () => {
      const change = await createTestChange(testUser.id);

      await prisma.change.update({
        where: { id: change.id },
        data: { state: 'IN_PROGRESS' }
      });

      const res = await request(app)
        .post(`${API_PREFIX}/changes/${change.id}/rollback`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reason: 'Unexpected issues' });

      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /changes/:id', () => {
    it('should delete change', async () => {
      const change = await createTestChange(testUser.id);

      const res = await request(app)
        .delete(`${API_PREFIX}/changes/${change.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
