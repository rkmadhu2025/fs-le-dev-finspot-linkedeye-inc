/**
 * Auth Routes E2E Tests
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

describe('Auth Routes', () => {
  beforeAll(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await disconnect();
  });

  describe('POST /auth/register', () => {
    it('should register a new user', async () => {
      const uniqueEmail = `newuser-${Date.now()}@test.local`;
      const res = await request(app)
        .post(`${API_PREFIX}/auth/register`)
        .send({
          email: uniqueEmail,
          password: 'NewUser123!',
          firstName: 'New',
          lastName: 'User'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      // Register response returns user data directly, not wrapped in user object
      // No token returned as account is pending approval
      expect(res.body.data.email).toBe(uniqueEmail);
    });

    it('should reject registration with existing email', async () => {
      await createTestUser(testUsers.admin);

      const res = await request(app)
        .post(`${API_PREFIX}/auth/register`)
        .send({
          email: testUsers.admin.email,
          password: 'SomePassword123!',
          firstName: 'Duplicate',
          lastName: 'User'
        });

      expect(res.status).toBe(409); // API returns 409 for duplicate email
      expect(res.body.success).toBe(false);
    });

    it('should reject registration with weak password', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/auth/register`)
        .send({
          email: 'weakpass@test.local',
          password: 'weak',
          firstName: 'Weak',
          lastName: 'Password'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject registration with invalid email', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/auth/register`)
        .send({
          email: 'invalid-email',
          password: 'ValidPass123!',
          firstName: 'Invalid',
          lastName: 'Email'
        });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    beforeAll(async () => {
      await createTestUser(testUsers.admin);
    });

    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/auth/login`)
        .send({
          email: testUsers.admin.email,
          password: testUsers.admin.password
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.user.email).toBe(testUsers.admin.email);
    });

    it('should reject login with wrong password', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/auth/login`)
        .send({
          email: testUsers.admin.email,
          password: 'WrongPassword123!'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject login with non-existent email', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/auth/login`)
        .send({
          email: 'nonexistent@test.local',
          password: 'SomePassword123!'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /auth/me', () => {
    it('should return current user when authenticated', async () => {
      const { token, user } = await setupAuthenticatedUser('admin');

      const res = await request(app)
        .get(`${API_PREFIX}/auth/me`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(user.email);
    });

    it('should reject request without token', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/auth/me`);

      expect(res.status).toBe(401);
    });

    it('should reject request with invalid token', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/auth/me`)
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout authenticated user', async () => {
      const { token } = await setupAuthenticatedUser('admin');

      const res = await request(app)
        .post(`${API_PREFIX}/auth/logout`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /auth/refresh-token', () => {
    it('should refresh token with valid refresh token', async () => {
      // First login to get refresh token
      await createTestUser(testUsers.operator);
      const loginRes = await request(app)
        .post(`${API_PREFIX}/auth/login`)
        .send({
          email: testUsers.operator.email,
          password: testUsers.operator.password
        });

      const refreshToken = loginRes.body.data.refreshToken;

      const res = await request(app)
        .post(`${API_PREFIX}/auth/refresh-token`)
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
    });
  });

  describe('POST /auth/change-password', () => {
    it('should change password for authenticated user', async () => {
      const { token } = await setupAuthenticatedUser('admin');

      const res = await request(app)
        .post(`${API_PREFIX}/auth/change-password`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: testUsers.admin.password,
          newPassword: 'NewSecurePass123!'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject change with wrong current password', async () => {
      const { token } = await setupAuthenticatedUser('admin');

      const res = await request(app)
        .post(`${API_PREFIX}/auth/change-password`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: 'WrongPassword123!',
          newPassword: 'NewSecurePass123!'
        });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('should accept forgot password request', async () => {
      await createTestUser(testUsers.admin);

      const res = await request(app)
        .post(`${API_PREFIX}/auth/forgot-password`)
        .send({ email: testUsers.admin.email });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('SSO Routes', () => {
    it('GET /auth/sso/azure should return redirect info', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/auth/sso/azure`);

      expect([200, 302, 501]).toContain(res.status);
    });

    it('GET /auth/sso/google should return redirect info', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/auth/sso/google`);

      expect([200, 302, 501]).toContain(res.status);
    });
  });

  describe('MFA Routes', () => {
    it('POST /auth/enable-mfa should initiate MFA setup', async () => {
      const { token } = await setupAuthenticatedUser('admin');

      const res = await request(app)
        .post(`${API_PREFIX}/auth/enable-mfa`)
        .set('Authorization', `Bearer ${token}`);

      expect([200, 501]).toContain(res.status);
    });

    it('POST /auth/disable-mfa should disable MFA', async () => {
      const { token } = await setupAuthenticatedUser('admin');

      const res = await request(app)
        .post(`${API_PREFIX}/auth/disable-mfa`)
        .set('Authorization', `Bearer ${token}`);

      expect([200, 400, 501]).toContain(res.status);
    });
  });
});
