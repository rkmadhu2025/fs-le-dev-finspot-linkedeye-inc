/**
 * Database Seed Script
 * LinkedEye-FinSpot
 *
 * Creates initial data for development/demo
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

  // Create Users
  console.log('Creating users...');
  const passwordHash = await bcrypt.hash('Password123!', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@linkedeye.local' },
    update: {},
    create: {
      email: 'admin@linkedeye.local',
      password: passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      status: 'ACTIVE',
      department: 'IT Operations',
      jobTitle: 'System Administrator'
    }
  });

  const manager = await prisma.user.upsert({
    where: { email: 'manager@linkedeye.local' },
    update: {},
    create: {
      email: 'manager@linkedeye.local',
      password: passwordHash,
      firstName: 'Rajkumar',
      lastName: 'Madhu',
      role: 'MANAGER',
      status: 'ACTIVE',
      department: 'Infrastructure Operations',
      jobTitle: 'Infrastructure Manager'
    }
  });

  const operator1 = await prisma.user.upsert({
    where: { email: 'operator1@linkedeye.local' },
    update: {},
    create: {
      email: 'operator1@linkedeye.local',
      password: passwordHash,
      firstName: 'Priya',
      lastName: 'Sharma',
      role: 'OPERATOR',
      status: 'ACTIVE',
      department: 'NOC',
      jobTitle: 'NOC Engineer'
    }
  });

  const operator2 = await prisma.user.upsert({
    where: { email: 'operator2@linkedeye.local' },
    update: {},
    create: {
      email: 'operator2@linkedeye.local',
      password: passwordHash,
      firstName: 'Amit',
      lastName: 'Kumar',
      role: 'ON_CALL',
      status: 'ACTIVE',
      department: 'Infrastructure',
      jobTitle: 'SRE Engineer'
    }
  });

  console.log('✅ Users created');

  // Create Teams
  console.log('Creating teams...');
  const infraTeam = await prisma.team.upsert({
    where: { name: 'Infrastructure Operations' },
    update: {},
    create: {
      name: 'Infrastructure Operations',
      description: 'Server and infrastructure management',
      email: 'infra-ops@linkedeye.local',
      slackChannel: '#infra-ops'
    }
  });

  const nocTeam = await prisma.team.upsert({
    where: { name: 'NOC' },
    update: {},
    create: {
      name: 'NOC',
      description: 'Network Operations Center',
      email: 'noc@linkedeye.local',
      slackChannel: '#noc-alerts'
    }
  });

  const dbaTeam = await prisma.team.upsert({
    where: { name: 'Database Team' },
    update: {},
    create: {
      name: 'Database Team',
      description: 'Database administration and support',
      email: 'dba@linkedeye.local',
      slackChannel: '#dba-team'
    }
  });

  console.log('✅ Teams created');

  // Add team members
  console.log('Adding team members...');
  await prisma.teamMember.upsert({
    where: { teamId_userId: { teamId: infraTeam.id, userId: manager.id } },
    update: {},
    create: { teamId: infraTeam.id, userId: manager.id, role: 'LEAD' }
  });

  await prisma.teamMember.upsert({
    where: { teamId_userId: { teamId: infraTeam.id, userId: operator2.id } },
    update: {},
    create: { teamId: infraTeam.id, userId: operator2.id, role: 'MEMBER' }
  });

  await prisma.teamMember.upsert({
    where: { teamId_userId: { teamId: nocTeam.id, userId: operator1.id } },
    update: {},
    create: { teamId: nocTeam.id, userId: operator1.id, role: 'MEMBER' }
  });

  console.log('✅ Team members added');

  // Create Configuration Items (Assets)
  console.log('Creating configuration items...');
  const server1 = await prisma.configurationItem.upsert({
    where: { id: 'ci-server-1' },
    update: {},
    create: {
      id: 'ci-server-1',
      name: 'prod-app-01.finspot.com',
      type: 'SERVER',
      status: 'LIVE',
      category: 'Production',
      hostname: 'prod-app-01',
      ipAddress: '192.168.1.101',
      os: 'Ubuntu',
      osVersion: '22.04 LTS',
      cpu: '8 vCPU',
      memory: '16GB',
      storage: '500GB SSD',
      location: 'DC-Mumbai',
      dataCenter: 'Mumbai-1',
      prometheusJob: 'node_exporter',
      grafanaDashboard: '/d/server-overview'
    }
  });

  const server2 = await prisma.configurationItem.upsert({
    where: { id: 'ci-server-2' },
    update: {},
    create: {
      id: 'ci-server-2',
      name: 'prod-app-02.finspot.com',
      type: 'SERVER',
      status: 'LIVE',
      category: 'Production',
      hostname: 'prod-app-02',
      ipAddress: '192.168.1.102',
      os: 'Ubuntu',
      osVersion: '22.04 LTS',
      cpu: '8 vCPU',
      memory: '16GB',
      storage: '500GB SSD',
      location: 'DC-Delhi',
      dataCenter: 'Delhi-1'
    }
  });

  const dbServer = await prisma.configurationItem.upsert({
    where: { id: 'ci-db-1' },
    update: {},
    create: {
      id: 'ci-db-1',
      name: 'prod-db-master',
      type: 'DATABASE',
      status: 'LIVE',
      category: 'Production',
      hostname: 'prod-db-master',
      ipAddress: '192.168.1.201',
      os: 'PostgreSQL',
      osVersion: '15.4',
      cpu: '16 vCPU',
      memory: '64GB',
      storage: '2TB NVMe',
      location: 'DC-Mumbai',
      dataCenter: 'Mumbai-1'
    }
  });

  const networkSwitch = await prisma.configurationItem.upsert({
    where: { id: 'ci-switch-1' },
    update: {},
    create: {
      id: 'ci-switch-1',
      name: 'core-switch-01',
      type: 'NETWORK_DEVICE',
      status: 'LIVE',
      category: 'Network',
      hostname: 'core-switch-01',
      ipAddress: '192.168.1.1',
      manufacturer: 'Cisco',
      model: 'Nexus 9300',
      location: 'DC-Mumbai',
      dataCenter: 'Mumbai-1'
    }
  });

  console.log('✅ Configuration items created');

  // Create SLA Definitions
  console.log('Creating SLA definitions...');
  await prisma.sLADefinition.upsert({
    where: { priority: 'P1' },
    update: {},
    create: { name: 'Critical', priority: 'P1', responseTimeMinutes: 15, resolutionTimeMinutes: 60 }
  });

  await prisma.sLADefinition.upsert({
    where: { priority: 'P2' },
    update: {},
    create: { name: 'High', priority: 'P2', responseTimeMinutes: 30, resolutionTimeMinutes: 240 }
  });

  await prisma.sLADefinition.upsert({
    where: { priority: 'P3' },
    update: {},
    create: { name: 'Medium', priority: 'P3', responseTimeMinutes: 120, resolutionTimeMinutes: 480 }
  });

  await prisma.sLADefinition.upsert({
    where: { priority: 'P4' },
    update: {},
    create: { name: 'Low', priority: 'P4', responseTimeMinutes: 480, resolutionTimeMinutes: 1440 }
  });

  console.log('✅ SLA definitions created');

  // Create Sample Incidents
  console.log('Creating sample incidents...');
  const incident1 = await prisma.incident.upsert({
    where: { number: 'INC0000001' },
    update: {},
    create: {
      number: 'INC0000001',
      shortDescription: 'High CPU Usage Alert - prod-app-01.finspot.com (CPU: 91.2%)',
      description: 'Alert triggered from Prometheus. CPU usage exceeded 85% threshold for 5 minutes.',
      state: 'IN_PROGRESS',
      impact: 'HIGH',
      urgency: 'HIGH',
      priority: 'P2',
      category: 'Infrastructure',
      subcategory: 'Server',
      source: 'PROMETHEUS',
      sourceAlertId: 'ALT-001',
      sourceAlertName: 'HighCPUUsage',
      assignedToId: manager.id,
      assignmentGroupId: infraTeam.id,
      configItemId: server1.id,
      createdById: admin.id,
      responseTime: new Date()
    }
  });

  const incident2 = await prisma.incident.upsert({
    where: { number: 'INC0000002' },
    update: {},
    create: {
      number: 'INC0000002',
      shortDescription: 'Database connection timeout',
      description: 'Application reporting intermittent database connection timeouts.',
      state: 'NEW',
      impact: 'MEDIUM',
      urgency: 'HIGH',
      priority: 'P2',
      category: 'Database',
      subcategory: 'Connectivity',
      source: 'MANUAL',
      assignmentGroupId: dbaTeam.id,
      configItemId: dbServer.id,
      createdById: operator1.id
    }
  });

  const incident3 = await prisma.incident.upsert({
    where: { number: 'INC0000003' },
    update: {},
    create: {
      number: 'INC0000003',
      shortDescription: 'Password reset request',
      description: 'User requesting password reset for application access.',
      state: 'RESOLVED',
      impact: 'LOW',
      urgency: 'LOW',
      priority: 'P4',
      category: 'Access',
      subcategory: 'Password',
      source: 'MANUAL',
      assignedToId: operator1.id,
      createdById: operator1.id,
      resolvedAt: new Date(),
      resolutionCode: 'Completed',
      resolutionNotes: 'Password reset completed successfully.'
    }
  });

  console.log('✅ Sample incidents created');

  // Create Sample Changes
  console.log('Creating sample changes...');
  await prisma.change.upsert({
    where: { number: 'CHG0000001' },
    update: {},
    create: {
      number: 'CHG0000001',
      shortDescription: 'Database version upgrade to PostgreSQL 16',
      description: 'Upgrade production database from PostgreSQL 15.4 to 16.1',
      type: 'NORMAL',
      state: 'SCHEDULED',
      riskLevel: 'MEDIUM',
      category: 'Database',
      justification: 'Security patches and performance improvements',
      implementationPlan: '1. Backup database\n2. Stop applications\n3. Upgrade PostgreSQL\n4. Verify data\n5. Restart applications',
      rollbackPlan: 'Restore from backup',
      plannedStartDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      plannedEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000),
      assignedToId: manager.id,
      assignmentGroupId: dbaTeam.id,
      createdById: manager.id
    }
  });

  await prisma.change.upsert({
    where: { number: 'CHG0000002' },
    update: {},
    create: {
      number: 'CHG0000002',
      shortDescription: 'Network switch firmware update',
      description: 'Update core switch firmware to latest version',
      type: 'STANDARD',
      state: 'AUTHORIZE',
      riskLevel: 'LOW',
      category: 'Network',
      plannedStartDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      assignmentGroupId: nocTeam.id,
      createdById: operator1.id
    }
  });

  console.log('✅ Sample changes created');

  // Create Sample Problem
  console.log('Creating sample problems...');
  await prisma.problem.upsert({
    where: { number: 'PRB0000001' },
    update: {},
    create: {
      number: 'PRB0000001',
      shortDescription: 'Recurring CPU spikes on trading servers',
      description: 'Multiple incidents reported for high CPU usage on trading application servers.',
      state: 'ROOT_CAUSE_ANALYSIS',
      priority: 'P2',
      category: 'Infrastructure',
      rootCause: 'Memory leak in trading-engine v2.3.4',
      rootCauseAnalysis: '## Analysis\n\nMemory leak identified in OrderCache class causing excessive garbage collection.\n\n## Evidence\n- Heap dump analysis\n- GC logs showing stop-the-world pauses',
      workaround: 'Schedule daily service restart at 3:00 AM',
      workaroundEffective: true,
      assignedToId: manager.id,
      assignmentGroupId: infraTeam.id,
      createdById: manager.id
    }
  });

  console.log('✅ Sample problems created');

  // Create Integrations
  console.log('Creating integrations...');
  await prisma.integration.upsert({
    where: { id: 'int-prometheus' },
    update: {},
    create: {
      id: 'int-prometheus',
      name: 'Prometheus',
      type: 'PROMETHEUS',
      status: 'ACTIVE',
      config: JSON.stringify({ url: 'http://localhost:9090', scrapeInterval: 30 })
    }
  });

  await prisma.integration.upsert({
    where: { id: 'int-grafana' },
    update: {},
    create: {
      id: 'int-grafana',
      name: 'Grafana',
      type: 'GRAFANA',
      status: 'ACTIVE',
      config: JSON.stringify({ url: 'http://localhost:3000', orgId: 1 })
    }
  });

  await prisma.integration.upsert({
    where: { id: 'int-slack' },
    update: {},
    create: {
      id: 'int-slack',
      name: 'Slack',
      type: 'SLACK',
      status: 'ACTIVE',
      config: JSON.stringify({ webhookUrl: 'https://hooks.slack.com/services/xxx', channel: '#ops-alerts' })
    }
  });

  console.log('✅ Integrations created');

  console.log('\n✨ Database seeding completed!\n');
  console.log('Demo Credentials:');
  console.log('─────────────────');
  console.log('Admin:    admin@linkedeye.local / Password123!');
  console.log('Manager:  manager@linkedeye.local / Password123!');
  console.log('Operator: operator1@linkedeye.local / Password123!');
  console.log('On-Call:  operator2@linkedeye.local / Password123!\n');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
