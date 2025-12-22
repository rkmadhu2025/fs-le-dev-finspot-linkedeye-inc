/**
 * ServiceNow Integration Service
 * LinkedEye-FinSpot
 * 
 * Handles bi-directional synchronization between local incidents
 * and a ServiceNow instance.
 */

const axios = require('axios');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');

class ServiceNowService {
    /**
     * Get ServiceNow integration configuration
     */
    async getConfig() {
        const integration = await prisma.integration.findFirst({
            where: { type: 'SERVICENOW' }
        });

        if (!integration || integration.status !== 'ACTIVE') {
            return null;
        }

        try {
            return JSON.parse(integration.config || '{}');
        } catch (error) {
            logger.error('Failed to parse ServiceNow config:', error);
            return null;
        }
    }

    /**
     * Helper to create Axios instance for ServiceNow
     */
    async getClient() {
        const config = await this.getConfig();
        if (!config || !config.url || !config.username || !config.password) {
            throw new Error('ServiceNow integration not configured or inactive');
        }

        // Basic Auth
        const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');

        return axios.create({
            baseURL: config.url,
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            timeout: 10000
        });
    }

    /**
     * Test connection to ServiceNow
     */
    async testConnection() {
        try {
            const client = await this.getClient();
            // Test by fetching a single record from the incident table (limit 1)
            const response = await client.get('/api/now/table/incident', {
                params: { sysparm_limit: 1 }
            });

            return {
                success: true,
                message: 'Connected successfully',
                latency: response.headers['server-timing'] || 'N/A'
            };
        } catch (error) {
            logger.error('ServiceNow test connection failed:', error.message);
            return {
                success: false,
                error: error.response?.data?.error?.message || error.message
            };
        }
    }

    /**
     * Sync a local incident to ServiceNow (Push)
     * This is typically called after a local creation or update.
     */
    async pushIncident(incidentId) {
        try {
            const config = await this.getConfig();
            if (!config) return;

            const incident = await prisma.incident.findUnique({
                where: { id: incidentId },
                include: { assignedTo: true }
            });

            if (!incident) return;

            const client = await this.getClient();

            const payload = {
                short_description: incident.shortDescription,
                description: incident.description,
                impact: this.mapLocalToSnowImpact(incident.impact),
                urgency: this.mapLocalToSnowUrgency(incident.urgency),
                state: this.mapLocalToSnowState(incident.state),
                work_notes: `Synced from LinkedEye-FinSpot. Local ID: ${incident.number}`
            };

            // If already linked (e.g. sourceAlertId stores ServiceNow sys_id or similar)
            // For now, lets assume we store ServiceNow Sys ID in sourceAlertId if synced
            // Or we could add a dedicated 'external_id' field to Incident model (not in schema yet)
            // Since schema shouldn't be changed easily, lets check if we can use sourceAlertId or if we should add a table for mapping.

            // Perform outbound call
            logger.info(`Pushing incident ${incident.number} to ServiceNow...`);

            try {
                const response = await client.post('/api/now/table/incident', payload);
                const snowIncident = response.data.result;

                logger.info(`Successfully pushed incident ${incident.number} to ServiceNow as ${snowIncident.number}`);

                // Store ServiceNow ID/Number in sourceAlertId to track linkage
                await prisma.incident.update({
                    where: { id: incident.id },
                    data: {
                        sourceAlertId: snowIncident.sys_id,
                        sourceAlertName: snowIncident.number
                    }
                });

                return true;
            } catch (err) {
                logger.error(`ServiceNow API Call failed: ${err.message}`);
                throw err;
            }
        } catch (error) {
            logger.error(`Error pushing incident ${incidentId} to ServiceNow:`, error.message);
            return false;
        }
    }

