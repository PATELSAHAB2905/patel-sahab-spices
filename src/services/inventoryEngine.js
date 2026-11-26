import { getDB } from './db';
import { queueRecordForSync } from './syncService';

/**
 * Format date to YYYY-MM-DD
 */
export function getTodayDateStr() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Helper to check if a record is active (not reversed)
 */
export function isRecordActive(record) {
  if (!record) return false;
  return record.is_reversed !== true && record.status !== 'REVERSED';
}

/**
 * Generate unique Entry ID
 * Format: {MODULE_PREFIX}-{YYYYMMDD}-{RANDOM4}
 */
export function generateEntryId(prefix) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${dateStr}-${rand}`;
}

/**
 * Generate unique Transaction ID / Order ID
 */
export function generateOrderId() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${dateStr}-${rand}`;
}

export function generatePackagingTxId() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `PKG-TX-${dateStr}-${rand}`;
}

/**
 * Generate unique Return ID (e.g. RET-YYYYMMDD-XXXX)
 */
export function generateReturnId() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `RET-${dateStr}-${rand}`;
}

/**
 * Generate unique Powder Recovery ID (e.g. REC-YYYYMMDD-XXXX)
 */
export function generateRecoveryId() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `REC-${dateStr}-${rand}`;
}

// Helper: Convert numeric index (1-based) to alphabetical sequence (A, B, C... Z, AA, AB...)
export function indexToSequenceLetters(num) {
  let n = parseInt(num, 10);
  if (isNaN(n) || n <= 0) return 'A';
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s || 'A';
}

// Helper: Convert alphabetical sequence (A, B, AA...) back to 1-based numeric index
export function sequenceLettersToIndex(str) {
  if (!str) return 0;
  const clean = String(str).trim().toUpperCase();
  let num = 0;
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      num = num * 26 + (code - 64);
    }
  }
  return num;
}

// Single-letter product prefix mapping (Haldi = H, Mirchi = M, Dhaniya = D)
export function getProductSinglePrefix(productNameOrPrefix) {
  const str = String(productNameOrPrefix || '').trim().toLowerCase();
  if (str.startsWith('haldi') || str.startsWith('turmeric') || str === 'h' || str === 'hal') return 'H';
  if (str.startsWith('mirchi') || str.startsWith('chilli') || str.startsWith('chili') || str === 'm' || str === 'mir') return 'M';
  if (str.startsWith('dhaniya') || str.startsWith('coriander') || str === 'd' || str === 'dha') return 'D';
  if (str.startsWith('jeera') || str.startsWith('cumin') || str === 'j' || str === 'jee') return 'J';
  if (str.startsWith('garam') || str === 'g' || str === 'gar') return 'G';
  if (productNameOrPrefix && String(productNameOrPrefix).trim()) {
    return String(productNameOrPrefix).trim().slice(0, 1).toUpperCase();
  }
  return 'H';
}

/**
 * Automatically generate next Batch ID based on Product Prefix + Month + Year + Monthly Purchase Sequence
 * Examples:
 * Haldi Nov 2026: H1126A, H1126B, H1126C
 * Mirchi Nov 2026: M1126A
 * Dhaniya Nov 2026: D1126A
 * Haldi Dec 2026: H1226A
 */
export async function generateNextBatchId(productNameOrPrefix, purchaseDate = null) {
  const prefix = getProductSinglePrefix(productNameOrPrefix);

  // Extract Month (MM) and Year (YY) from purchaseDate (defaults to today)
  let mm = '';
  let yy = '';
  if (purchaseDate && typeof purchaseDate === 'string' && purchaseDate.includes('-')) {
    const parts = purchaseDate.split('-');
    if (parts.length >= 2) {
      yy = parts[0].slice(-2);
      mm = parts[1].padStart(2, '0');
    }
  }
  if (!mm || !yy) {
    const d = new Date();
    mm = String(d.getMonth() + 1).padStart(2, '0');
    yy = String(d.getFullYear()).slice(-2);
  }

  const db = await getDB();
  const rawEntries = await db.getAll('raw_material');

  // Match existing batches for this product prefix, month, and year: e.g. ^H1126([A-Z]+)$
  const regex = new RegExp(`^${prefix}${mm}${yy}([A-Z]+)$`, 'i');
  let maxSeq = 0;

  for (const entry of rawEntries) {
    if (entry.batch_id) {
      const match = String(entry.batch_id).trim().match(regex);
      if (match) {
        const seqNum = sequenceLettersToIndex(match[1]);
        if (seqNum > maxSeq) {
          maxSeq = seqNum;
        }
      }
    }
  }

  // Next sequence index (starts at 1 -> A)
  let nextSeq = maxSeq + 1;
  let candidateBatch = `${prefix}${mm}${yy}${indexToSequenceLetters(nextSeq)}`;

  // Double check uniqueness across all raw material entries
  const existingBatchIds = new Set(rawEntries.map(r => (r.batch_id || '').trim().toUpperCase()));
  while (existingBatchIds.has(candidateBatch.toUpperCase())) {
    nextSeq += 1;
    candidateBatch = `${prefix}${mm}${yy}${indexToSequenceLetters(nextSeq)}`;
  }

  return candidateBatch;
}

/**
 * Safely migrate a Batch ID across all inventory and production records.
 * Updates raw_material, processing, packaging, order_sale, sales_return, and powder_recovery.
 */
export async function updateBatchIdAcrossInventory(oldBatchId, newBatchId, modifiedBy = 'Admin', reason = '') {
  if (!oldBatchId || !newBatchId) throw new Error('Both old and new Batch ID are required.');
  const cleanOld = oldBatchId.trim().toUpperCase();
  const cleanNew = newBatchId.trim().toUpperCase();
  if (cleanOld === cleanNew) return { updatedCount: 0 };

  const db = await getDB();
  const rawList = await db.getAll('raw_material');

  // Verify newBatchId does not already belong to a different batch
  const collision = rawList.find(r => (r.batch_id || '').toUpperCase() === cleanNew && (r.batch_id || '').toUpperCase() !== cleanOld);
  if (collision) {
    throw new Error(`Batch ID "${cleanNew}" already exists in factory records (Entry ${collision.entry_id}). Batch numbers must remain unique.`);
  }

  const stores = ['raw_material', 'processing', 'packaging', 'order_sale', 'sales_return', 'powder_recovery'];
  let updatedCount = 0;
  const now = new Date().toISOString();

  for (const storeName of stores) {
    if (!db.objectStoreNames.contains(storeName)) continue;
    const records = await db.getAll(storeName);
    for (const rec of records) {
      if ((rec.batch_id || '').toUpperCase() === cleanOld) {
        rec.batch_id = cleanNew;
        rec.previous_batch_id = cleanOld;
        rec.updated_at = now;
        rec.updated_by = modifiedBy;
        rec.synced = false;
        await db.put(storeName, rec);
        try {
          await queueRecordForSync(storeName, rec, 'UPDATE');
        } catch {}
        updatedCount++;
      }
    }
  }

  // Audit Log
  try {
    await db.add('audit_logs', {
      timestamp: now,
      module: 'INVENTORY_ENGINE',
      action: 'UPDATE_BATCH_ID_CASCADE',
      performed_by: modifiedBy,
      target_id: cleanNew,
      details: `Batch ID migrated from "${cleanOld}" to "${cleanNew}". Total linked records updated: ${updatedCount}. Reason: ${reason || 'Manual Batch ID Update'}`
    });
  } catch {}

  return { success: true, oldBatchId: cleanOld, newBatchId: cleanNew, updatedCount };
}

