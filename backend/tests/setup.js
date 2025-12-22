/**
 * Test Setup & Utilities
 * LinkedEye-FinSpot E2E Tests
 */

const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// Test user data
const testUsers = {
  admin: {
    email: 'admin@test.local',
    password: 'TestAdmin123!',
    firstName: 'Test',
    lastName: 'Admin',
    role: 'ADMIN'
  },
  operator: {
    email: 'operator@test.local',
    password: 'TestOperator123!',
    firstName: 'Test',
    lastName: 'Operator',
    role: 'OPERATOR'
  },
  manager: {
    email: 'manager@test.local',
    password: 'TestManager123!',
    firstName: 'Test',
    lastName: 'Manager',
    role: 'MANAGER'
  }
};

/**
 * Create a test user and return their data
 */
async function createTestUser(userData = testUsers.admin) {
  const hashedPassword = await bcrypt.hash(userData.password, 10);

  const user = await prisma.user.upsert({
    where: { email: userData.email },
    update: {},
    create: {
      email: userData.email,
      password: hashedPassword,
      firstName: userData.firstName,
      lastName: userData.lastName,
      role: userData.role,
      status: 'ACTIVE'
    }
  });

  return user;
}

/**
 * Generate auth token for a user
 */
function generateAuthToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET || 'test-secret-key',
    { expiresIn: '1h' }
  );
}

/**
 * Create test user and return with auth token
 */
async function setupAuthenticatedUser(role = 'admin') {
  const userData = testUsers[role] || testUsers.admin;
  const user = await createTestUser(userData);
  const token = generateAuthToken(user);
  return { user, token };
}

/**
 * Create a test team
 */
async function createTestTeam(name = 'Test Team') {
  return prisma.team.upsert({
    where: { name },
    update: {},
    create: {
      name,
      description: 'Test team for E2E tests',
      isActive: true
    }
  });
}

/**
 * Create a test incident
 */
async function createTestIncident(userId, teamId = null) {
  const lastIncident = await prisma.incident.findFirst({
    orderBy: { number: 'desc' },
    select: { number: true }
  });

  const nextNum = lastIncident
    ? parseInt(lastIncident.number.replace('INC', '')) + 1
    : 1;
  const number = `INC${nextNum.toString().padStart(7, '0')}`;

  return prisma.incident.create({
    data: {
      number,
      shortDescription: 'Test Incident',
      description: 'This is a test incident for E2E testing',
      state: 'NEW',
      impact: 'MEDIUM',
      urgency: 'MEDIUM',
      priority: 'P3',
      source: 'MANUAL',
      createdById: userId,
      assignmentGroupId: teamId
    }
  });
}

/**
 * Create a test change
 */
async function createTestChange(userId) {
  const lastChange = await prisma.change.findFirst({
    orderBy: { number: 'desc' },
    select: { number: true }
  });

  const nextNum = lastChange
    ? parseInt(lastChange.number.replace('CHG', '')) + 1
    : 1;
  const number = `CHG${nextNum.toString().padStart(7, '0')}`;

  return prisma.change.create({
    data: {
      number,
      shortDescription: 'Test Change',
      description: 'This is a test change for E2E testing',
      type: 'NORMAL',
      state: 'NEW',
      riskLevel: 'MEDIUM',
      createdById: userId
    }
  });
}

/**
 * Create a test problem
 */
async function createTestProblem(userId) {
  const lastProblem = await prisma.problem.findFirst({
    orderBy: { number: 'desc' },
    select: { number: true }
  });

  const nextNum = lastProblem
    ? parseInt(lastProblem.number.replace('PRB', '')) + 1
    : 1;
  const number = `PRB${nextNum.toString().padStart(7, '0')}`;

  return prisma.problem.create({
    data: {
      number,
      shortDescription: 'Test Problem',
      description: 'This is a test problem for E2E testing',
      state: 'NEW',
      priority: 'P3',
      createdById: userId
    }
  });
}

/**
 * Create a test configuration item (asset)
 */
async function createTestAsset() {
  return prisma.configurationItem.create({
    data: {
      name: `test-server-${Date.now()}`,
      type: 'SERVER',
      status: 'LIVE',
      hostname: 'test-server.local',
      ipAddress: '10.0.0.100'
    }
  });
}

/**
 * Create a test alert
 */
async function createTestAlert(configItemId = null, incidentId = null) {
  return prisma.alert.create({
    data: {
      alertId: `alert-${Date.now()}`,
      name: 'Test Alert',
      severity: 'WARNING',
      status: 'FIRING',
      source: 'test',
      description: 'Test alert for E2E testing',
      firedAt: new Date(),
      configItemId,
      incidentId
    }
  });
}

/**
 * Create a test integration
 */
async function createTestIntegration() {
  return prisma.integration.create({
    data: {
      name: 'Test Integration',
      type: 'PROMETHEUS',
      status: 'INACTIVE',
      config: JSON.stringify({ url: 'http://localhost:9090' })
    }
  });
}

/**
 * Clean up test data
 */
async function cleanupTestData() {
  // Delete in order of dependencies
  await prisma.activity.deleteMany({});
  await prisma.workNote.deleteMany({});
  await prisma.incidentChange.deleteMany({});
  await prisma.incidentProblem.deleteMany({});
  await prisma.alert.deleteMany({});
  await prisma.incident.deleteMany({});
  await prisma.approval.deleteMany({});
  await prisma.changeCI.deleteMany({});
  await prisma.change.deleteMany({});
  await prisma.problem.deleteMany({});
  await prisma.configurationItem.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.escalationRule.deleteMany({});
  await prisma.escalationPolicy.deleteMany({});
  await prisma.onCallSchedule.deleteMany({});
  await prisma.teamMember.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.integrationWebhook.deleteMany({});
  await prisma.integration.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.user.deleteMany({
    where: {
      email: { in: Object.values(testUsers).map(u => u.email) }
    }
  });
}

/**
 * Disconnect Prisma client
 */
async function disconnect() {
  await prisma.$disconnect();
}

module.exports = {
  prisma,
  testUsers,
  createTestUser,
  generateAuthToken,
  setupAuthenticatedUser,
  createTestTeam,
  createTestIncident,
  createTestChange,
  createTestProblem,
  createTestAsset,
  createTestAlert,
  createTestIntegration,
  cleanupTestData,
  disconnect
};
