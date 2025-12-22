/**
 * Helper Utilities
 * LinkedEye-FinSpot
 */

const crypto = require('crypto');

/**
 * Generate unique incident number
 * Format: INC0000001
 */
function generateIncidentNumber(lastNumber) {
  const num = lastNumber ? parseInt(lastNumber.replace('INC', '')) + 1 : 1;
  return `INC${String(num).padStart(7, '0')}`;
}

/**
 * Generate unique change number
 * Format: CHG0000001
 */
function generateChangeNumber(lastNumber) {
  const num = lastNumber ? parseInt(lastNumber.replace('CHG', '')) + 1 : 1;
  return `CHG${String(num).padStart(7, '0')}`;
}

/**
 * Generate unique problem number
 * Format: PRB0000001
 */
function generateProblemNumber(lastNumber) {
  const num = lastNumber ? parseInt(lastNumber.replace('PRB', '')) + 1 : 1;
  return `PRB${String(num).padStart(7, '0')}`;
}

/**
 * Generate unique alert ID
 */
function generateAlertId() {
  return `ALT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Generate unique known error ID
 * Format: KE0000001
 */
function generateKnownErrorId(lastId) {
  const num = lastId ? parseInt(lastId.replace('KE', '')) + 1 : 1;
  return `KE${String(num).padStart(7, '0')}`;
}

/**
 * Calculate priority from impact and urgency
 * Priority Matrix:
 *           | Critical | High | Medium | Low
 * Critical  |   P1     |  P1  |   P2   |  P3
 * High      |   P1     |  P2  |   P2   |  P3
 * Medium    |   P2     |  P2  |   P3   |  P3
 * Low       |   P3     |  P3  |   P3   |  P4
 */
function calculatePriority(impact, urgency) {
  const matrix = {
    CRITICAL: { CRITICAL: 'P1', HIGH: 'P1', MEDIUM: 'P2', LOW: 'P3' },
    HIGH: { CRITICAL: 'P1', HIGH: 'P2', MEDIUM: 'P2', LOW: 'P3' },
    MEDIUM: { CRITICAL: 'P2', HIGH: 'P2', MEDIUM: 'P3', LOW: 'P3' },
    LOW: { CRITICAL: 'P3', HIGH: 'P3', MEDIUM: 'P3', LOW: 'P4' }
  };

  return matrix[impact]?.[urgency] || 'P3';
}

/**
 * Calculate SLA target times based on priority
 * Returns target times in minutes
 */
function calculateSLATargets(priority) {
  const slaMatrix = {
    P1: { response: 15, resolution: 60 },      // 15 min response, 1 hour resolution
    P2: { response: 30, resolution: 240 },     // 30 min response, 4 hours resolution
    P3: { response: 120, resolution: 480 },    // 2 hours response, 8 hours resolution
    P4: { response: 480, resolution: 1440 }    // 8 hours response, 24 hours resolution
  };

  return slaMatrix[priority] || slaMatrix.P3;
}

/**
 * Calculate SLA target datetime
 */
function calculateSLATargetTime(startTime, minutes, businessHoursOnly = true) {
  const start = new Date(startTime);

  if (!businessHoursOnly) {
    return new Date(start.getTime() + minutes * 60 * 1000);
  }

  // Business hours: 9 AM - 6 PM, Mon-Fri
  let remainingMinutes = minutes;
  let current = new Date(start);

  while (remainingMinutes > 0) {
    const dayOfWeek = current.getDay();
    const hour = current.getHours();

    // Skip weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      current.setDate(current.getDate() + 1);
      current.setHours(9, 0, 0, 0);
      continue;
    }

    // Before business hours
    if (hour < 9) {
      current.setHours(9, 0, 0, 0);
      continue;
    }

    // After business hours
    if (hour >= 18) {
      current.setDate(current.getDate() + 1);
      current.setHours(9, 0, 0, 0);
      continue;
    }

    // Within business hours
    const minutesUntilEOD = (18 - hour) * 60 - current.getMinutes();
    const minutesToAdd = Math.min(remainingMinutes, minutesUntilEOD);

    current = new Date(current.getTime() + minutesToAdd * 60 * 1000);
    remainingMinutes -= minutesToAdd;
  }

  return current;
}

/**
 * Format duration in human readable format
 */
function formatDuration(minutes) {
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours < 24) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

/**
 * Calculate time difference in minutes
 */
function getMinutesDifference(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return Math.round((endDate - startDate) / (1000 * 60));
}

/**
 * Paginate results
 */
function paginate(page = 1, limit = 25) {
  const skip = (page - 1) * limit;
  return { skip, take: limit };
}

/**
 * Build pagination response
 */
function paginationResponse(data, total, page, limit) {
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  };
}

/**
 * Sanitize object - remove undefined/null values
 */
function sanitizeObject(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined && v !== null)
  );
}

/**
 * Generate random token
 */
function generateToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  generateIncidentNumber,
  generateChangeNumber,
  generateProblemNumber,
  generateAlertId,
  generateKnownErrorId,
  calculatePriority,
  calculateSLATargets,
  calculateSLATargetTime,
  formatDuration,
  getMinutesDifference,
  paginate,
  paginationResponse,
  sanitizeObject,
  generateToken,
  sleep
};