/**
 * Get next processing round number for a batch
 */
export async function getNextProcessingRound(batchId) {
  if (!batchId) return 1;
  const db = await getDB();
  const processingEntries = await db.getAll('processing');
  const batchRounds = processingEntries.filter(p => p.batch_id === batchId);
  return batchRounds.length + 1;
}

/**
 * Calculate RAW MATERIAL inventory
 * Batch-wise and aggregate (Excludes reversed records)
 */
export async function getRawMaterialStockSummary() {
  const db = await getDB();
  const rawList = (await db.getAll('raw_material')).filter(isRecordActive);
  const procList = (await db.getAll('processing')).filter(isRecordActive);

  // Map by batch_id
  const batchMap = {};

  for (const r of rawList) {
    if (!batchMap[r.batch_id]) {
      batchMap[r.batch_id] = {
        batchId: r.batch_id,
        materialName: r.material_name,
        date: r.date,
        supplier: r.supplier_name,
        invoiceNumber: r.invoice_number,
        inwardKg: 0,
        grossProcessedKg: 0,
        remainingUnprocessedKg: 0,
      };
    }
    batchMap[r.batch_id].inwardKg += Number(r.quantity_kg) || 0;
  }

  for (const p of procList) {
    if (batchMap[p.batch_id]) {
      batchMap[p.batch_id].grossProcessedKg += Number(p.gross_raw_kg) || 0;
    }
  }

  let totalRawInward = 0;
  let totalGrossSent = 0;
  let totalRemainingUnprocessed = 0;

  Object.values(batchMap).forEach(b => {
    b.remainingUnprocessedKg = Math.max(0, Number((b.inwardKg - b.grossProcessedKg).toFixed(3)));
    totalRawInward += b.inwardKg;
    totalGrossSent += b.grossProcessedKg;
    totalRemainingUnprocessed += b.remainingUnprocessedKg;
  });

  return {
    totalRawInward: Number(totalRawInward.toFixed(3)),
    totalGrossSent: Number(totalGrossSent.toFixed(3)),
    totalRemainingUnprocessed: Number(totalRemainingUnprocessed.toFixed(3)),
    batchMap,
    availableBatches: Object.values(batchMap).filter(b => b.remainingUnprocessedKg > 0.0001),
  };
}

/**
 * Calculate POWDER inventory
 * Batch-wise and aggregate (Excludes reversed records; adds actual recovered powder from returns)
 */
export async function getPowderStockSummary() {
  const db = await getDB();
  const rawList = (await db.getAll('raw_material')).filter(isRecordActive);
  const procList = (await db.getAll('processing')).filter(isRecordActive);
  const pkgList = (await db.getAll('packaging')).filter(isRecordActive);
  const recoveryList = db.objectStoreNames.contains('powder_recovery') 
    ? (await db.getAll('powder_recovery')).filter(isRecordActive) 
    : [];
  const returnList = db.objectStoreNames.contains('sales_return')
    ? (await db.getAll('sales_return')).filter(isRecordActive)
    : [];

  // Map product names from raw materials
  const batchProductNameMap = {};
  rawList.forEach(r => {
    batchProductNameMap[r.batch_id] = r.material_name;
  });

  const batchMap = {};

  for (const p of procList) {
    if (!batchMap[p.batch_id]) {
      batchMap[p.batch_id] = {
        batchId: p.batch_id,
        productName: p.material_name || batchProductNameMap[p.batch_id] || 'Unknown',
        netPowderProducedKg: 0,
        actualRecoveredPowderKg: 0,
        powderUsedInPkgKg: 0,
        remainingPowderKg: 0,
      };
    }
    batchMap[p.batch_id].netPowderProducedKg += Number(p.net_powder_kg) || 0;
  }

  // Add actual recovered powder from powder_recovery
  for (const rec of recoveryList) {
    if (!batchMap[rec.batch_id]) {
      batchMap[rec.batch_id] = {
        batchId: rec.batch_id,
        productName: rec.product_name || batchProductNameMap[rec.batch_id] || 'Unknown',
        netPowderProducedKg: 0,
        actualRecoveredPowderKg: 0,
        powderUsedInPkgKg: 0,
        remainingPowderKg: 0,
      };
    }
    batchMap[rec.batch_id].actualRecoveredPowderKg += Number(rec.actual_recovered_powder_kg) || 0;
  }

  // Also include standalone actual recovered powder directly saved on return records (if not linked to powder_recovery)
  for (const ret of returnList) {
    if (ret.status === 'RECOVERY_COMPLETED' && !ret.recovery_id && Number(ret.actual_recovered_powder_kg) > 0) {
      if (!batchMap[ret.batch_id]) {
        batchMap[ret.batch_id] = {
          batchId: ret.batch_id,
          productName: ret.product_name || batchProductNameMap[ret.batch_id] || 'Unknown',
          netPowderProducedKg: 0,
          actualRecoveredPowderKg: 0,
          powderUsedInPkgKg: 0,
          remainingPowderKg: 0,
        };
      }
      batchMap[ret.batch_id].actualRecoveredPowderKg += Number(ret.actual_recovered_powder_kg);
    }
  }

  for (const k of pkgList) {
    if (!batchMap[k.batch_id]) {
      batchMap[k.batch_id] = {
        batchId: k.batch_id,
        productName: k.product_name || batchProductNameMap[k.batch_id] || 'Unknown',
        netPowderProducedKg: 0,
        actualRecoveredPowderKg: 0,
        powderUsedInPkgKg: 0,
        remainingPowderKg: 0,
      };
    }
    batchMap[k.batch_id].powderUsedInPkgKg += Number(k.powder_used_kg) || 0;
  }

  let totalNetPowderProduced = 0;
  let totalActualRecoveredPowder = 0;
  let totalPowderUsedInPkg = 0;
  let totalRemainingPowder = 0;

  Object.values(batchMap).forEach(b => {
    b.netPowderProducedKg = Number(b.netPowderProducedKg.toFixed(3));
    b.actualRecoveredPowderKg = Number(b.actualRecoveredPowderKg.toFixed(3));
    b.powderUsedInPkgKg = Number(b.powderUsedInPkgKg.toFixed(3));
    // Formula: Powder Produced + Actual Recovered Powder - Powder Used in Packaging
    b.remainingPowderKg = Math.max(0, Number((b.netPowderProducedKg + b.actualRecoveredPowderKg - b.powderUsedInPkgKg).toFixed(3)));

    totalNetPowderProduced += b.netPowderProducedKg;
    totalActualRecoveredPowder += b.actualRecoveredPowderKg;
    totalPowderUsedInPkg += b.powderUsedInPkgKg;
    totalRemainingPowder += b.remainingPowderKg;
  });

  return {
    totalNetPowderProduced: Number(totalNetPowderProduced.toFixed(3)),
    totalActualRecoveredPowder: Number(totalActualRecoveredPowder.toFixed(3)),
    totalPowderUsedInPkg: Number(totalPowderUsedInPkg.toFixed(3)),
    totalRemainingPowder: Number(totalRemainingPowder.toFixed(3)),
    batchMap,
    availableBatches: Object.values(batchMap).filter(b => b.remainingPowderKg > 0.0001),
  };
}

