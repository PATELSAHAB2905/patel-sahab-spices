import { getDB } from './db.js';
import { queueRecordForSync } from './syncService.js';

/**
 * Generate unique Error ID: ERR-YYYYMMDD-XXXX
 */
function generateErrorId() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ERR-${y}${m}${day}-${rand}`;
}

/**
 * Log a system error to IndexedDB and queue for sync
 * @param {Object} params
 * @param {string} params.module - 'SYNC' | 'DATABASE' | 'STOCK' | 'AUTH' | 'REVERSAL' | 'PACKAGING' | 'ORDER' | 'RETURN'
 * @param {string} params.description - Human readable error message
 * @param {'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'} [params.severity='MEDIUM']
 * @param {Error|any} [params.errorObj] - Optional raw error object or stack
 * @param {Object} [params.metadata] - Contextual data (e.g., employeeId, recordId)
 */
export async function logSystemError({
  module = 'SYSTEM',
  description,
  severity = 'MEDIUM',
  errorObj = null,
  metadata = {}
}) {
  try {
    const db = await getDB();
    const errorRecord = {
      error_id: generateErrorId(),
      timestamp: new Date().toISOString(),
      module: String(module).toUpperCase(),
      description: description || (errorObj ? errorObj.message : 'Unknown system error'),
      stack: errorObj && errorObj.stack ? String(errorObj.stack).substring(0, 1000) : null,
      severity: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severity) ? severity : 'MEDIUM',
      status: 'OPEN',
      resolution_notes: '',
      resolved_at: null,
      resolved_by: null,
      metadata: metadata || {},
      synced: false
    };

    const id = await db.add('system_errors', errorRecord);
    errorRecord.id = id;

    // Queue for sync to Firestore if possible
    try {
      await queueRecordForSync('system_errors', 'CREATE', errorRecord);
    } catch (syncErr) {
      console.warn('Could not queue error log for sync:', syncErr);
    }

    console.error(`[SYSTEM_ERROR][${errorRecord.severity}][${errorRecord.module}] ${errorRecord.description}`);
    return errorRecord;
  } catch (err) {
    console.error('Failed to log system error to DB:', err);
    return null;
  }
}

/**
 * Fetch all system errors sorted by timestamp descending
 */
export async function getSystemErrors() {
  try {
    const db = await getDB();
    const errors = await db.getAll('system_errors');
    return errors.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (err) {
    console.error('Failed to get system errors:', err);
    return [];
  }
}

/**
 * Mark a system error as resolved
 * @param {string} errorId 
 * @param {string} resolutionNotes 
 * @param {string} adminName 
 */
export async function resolveSystemError(errorId, resolutionNotes, adminName = 'Admin') {
  try {
    const db = await getDB();
    const all = await db.getAll('system_errors');
    const record = all.find(e => e.error_id === errorId || e.id === errorId);
    if (!record) {
      throw new Error(`Error record not found: ${errorId}`);
    }

    record.status = 'RESOLVED';
    record.resolution_notes = resolutionNotes || 'Resolved by administrator';
    record.resolved_at = new Date().toISOString();
    record.resolved_by = adminName;
    record.synced = false;

    await db.put('system_errors', record);

    try {
      await queueRecordForSync('system_errors', 'UPDATE', record);
    } catch (syncErr) {
      console.warn('Could not queue resolved error for sync:', syncErr);
    }

    return record;
  } catch (err) {
    console.error('Failed to resolve system error:', err);
    throw err;
  }
}

/**
 * Get system health status metrics
 */
export async function getSystemHealthSummary() {
  try {
    const db = await getDB();
    const errors = await db.getAll('system_errors');
    const syncQueue = await db.getAll('sync_queue');
    const lastSyncSetting = await db.get('settings', 'last_successful_sync');

    const openErrors = errors.filter(e => e.status === 'OPEN');
    const resolvedErrors = errors.filter(e => e.status === 'RESOLVED');
    const pendingSync = syncQueue.filter(q => q.status === 'PENDING' || q.status === 'FAILED');

    return {
      database_status: 'HEALTHY',
      total_errors: errors.length,
      open_errors: openErrors.length,
      resolved_errors: resolvedErrors.length,
      critical_open: openErrors.filter(e => e.severity === 'CRITICAL').length,
      pending_sync_count: pendingSync.length,
      last_sync_time: lastSyncSetting ? lastSyncSetting.value : null
    };
  } catch (err) {
    console.error('Failed to get system health summary:', err);
    return {
      database_status: 'DEGRADED',
      total_errors: 0,
      open_errors: 0,
      resolved_errors: 0,
      critical_open: 0,
      pending_sync_count: 0,
      last_sync_time: null
    };
  }
}
