/**
 * User Routes E2E Tests
 * LinkedEye-FinSpot
 */

const request = require('supertest');
const { app } = require('../src/server');
const {
  prisma,
  testUsers,
  createTestUser,
  setupAuthenticatedUser,
  cleanupTestData,
  disconnect
} = require('./setup');

const API_PREFIX = '/api/v1';

describe('User Routes', () => {
  let adminToken;
  let adminUser;
  let operatorToken;
  let operatorUser;

  beforeAll(async () => {
    await cleanupTestData();
    const adminAuth = await setupAuthenticatedUser('admin');
    adminToken = adminAuth.token;
    adminUser = adminAuth.user;

    const operatorAuth = await setupAuthenticatedUser('operator');
    operatorToken = operatorAuth.token;
    operatorUser = operatorAuth.user;
  });

  afterAll(async () => {
    await cleanupTestData();
    await disconnect();
  });

  describe('GET /users', () => {
    it('should list all users', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/users`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should filter users by role', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/users?role=ADMIN`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      res.body.data.forEach(user => {
        expect(user.role).toBe('ADMIN');
      });
    });

    it('should search users', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/users?search=Test`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('should paginate users', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/users?page=1&limit=10`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination).toBeDefined();
    });

    it('should reject without authentication', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/users`);

      expect(res.status).toBe(401);
    });
  });

  describe('GET /users/:id', () => {
    it('should get user by ID', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(adminUser.id);
    });

    it('should return 404 for non-existent user', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/users/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /users/:id', () => {
    it('should update user as admin', async () => {
      const res = await request(app)
        .put(`${API_PREFIX}/users/${operatorUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          firstName: 'Updated',
          lastName: 'Name',
          department: 'IT Operations'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.firstName).toBe('Updated');
    });

    it('should reject update by non-admin', async () => {
      const res = await request(app)
        .put(`${API_PREFIX}/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          firstName: 'Unauthorized'
        });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /users/:id/notifications', () => {
    it('should get own notifications', async () => {
      // Create a notification
      await prisma.notification.create({
        data: {
          userId: adminUser.id,
          type: 'INFO',
          title: 'Test Notification',
          message: 'This is a test'
        }
      });

      const res = await request(app)
        .get(`${API_PREFIX}/users/${adminUser.id}/notifications`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should reject getting other users notifications (non-admin)', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/users/${adminUser.id}/notifications`)
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /users/notifications/:notificationId/read', () => {
    it('should mark notification as read', async () => {
      const notification = await prisma.notification.create({
        data: {
          userId: adminUser.id,
          type: 'INFO',
          title: 'Read Test',
          message: 'Mark as read test'
        }
      });

      const res = await request(app)
        .put(`${API_PREFIX}/users/notifications/${notification.id}/read`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('DELETE /users/:id', () => {
    it('should delete user as admin', async () => {
      const tempUser = await createTestUser({
        email: 'todelete@test.local',
        password: 'ToDelete123!',
        firstName: 'To',
        lastName: 'Delete',
        role: 'OPERATOR'
      });

      const res = await request(app)
        .delete(`${API_PREFIX}/users/${tempUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject delete by non-admin', async () => {
      const res = await request(app)
        .delete(`${API_PREFIX}/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(403);
    });
  });
});