/**
 * Calculate FINISHED PRODUCT inventory
 * Pack-size wise, batch wise, and aggregate - STRICTLY IN KG ONLY
 * Excludes reversed records; adds back Reusable Packets from Sales Returns
 */
export async function getFinishedStockSummary() {
  const db = await getDB();
  const pkgList = (await db.getAll('packaging')).filter(isRecordActive);
  const saleList = (await db.getAll('order_sale')).filter(isRecordActive);
  const returnList = db.objectStoreNames.contains('sales_return')
    ? (await db.getAll('sales_return')).filter(isRecordActive)
    : [];

  // Key: `${batch_id}__${pack_size_gm}`
  const finishedMap = {};
  const productSummary = {};

  for (const p of pkgList) {
    const key = `${p.batch_id}__${p.pack_size_gm}`;
    if (!finishedMap[key]) {
      finishedMap[key] = {
        batchId: p.batch_id,
        productName: p.product_name,
        packSizeGm: Number(p.pack_size_gm) || 0,
        kgProduced: 0,
        kgSold: 0,
        kgReturnedReusable: 0,
        packetsProduced: 0,
        packetsSold: 0,
        packetsReturnedReusable: 0,
        remainingKg: 0,
        remainingPackets: 0,
      };
    }
    const size = Number(p.pack_size_gm) || 1;
    const kg = Number(p.powder_used_kg) || Number(p.quantity_kg) || ((Number(p.packet_quantity) * size) / 1000) || 0;
    const pkts = p.packet_quantity != null ? Number(p.packet_quantity) : Math.round((kg * 1000) / size);

    finishedMap[key].kgProduced += Number(kg);
    finishedMap[key].packetsProduced += pkts;
  }

  for (const s of saleList) {
    const key = `${s.batch_id}__${s.pack_size_gm}`;
    if (!finishedMap[key]) {
      finishedMap[key] = {
        batchId: s.batch_id,
        productName: s.product_name,
        packSizeGm: Number(s.pack_size_gm) || 0,
        kgProduced: 0,
        kgSold: 0,
        kgReturnedReusable: 0,
        packetsProduced: 0,
        packetsSold: 0,
        packetsReturnedReusable: 0,
        remainingKg: 0,
        remainingPackets: 0,
      };
    }
    const size = Number(s.pack_size_gm) || 1;
    const kg = Number(s.kg_sold) || 0;
    const pkts = s.packets_deducted != null ? Number(s.packets_deducted) : Math.round((kg * 1000) / size);

    finishedMap[key].kgSold += Number(kg);
    finishedMap[key].packetsSold += pkts;
  }

  // Add reusable packets from returns back to available finished stock
  for (const r of returnList) {
    const key = `${r.batch_id}__${r.pack_size_gm}`;
    if (!finishedMap[key]) {
      finishedMap[key] = {
        batchId: r.batch_id,
        productName: r.product_name,
        packSizeGm: Number(r.pack_size_gm) || 0,
        kgProduced: 0,
        kgSold: 0,
        kgReturnedReusable: 0,
        packetsProduced: 0,
        packetsSold: 0,
        packetsReturnedReusable: 0,
        remainingKg: 0,
        remainingPackets: 0,
      };
    }
    const reusPkts = Number(r.reusable_packets) || 0;
    const size = Number(r.pack_size_gm) || 1;
    const reusKg = (reusPkts * size) / 1000;

    finishedMap[key].kgReturnedReusable += reusKg;
    finishedMap[key].packetsReturnedReusable += reusPkts;
  }

  let totalFinishedKg = 0;
  let totalFinishedPackets = 0;

  Object.values(finishedMap).forEach(item => {
    item.kgProduced = Number(item.kgProduced.toFixed(3));
    item.kgSold = Number(item.kgSold.toFixed(3));
    item.kgReturnedReusable = Number(item.kgReturnedReusable.toFixed(3));

    // Finished stock = Produced - Sold + Reusable Returned
    item.remainingKg = Math.max(0, Number((item.kgProduced - item.kgSold + item.kgReturnedReusable).toFixed(3)));
    item.remainingPackets = Math.max(0, item.packetsProduced - item.packetsSold + item.packetsReturnedReusable);

    totalFinishedKg += item.remainingKg;
    totalFinishedPackets += item.remainingPackets;

    // Aggregate by product
    if (!productSummary[item.productName]) {
      productSummary[item.productName] = {
        productName: item.productName,
        totalKg: 0,
        totalPackets: 0,
        packSizes: {},
      };
    }
    productSummary[item.productName].totalKg = Number(
      (productSummary[item.productName].totalKg + item.remainingKg).toFixed(3)
    );
    productSummary[item.productName].totalPackets += item.remainingPackets;

    if (!productSummary[item.productName].packSizes[item.packSizeGm]) {
      productSummary[item.productName].packSizes[item.packSizeGm] = 0;
    }
    productSummary[item.productName].packSizes[item.packSizeGm] = Number(
      (productSummary[item.productName].packSizes[item.packSizeGm] + item.remainingKg).toFixed(3)
    );
  });

  return {
    totalFinishedKg: Number(totalFinishedKg.toFixed(3)),
    totalFinishedPackets,
    stockItems: Object.values(finishedMap).filter(i => i.remainingKg > 0.0001),
    allItems: Object.values(finishedMap),
    productSummary,
  };
}

/**
 * Validate Sale Quantity in KG
 */
export function validateSaleKg(kgSold) {
  const kg = Number(kgSold);
  if (isNaN(kg) || kg <= 0) {
    return { valid: false, error: 'Sale quantity must be greater than 0 KG' };
  }
  return { valid: true };
}

// Backward compatibility alias
export function validateKgToPackets(kgSold, packSizeGm) {
  return validateSaleKg(kgSold);
}

/**
 * FIFO Allocation for Product-wise Sale in KG
 * Consumes oldest batch first
 */
export async function calculateFifoAllocation(productName, packSizeGm, kgSold) {
  const kg = Number(kgSold);
  if (isNaN(kg) || kg <= 0) {
    throw new Error('Sale quantity must be greater than 0 KG');
  }

  const sizeGm = Number(packSizeGm);
  const finishedSummary = await getFinishedStockSummary();
  const db = await getDB();
  const rawList = await db.getAll('raw_material');

  // Inward date lookup for FIFO ordering
  const batchDateMap = {};
  rawList.forEach(r => {
    batchDateMap[r.batch_id] = r.date || r.timestamp;
  });

  // Filter batches for this product and pack size with available KG
  const eligibleBatches = finishedSummary.allItems
    .filter(item => 
      item.productName.toLowerCase() === productName.toLowerCase() &&
      item.packSizeGm === sizeGm &&
      item.remainingKg > 0.0001
    )
    .sort((a, b) => {
      const dateA = batchDateMap[a.batchId] || '';
      const dateB = batchDateMap[b.batchId] || '';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return a.batchId.localeCompare(b.batchId);
    });

  const totalAvailableKg = eligibleBatches.reduce((acc, b) => acc + b.remainingKg, 0);

  if (totalAvailableKg < kg - 0.0001) {
    throw new Error(
      `Insufficient stock for ${productName} (${sizeGm} GM). Required: ${kg} KG, but only ${totalAvailableKg.toFixed(3)} KG available across batches.`
    );
  }

  let kgLeftToAllocate = kg;
  const allocations = [];

  for (const batch of eligibleBatches) {
    if (kgLeftToAllocate <= 0.0001) break;

    const kgTaken = Math.min(kgLeftToAllocate, batch.remainingKg);
    const roundedTaken = Number(kgTaken.toFixed(3));

    allocations.push({
      batchId: batch.batchId,
      productName: batch.productName,
      packSizeGm: sizeGm,
      kgSold: roundedTaken,
      availableBeforeSale: batch.remainingKg,
      remainingAfterSale: Number((batch.remainingKg - roundedTaken).toFixed(3)),
    });

    kgLeftToAllocate -= roundedTaken;
  }

  return allocations;
}