    /**
     * Pull incidents from ServiceNow (Fetch)
     */
    async pullIncidents() {
        try {
            const config = await this.getConfig();
            if (!config) return { success: false, error: 'Not configured' };

            const client = await this.getClient();

            // Fetch recent incidents
            const response = await client.get('/api/now/table/incident', {
                params: {
                    sysparm_limit: 10,
                    sysparm_query: 'active=true^ORDERBYDESCsys_created_on'
                }
            });

            const snowIncidents = response.data.result;
            logger.info(`Pulled ${snowIncidents.length} incidents from ServiceNow`);

            // Sync to local database
            for (const snowInc of snowIncidents) {
                await this.syncToLocal(snowInc);
            }

            await prisma.integration.update({
                where: { id: (await prisma.integration.findFirst({ where: { type: 'SERVICENOW' } })).id },
                data: { lastSyncAt: new Date(), syncStatus: 'SUCCESS' }
            });

            return { success: true, count: snowIncidents.length };
        } catch (error) {
            logger.error('ServiceNow pull failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Sync single ServiceNow incident to local DB
     */
    async syncToLocal(snowInc) {
        try {
            // Check if already exists in local DB
            // We can use the ServiceNow 'number' (e.g. INC0000001) or sys_id
            // Let's assume we match by number for now, but in prod sys_id is better.
            const existing = await prisma.incident.findUnique({
                where: { number: snowInc.number }
            });

            if (existing) {
                // Update existing if needed
                // For simplicity, only update state if it changed
                const newState = this.mapSnowToLocalState(snowInc.state);
                if (existing.state !== newState) {
                    await prisma.incident.update({
                        where: { id: existing.id },
                        data: {
                            state: newState,
                            updatedAt: new Date()
                        }
                    });

                    await prisma.activity.create({
                        data: {
                            incidentId: existing.id,
                            action: 'UPDATED',
                            description: `State updated from ServiceNow sync: ${existing.state} → ${newState}`
                        }
                    });
                }
            } else {
                // Create new local incident
                // We need a creator ID, let's use the 'admin' user or a system user
                const systemUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });

                await prisma.incident.create({
                    data: {
                        number: snowInc.number,
                        shortDescription: snowInc.short_description || 'ServiceNow Sync',
                        description: snowInc.description || '',
                        state: this.mapSnowToLocalState(snowInc.state),
                        impact: this.mapSnowToLocalImpact(snowInc.impact),
                        urgency: this.mapSnowToLocalUrgency(snowInc.urgency),
                        priority: `P${snowInc.priority || '3'}`,
                        createdById: systemUser.id,
                        source: 'SERVICENOW',
                        createdAt: new Date(snowInc.sys_created_on)
                    }
                });
            }
        } catch (error) {
            logger.error(`Error syncing ServiceNow incident ${snowInc.number} to local:`, error.message);
        }
    }

    // --- Mapping Helpers ---

    mapSnowToLocalState(snowState) {
        // ServiceNow States: 1=New, 2=In Progress, 3=On Hold, 6=Resolved, 7=Closed, 8=Canceled
        const mapping = {
            '1': 'NEW',
            '2': 'IN_PROGRESS',
            '3': 'ON_HOLD',
            '6': 'RESOLVED',
            '7': 'CLOSED',
            '8': 'CANCELLED'
        };
        return mapping[snowState] || 'NEW';
    }

    mapLocalToSnowState(localState) {
        const mapping = {
            'NEW': '1',
            'IN_PROGRESS': '2',
            'ON_HOLD': '3',
            'RESOLVED': '6',
            'CLOSED': '7',
            'CANCELLED': '8'
        };
        return mapping[localState] || '1';
    }

    mapSnowToLocalImpact(snowImpact) {
        const mapping = { '1': 'CRITICAL', '2': 'HIGH', '3': 'MEDIUM', '4': 'LOW' };
        return mapping[snowImpact] || 'MEDIUM';
    }

    mapLocalToSnowImpact(localImpact) {
        const mapping = { 'CRITICAL': '1', 'HIGH': '2', 'MEDIUM': '3', 'LOW': '4' };
        return mapping[localImpact] || '3';
    }

    mapSnowToLocalUrgency(snowUrgency) {
        const mapping = { '1': 'CRITICAL', '2': 'HIGH', '3': 'MEDIUM', '4': 'LOW' };
        return mapping[snowUrgency] || 'MEDIUM';
    }

    mapLocalToSnowUrgency(localUrgency) {
        const mapping = { 'CRITICAL': '1', 'HIGH': '2', 'MEDIUM': '3', 'LOW': '4' };
        return mapping[localUrgency] || '3';
    }
}

module.exports = new ServiceNowService();
