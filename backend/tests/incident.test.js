/**
 * Incident Routes E2E Tests
 * LinkedEye-FinSpot
 */

const request = require('supertest');
const { app } = require('../src/server');
const {
  prisma,
  setupAuthenticatedUser,
  createTestTeam,
  createTestIncident,
  createTestChange,
  createTestProblem,
  createTestAlert,
  cleanupTestData,
  disconnect
} = require('./setup');

const API_PREFIX = '/api/v1';

describe('Incident Routes', () => {
  let authToken;
  let testUser;
  let testTeam;
  let testIncident;

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

  describe('POST /incidents', () => {
    it('should create a new incident', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/incidents`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          shortDescription: 'Server down in production',
          description: 'The main production server is not responding',
          impact: 'CRITICAL',
          urgency: 'CRITICAL',
          category: 'Infrastructure',
          assignmentGroupId: testTeam.id
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.number).toMatch(/^INC\d{7}$/);
      expect(res.body.data.shortDescription).toBe('Server down in production');
      expect(res.body.data.priority).toBe('P1');

      testIncident = res.body.data;
    });

    it('should reject incident without short description', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/incidents`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          description: 'Missing short description'
        });

      expect(res.status).toBe(400);
    });

    it('should reject request without authentication', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/incidents`)
        .send({
          shortDescription: 'Unauthorized test'
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /incidents', () => {
    it('should list all incidents', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/incidents`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });

    it('should filter incidents by state', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/incidents?state=NEW`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      res.body.data.forEach(incident => {
        expect(incident.state).toBe('NEW');
      });
    });

    it('should filter incidents by priority', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/incidents?priority=P1`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      res.body.data.forEach(incident => {
        expect(incident.priority).toBe('P1');
      });
    });

    it('should paginate results', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/incidents?page=1&limit=5`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(5);
    });
  });

  describe('GET /incidents/stats', () => {
    it('should return incident statistics', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/incidents/stats`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });

  describe('GET /incidents/:id', () => {
    it('should get incident by ID', async () => {
      const incident = await createTestIncident(testUser.id, testTeam.id);

      const res = await request(app)
        .get(`${API_PREFIX}/incidents/${incident.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(incident.id);
    });

    it('should return 404 for non-existent incident', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/incidents/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /incidents/number/:number', () => {
    it('should get incident by number', async () => {
      const incident = await createTestIncident(testUser.id);

      const res = await request(app)
        .get(`${API_PREFIX}/incidents/number/${incident.number}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.number).toBe(incident.number);
    });
  });

  describe('PUT /incidents/:id', () => {
    it('should update incident', async () => {
      const incident = await createTestIncident(testUser.id);

      const res = await request(app)
        .put(`${API_PREFIX}/incidents/${incident.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          shortDescription: 'Updated description',
          state: 'IN_PROGRESS'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.shortDescription).toBe('Updated description');
      expect(res.body.data.state).toBe('IN_PROGRESS');
    });
  });

  describe('POST /incidents/:id/assign', () => {
    it('should assign incident to user', async () => {
      const incident = await createTestIncident(testUser.id);

      const res = await request(app)
        .post(`${API_PREFIX}/incidents/${incident.id}/assign`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          assignedToId: testUser.id,
          assignmentGroupId: testTeam.id
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /incidents/:id/resolve', () => {
    it('should resolve incident', async () => {
      const incident = await createTestIncident(testUser.id);

      // First put in progress
      await request(app)
        .put(`${API_PREFIX}/incidents/${incident.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ state: 'IN_PROGRESS' });

      const res = await request(app)
        .post(`${API_PREFIX}/incidents/${incident.id}/resolve`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          resolutionCode: 'FIXED',
          resolutionNotes: 'Issue has been fixed'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.state).toBe('RESOLVED');
    });

    it('should resolve incident without resolution code (optional)', async () => {
      const incident = await createTestIncident(testUser.id);

      const res = await request(app)
        .post(`${API_PREFIX}/incidents/${incident.id}/resolve`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          resolutionNotes: 'Resolved without code'
        });

      // Resolution code is optional in the API
      expect(res.status).toBe(200);
      expect(res.body.data.state).toBe('RESOLVED');
    });
  });

  describe('POST /incidents/:id/close', () => {
    it('should close resolved incident', async () => {
      const incident = await createTestIncident(testUser.id);

      // Resolve first
      await prisma.incident.update({
        where: { id: incident.id },
        data: { state: 'RESOLVED' }
      });

      const res = await request(app)
        .post(`${API_PREFIX}/incidents/${incident.id}/close`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.state).toBe('CLOSED');
    });
  });

  describe('POST /incidents/:id/reopen', () => {
    it('should reopen closed incident', async () => {
      const incident = await createTestIncident(testUser.id);

      await prisma.incident.update({
        where: { id: incident.id },
        data: { state: 'CLOSED' }
      });

      const res = await request(app)
        .post(`${API_PREFIX}/incidents/${incident.id}/reopen`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.state).toBe('IN_PROGRESS');
    });
  });

  describe('POST /incidents/:id/notes', () => {
    it('should add work note to incident', async () => {
      const incident = await createTestIncident(testUser.id);

      const res = await request(app)
        .post(`${API_PREFIX}/incidents/${incident.id}/notes`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content: 'This is a work note',
          isInternal: true
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /incidents/:id/notes', () => {
    it('should get work notes for incident', async () => {
      const incident = await createTestIncident(testUser.id);

      // Add a note first
      await prisma.workNote.create({
        data: {
          incidentId: incident.id,
          content: 'Test note',
          authorId: testUser.id
        }
      });

      const res = await request(app)
        .get(`${API_PREFIX}/incidents/${incident.id}/notes`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /incidents/:id/activities', () => {
    it('should get activities for incident', async () => {
      const incident = await createTestIncident(testUser.id);

      const res = await request(app)
        .get(`${API_PREFIX}/incidents/${incident.id}/activities`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /incidents/:id/link-change', () => {
    it('should link incident to change', async () => {
      const incident = await createTestIncident(testUser.id);
      const change = await createTestChange(testUser.id);

      const res = await request(app)
        .post(`${API_PREFIX}/incidents/${incident.id}/link-change`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          changeId: change.id,
          linkType: 'CAUSED_BY',
          notes: 'Incident caused by this change'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.changeId).toBe(change.id);
    });

    it('should reject duplicate link', async () => {
      const incident = await createTestIncident(testUser.id);
      const change = await createTestChange(testUser.id);

      // Link once
      await request(app)
        .post(`${API_PREFIX}/incidents/${incident.id}/link-change`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ changeId: change.id });

      // Try to link again
      const res = await request(app)
        .post(`${API_PREFIX}/incidents/${incident.id}/link-change`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ changeId: change.id });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /incidents/:id/link-problem', () => {
    it('should link incident to problem', async () => {
      const incident = await createTestIncident(testUser.id);
      const problem = await createTestProblem(testUser.id);

      const res = await request(app)
        .post(`${API_PREFIX}/incidents/${incident.id}/link-problem`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          problemId: problem.id,
          linkType: 'SYMPTOM_OF',
          notes: 'This incident is a symptom of the problem'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.problemId).toBe(problem.id);
    });

    it('should reject duplicate link', async () => {
      const incident = await createTestIncident(testUser.id);
      const problem = await createTestProblem(testUser.id);

      // Link once
      await request(app)
        .post(`${API_PREFIX}/incidents/${incident.id}/link-problem`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ problemId: problem.id });

      // Try to link again
      const res = await request(app)
        .post(`${API_PREFIX}/incidents/${incident.id}/link-problem`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ problemId: problem.id });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /incidents/:id/alerts', () => {
    it('should get related alerts for incident', async () => {
      const incident = await createTestIncident(testUser.id);
      await createTestAlert(null, incident.id);

      const res = await request(app)
        .get(`${API_PREFIX}/incidents/${incident.id}/alerts`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('DELETE /incidents/:id', () => {
    it('should delete incident', async () => {
      const incident = await createTestIncident(testUser.id);

      const res = await request(app)
        .delete(`${API_PREFIX}/incidents/${incident.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify deleted
      const deleted = await prisma.incident.findUnique({
        where: { id: incident.id }
      });
      expect(deleted).toBeNull();
    });
  });
});
