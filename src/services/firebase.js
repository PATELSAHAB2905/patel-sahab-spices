import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  collection, 
  deleteDoc, 
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { getDB } from './db.js';

let firebaseApp = null;
let firestoreDb = null;

/**
 * Default fallback env configuration
 */
export function getEnvFirebaseConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  };
}

/**
 * Get current Firebase configuration (from IndexedDB settings or .env)
 */
export async function getFirebaseConfig() {
  try {
    const db = await getDB();
    const setting = await db.get('settings', 'firebase_config');
    if (setting && setting.value && setting.value.projectId) {
      return setting.value;
    }
  } catch (err) {
    console.warn('Could not read firebase_config from db:', err);
  }

  return getEnvFirebaseConfig();
}

/**
 * Save Firebase configuration to IndexedDB settings
 */
export async function saveFirebaseConfig(config) {
  const db = await getDB();
  const cleaned = {
    apiKey: (config.apiKey || '').trim(),
    authDomain: (config.authDomain || '').trim(),
    projectId: (config.projectId || '').trim(),
    storageBucket: (config.storageBucket || '').trim(),
    messagingSenderId: (config.messagingSenderId || '').trim(),
    appId: (config.appId || '').trim(),
  };

  await db.put('settings', {
    key: 'firebase_config',
    value: cleaned,
    updated_at: new Date().toISOString()
  });

  // Re-initialize with new config
  return initFirebase(cleaned);
}

/**
 * Parse raw Firebase config text (e.g. pasted from Firebase Console)
 */
