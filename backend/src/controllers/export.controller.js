/**
 * Export/Import Controller
 * LinkedEye-FinSpot
 *
 * Production-grade data export and import functionality
 * Supports CSV and Excel formats
 */

const ExcelJS = require('exceljs');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');

// Export field mappings
const INCIDENT_FIELDS = [
  { key: 'number', header: 'Number' },
  { key: 'shortDescription', header: 'Short Description' },
  { key: 'description', header: 'Description' },
  { key: 'state', header: 'State' },
  { key: 'priority', header: 'Priority' },
  { key: 'impact', header: 'Impact' },
  { key: 'urgency', header: 'Urgency' },
  { key: 'category', header: 'Category' },
  { key: 'subcategory', header: 'Subcategory' },
  { key: 'assignedTo', header: 'Assigned To' },
  { key: 'assignmentGroup', header: 'Assignment Group' },
  { key: 'createdBy', header: 'Created By' },
  { key: 'source', header: 'Source' },
  { key: 'slaBreached', header: 'SLA Breached' },
  { key: 'resolutionCode', header: 'Resolution Code' },
  { key: 'resolutionNotes', header: 'Resolution Notes' },
  { key: 'createdAt', header: 'Created At' },
  { key: 'updatedAt', header: 'Updated At' },
  { key: 'resolvedAt', header: 'Resolved At' },
  { key: 'closedAt', header: 'Closed At' }
];

const CHANGE_FIELDS = [
  { key: 'number', header: 'Number' },
  { key: 'shortDescription', header: 'Short Description' },
  { key: 'description', header: 'Description' },
  { key: 'type', header: 'Type' },
  { key: 'state', header: 'State' },
  { key: 'riskLevel', header: 'Risk Level' },
  { key: 'category', header: 'Category' },
  { key: 'assignedTo', header: 'Assigned To' },
  { key: 'createdBy', header: 'Created By' },
  { key: 'plannedStartDate', header: 'Planned Start' },
  { key: 'plannedEndDate', header: 'Planned End' },
  { key: 'actualStartDate', header: 'Actual Start' },
  { key: 'actualEndDate', header: 'Actual End' },
  { key: 'createdAt', header: 'Created At' },
  { key: 'updatedAt', header: 'Updated At' }
];

const ASSET_FIELDS = [
  { key: 'name', header: 'Name' },
  { key: 'type', header: 'Type' },
  { key: 'status', header: 'Status' },
  { key: 'category', header: 'Category' },
  { key: 'description', header: 'Description' },
  { key: 'serialNumber', header: 'Serial Number' },
  { key: 'assetTag', header: 'Asset Tag' },
  { key: 'manufacturer', header: 'Manufacturer' },
  { key: 'model', header: 'Model' },
  { key: 'location', header: 'Location' },
  { key: 'ipAddress', header: 'IP Address' },
  { key: 'hostname', header: 'Hostname' },
  { key: 'os', header: 'Operating System' },
  { key: 'osVersion', header: 'OS Version' },
  { key: 'createdAt', header: 'Created At' }
];

/**
 * Export incidents to CSV
 * GET /api/v1/incidents/export?format=csv
 */