/**
 * Get Today's Dashboard Metrics
 */
export async function getDashboardMetrics() {
  const db = await getDB();
  const todayStr = getTodayDateStr();

  const [rawSummary, powderSummary, finishedSummary] = await Promise.all([
    getRawMaterialStockSummary(),
    getPowderStockSummary(),
    getFinishedStockSummary(),
  ]);

  const rawList = (await db.getAll('raw_material')).filter(isRecordActive);
  const procList = (await db.getAll('processing')).filter(isRecordActive);
  const pkgList = (await db.getAll('packaging')).filter(isRecordActive);
  const saleList = (await db.getAll('order_sale')).filter(isRecordActive);
  const queueList = await db.getAll('sync_queue');
  const returnList = db.objectStoreNames.contains('sales_return') 
    ? (await db.getAll('sales_return')).filter(isRecordActive) 
    : [];

  // Today's metrics
  const todayRawInward = rawList
    .filter(r => (r.date && r.date.startsWith(todayStr)) || (r.timestamp && r.timestamp.startsWith(todayStr)))
    .reduce((sum, r) => sum + (Number(r.quantity_kg) || 0), 0);

  const todayProcessing = procList
    .filter(p => (p.date && p.date.startsWith(todayStr)) || (p.timestamp && p.timestamp.startsWith(todayStr)))
    .reduce((sum, p) => sum + (Number(p.gross_raw_kg) || 0), 0);

  const todayPackagingPowder = pkgList
    .filter(k => (k.date && k.date.startsWith(todayStr)) || (k.timestamp && k.timestamp.startsWith(todayStr)))
    .reduce((sum, k) => sum + (Number(k.powder_used_kg) || 0), 0);

  const todaySalesKg = saleList
    .filter(s => (s.date && s.date.startsWith(todayStr)) || (s.timestamp && s.timestamp.startsWith(todayStr)))
    .reduce((sum, s) => sum + (Number(s.kg_sold) || 0), 0);

  const todayReturnsCount = returnList
    .filter(r => (r.date && r.date.startsWith(todayStr)) || (r.timestamp && r.timestamp.startsWith(todayStr)))
    .length;

  const pendingSyncCount = queueList.filter(q => q.status === 'PENDING' || q.status === 'FAILED').length;

  const lastSyncSetting = await db.get('settings', 'last_successful_sync');

  return {
    // 1. Total Raw Material Stock (Inward)
    totalRawMaterialStockKg: rawSummary.totalRawInward,
    // 2. Total Unprocessed Raw Material
    totalUnprocessedRawMaterialKg: rawSummary.totalRemainingUnprocessed,
    // 3. Total Powder Stock (including actual recovered powder)
    totalPowderStockKg: powderSummary.totalRemainingPowder,
    totalActualRecoveredPowderKg: powderSummary.totalActualRecoveredPowder || 0,
    // 4. Total Finished Product Stock (KG ONLY)
    totalFinishedProductStockKg: finishedSummary.totalFinishedKg,
    totalFinishedPackets: finishedSummary.totalFinishedPackets || 0,
    // 5. Today's Raw Material Inward
    todayRawMaterialInwardKg: Number(todayRawInward.toFixed(3)),
    // 6. Today's Processing
    todayProcessingKg: Number(todayProcessing.toFixed(3)),
    // 7. Today's Packaging
    todayPackagingKg: Number(todayPackagingPowder.toFixed(3)),
    // 8. Today's Sales
    todaySalesKg: Number(todaySalesKg.toFixed(3)),
    // 9. Today's Returns
    todayReturnsCount,
    // 10. Pending Sync Records
    pendingSyncCount,
    lastSuccessfulSyncTime: lastSyncSetting?.value || null,
  };
}

/**
 * Get Complete Batch Lifecycle for single or all batches
 */