export function parseFirebaseConfigText(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;

  try {
    // If it's already pure JSON
    if (rawText.trim().startsWith('{') && rawText.trim().endsWith('}')) {
      const parsed = JSON.parse(rawText);
      if (parsed.projectId || parsed.apiKey) return parsed;
    }
  } catch (e) {
    // Not pure JSON, continue regex matching
  }

  // Regex extract common Firebase properties
  const extract = (key) => {
    const regex = new RegExp(`${key}['"\\s]*:['"\\s]*([^'",;\\n}]+)`, 'i');
    const match = rawText.match(regex);
    return match ? match[1].trim().replace(/['"]/g, '') : '';
  };

  const config = {
    apiKey: extract('apiKey'),
    authDomain: extract('authDomain'),
    projectId: extract('projectId'),
    storageBucket: extract('storageBucket'),
    messagingSenderId: extract('messagingSenderId'),
    appId: extract('appId')
  };

  if (config.apiKey || config.projectId) {
    return config;
  }

  return null;
}

/**
 * Initialize Firebase App & Firestore
 */
export async function initFirebase(customConfig = null) {
  const config = customConfig || (await getFirebaseConfig());

  if (!config || !config.apiKey || !config.projectId) {
    return { initialized: false, error: 'Firebase config missing (apiKey or projectId not set)' };
  }

  try {
    if (getApps().length === 0) {
      firebaseApp = initializeApp(config);
    } else {
      firebaseApp = getApp();
    }

    firestoreDb = getFirestore(firebaseApp);
    return { initialized: true, app: firebaseApp, db: firestoreDb };
  } catch (err) {
    console.error('Failed to initialize Firebase:', err);
    return { initialized: false, error: err.message };
  }
}

/**
 * Check if Firebase is currently configured
 */
export async function isFirebaseConfigured() {
  const config = await getFirebaseConfig();
  return Boolean(config && config.apiKey && config.projectId);
}

/**
 * Test Firebase Connection (Ping Firestore test collection)
 */
export async function testFirebaseConnection(customConfig = null) {
  const initRes = await initFirebase(customConfig);
  if (!initRes.initialized) {
    throw new Error(initRes.error || 'Firebase could not be initialized.');
  }

  const db = initRes.db;
  const testId = `ping_${Date.now()}`;
  const testRef = doc(db, '_connection_test', testId);

  // 1. Write test doc
  await setDoc(testRef, {
    ping: 'Patel Sahab Spices Firestore Test',
    timestamp: serverTimestamp(),
    app: 'patel-sahab-spices'
  });

  // 2. Read test doc
  const snap = await getDoc(testRef);
  if (!snap.exists()) {
    throw new Error('Test document could not be read back from Firestore.');
  }

  // 3. Clean up test doc
  try {
    await deleteDoc(testRef);
  } catch (delErr) {
    // Non-fatal if delete fails
  }

  const dbLocal = await getDB();
  await dbLocal.put('settings', {
    key: 'last_successful_firebase_sync',
    value: new Date().toISOString()
  });

  return {
    success: true,
    message: `Connected successfully to Firebase Project "${customConfig?.projectId || (await getFirebaseConfig()).projectId}"!`
  };
}

/**
 * Map table name to Firestore collection
 */
function getCollectionName(tableName) {
  const map = {
    'RAW_MATERIAL': 'raw_material',
    'PROCESSING': 'processing',
    'PACKAGING': 'packaging',
    'ORDER_SALE': 'order_sale',
    'raw_material': 'raw_material',
    'processing': 'processing',
    'packaging': 'packaging',
    'order_sale': 'order_sale',
    'products': 'products',
    'employees': 'employees',
    'audit_logs': 'audit_logs'
  };
  return map[tableName] || tableName.toLowerCase();
}

/**
 * Sync single record to Firestore
 */
export async function syncRecordToFirestore(tableName, record) {
  const initRes = await initFirebase();
  if (!initRes.initialized) return { success: false, skipped: true, reason: 'Firebase not configured' };

  const db = initRes.db;
  const collectionName = getCollectionName(tableName);
  const docId = String(record.entry_id || record.id || record.order_id || `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);

  const docRef = doc(db, collectionName, docId);
  await setDoc(docRef, {
    ...record,
    _synced_at: serverTimestamp()
  }, { merge: true });

  return { success: true, docId, collection: collectionName };
}

/**
 * Full Sync from IndexedDB to Firestore
 */
export async function syncAllLocalDataToFirestore(onProgress = null) {
  const initRes = await initFirebase();
  if (!initRes.initialized) {
    throw new Error(initRes.error || 'Firebase is not configured.');
  }

  const db = initRes.db;
  const localDb = await getDB();

  const collectionsToSync = [
    { name: 'raw_material', store: 'raw_material', idField: 'entry_id' },
    { name: 'processing', store: 'processing', idField: 'entry_id' },
    { name: 'packaging', store: 'packaging', idField: 'entry_id' },
    { name: 'order_sale', store: 'order_sale', idField: 'entry_id' },
    { name: 'products', store: 'products', idField: 'id' },
    { name: 'employees', store: 'employees', idField: 'id' }
  ];

  let totalUploaded = 0;
  const results = {};

  for (const col of collectionsToSync) {
    const items = await localDb.getAll(col.store);
    results[col.name] = items.length;

    if (items.length === 0) continue;

    // Batch writes (max 500 per batch in Firestore)
    const chunkSize = 400;
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const batch = writeBatch(db);

      chunk.forEach(item => {
        const docId = String(item[col.idField] || item.entry_id || item.id || Date.now());
        const ref = doc(db, col.name, docId);
        batch.set(ref, {
          ...item,
          _cloud_synced_at: new Date().toISOString()
        }, { merge: true });
      });

      await batch.commit();
      totalUploaded += chunk.length;

      if (onProgress) {
        onProgress({
          collection: col.name,
          currentBatch: chunk.length,
          totalUploaded
        });
      }
    }
  }

  await localDb.put('settings', {
    key: 'last_successful_firebase_sync',
    value: new Date().toISOString()
  });

  return {
    success: true,
    totalUploaded,
    breakdown: results
  };
}

/**
 * Pull all data from Firestore down to local IndexedDB (Cloud Restore)
 */
export async function pullDataFromFirestore(onProgress = null) {
  const initRes = await initFirebase();
  if (!initRes.initialized) {
    throw new Error(initRes.error || 'Firebase is not configured.');
  }

  const db = initRes.db;
  const localDb = await getDB();

  const collectionsToPull = [
    { name: 'raw_material', store: 'raw_material' },
    { name: 'processing', store: 'processing' },
    { name: 'packaging', store: 'packaging' },
    { name: 'order_sale', store: 'order_sale' },
    { name: 'products', store: 'products' },
    { name: 'employees', store: 'employees' }
  ];

  let totalDownloaded = 0;
  const results = {};

  for (const col of collectionsToPull) {
    const colRef = collection(db, col.name);
    const snap = await getDocs(colRef);
    results[col.name] = snap.size;

    const tx = localDb.transaction(col.store, 'readwrite');
    snap.forEach(docSnap => {
      const data = docSnap.data();
      delete data._synced_at;
      delete data._cloud_synced_at;
      tx.store.put(data);
      totalDownloaded++;
    });
    await tx.done;

    if (onProgress) {
      onProgress({
        collection: col.name,
        downloaded: snap.size,
        totalDownloaded
      });
    }
  }

  return {
    success: true,
    totalDownloaded,
    breakdown: results
  };
}

/**
 * Format number in Indian Number System (e.g. 1,00,000.00)
 */
export function formatIndian(val, decimals = 2) {
  if (val === null || val === undefined || isNaN(val)) return '0';
  const num = Number(val);
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(num);
}

/**
 * Format integer in Indian Number System (e.g. 10,000 packets)
 */
export function formatIndianInt(val) {
  if (val === null || val === undefined || isNaN(val)) return '0';
  const num = Math.round(Number(val));
  return new Intl.NumberFormat('en-IN').format(num);
}

/**
 * Fetch Live Factory Stock Overview from Firebase Firestore (with local IndexedDB fallback)
 */
export async function fetchFirebaseDashboardData() {
  let isFromFirebase = false;
  let dataSource = 'Local Database (Offline / Synced)';
  let rawList = [];
  let procList = [];
  let pkgList = [];
  let saleList = [];
  let prodList = [];
  let errorMsg = null;
  let projectId = null;

  const todayStr = new Date().toISOString().slice(0, 10);

  // 1. Try fetching from Cloud Firestore
  try {
    const isConfigured = await isFirebaseConfigured();
    if (isConfigured && navigator.onLine) {
      const initRes = await initFirebase();
      if (initRes.initialized) {
        const db = initRes.db;
        const config = await getFirebaseConfig();
        projectId = config?.projectId || null;

        const [rawSnap, procSnap, pkgSnap, saleSnap, prodSnap] = await Promise.all([
          getDocs(collection(db, 'raw_material')),
          getDocs(collection(db, 'processing')),
          getDocs(collection(db, 'packaging')),
          getDocs(collection(db, 'order_sale')),
          getDocs(collection(db, 'products')),
        ]);

        rawList = rawSnap.docs.map(d => ({ ...d.data(), docId: d.id }));
        procList = procSnap.docs.map(d => ({ ...d.data(), docId: d.id }));
        pkgList = pkgSnap.docs.map(d => ({ ...d.data(), docId: d.id }));
        saleList = saleSnap.docs.map(d => ({ ...d.data(), docId: d.id }));
        prodList = prodSnap.docs.map(d => ({ ...d.data(), docId: d.id }));

        isFromFirebase = true;
        dataSource = `Firebase Cloud Firestore (${projectId})`;
      }
    }
  } catch (err) {
    console.warn('Firebase live fetch failed, falling back to local database:', err);
    errorMsg = err.message;
  }

  // 2. Fallback to IndexedDB if Firebase had 0 records or failed
  if (!isFromFirebase || (rawList.length === 0 && procList.length === 0 && pkgList.length === 0 && saleList.length === 0)) {
    try {
      const localDb = await getDB();
      const [r, p, k, s, pr] = await Promise.all([
        localDb.getAll('raw_material'),
        localDb.getAll('processing'),
        localDb.getAll('packaging'),
        localDb.getAll('order_sale'),
        localDb.getAll('products')
      ]);

      // If local database has records, use them
      if (r.length > 0 || p.length > 0 || k.length > 0 || s.length > 0) {
        rawList = r;
        procList = p;
        pkgList = k;
        saleList = s;
        prodList = pr;
        dataSource = isFromFirebase ? `Firebase Firestore (Synced via Local Cache)` : 'Local Database (Offline / Synced)';
      }
    } catch (localErr) {
      console.error('Local database fetch error:', localErr);
      if (!errorMsg) errorMsg = localErr.message;
    }
  }

  // 3. Build Batch to Product Name Map for infallible product association
  const batchProductMap = {};
  rawList.forEach(r => {
    if (r.batch_id && r.material_name) {
      batchProductMap[r.batch_id] = r.material_name.trim();
    }
  });

  // 4. Products list (Priority: Haldi, Mirchi, Dhaniya, plus custom active products)
  const defaultStandardProducts = ['Haldi', 'Mirchi', 'Dhaniya'];
  const customProducts = prodList
    .filter(p => p.active !== false && !defaultStandardProducts.some(dp => dp.toLowerCase() === (p.name || '').toLowerCase()))
    .map(p => p.name.trim());

  const allProductNames = [...defaultStandardProducts, ...customProducts];

  // Helper to match a record to a product name
  const isMatchProduct = (recordProdName, targetName, batchId) => {
    const p1 = (recordProdName || '').toLowerCase().trim();
    const target = targetName.toLowerCase().trim();
    if (p1 === target) return true;
    if (p1.includes(target) || target.includes(p1)) return true;
    if (batchId && batchProductMap[batchId]) {
      const bp = batchProductMap[batchId].toLowerCase().trim();
      return bp === target || bp.includes(target);
    }
    return false;
  };

  // Standard pack sizes in GM
  const PACK_SIZES = [10, 24, 50, 100, 200, 500];

  // 5. Calculate Product-Wise Metrics
  const productsSummary = allProductNames.map(productName => {
    // A. Raw Material calculations
    const prodRawEntries = rawList.filter(r => isMatchProduct(r.material_name, productName, r.batch_id));
    const prodProcEntries = procList.filter(p => isMatchProduct(p.material_name, productName, p.batch_id));
    const prodPkgEntries = pkgList.filter(k => isMatchProduct(k.product_name, productName, k.batch_id));
    const prodSaleEntries = saleList.filter(s => isMatchProduct(s.product_name, productName, s.batch_id));

    // Total raw inward
    const totalRawInwardKg = prodRawEntries.reduce((acc, r) => acc + (Number(r.quantity_kg) || 0), 0);
    // Total raw issued for processing (gross_raw_kg)
    const totalRawIssuedForProcessingKg = prodProcEntries.reduce((acc, p) => acc + (Number(p.gross_raw_kg) || 0), 0);
    // Available Raw Material = Inward - Issued
    const availableRawMaterialKg = Math.max(0, Number((totalRawInwardKg - totalRawIssuedForProcessingKg).toFixed(3)));
    const percentProcessed = totalRawInwardKg > 0 
      ? Math.min(100, Math.round((totalRawIssuedForProcessingKg / totalRawInwardKg) * 100)) 
      : 0;

    // B. Grinding / Processing Status
    const netCleanedRawKg = prodProcEntries.reduce((acc, p) => acc + (Number(p.net_raw_kg) || 0), 0);
    const cleaningWasteKg = prodProcEntries.reduce((acc, p) => acc + (Number(p.cleaning_waste_kg) || 0), 0);
    const powderProducedKg = prodProcEntries.reduce((acc, p) => acc + (Number(p.net_powder_kg) || 0), 0);
    const grindingLossKg = prodProcEntries.reduce((acc, p) => acc + (Number(p.grinding_loss_kg) || 0), 0);
    const totalLossKg = prodProcEntries.reduce((acc, p) => acc + (Number(p.total_loss_kg) || (Number(p.cleaning_waste_kg) + Number(p.grinding_loss_kg)) || 0), 0);

    const yieldPercentage = totalRawIssuedForProcessingKg > 0 
      ? Number(((powderProducedKg / totalRawIssuedForProcessingKg) * 100).toFixed(1)) 
      : 0;

    // Powder used in packaging
    const powderUsedInPackagingKg = prodPkgEntries.reduce((acc, k) => {
      return acc + (Number(k.powder_used_kg) || Number(k.quantity_kg) || ((Number(k.packet_quantity) * Number(k.pack_size_gm)) / 1000) || 0);
    }, 0);

    // Available powder balance for packaging
    const availablePowderKg = Math.max(0, Number((powderProducedKg - powderUsedInPackagingKg).toFixed(3)));

    // C. Finished Product Stock (PACKETS & KG)
    // Calculate for each pack size
    const packSizeStock = PACK_SIZES.map(size => {
      const sizePkg = prodPkgEntries.filter(k => Number(k.pack_size_gm) === size);
      const sizeSales = prodSaleEntries.filter(s => Number(s.pack_size_gm) === size);

      // Packets produced
      const producedPackets = sizePkg.reduce((acc, k) => {
        if (k.packet_quantity != null && Number(k.packet_quantity) > 0) {
          return acc + Number(k.packet_quantity);
        }
        const kg = Number(k.powder_used_kg) || Number(k.quantity_kg) || 0;
        return acc + Math.round((kg * 1000) / size);
      }, 0);

      // Packets sold
      const soldPackets = sizeSales.reduce((acc, s) => {
        if (s.packets_deducted != null && Number(s.packets_deducted) > 0) {
          return acc + Number(s.packets_deducted);
        }
        const kg = Number(s.kg_sold) || 0;
        return acc + Math.round((kg * 1000) / size);
      }, 0);

      const remainingPackets = Math.max(0, producedPackets - soldPackets);
      const remainingKg = Number(((remainingPackets * size) / 1000).toFixed(3));
      const soldKg = Number(((soldPackets * size) / 1000).toFixed(3));

      return {
        packSizeGm: size,
        producedPackets,
        soldPackets,
        remainingPackets,
        remainingKg,
        soldKg
      };
    });

    const totalFinishedPackets = packSizeStock.reduce((acc, s) => acc + s.remainingPackets, 0);
    const totalFinishedStockKg = packSizeStock.reduce((acc, s) => acc + s.remainingKg, 0);
    const totalKgSold = prodSaleEntries.reduce((acc, s) => acc + (Number(s.kg_sold) || 0), 0);

    return {
      productName,
      // Raw Material
      totalRawInwardKg: Number(totalRawInwardKg.toFixed(3)),
      totalRawIssuedForProcessingKg: Number(totalRawIssuedForProcessingKg.toFixed(3)),
      availableRawMaterialKg: Number(availableRawMaterialKg.toFixed(3)),
      percentProcessed,
      // Processing
      netCleanedRawKg: Number(netCleanedRawKg.toFixed(3)),
      cleaningWasteKg: Number(cleaningWasteKg.toFixed(3)),
      powderProducedKg: Number(powderProducedKg.toFixed(3)),
      grindingLossKg: Number(grindingLossKg.toFixed(3)),
      totalLossKg: Number(totalLossKg.toFixed(3)),
      yieldPercentage,
      powderUsedInPackagingKg: Number(powderUsedInPackagingKg.toFixed(3)),
      availablePowderKg: Number(availablePowderKg.toFixed(3)),
      // Finished Stock
      packSizeStock,
      totalFinishedPackets,
      totalFinishedStockKg: Number(totalFinishedStockKg.toFixed(3)),
      // Sales
      totalKgSold: Number(totalKgSold.toFixed(3)),
      // Entry counts
      entryCounts: {
        raw: prodRawEntries.length,
        processing: prodProcEntries.length,
        packaging: prodPkgEntries.length,
        sales: prodSaleEntries.length,
      }
    };
  });

  // 6. Overall Factory Totals
  const overall = {
    totalRawInwardKg: productsSummary.reduce((acc, p) => acc + p.totalRawInwardKg, 0),
    totalRawIssuedProcessingKg: productsSummary.reduce((acc, p) => acc + p.totalRawIssuedForProcessingKg, 0),
    totalAvailableRawMaterialKg: productsSummary.reduce((acc, p) => acc + p.availableRawMaterialKg, 0),
    totalPowderProducedKg: productsSummary.reduce((acc, p) => acc + p.powderProducedKg, 0),
    totalPowderUsedPackagingKg: productsSummary.reduce((acc, p) => acc + p.powderUsedInPackagingKg, 0),
    totalAvailablePowderKg: productsSummary.reduce((acc, p) => acc + p.availablePowderKg, 0),
    totalFinishedPackets: productsSummary.reduce((acc, p) => acc + p.totalFinishedPackets, 0),
    totalFinishedStockKg: productsSummary.reduce((acc, p) => acc + p.totalFinishedStockKg, 0),
    totalSoldKg: productsSummary.reduce((acc, p) => acc + p.totalKgSold, 0),
    // Today's Activity
    todayRawInwardKg: rawList
      .filter(r => (r.date || '').slice(0, 10) === todayStr || (r.timestamp || '').slice(0, 10) === todayStr)
      .reduce((acc, r) => acc + (Number(r.quantity_kg) || 0), 0),
    todayProcessingKg: procList
      .filter(p => (p.date || '').slice(0, 10) === todayStr || (p.timestamp || '').slice(0, 10) === todayStr)
      .reduce((acc, p) => acc + (Number(p.gross_raw_kg) || 0), 0),
    todayPackagingPowderKg: pkgList
      .filter(k => (k.date || '').slice(0, 10) === todayStr || (k.timestamp || '').slice(0, 10) === todayStr)
      .reduce((acc, k) => acc + (Number(k.powder_used_kg) || Number(k.quantity_kg) || 0), 0),
    todaySalesKg: saleList
      .filter(s => (s.date || '').slice(0, 10) === todayStr || (s.timestamp || '').slice(0, 10) === todayStr)
      .reduce((acc, s) => acc + (Number(s.kg_sold) || 0), 0),
    totalEntriesCount: rawList.length + procList.length + pkgList.length + saleList.length
  };

  // 7. Recent Transactions Feed (Latest 8 items across all modules)
  const taggedRaw = rawList.map(r => ({
    id: r.entry_id,
    module: 'RAW INWARD',
    date: r.date || r.timestamp?.slice(0, 10),
    timestamp: r.timestamp || r.date,
    product: r.material_name,
    batch: r.batch_id,
    quantity: `${formatIndian(r.quantity_kg, 2)} KG`,
    staff: r.employee_name || 'Staff'
  }));

  const taggedProc = procList.map(p => ({
    id: p.entry_id,
    module: 'PROCESSING',
    date: p.date || p.timestamp?.slice(0, 10),
    timestamp: p.timestamp || p.date,
    product: p.material_name || batchProductMap[p.batch_id] || 'Spice',
    batch: p.batch_id,
    quantity: `${formatIndian(p.net_powder_kg, 2)} KG Powder (R${p.processing_round || 1})`,
    staff: p.employee_name || 'Staff'
  }));

  const taggedPkg = pkgList.map(k => {
    const pkts = k.packet_quantity != null ? k.packet_quantity : Math.round(((Number(k.powder_used_kg) || 0) * 1000) / Number(k.pack_size_gm));
    return {
      id: k.entry_id,
      module: 'PACKAGING',
      date: k.date || k.timestamp?.slice(0, 10),
      timestamp: k.timestamp || k.date,
      product: k.product_name || batchProductMap[k.batch_id] || 'Spice',
      batch: k.batch_id,
      quantity: `${formatIndianInt(pkts)} pkts (${k.pack_size_gm} GM)`,
      staff: k.employee_name || 'Staff'
    };
  });

  const taggedSales = saleList.map(s => ({
    id: s.entry_id,
    module: 'DISPATCH / SALE',
    date: s.date || s.timestamp?.slice(0, 10),
    timestamp: s.timestamp || s.date,
    product: s.product_name,
    batch: s.batch_id,
    quantity: `${formatIndian(s.kg_sold, 2)} KG (${s.pack_size_gm} GM)`,
    staff: s.employee_name || 'Staff'
  }));

  const recentTransactions = [...taggedRaw, ...taggedProc, ...taggedPkg, ...taggedSales]
    .sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date))
    .slice(0, 8);

  return {
    isFromFirebase,
    dataSource,
    projectId,
    lastUpdated: new Date().toISOString(),
    productsSummary,
    overall,
    recentTransactions,
    error: errorMsg
  };
}