exports.exportIncidents = async (req, res) => {
  try {
    const { format = 'csv', state, priority, dateFrom, dateTo } = req.query;

    // Build filter
    const where = {};
    if (state) where.state = state;
    if (priority) where.priority = priority;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    // Fetch incidents
    const incidents = await prisma.incident.findMany({
      where,
      include: {
        assignedTo: { select: { firstName: true, lastName: true, email: true } },
        assignmentGroup: { select: { name: true } },
        createdBy: { select: { firstName: true, lastName: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 10000 // Limit to 10k records
    });

    // Transform data
    const data = incidents.map(inc => ({
      number: inc.number,
      shortDescription: inc.shortDescription,
      description: inc.description || '',
      state: inc.state,
      priority: inc.priority,
      impact: inc.impact,
      urgency: inc.urgency,
      category: inc.category || '',
      subcategory: inc.subcategory || '',
      assignedTo: inc.assignedTo ? `${inc.assignedTo.firstName} ${inc.assignedTo.lastName}` : '',
      assignmentGroup: inc.assignmentGroup?.name || '',
      createdBy: inc.createdBy ? `${inc.createdBy.firstName} ${inc.createdBy.lastName}` : '',
      source: inc.source,
      slaBreached: inc.slaBreached ? 'Yes' : 'No',
      resolutionCode: inc.resolutionCode || '',
      resolutionNotes: inc.resolutionNotes || '',
      createdAt: inc.createdAt?.toISOString() || '',
      updatedAt: inc.updatedAt?.toISOString() || '',
      resolvedAt: inc.resolvedAt?.toISOString() || '',
      closedAt: inc.closedAt?.toISOString() || ''
    }));

    if (format === 'xlsx') {
      const buffer = await generateExcel(data, INCIDENT_FIELDS, 'Incidents');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=incidents-${Date.now()}.xlsx`);
      return res.send(buffer);
    }

    // Default to CSV
    const csv = generateCSV(data, INCIDENT_FIELDS);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=incidents-${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    logger.error('Export incidents error:', error);
    res.status(500).json({
      success: false,
      error: 'Export failed'
    });
  }
};

/**
 * Export changes to CSV/Excel
 * GET /api/v1/changes/export
 */
exports.exportChanges = async (req, res) => {
  try {
    const { format = 'csv', state, type, dateFrom, dateTo } = req.query;

    const where = {};
    if (state) where.state = state;
    if (type) where.type = type;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const changes = await prisma.change.findMany({
      where,
      include: {
        assignedTo: { select: { firstName: true, lastName: true } },
        createdBy: { select: { firstName: true, lastName: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 10000
    });

    const data = changes.map(chg => ({
      number: chg.number,
      shortDescription: chg.shortDescription,
      description: chg.description || '',
      type: chg.type,
      state: chg.state,
      riskLevel: chg.riskLevel,
      category: chg.category || '',
      assignedTo: chg.assignedTo ? `${chg.assignedTo.firstName} ${chg.assignedTo.lastName}` : '',
      createdBy: chg.createdBy ? `${chg.createdBy.firstName} ${chg.createdBy.lastName}` : '',
      plannedStartDate: chg.plannedStartDate?.toISOString() || '',
      plannedEndDate: chg.plannedEndDate?.toISOString() || '',
      actualStartDate: chg.actualStartDate?.toISOString() || '',
      actualEndDate: chg.actualEndDate?.toISOString() || '',
      createdAt: chg.createdAt?.toISOString() || '',
      updatedAt: chg.updatedAt?.toISOString() || ''
    }));

    if (format === 'xlsx') {
      const buffer = await generateExcel(data, CHANGE_FIELDS, 'Changes');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=changes-${Date.now()}.xlsx`);
      return res.send(buffer);
    }

    const csv = generateCSV(data, CHANGE_FIELDS);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=changes-${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    logger.error('Export changes error:', error);
    res.status(500).json({
      success: false,
      error: 'Export failed'
    });
  }
};

/**
 * Export assets to CSV/Excel
 * GET /api/v1/assets/export
 */
exports.exportAssets = async (req, res) => {
  try {
    const { format = 'csv', type, status } = req.query;

    const where = {};
    if (type) where.type = type;
    if (status) where.status = status;

    const assets = await prisma.configurationItem.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 10000
    });

    const data = assets.map(asset => ({
      name: asset.name,
      type: asset.type,
      status: asset.status,
      category: asset.category || '',
      description: asset.description || '',
      serialNumber: asset.serialNumber || '',
      assetTag: asset.assetTag || '',
      manufacturer: asset.manufacturer || '',
      model: asset.model || '',
      location: asset.location || '',
      ipAddress: asset.ipAddress || '',
      hostname: asset.hostname || '',
      os: asset.os || '',
      osVersion: asset.osVersion || '',
      createdAt: asset.createdAt?.toISOString() || ''
    }));

    if (format === 'xlsx') {
      const buffer = await generateExcel(data, ASSET_FIELDS, 'Assets');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=assets-${Date.now()}.xlsx`);
      return res.send(buffer);
    }

    const csv = generateCSV(data, ASSET_FIELDS);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=assets-${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    logger.error('Export assets error:', error);
    res.status(500).json({
      success: false,
      error: 'Export failed'
    });
  }
};

/**
 * Import assets from CSV
 * POST /api/v1/assets/import
 */
exports.importAssets = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const content = req.file.buffer.toString('utf-8');
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    const results = {
      created: 0,
      updated: 0,
      failed: 0,
      errors: []
    };

    for (const record of records) {
      try {
        // Map CSV columns to model fields
        const assetData = {
          name: record['Name'] || record['name'],
          type: record['Type'] || record['type'] || 'SERVER',
          status: record['Status'] || record['status'] || 'LIVE',
          category: record['Category'] || record['category'],
          description: record['Description'] || record['description'],
          serialNumber: record['Serial Number'] || record['serialNumber'],
          assetTag: record['Asset Tag'] || record['assetTag'],
          manufacturer: record['Manufacturer'] || record['manufacturer'],
          model: record['Model'] || record['model'],
          location: record['Location'] || record['location'],
          ipAddress: record['IP Address'] || record['ipAddress'],
          hostname: record['Hostname'] || record['hostname'],
          os: record['Operating System'] || record['os'],
          osVersion: record['OS Version'] || record['osVersion']
        };

        if (!assetData.name) {
          results.failed++;
          results.errors.push({ row: records.indexOf(record) + 2, error: 'Name is required' });
          continue;
        }

        // Check if asset exists (by name or asset tag)
        const existing = await prisma.configurationItem.findFirst({
          where: {
            OR: [
              { name: assetData.name },
              assetData.assetTag ? { assetTag: assetData.assetTag } : {}
            ]
          }
        });

        if (existing) {
          await prisma.configurationItem.update({
            where: { id: existing.id },
            data: assetData
          });
          results.updated++;
        } else {
          await prisma.configurationItem.create({
            data: assetData
          });
          results.created++;
        }
      } catch (error) {
        results.failed++;
        results.errors.push({ row: records.indexOf(record) + 2, error: error.message });
      }
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'IMPORT_ASSETS',
        entityType: 'ConfigurationItem',
        entityId: 'bulk',
        newData: JSON.stringify(results)
      }
    });

    logger.info(`Asset import: ${results.created} created, ${results.updated} updated, ${results.failed} failed`);

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    logger.error('Import assets error:', error);
    res.status(500).json({
      success: false,
      error: 'Import failed: ' + error.message
    });
  }
};

/**
 * Get export template
 * GET /api/v1/export/template/:type
 */
exports.getTemplate = async (req, res) => {
  try {
    const { type } = req.params;
    const { format = 'csv' } = req.query;

    let fields;
    let sampleData = [];

    switch (type) {
      case 'incidents':
        fields = INCIDENT_FIELDS;
        sampleData = [{
          number: 'INC0000001',
          shortDescription: 'Sample incident',
          state: 'NEW',
          priority: 'P3',
          impact: 'MEDIUM',
          urgency: 'MEDIUM'
        }];
        break;

      case 'changes':
        fields = CHANGE_FIELDS;
        sampleData = [{
          number: 'CHG0000001',
          shortDescription: 'Sample change',
          type: 'NORMAL',
          state: 'NEW',
          riskLevel: 'MEDIUM'
        }];
        break;

      case 'assets':
        fields = ASSET_FIELDS;
        sampleData = [{
          name: 'server-001',
          type: 'SERVER',
          status: 'LIVE',
          ipAddress: '10.0.0.1',
          hostname: 'server-001.example.com'
        }];
        break;

      default:
        return res.status(400).json({
          success: false,
          error: 'Unknown template type'
        });
    }

    if (format === 'xlsx') {
      const buffer = await generateExcel(sampleData, fields, `${type}_template`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${type}-template.xlsx`);
      return res.send(buffer);
    }

    const csv = generateCSV(sampleData, fields);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${type}-template.csv`);
    res.send(csv);
  } catch (error) {
    logger.error('Get template error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate template'
    });
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate CSV from data
 */
function generateCSV(data, fields) {
  const headers = fields.map(f => f.header);
  const rows = data.map(row => fields.map(f => row[f.key] || ''));

  return stringify([headers, ...rows]);
}

/**
 * Generate Excel workbook from data
 */
async function generateExcel(data, fields, sheetName) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'LinkedEye-FinSpot';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(sheetName);

  // Add headers with styling
  worksheet.columns = fields.map(f => ({
    header: f.header,
    key: f.key,
    width: 20
  }));

  // Style header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1A56DB' }
  };
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  // Add data rows
  data.forEach(row => {
    worksheet.addRow(row);
  });

  // Add filters
  worksheet.autoFilter = {
    from: 'A1',
    to: `${String.fromCharCode(64 + fields.length)}1`
  };

  return workbook.xlsx.writeBuffer();
}