export async function getBatchLifecycleReport(filterBatchId = null) {
  const db = await getDB();
  const rawList = (await db.getAll('raw_material')).filter(isRecordActive);
  const procList = (await db.getAll('processing')).filter(isRecordActive);
  const pkgList = (await db.getAll('packaging')).filter(isRecordActive);
  const saleList = (await db.getAll('order_sale')).filter(isRecordActive);
  const recoveryList = db.objectStoreNames.contains('powder_recovery') 
    ? (await db.getAll('powder_recovery')).filter(isRecordActive) 
    : [];
  const returnList = db.objectStoreNames.contains('sales_return')
    ? (await db.getAll('sales_return')).filter(isRecordActive)
    : [];

  // Unique batch list
  const batches = Array.from(new Set(rawList.map(r => r.batch_id)));

  const reports = [];

  for (const bId of batches) {
    if (filterBatchId && bId.toLowerCase() !== filterBatchId.toLowerCase()) {
      continue;
    }

    const rawEntries = rawList.filter(r => r.batch_id === bId);
    const procEntries = procList.filter(p => p.batch_id === bId).sort((a, b) => (a.processing_round || 0) - (b.processing_round || 0));
    const pkgEntries = pkgList.filter(k => k.batch_id === bId);
    const saleEntries = saleList.filter(s => s.batch_id === bId);
    const bRecoveries = recoveryList.filter(rec => rec.batch_id === bId);
    const bReturns = returnList.filter(ret => ret.batch_id === bId);

    const productName = rawEntries[0]?.material_name || procEntries[0]?.material_name || 'Unknown';
    const originalInwardKg = rawEntries.reduce((sum, r) => sum + (Number(r.quantity_kg) || 0), 0);
    const totalProcessedKg = procEntries.reduce((sum, p) => sum + (Number(p.gross_raw_kg) || 0), 0);
    const remainingRawKg = Math.max(0, Number((originalInwardKg - totalProcessedKg).toFixed(3)));

    const netPowderProducedKg = procEntries.reduce((sum, p) => sum + (Number(p.net_powder_kg) || 0), 0);
    const powderUsedInPkgKg = pkgEntries.reduce((sum, k) => sum + (Number(k.powder_used_kg) || 0), 0);
    const actualRecoveredKg = bRecoveries.reduce((sum, rec) => sum + (Number(rec.actual_recovered_powder_kg) || 0), 0) +
      bReturns.filter(ret => ret.status === 'RECOVERY_COMPLETED' && !ret.recovery_id).reduce((sum, ret) => sum + (Number(ret.actual_recovered_powder_kg) || 0), 0);

    const remainingPowderKg = Math.max(0, Number((netPowderProducedKg + actualRecoveredKg - powderUsedInPkgKg).toFixed(3)));

    // Pack sizes produced in KG
    const packSizesProducedKg = {};
    pkgEntries.forEach(k => {
      const size = Number(k.pack_size_gm);
      const kg = Number(k.powder_used_kg) || Number(k.quantity_kg) || ((Number(k.packet_quantity) * size) / 1000) || 0;
      packSizesProducedKg[size] = Number(((packSizesProducedKg[size] || 0) + kg).toFixed(3));
    });

    const packSizesSoldKg = {};
    let totalKgSold = 0;
    saleEntries.forEach(s => {
      const size = Number(s.pack_size_gm);
      const kg = Number(s.kg_sold) || 0;
      packSizesSoldKg[size] = Number(((packSizesSoldKg[size] || 0) + kg).toFixed(3));
      totalKgSold += kg;
    });

    const packSizesReturnedReusableKg = {};
    bReturns.forEach(ret => {
      const size = Number(ret.pack_size_gm);
      const reusPkts = Number(ret.reusable_packets) || 0;
      const kg = (reusPkts * size) / 1000;
      packSizesReturnedReusableKg[size] = Number(((packSizesReturnedReusableKg[size] || 0) + kg).toFixed(3));
    });

    const remainingKgBySize = {};
    let totalRemainingFinishedKg = 0;

    const allSizes = Array.from(new Set([...Object.keys(packSizesProducedKg), ...Object.keys(packSizesSoldKg), ...Object.keys(packSizesReturnedReusableKg)])).map(Number);
    allSizes.sort((a, b) => a - b);

    allSizes.forEach(size => {
      const prodKg = packSizesProducedKg[size] || 0;
      const soldKg = packSizesSoldKg[size] || 0;
      const reusKg = packSizesReturnedReusableKg[size] || 0;
      const remKg = Math.max(0, Number((prodKg - soldKg + reusKg).toFixed(3)));
      remainingKgBySize[size] = remKg;
      totalRemainingFinishedKg += remKg;
    });

    reports.push({
      batchId: bId,
      productName,
      inwardDate: rawEntries[0]?.date || rawEntries[0]?.timestamp?.slice(0, 10),
      supplierName: rawEntries[0]?.supplier_name || 'N/A',
      originalInwardKg: Number(originalInwardKg.toFixed(3)),
      totalProcessedKg: Number(totalProcessedKg.toFixed(3)),
      remainingRawKg,
      totalNetPowderProducedKg: Number(netPowderProducedKg.toFixed(3)),
      actualRecoveredPowderKg: Number(actualRecoveredKg.toFixed(3)),
      powderUsedInPackagingKg: Number(powderUsedInPkgKg.toFixed(3)),
      remainingPowderKg,
      packSizesProducedKg,
      kgSold: Number(totalKgSold.toFixed(3)),
      packSizesSoldKg,
      remainingKgBySize,
      totalRemainingFinishedKg: Number(totalRemainingFinishedKg.toFixed(3)),
      processingRounds: procEntries,
      pkgEntries,
      saleEntries,
      rawEntries,
      returns: bReturns,
      recoveries: bRecoveries,
    });
  }

  return reports;
}

/**
 * Get Sales Return Summary metrics
 */
export async function getSalesReturnSummary() {
  const db = await getDB();
  if (!db.objectStoreNames.contains('sales_return')) {
    return {
      totalReturnsCount: 0,
      totalReturnedPackets: 0,
      totalReusablePackets: 0,
      totalRejectedPackets: 0,
      totalEstimatedPowderKg: 0,
      totalActualRecoveredKg: 0,
      pendingRecoveryCount: 0,
      pendingRecoveryEstimatedKg: 0,
      returnsList: []
    };
  }

  const returns = (await db.getAll('sales_return')).filter(isRecordActive);
  let totalReturnedPackets = 0;
  let totalReusablePackets = 0;
  let totalRejectedPackets = 0;
  let totalEstimatedPowderKg = 0;
  let totalActualRecoveredKg = 0;
  let pendingRecoveryCount = 0;
  let pendingRecoveryEstimatedKg = 0;

  for (const r of returns) {
    const retPkts = Number(r.returned_packets) || 0;
    const reusPkts = Number(r.reusable_packets) || 0;
    const rejPkts = Number(r.rejected_packets) || 0;
    const estKg = Number(r.estimated_powder_kg) || ((rejPkts * Number(r.pack_size_gm || 0)) / 1000);
    const actKg = Number(r.actual_recovered_powder_kg) || 0;

    totalReturnedPackets += retPkts;
    totalReusablePackets += reusPkts;
    totalRejectedPackets += rejPkts;
    totalEstimatedPowderKg += estKg;
    totalActualRecoveredKg += actKg;

    if (rejPkts > 0 && r.status === 'PENDING_RECOVERY') {
      pendingRecoveryCount += 1;
      pendingRecoveryEstimatedKg += estKg;
    }
  }

  return {
    totalReturnsCount: returns.length,
    totalReturnedPackets,
    totalReusablePackets,
    totalRejectedPackets,
    totalEstimatedPowderKg: Number(totalEstimatedPowderKg.toFixed(3)),
    totalActualRecoveredKg: Number(totalActualRecoveredKg.toFixed(3)),
    pendingRecoveryCount,
    pendingRecoveryEstimatedKg: Number(pendingRecoveryEstimatedKg.toFixed(3)),
    returnsList: returns.sort((a, b) => new Date(b.date || b.timestamp) - new Date(a.date || a.timestamp))
  };
}

/**
 * Validate Sales Return Data
 * Checks linked order constraints or batch existence
 */
export async function validateSalesReturn({ orderId, batchId, packSizeGm, returnedPackets, reusablePackets, rejectedPackets }) {
  const retPkts = Number(returnedPackets) || 0;
  const reusPkts = Number(reusablePackets) || 0;
  const rejPkts = Number(rejectedPackets) || 0;
  const sizeGm = Number(packSizeGm) || 0;

  if (retPkts <= 0) {
    return { valid: false, error: 'Total returned packets must be greater than 0.' };
  }
  if (reusPkts + rejPkts !== retPkts) {
    return { valid: false, error: `Reusable packets (${reusPkts}) + Rejected packets (${rejPkts}) must exactly equal Total returned packets (${retPkts}).` };
  }

  const db = await getDB();

  // If orderId provided, validate against existing sale records
  if (orderId && orderId.trim()) {
    const cleanOrderId = orderId.trim();
    const allSales = (await db.getAll('order_sale')).filter(isRecordActive);
    const matchingSales = allSales.filter(s => 
      (s.order_id === cleanOrderId || s.entry_id === cleanOrderId) &&
      (!batchId || s.batch_id === batchId) &&
      (!sizeGm || Number(s.pack_size_gm) === sizeGm)
    );

    if (matchingSales.length === 0) {
      return { 
        valid: false, 
        error: `Order ID "${cleanOrderId}" was not found in sales records for Batch ${batchId || ''} (${sizeGm}g).` 
      };
    }

    const totalSoldPackets = matchingSales.reduce((acc, s) => {
      if (s.packets_deducted != null) return acc + Number(s.packets_deducted);
      return acc + Math.round(((Number(s.kg_sold) || 0) * 1000) / sizeGm);
    }, 0);

    // Check prior returns against this order
    const allReturns = db.objectStoreNames.contains('sales_return') 
      ? (await db.getAll('sales_return')).filter(isRecordActive)
      : [];
    const priorReturns = allReturns.filter(r => 
      (r.order_id === cleanOrderId) &&
      (!batchId || r.batch_id === batchId) &&
      (!sizeGm || Number(r.pack_size_gm) === sizeGm)
    );

    const alreadyReturnedPackets = priorReturns.reduce((acc, r) => acc + (Number(r.returned_packets) || 0), 0);
    const maxReturnable = totalSoldPackets - alreadyReturnedPackets;

    if (retPkts > maxReturnable) {
      return {
        valid: false,
        error: `Return quantity (${retPkts} pkts) exceeds original order balance. Sold: ${totalSoldPackets} pkts, Prior returns: ${alreadyReturnedPackets} pkts, Maximum returnable: ${maxReturnable} pkts.`
      };
    }

    return { valid: true, isLinked: true, order: matchingSales[0], maxReturnable };
  }

  // If unlinked (No order ID provided), validate batch exists in inventory
  if (batchId) {
    const finishedSummary = await getFinishedStockSummary();
    const batchExists = finishedSummary.allItems.some(i => i.batchId === batchId && (!sizeGm || i.packSizeGm === sizeGm));
    if (!batchExists) {
      const rawList = await db.getAll('raw_material');
      const hasRaw = rawList.some(r => r.batch_id === batchId);
      if (!hasRaw) {
        return { valid: false, error: `Batch ID "${batchId}" does not exist in factory inventory records.` };
      }
    }
  }

  return { valid: true, isLinked: false };
}

