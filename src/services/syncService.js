import { getDB } from './db';
import { 
  syncRecordToFirestore, 
  isFirebaseConfigured, 
  getFirebaseConfig 
} from './firebase';

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
  } else if (failed > 0) {
    statusText = 'SYNC FAILED';
  } else if (pending > 0) {
    statusText = 'PENDING SYNC';
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
 * Process pending sync queue (Syncs directly to Firebase Firestore)
 */
export async function triggerSync() {
  if (isSyncing) return { message: 'Sync already in progress' };
  if (!navigator.onLine) {
    return { error: 'Device is offline. Records remain saved safely in local storage.' };
  }

  const fbConfigured = await isFirebaseConfigured();
  if (!fbConfigured) {
    return {
      warning: 'Firebase Firestore is running in local offline-first mode.'
    };
  }

  isSyncing = true;
  notifySyncStatus({ isSyncing: true });

  try {
    const db = await getDB();
    const allQueue = await db.getAll('sync_queue');
    const pendingItems = allQueue.filter(q => q.status === 'PENDING' || q.status === 'FAILED');

    if (pendingItems.length === 0) {
      isSyncing = false;
      notifySyncStatus({ isSyncing: false });
      return { success: true, count: 0, message: 'All records are already synced.' };
    }

    const now = new Date().toISOString();

    for (const item of pendingItems) {
      await syncRecordToFirestore(item.table, item.data);
    }

    await db.put('settings', {
      key: 'last_successful_firebase_sync',
      value: now,
      updatedAt: now
    });

    const tx = db.transaction(['sync_queue', 'raw_material', 'processing', 'packaging', 'order_sale'], 'readwrite');
    for (const item of pendingItems) {
      item.status = 'SYNCED';
      item.synced_at = now;
      item.error_message = null;
      await tx.objectStore('sync_queue').put(item);

      const tableName = item.table.toLowerCase();
      const entryId = item.data.entry_id;
      if (tx.objectStoreNames.contains(tableName) && entryId) {
        const tableStore = tx.objectStore(tableName);
        const index = tableStore.index('entry_id');
        const localRecord = await index.get(entryId);
        if (localRecord) {
          localRecord.synced = true;
          localRecord.synced_at = now;
          await tableStore.put(localRecord);
        }
      }
    }
    await tx.done;

    isSyncing = false;
    notifySyncStatus({ isSyncing: false, lastSyncTime: now });
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
      const pendingItems = allQueue.filter(q => q.status === 'PENDING');
      for (const item of pendingItems) {
        item.status = 'FAILED';
        item.attempts = (item.attempts || 0) + 1;
        item.last_attempt = new Date().toISOString();
        item.error_message = err.message;
        await db.put('sync_queue', item);
      }
    } catch (_) {}

    isSyncing = false;
    notifySyncStatus({ isSyncing: false, lastError: err.message });
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
