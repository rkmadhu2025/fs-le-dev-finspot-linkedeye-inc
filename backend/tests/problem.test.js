/**
 * Problem Routes E2E Tests
 * LinkedEye-FinSpot
 */

const request = require('supertest');
const { app } = require('../src/server');
const {
  prisma,
  setupAuthenticatedUser,
  createTestTeam,
  createTestProblem,
  cleanupTestData,
  disconnect
} = require('./setup');

const API_PREFIX = '/api/v1';

describe('Problem Routes', () => {
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

  describe('POST /problems', () => {
    it('should create a new problem', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/problems`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          shortDescription: 'Recurring database connection issues',
          description: 'Multiple incidents related to database timeouts',
          priority: 'P2',
          category: 'Database'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.number).toMatch(/^PRB\d{7}$/);
    });

    it('should reject problem without authentication', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/problems`)
        .send({
          shortDescription: 'Unauthorized problem'
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /problems', () => {
    it('should list all problems', async () => {
      await createTestProblem(testUser.id);

      const res = await request(app)
        .get(`${API_PREFIX}/problems`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /problems/known-errors', () => {
    it('should list known errors', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/problems/known-errors`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /problems/stats', () => {
    it('should get problem statistics', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/problems/stats`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /problems/:id', () => {
    it('should get problem by ID', async () => {
      const problem = await createTestProblem(testUser.id);

      const res = await request(app)
        .get(`${API_PREFIX}/problems/${problem.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(problem.id);
    });

    it('should return 404 for non-existent problem', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/problems/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /problems/:id', () => {
    it('should update problem', async () => {
      const problem = await createTestProblem(testUser.id);

      const res = await request(app)
        .put(`${API_PREFIX}/problems/${problem.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          shortDescription: 'Updated problem description',
          state: 'IN_PROGRESS'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.shortDescription).toBe('Updated problem description');
    });
  });

  describe('POST /problems/:id/rca', () => {
    it('should update root cause analysis', async () => {
      const problem = await createTestProblem(testUser.id);

      const res = await request(app)
        .post(`${API_PREFIX}/problems/${problem.id}/rca`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          rootCause: 'Connection pool exhaustion',
          rootCauseAnalysis: 'Using 5 Whys technique, identified connection pool settings'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /problems/:id/workaround', () => {
    it('should add workaround', async () => {
      const problem = await createTestProblem(testUser.id);

      const res = await request(app)
        .post(`${API_PREFIX}/problems/${problem.id}/workaround`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          workaround: 'Restart database service every 4 hours',
          workaroundEffective: true
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /problems/:id/known-error', () => {
    it('should create known error from problem', async () => {
      const problem = await createTestProblem(testUser.id);

      // Add workaround first
      await prisma.problem.update({
        where: { id: problem.id },
        data: {
          workaround: 'Temporary workaround',
          workaroundEffective: true,
          rootCause: 'Identified root cause'
        }
      });

      const res = await request(app)
        .post(`${API_PREFIX}/problems/${problem.id}/known-error`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(201); // API returns 201 for creation
      expect(res.body.data.isKnownError).toBe(true);
    });
  });

  describe('POST /problems/:id/resolve', () => {
    it('should resolve problem', async () => {
      const problem = await createTestProblem(testUser.id);

      await prisma.problem.update({
        where: { id: problem.id },
        data: { state: 'IN_PROGRESS' }
      });

      const res = await request(app)
        .post(`${API_PREFIX}/problems/${problem.id}/resolve`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          permanentFix: 'Increased connection pool size',
          fixImplemented: true
        });

      expect(res.status).toBe(200);
      expect(res.body.data.state).toBe('RESOLVED');
    });
  });

  describe('DELETE /problems/:id', () => {
    it('should delete problem', async () => {
      const problem = await createTestProblem(testUser.id);

      const res = await request(app)
        .delete(`${API_PREFIX}/problems/${problem.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