/**
 * Complete Powder Recovery for a Sales Return record
 * Adds actual recovered powder (KG) to available powder stock
 */
export async function completePowderRecovery({ returnId, actualRecoveredPowderKg, notes, adminName = 'Admin' }) {
  const actualKg = Number(actualRecoveredPowderKg);
  if (isNaN(actualKg) || actualKg <= 0) {
    throw new Error('Actual recovered powder must be greater than 0 KG.');
  }

  const db = await getDB();
  const returnList = await db.getAll('sales_return');
  const returnRecord = returnList.find(r => r.return_id === returnId || r.id === returnId);
  if (!returnRecord) {
    throw new Error(`Sales return record "${returnId}" not found.`);
  }

  const recoveryId = generateRecoveryId();
  const now = new Date().toISOString();

  // Create powder_recovery record
  const recoveryRecord = {
    recovery_id: recoveryId,
    return_id: returnRecord.return_id,
    batch_id: returnRecord.batch_id,
    product_name: returnRecord.product_name,
    pack_size_gm: returnRecord.pack_size_gm,
    rejected_packets: returnRecord.rejected_packets,
    estimated_powder_kg: returnRecord.estimated_powder_kg,
    actual_recovered_powder_kg: Number(actualKg.toFixed(3)),
    date: now.slice(0, 10),
    timestamp: now,
    recovered_by: adminName,
    notes: notes ? notes.trim() : '',
    status: 'COMPLETED',
    is_reversed: false,
    synced: false
  };

  if (db.objectStoreNames.contains('powder_recovery')) {
    await db.put('powder_recovery', recoveryRecord);
    try {
      await queueRecordForSync('powder_recovery', recoveryRecord);
    } catch {}
  }

  // Update return record
  returnRecord.status = 'RECOVERY_COMPLETED';
  returnRecord.recovery_id = recoveryId;
  returnRecord.actual_recovered_powder_kg = Number(actualKg.toFixed(3));
  returnRecord.recovery_date = now.slice(0, 10);
  returnRecord.recovery_notes = notes ? notes.trim() : '';
  returnRecord.recovered_by = adminName;
  returnRecord.synced = false;

  await db.put('sales_return', returnRecord);
  try {
    await queueRecordForSync('sales_return', returnRecord);
  } catch {}

  // Audit log
  try {
    await db.add('audit_logs', {
      timestamp: now,
      module: 'POWDER_RECOVERY',
      action: 'COMPLETE_POWDER_RECOVERY',
      performed_by: adminName,
      target_id: recoveryId,
      details: `Completed powder recovery: ${actualKg.toFixed(3)} KG added to powder stock for Batch ${returnRecord.batch_id} (${returnRecord.product_name}). Return ID: ${returnRecord.return_id}`
    });
  } catch {}

  return { recoveryRecord, returnRecord };
}

/**
 * Validate Reversal Dependency Safety
 */
