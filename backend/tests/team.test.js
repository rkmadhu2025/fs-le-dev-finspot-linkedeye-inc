/**
 * Team Routes E2E Tests
 * LinkedEye-FinSpot
 */

const request = require('supertest');
const { app } = require('../src/server');
const {
  prisma,
  setupAuthenticatedUser,
  createTestTeam,
  cleanupTestData,
  disconnect
} = require('./setup');

const API_PREFIX = '/api/v1';

describe('Team Routes', () => {
  let adminToken;
  let adminUser;
  let operatorToken;

  beforeAll(async () => {
    await cleanupTestData();
    const adminAuth = await setupAuthenticatedUser('admin');
    adminToken = adminAuth.token;
    adminUser = adminAuth.user;

    const operatorAuth = await setupAuthenticatedUser('operator');
    operatorToken = operatorAuth.token;
  });

  afterAll(async () => {
    await cleanupTestData();
    await disconnect();
  });

  describe('POST /teams', () => {
    it('should create a new team (admin)', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/teams`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'NOC Team',
          description: 'Network Operations Center',
          email: 'noc@example.com',
          slackChannel: '#noc-alerts'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('NOC Team');
    });

    it('should reject team creation by operator', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/teams`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          name: 'Unauthorized Team'
        });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /teams', () => {
    it('should list all teams', async () => {
      await createTestTeam('Active Team');

      const res = await request(app)
        .get(`${API_PREFIX}/teams`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should include member count', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/teams`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        expect(res.body.data[0]._count).toBeDefined();
      }
    });
  });

  describe('GET /teams/:id', () => {
    it('should get team by ID', async () => {
      const team = await createTestTeam('Get Team Test');

      const res = await request(app)
        .get(`${API_PREFIX}/teams/${team.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(team.id);
    });

    it('should return 404 for non-existent team', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/teams/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /teams/:id', () => {
    it('should update team', async () => {
      const team = await createTestTeam('Update Team Test');

      const res = await request(app)
        .put(`${API_PREFIX}/teams/${team.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          description: 'Updated description',
          slackChannel: '#updated-channel'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.description).toBe('Updated description');
    });
  });

  describe('POST /teams/:id/members', () => {
    it('should add member to team', async () => {
      const team = await createTestTeam('Member Test Team');

      const res = await request(app)
        .post(`${API_PREFIX}/teams/${team.id}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: adminUser.id,
          role: 'LEAD'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });
  });

  describe('DELETE /teams/:id/members/:userId', () => {
    it('should remove member from team', async () => {
      const team = await createTestTeam('Remove Member Test');

      // Add member first
      await prisma.teamMember.create({
        data: {
          teamId: team.id,
          userId: adminUser.id,
          role: 'MEMBER'
        }
      });

      const res = await request(app)
        .delete(`${API_PREFIX}/teams/${team.id}/members/${adminUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /teams/:id/on-call', () => {
    it('should get current on-call', async () => {
      const team = await createTestTeam('On-Call Test Team');

      const res = await request(app)
        .get(`${API_PREFIX}/teams/${team.id}/on-call`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /teams/:id/on-call', () => {
    it('should create on-call schedule', async () => {
      const team = await createTestTeam('Schedule Test Team');

      const res = await request(app)
        .post(`${API_PREFIX}/teams/${team.id}/on-call`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: adminUser.id,
          startTime: new Date().toISOString(),
          endTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          isPrimary: true
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /teams/:id/on-call/schedule', () => {
    it('should get on-call schedule', async () => {
      const team = await createTestTeam('Schedule View Team');

      const res = await request(app)
        .get(`${API_PREFIX}/teams/${team.id}/on-call/schedule`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /teams/:id/escalation-policy', () => {
    it('should create escalation policy', async () => {
      const team = await createTestTeam('Escalation Team');

      const res = await request(app)
        .post(`${API_PREFIX}/teams/${team.id}/escalation-policy`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Default Policy',
          description: 'Default escalation policy',
          rules: [
            { level: 1, delayMinutes: 5, notifyType: 'EMAIL', notifyTargets: 'team' },
            { level: 2, delayMinutes: 15, notifyType: 'SMS', notifyTargets: 'manager' }
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Default Policy');
    });
  });

  describe('DELETE /teams/:id', () => {
    it('should deactivate team', async () => {
      const team = await createTestTeam('Delete Team Test');

      const res = await request(app)
        .delete(`${API_PREFIX}/teams/${team.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify deactivated
      const updated = await prisma.team.findUnique({
        where: { id: team.id }
      });
      expect(updated.isActive).toBe(false);
    });
  });
});
