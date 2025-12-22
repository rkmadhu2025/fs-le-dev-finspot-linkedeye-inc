/**
 * Webhook Routes E2E Tests
 * LinkedEye-FinSpot
 */

const request = require('supertest');
const { app } = require('../src/server');
const {
  prisma,
  createTestUser,
  cleanupTestData,
  disconnect
} = require('./setup');

const API_PREFIX = '/api/v1';

describe('Webhook Routes', () => {
  beforeAll(async () => {
    await cleanupTestData();
    // Create system user for auto-incident creation
    await createTestUser({
      email: 'system@linkedeye.local',
      password: 'system-password',
      firstName: 'System',
      lastName: 'Auto',
      role: 'ADMIN'
    });
  });

  afterAll(async () => {
    await cleanupTestData();
    await disconnect();
  });

  describe('POST /webhooks/alertmanager', () => {
    it('should process Prometheus Alertmanager alerts', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/webhooks/alertmanager`)
        .send({
          alerts: [
            {
              status: 'firing',
              labels: {
                alertname: 'HighMemoryUsage',
                severity: 'warning',
                instance: 'server-01:9100'
              },
              annotations: {
                summary: 'High memory usage detected',
                description: 'Memory usage is above 90%'
              },
              startsAt: new Date().toISOString(),
              fingerprint: `alert-${Date.now()}`
            }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.alertsProcessed).toBe(1);
    });

    it('should auto-create incident for critical alerts', async () => {
      const fingerprint = `critical-${Date.now()}`;

      const res = await request(app)
        .post(`${API_PREFIX}/webhooks/alertmanager`)
        .send({
          alerts: [
            {
              status: 'firing',
              labels: {
                alertname: 'ServerDown',
                severity: 'critical',
                instance: 'prod-server:9100'
              },
              annotations: {
                summary: 'Production server is down',
                description: 'Server not responding to health checks'
              },
              startsAt: new Date().toISOString(),
              fingerprint
            }
          ]
        });

      expect(res.status).toBe(200);

      // Verify incident was created
      const incident = await prisma.incident.findFirst({
        where: { sourceAlertId: fingerprint }
      });
      expect(incident).not.toBeNull();
      expect(incident.priority).toBe('P1');
    });

    it('should resolve alerts', async () => {
      const fingerprint = `resolve-${Date.now()}`;

      // Create firing alert first
      await request(app)
        .post(`${API_PREFIX}/webhooks/alertmanager`)
        .send({
          alerts: [{
            status: 'firing',
            labels: { alertname: 'TestAlert', severity: 'warning' },
            startsAt: new Date().toISOString(),
            fingerprint
          }]
        });

      // Resolve it
      const res = await request(app)
        .post(`${API_PREFIX}/webhooks/alertmanager`)
        .send({
          alerts: [{
            status: 'resolved',
            labels: { alertname: 'TestAlert', severity: 'warning' },
            startsAt: new Date(Date.now() - 60000).toISOString(),
            endsAt: new Date().toISOString(),
            fingerprint
          }]
        });

      expect(res.status).toBe(200);

      // Verify alert is resolved
      const alert = await prisma.alert.findUnique({
        where: { alertId: fingerprint }
      });
      expect(alert.status).toBe('RESOLVED');
    });

    it('should reject invalid payload', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/webhooks/alertmanager`)
        .send({
          invalidPayload: true
        });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /webhooks/grafana', () => {
    it('should process Grafana alerts', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/webhooks/grafana`)
        .send({
          state: 'alerting',
          ruleName: 'CPU Usage High',
          ruleUrl: 'http://grafana/dashboard/1',
          message: 'CPU usage exceeded threshold',
          evalMatches: [
            { metric: 'cpu_usage', value: 95 }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('CPU Usage High');
    });

    it('should handle resolved state', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/webhooks/grafana`)
        .send({
          state: 'ok',
          ruleName: 'Resolved Alert',
          message: 'Alert has been resolved'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('RESOLVED');
    });
  });

  describe('POST /webhooks/pagerduty', () => {
    it('should process PagerDuty webhooks', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/webhooks/pagerduty`)
        .send({
          messages: [
            {
              event: 'incident.trigger',
              incident: {
                title: 'PagerDuty Incident',
                description: 'Something went wrong',
                urgency: 'high'
              }
            }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should handle empty messages', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/webhooks/pagerduty`)
        .send({
          messages: []
        });

      expect(res.status).toBe(200);
    });
  });

  describe('POST /webhooks/generic', () => {
    it('should process generic webhooks', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/webhooks/generic`)
        .send({
          title: 'Custom Alert',
          description: 'Custom monitoring alert',
          severity: 'WARNING',
          source: 'custom-monitor',
          instance: 'app-server-01'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Custom Alert');
      expect(res.body.data.source).toBe('custom-monitor');
    });

    it('should use defaults for missing fields', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/webhooks/generic`)
        .send({
          description: 'Minimal alert'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Generic Alert');
      expect(res.body.data.severity).toBe('INFO');
      expect(res.body.data.source).toBe('webhook');
    });
  });

  describe('POST /webhooks/stackstorm', () => {
    it('should process StackStorm webhooks', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/webhooks/stackstorm`)
        .send({
          trigger: 'custom.event',
          payload: {
            key: 'value',
            action: 'execute'
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