export async function validateRecordReversal(module, entryId) {
  const db = await getDB();
  const mod = module.toLowerCase();

  if (mod === 'raw_material') {
    const rawList = await db.getAll('raw_material');
    const entry = rawList.find(r => r.entry_id === entryId || r.id === entryId);
    if (!entry) throw new Error(`Raw Material entry "${entryId}" not found.`);
    if (entry.is_reversed) throw new Error(`Entry "${entryId}" is already reversed.`);

    const batchId = entry.batch_id;
    const inwardKg = Number(entry.quantity_kg) || 0;
    const activeRaw = rawList.filter(r => isRecordActive(r) && r.batch_id === batchId);
    const totalInwardKg = activeRaw.reduce((sum, r) => sum + (Number(r.quantity_kg) || 0), 0);

    const procList = (await db.getAll('processing')).filter(isRecordActive);
    const processedKg = procList
      .filter(p => p.batch_id === batchId)
      .reduce((sum, p) => sum + (Number(p.gross_raw_kg) || 0), 0);

    const remainingIfReversed = totalInwardKg - inwardKg;
    if (remainingIfReversed < processedKg - 0.0001) {
      throw new Error(
        `Cannot reverse Raw Material entry ${entryId}. Batch ${batchId} has already had ${processedKg.toFixed(3)} KG processed into powder. Reversing this entry would leave only ${remainingIfReversed.toFixed(3)} KG inward, causing negative stock. Please reverse or adjust dependent processing records first.`
      );
    }
    return { valid: true, entry };
  }

  if (mod === 'processing') {
    const procList = await db.getAll('processing');
    const entry = procList.find(p => p.entry_id === entryId || p.id === entryId);
    if (!entry) throw new Error(`Processing entry "${entryId}" not found.`);
    if (entry.is_reversed) throw new Error(`Entry "${entryId}" is already reversed.`);

    const batchId = entry.batch_id;
    const netPowderKg = Number(entry.net_powder_kg) || 0;
    const activeProc = procList.filter(p => isRecordActive(p) && p.batch_id === batchId);
    const totalPowderKg = activeProc.reduce((sum, p) => sum + (Number(p.net_powder_kg) || 0), 0);

    const pkgList = (await db.getAll('packaging')).filter(isRecordActive);
    const packagedKg = pkgList
      .filter(k => k.batch_id === batchId)
      .reduce((sum, k) => sum + (Number(k.powder_used_kg) || Number(k.quantity_kg) || ((Number(k.packet_quantity) * Number(k.pack_size_gm)) / 1000) || 0), 0);

    const recList = db.objectStoreNames.contains('powder_recovery') ? (await db.getAll('powder_recovery')).filter(isRecordActive) : [];
    const recoveredKg = recList.filter(r => r.batch_id === batchId).reduce((sum, r) => sum + (Number(r.actual_recovered_powder_kg) || 0), 0);

    const remainingIfReversed = (totalPowderKg - netPowderKg + recoveredKg);
    if (remainingIfReversed < packagedKg - 0.0001) {
      throw new Error(
        `Cannot reverse Processing entry ${entryId}. Batch ${batchId} has already used ${packagedKg.toFixed(3)} KG powder in packaging. Reversing this entry would leave only ${remainingIfReversed.toFixed(3)} KG powder, causing negative stock. Please reverse dependent packaging records first.`
      );
    }
    return { valid: true, entry };
  }

  if (mod === 'packaging') {
    const pkgList = await db.getAll('packaging');
    const entry = pkgList.find(k => k.entry_id === entryId || k.id === entryId);
    if (!entry) throw new Error(`Packaging entry "${entryId}" not found.`);
    if (entry.is_reversed) throw new Error(`Entry "${entryId}" is already reversed.`);

    const batchId = entry.batch_id;
    const sizeGm = Number(entry.pack_size_gm);
    const pktsProduced = Number(entry.packet_quantity) || Math.round(((Number(entry.powder_used_kg) || 0) * 1000) / sizeGm);

    const activePkg = pkgList.filter(k => isRecordActive(k) && k.batch_id === batchId && Number(k.pack_size_gm) === sizeGm);
    const totalProduced = activePkg.reduce((sum, k) => {
      if (k.packet_quantity != null) return sum + Number(k.packet_quantity);
      return sum + Math.round(((Number(k.powder_used_kg) || 0) * 1000) / sizeGm);
    }, 0);

    const salesList = (await db.getAll('order_sale')).filter(isRecordActive);
    const totalSold = salesList
      .filter(s => s.batch_id === batchId && Number(s.pack_size_gm) === sizeGm)
      .reduce((sum, s) => {
        if (s.packets_deducted != null) return sum + Number(s.packets_deducted);
        return sum + Math.round(((Number(s.kg_sold) || 0) * 1000) / sizeGm);
      }, 0);

    const returnList = db.objectStoreNames.contains('sales_return') ? (await db.getAll('sales_return')).filter(isRecordActive) : [];
    const reusableReturned = returnList
      .filter(r => r.batch_id === batchId && Number(r.pack_size_gm) === sizeGm)
      .reduce((sum, r) => sum + (Number(r.reusable_packets) || 0), 0);

    const remainingIfReversed = totalProduced - pktsProduced + reusableReturned;
    if (remainingIfReversed < totalSold) {
      throw new Error(
        `Cannot reverse Packaging entry ${entryId}. Batch ${batchId} (${sizeGm}g) has already had ${totalSold} packets sold. Reversing this entry would leave only ${remainingIfReversed} packets in stock. Please reverse dependent sales records first.`
      );
    }
    return { valid: true, entry };
  }

  if (mod === 'order_sale') {
    const saleList = await db.getAll('order_sale');
    const entry = saleList.find(s => s.entry_id === entryId || s.id === entryId || s.order_id === entryId);
    if (!entry) throw new Error(`Order/Sale entry "${entryId}" not found.`);
    if (entry.is_reversed) throw new Error(`Entry "${entryId}" is already reversed.`);

    const returnList = db.objectStoreNames.contains('sales_return') ? (await db.getAll('sales_return')).filter(isRecordActive) : [];
    const returnsOnOrder = returnList.filter(r => r.order_id === entry.order_id || r.order_id === entry.entry_id);
    if (returnsOnOrder.length > 0) {
      throw new Error(
        `Cannot reverse Order/Sale entry ${entryId} because ${returnsOnOrder.length} Sales Return record(s) exist against this order. Please reverse the sales return records first.`
      );
    }
    return { valid: true, entry };
  }

  if (mod === 'sales_return') {
    const retList = await db.getAll('sales_return');
    const entry = retList.find(r => r.return_id === entryId || r.entry_id === entryId || r.id === entryId);
    if (!entry) throw new Error(`Sales Return entry "${entryId}" not found.`);
    if (entry.is_reversed) throw new Error(`Entry "${entryId}" is already reversed.`);

    if (Number(entry.actual_recovered_powder_kg) > 0) {
      const powderSummary = await getPowderStockSummary();
      const batchStock = powderSummary.batchMap[entry.batch_id];
      if (batchStock && batchStock.remainingPowderKg < Number(entry.actual_recovered_powder_kg) - 0.0001) {
        throw new Error(
          `Cannot reverse Sales Return entry ${entryId}. The recovered powder (${entry.actual_recovered_powder_kg} KG) from this return has already been packaged. Available powder balance for Batch ${entry.batch_id} is only ${batchStock.remainingPowderKg.toFixed(3)} KG.`
        );
      }
    }
    return { valid: true, entry };
  }

  return { valid: true };
}

/**
 * Validate Record Edit Safety
 */
export async function validateRecordEdit(module, entryId, updatedValues) {
  const db = await getDB();
  const mod = module.toLowerCase();

  if (mod === 'raw_material') {
    const rawList = await db.getAll('raw_material');
    const entry = rawList.find(r => r.entry_id === entryId || r.id === entryId);
    if (!entry) throw new Error(`Raw material entry "${entryId}" not found.`);

    // 1. Quantity validation against processed usage
    if (updatedValues.quantity_kg !== undefined) {
      const newInward = Number(updatedValues.quantity_kg);
      if (isNaN(newInward) || newInward <= 0) throw new Error('Quantity must be greater than 0 KG.');

      const batchId = (updatedValues.batch_id || entry.batch_id).trim().toUpperCase();
      const activeRaw = rawList.filter(r => isRecordActive(r) && (r.batch_id || '').toUpperCase() === batchId && r.entry_id !== entry.entry_id);
      const otherInward = activeRaw.reduce((sum, r) => sum + (Number(r.quantity_kg) || 0), 0);
      const totalNewInward = otherInward + newInward;

      const procList = (await db.getAll('processing')).filter(isRecordActive);
      const processedKg = procList.filter(p => (p.batch_id || '').toUpperCase() === batchId).reduce((sum, p) => sum + (Number(p.gross_raw_kg) || 0), 0);

      if (totalNewInward < processedKg - 0.0001) {
        throw new Error(
          `Cannot reduce inward quantity to ${newInward} KG. Batch ${batchId} already has ${processedKg.toFixed(3)} KG processed into powder. Minimum inward required: ${(processedKg - otherInward).toFixed(3)} KG.`
        );
      }
    }

    // 2. Batch ID change validation
    if (updatedValues.batch_id !== undefined) {
      const cleanNewBatch = String(updatedValues.batch_id).trim().toUpperCase();
      const cleanOldBatch = (entry.batch_id || '').trim().toUpperCase();
      if (!cleanNewBatch) throw new Error('Batch ID cannot be blank.');
      if (cleanNewBatch !== cleanOldBatch) {
        const duplicate = rawList.find(r => r.entry_id !== entry.entry_id && (r.batch_id || '').trim().toUpperCase() === cleanNewBatch);
        if (duplicate) {
          throw new Error(`Batch ID "${cleanNewBatch}" already exists in factory records (Entry ${duplicate.entry_id}). Batch numbers must remain unique.`);
        }
      }
    }
  }

  return { valid: true };
}

/**
 * Reverse an Inventory Record (Soft reversal with audit trail)
 */
