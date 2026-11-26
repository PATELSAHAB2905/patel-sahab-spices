import { getDB } from './db';
import { 
  syncRecordToFirestore, 
  syncBatchToFirestore,
  isFirebaseConfigured, 
  getFirebaseConfig 
} from './firebase';
import { logSystemError } from './errorLogger';

// Listeners for sync state updates
const listeners = new Set();
let isSyncing = false;

export function subscribeToSyncStatus(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifySyncStatus(state) {
  listeners.forEach(fn => {
    try {
      fn(state);
    } catch (e) {
      console.error('Sync listener error:', e);
    }
  });
}

/**
 * Queue a record for synchronization
 */
export async function queueSyncRecord(tableName, recordData, action = 'sync') {
  const db = await getDB();
  const queueItem = {
    table: tableName,
    data: recordData,
    action: action,
    status: 'PENDING',
    created_at: new Date().toISOString(),
    attempts: 0,
    last_attempt: null,
    error_message: null
  };

  const id = await db.add('sync_queue', queueItem);

  // If Firebase is configured and online, attempt real-time direct write to Firestore
  if (navigator.onLine) {
    isFirebaseConfigured().then(configured => {
      if (configured) {
        syncRecordToFirestore(tableName, recordData).catch(err => {
          console.warn('Direct Firestore upload deferred to queue:', err.message);
        });
      }
    });

    // Also trigger queue sync
    triggerSync().catch(err => console.log('Auto-sync deferred:', err.message));
  }

  return id;
}

export const queueRecordForSync = queueSyncRecord;

/**
 * Get current sync status overview (Firebase & Offline Queue)
 */
export async function getSyncOverview() {
  const db = await getDB();
  const queue = await db.getAll('sync_queue');
  const pending = queue.filter(q => q.status === 'PENDING').length;
  const failed = queue.filter(q => q.status === 'FAILED').length;
  const synced = queue.filter(q => q.status === 'SYNCED').length;

  const lastFbSyncSetting = await db.get('settings', 'last_successful_firebase_sync');
  const fbConfig = await getFirebaseConfig();
  const hasFirebase = Boolean(fbConfig && fbConfig.projectId && fbConfig.apiKey);

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  let statusText = 'ONLINE';
  if (!isOnline) {
    statusText = 'OFFLINE';
  } else if (!hasFirebase) {
    statusText = 'LOCAL STORAGE (FIREBASE NOT CONFIGURED)';
  } else if (failed > 0) {
    statusText = 'SYNC FAILED';
  } else if (pending > 0) {
    statusText = 'PENDING SYNC';
  } else {
    statusText = 'ALL DATA SYNCED';
  }

  return {
    isOnline,
    isSyncing,
    pendingCount: pending + failed,
    failedCount: failed,
    syncedCount: synced,
    lastSyncTime: lastFbSyncSetting?.value || null,
    hasFirebase,
    firebaseProjectId: fbConfig?.projectId || null,
    statusText
  };
}

/**
 * Process pending sync queue (Syncs directly to Firebase Firestore using batch write chunks)
 */
export async function triggerSync() {
  if (isSyncing) return { message: 'Sync already in progress' };
  if (!navigator.onLine) {
    return { error: 'Device is offline. Records remain saved safely in local storage.' };
  }

  const fbConfigured = await isFirebaseConfigured();
  if (!fbConfigured) {
    isSyncing = false;
    notifySyncStatus({ 
      isSyncing: false, 
      warning: 'Firebase Firestore is running in local offline mode.' 
    });
    return {
      warning: 'Firebase Firestore is running in local offline-first mode. Configure Firebase in Admin Settings to enable Cloud sync.'
    };
  }

  isSyncing = true;
  notifySyncStatus({ isSyncing: true, statusText: 'SYNCING' });

  try {
    const db = await getDB();
    const allQueue = await db.getAll('sync_queue');
    const pendingItems = allQueue.filter(q => q.status === 'PENDING' || q.status === 'FAILED');

    if (pendingItems.length === 0) {
      isSyncing = false;
      notifySyncStatus({ isSyncing: false, statusText: 'ALL DATA SYNCED' });
      return { success: true, count: 0, message: 'All records are already synced.' };
    }

    const now = new Date().toISOString();

    // High performance writeBatch sync chunked into Firestore
    await syncBatchToFirestore(pendingItems.map(item => ({
      table: item.table,
      data: item.data
    })));

    await db.put('settings', {
      key: 'last_successful_firebase_sync',
      value: now,
      updatedAt: now
    });

    // Mark sync_queue records as SYNCED
    const availableStores = ['sync_queue', 'raw_material', 'processing', 'packaging', 'order_sale', 'sales_return', 'powder_recovery', 'system_errors']
      .filter(s => db.objectStoreNames.contains(s));

    const tx = db.transaction(availableStores, 'readwrite');
    for (const item of pendingItems) {
      item.status = 'SYNCED';
      item.synced_at = now;
      item.error_message = null;
      await tx.objectStore('sync_queue').put(item);

      const tableName = item.table.toLowerCase();
      const entryId = item.data.return_id || item.data.recovery_id || item.data.entry_id;
      if (tx.objectStoreNames.contains(tableName) && entryId) {
        const tableStore = tx.objectStore(tableName);
        let idIndex = null;
        if (tableStore.indexNames.contains('entry_id')) idIndex = 'entry_id';
        else if (tableStore.indexNames.contains('return_id')) idIndex = 'return_id';
        else if (tableStore.indexNames.contains('recovery_id')) idIndex = 'recovery_id';

        if (idIndex) {
          const localRecord = await tableStore.index(idIndex).get(entryId);
          if (localRecord) {
            localRecord.synced = true;
            localRecord.synced_at = now;
            await tableStore.put(localRecord);
          }
        }
      }
    }
    await tx.done;

    isSyncing = false;
    notifySyncStatus({ isSyncing: false, statusText: 'ALL DATA SYNCED', lastSyncTime: now });
    return {
      success: true,
      count: pendingItems.length,
      message: `Successfully synchronized ${pendingItems.length} records to Cloud Firestore.`
    };

  } catch (err) {
    console.error('Sync failure:', err);
    try {
      const db = await getDB();
      const allQueue = await db.getAll('sync_queue');
      const pendingItems = allQueue.filter(q => q.status === 'PENDING' || q.status === 'FAILED');
      for (const item of pendingItems) {
        item.attempts = (item.attempts || 0) + 1;
        item.last_attempt = new Date().toISOString();
        item.error_message = err.message;
        if (item.attempts >= 3) {
          item.status = 'FAILED';
        }
        await db.put('sync_queue', item);
      }

      await logSystemError({
        module: 'SYNC',
        description: `Firebase Cloud Sync Error: ${err.message}`,
        severity: 'HIGH',
        errorObj: err,
        metadata: { pendingCount: pendingItems.length }
      });
    } catch (_) {}

    isSyncing = false;
    notifySyncStatus({ isSyncing: false, statusText: 'SYNC FAILED', lastError: err.message });
    throw err;
  }
}

// Window listeners for offline / online transitions
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('Network online detected: triggering automatic cloud sync...');
    notifySyncStatus({ isOnline: true });
    triggerSync().catch(err => console.log('Auto-sync error:', err.message));
  });

  window.addEventListener('offline', () => {
    console.log('Network offline detected');
    notifySyncStatus({ isOnline: false });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      triggerSync().catch(err => console.log('Visibility sync error:', err.message));
    }
  });
}