export async function reverseInventoryRecord(module, entryId, reason, adminName = 'Admin') {
  if (!reason || !reason.trim()) {
    throw new Error('A reversal reason is mandatory.');
  }

  const mod = module.toLowerCase();
  const db = await getDB();
  const { entry } = await validateRecordReversal(mod, entryId);

  entry.is_reversed = true;
  entry.status = 'REVERSED';
  entry.reversed_at = new Date().toISOString();
  entry.reversed_by = adminName;
  entry.reversal_reason = reason.trim();
  entry.synced = false;

  await db.put(mod, entry);

  // Write to audit log
  try {
    await db.add('audit_logs', {
      timestamp: new Date().toISOString(),
      module: mod.toUpperCase(),
      action: 'REVERSE_ENTRY',
      performed_by: adminName,
      target_id: entryId,
      details: `Reversed entry ${entryId} in ${mod}. Reason: ${reason.trim()}`
    });
  } catch (auditErr) {
    console.warn('Could not write reversal audit log:', auditErr);
  }

  // Queue for sync
  try {
    await queueRecordForSync(mod, entry, 'UPDATE');
  } catch (syncErr) {
    console.warn('Could not queue reversed record for sync:', syncErr);
  }

  return entry;
}

/**
 * Edit an Inventory Record (With audit logging and sync)
 */
export async function editInventoryRecord(module, entryId, updatedFields, reason, adminName = 'Admin') {
  if (!reason || !reason.trim()) {
    throw new Error('An edit reason is mandatory.');
  }

  const mod = module.toLowerCase();
  const db = await getDB();
  await validateRecordEdit(mod, entryId, updatedFields);

  const all = await db.getAll(mod);
  const entry = all.find(item => item.entry_id === entryId || item.id === entryId || item.return_id === entryId);
  if (!entry) throw new Error(`Record "${entryId}" not found in ${module}.`);
  if (entry.is_reversed) throw new Error(`Cannot edit reversed record "${entryId}".`);

  // Build diff
  const diff = {};
  for (const key of Object.keys(updatedFields)) {
    if (entry[key] !== updatedFields[key]) {
      diff[key] = { old: entry[key], new: updatedFields[key] };
    }
  }

  if (Object.keys(diff).length === 0) {
    return { entry, noChange: true };
  }

  // If Batch ID was edited on raw_material, cascade change to all linked modules
  if (mod === 'raw_material' && diff.batch_id && diff.batch_id.old && diff.batch_id.new) {
    try {
      await updateBatchIdAcrossInventory(diff.batch_id.old, diff.batch_id.new, adminName, reason);
    } catch (cascadeErr) {
      console.warn('Batch ID cascade warning:', cascadeErr.message);
    }
  }

  // Apply updates
  Object.assign(entry, updatedFields);
  entry.updated_at = new Date().toISOString();
  entry.updated_by = adminName;
  entry.last_edit_reason = reason.trim();
  entry.synced = false;

  await db.put(mod, entry);

  // Audit log
  try {
    await db.add('audit_logs', {
      timestamp: new Date().toISOString(),
      module: mod.toUpperCase(),
      action: 'EDIT_ENTRY',
      performed_by: adminName,
      target_id: entryId,
      details: `Edited entry ${entryId} in ${mod}. Reason: ${reason.trim()}`,
      diff
    });
  } catch {}

  try {
    await queueRecordForSync(mod, entry, 'UPDATE');
  } catch {}

  return entry;
}

/**
 * Validate Raw Material Delete Safety
 * Checks if the batch's raw material has already been used in Processing.
 */
export async function validateRawMaterialDelete(entryId) {
  const db = await getDB();
  const rawList = await db.getAll('raw_material');
  const entry = rawList.find(r => r.entry_id === entryId || r.id === entryId);
  if (!entry) throw new Error(`Raw Material entry "${entryId}" not found.`);
  if (entry.is_reversed) throw new Error(`Entry "${entryId}" is already deleted / reversed.`);

  const batchId = (entry.batch_id || '').trim().toUpperCase();
  const activeRaw = rawList.filter(r => isRecordActive(r) && (r.batch_id || '').toUpperCase() === batchId);
  const totalInwardKg = activeRaw.reduce((sum, r) => sum + (Number(r.quantity_kg) || 0), 0);
  const inwardKg = Number(entry.quantity_kg) || 0;

  const procList = (await db.getAll('processing')).filter(isRecordActive);
  const processedKg = procList
    .filter(p => (p.batch_id || '').toUpperCase() === batchId)
    .reduce((sum, p) => sum + (Number(p.gross_raw_kg) || 0), 0);

  const remainingIfDeleted = totalInwardKg - inwardKg;
  if (remainingIfDeleted < processedKg - 0.0001) {
    throw new Error(
      `Cannot delete Raw Material entry ${entryId}. Batch ${batchId} has already had ${processedKg.toFixed(3)} KG processed into powder. Deleting this entry would leave only ${remainingIfDeleted.toFixed(3)} KG inward, causing negative stock. Dependent processing transactions must be reversed first.`
    );
  }

  return { valid: true, entry, processedKg, totalInwardKg };
}

/**
 * Validate Raw Material Edit Safety
 */
export async function validateRawMaterialEdit(entryId, updatedValues) {
  return validateRecordEdit('raw_material', entryId, updatedValues);
}

/**
 * Edit Raw Material Entry (with permission check)
 */
export async function editRawMaterialEntry(entryId, updatedFields, reason, userName, userRole = 'staff') {
  const db = await getDB();
  const rawList = await db.getAll('raw_material');
  const entry = rawList.find(r => r.entry_id === entryId || r.id === entryId);
  if (!entry) throw new Error(`Raw Material entry "${entryId}" not found.`);

  const isAdmin = userRole === 'admin' || userRole === 'Administrator';
  const isOwner = 
    (entry.employee_name && entry.employee_name.toLowerCase().trim() === (userName || '').toLowerCase().trim()) ||
    (entry.employee_id && entry.employee_id.toUpperCase() === (userName || '').toUpperCase()) ||
    (entry.created_by_id && entry.created_by_id.toUpperCase() === (userName || '').toUpperCase());

  if (!isAdmin && !isOwner) {
    throw new Error('Permission denied: Employees can only edit their own entries.');
  }

  return editInventoryRecord('raw_material', entryId, updatedFields, reason, userName);
}

/**
 * Delete / Reverse Raw Material Entry (Soft delete with permission check)
 */
export async function deleteRawMaterialEntry(entryId, reason, userName, userRole = 'staff') {
  const db = await getDB();
  const rawList = await db.getAll('raw_material');
  const entry = rawList.find(r => r.entry_id === entryId || r.id === entryId);
  if (!entry) throw new Error(`Raw Material entry "${entryId}" not found.`);

  const isAdmin = userRole === 'admin' || userRole === 'Administrator';
  const isOwner = 
    (entry.employee_name && entry.employee_name.toLowerCase().trim() === (userName || '').toLowerCase().trim()) ||
    (entry.employee_id && entry.employee_id.toUpperCase() === (userName || '').toUpperCase()) ||
    (entry.created_by_id && entry.created_by_id.toUpperCase() === (userName || '').toUpperCase());

  if (!isAdmin && !isOwner) {
    throw new Error('Permission denied: Employees can only delete their own entries.');
  }

  await validateRawMaterialDelete(entryId);
  return reverseInventoryRecord('raw_material', entryId, reason, userName);
}
