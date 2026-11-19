import { getDB } from './db';

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
 * Automatically generate next Batch ID based on Product Prefix
 * Format: {PREFIX}-{001}
 * Never reuses existing batch IDs.
 */
export async function generateNextBatchId(productPrefix) {
  if (!productPrefix) {
    productPrefix = 'BAT';
  }
  const cleanPrefix = productPrefix.trim().toUpperCase();
  const db = await getDB();
  const rawEntries = await db.getAll('raw_material');

  let maxNum = 0;
  const regex = new RegExp(`^${cleanPrefix}-(\\d+)$`, 'i');

  for (const entry of rawEntries) {
    if (entry.batch_id) {
      const match = entry.batch_id.match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) {
          maxNum = num;
        }
      }
    }
  }

  const nextNum = maxNum + 1;
  return `${cleanPrefix}-${String(nextNum).padStart(3, '0')}`;
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
 * Batch-wise and aggregate
 */
export async function getRawMaterialStockSummary() {
  const db = await getDB();
  const rawList = await db.getAll('raw_material');
  const procList = await db.getAll('processing');

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
 * Batch-wise and aggregate
 */
export async function getPowderStockSummary() {
  const db = await getDB();
  const rawList = await db.getAll('raw_material');
  const procList = await db.getAll('processing');
  const pkgList = await db.getAll('packaging');

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
        powderUsedInPkgKg: 0,
        remainingPowderKg: 0,
      };
    }
    batchMap[p.batch_id].netPowderProducedKg += Number(p.net_powder_kg) || 0;
  }

  for (const k of pkgList) {
    if (!batchMap[k.batch_id]) {
      batchMap[k.batch_id] = {
        batchId: k.batch_id,
        productName: k.product_name || batchProductNameMap[k.batch_id] || 'Unknown',
        netPowderProducedKg: 0,
        powderUsedInPkgKg: 0,
        remainingPowderKg: 0,
      };
    }
    batchMap[k.batch_id].powderUsedInPkgKg += Number(k.powder_used_kg) || 0;
  }

  let totalNetPowderProduced = 0;
  let totalPowderUsedInPkg = 0;
  let totalRemainingPowder = 0;

  Object.values(batchMap).forEach(b => {
    b.remainingPowderKg = Math.max(0, Number((b.netPowderProducedKg - b.powderUsedInPkgKg).toFixed(3)));
    totalNetPowderProduced += b.netPowderProducedKg;
    totalPowderUsedInPkg += b.powderUsedInPkgKg;
    totalRemainingPowder += b.remainingPowderKg;
  });

  return {
    totalNetPowderProduced: Number(totalNetPowderProduced.toFixed(3)),
    totalPowderUsedInPkg: Number(totalPowderUsedInPkg.toFixed(3)),
    totalRemainingPowder: Number(totalRemainingPowder.toFixed(3)),
    batchMap,
    availableBatches: Object.values(batchMap).filter(b => b.remainingPowderKg > 0.0001),
  };
}

/**
 * Calculate FINISHED PRODUCT inventory
 * Pack-size wise, batch wise, and aggregate - STRICTLY IN KG ONLY
 */
export async function getFinishedStockSummary() {
  const db = await getDB();
  const pkgList = await db.getAll('packaging');
  const saleList = await db.getAll('order_sale');

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
        remainingKg: 0,
      };
    }
    // Powder used or quantity kg
    const kg = Number(p.powder_used_kg) || Number(p.quantity_kg) || ((Number(p.packet_quantity) * Number(p.pack_size_gm)) / 1000) || 0;
    finishedMap[key].kgProduced += Number(kg);
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
        remainingKg: 0,
      };
    }
    finishedMap[key].kgSold += Number(s.kg_sold) || 0;
  }

  let totalFinishedKg = 0;

  Object.values(finishedMap).forEach(item => {
    item.kgProduced = Number(item.kgProduced.toFixed(3));
    item.kgSold = Number(item.kgSold.toFixed(3));
    item.remainingKg = Math.max(0, Number((item.kgProduced - item.kgSold).toFixed(3)));

    totalFinishedKg += item.remainingKg;

    // Aggregate by product
    if (!productSummary[item.productName]) {
      productSummary[item.productName] = {
        productName: item.productName,
        totalKg: 0,
        packSizes: {},
      };
    }
    productSummary[item.productName].totalKg = Number(
      (productSummary[item.productName].totalKg + item.remainingKg).toFixed(3)
    );

    if (!productSummary[item.productName].packSizes[item.packSizeGm]) {
      productSummary[item.productName].packSizes[item.packSizeGm] = 0;
    }
    productSummary[item.productName].packSizes[item.packSizeGm] = Number(
      (productSummary[item.productName].packSizes[item.packSizeGm] + item.remainingKg).toFixed(3)
    );
  });

  return {
    totalFinishedKg: Number(totalFinishedKg.toFixed(3)),
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

  const rawList = await db.getAll('raw_material');
  const procList = await db.getAll('processing');
  const pkgList = await db.getAll('packaging');
  const saleList = await db.getAll('order_sale');
  const queueList = await db.getAll('sync_queue');

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

  const pendingSyncCount = queueList.filter(q => q.status === 'PENDING' || q.status === 'FAILED').length;

  const lastSyncSetting = await db.get('settings', 'last_successful_sync');

  return {
    // 1. Total Raw Material Stock (Inward)
    totalRawMaterialStockKg: rawSummary.totalRawInward,
    // 2. Total Unprocessed Raw Material
    totalUnprocessedRawMaterialKg: rawSummary.totalRemainingUnprocessed,
    // 3. Total Powder Stock
    totalPowderStockKg: powderSummary.totalRemainingPowder,
    // 4. Total Finished Product Stock (KG ONLY)
    totalFinishedProductStockKg: finishedSummary.totalFinishedKg,
    // 5. Today's Raw Material Inward
    todayRawMaterialInwardKg: Number(todayRawInward.toFixed(3)),
    // 6. Today's Processing
    todayProcessingKg: Number(todayProcessing.toFixed(3)),
    // 7. Today's Packaging
    todayPackagingKg: Number(todayPackagingPowder.toFixed(3)),
    // 8. Today's Sales
    todaySalesKg: Number(todaySalesKg.toFixed(3)),
    // 9. Pending Google Sheets Uploads
    pendingSyncCount,
    lastSuccessfulSyncTime: lastSyncSetting?.value || null,
  };
}

/**
 * Get Complete Batch Lifecycle for single or all batches
 */
export async function getBatchLifecycleReport(filterBatchId = null) {
  const db = await getDB();
  const rawList = await db.getAll('raw_material');
  const procList = await db.getAll('processing');
  const pkgList = await db.getAll('packaging');
  const saleList = await db.getAll('order_sale');

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

    const productName = rawEntries[0]?.material_name || procEntries[0]?.material_name || 'Unknown';
    const originalInwardKg = rawEntries.reduce((sum, r) => sum + (Number(r.quantity_kg) || 0), 0);
    const totalProcessedKg = procEntries.reduce((sum, p) => sum + (Number(p.gross_raw_kg) || 0), 0);
    const remainingRawKg = Math.max(0, Number((originalInwardKg - totalProcessedKg).toFixed(3)));

    const netPowderProducedKg = procEntries.reduce((sum, p) => sum + (Number(p.net_powder_kg) || 0), 0);
    const powderUsedInPkgKg = pkgEntries.reduce((sum, k) => sum + (Number(k.powder_used_kg) || 0), 0);
    const remainingPowderKg = Math.max(0, Number((netPowderProducedKg - powderUsedInPkgKg).toFixed(3)));

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

    const remainingKgBySize = {};
    let totalRemainingFinishedKg = 0;

    const allSizes = Array.from(new Set([...Object.keys(packSizesProducedKg), ...Object.keys(packSizesSoldKg)])).map(Number);
    allSizes.sort((a, b) => a - b);

    allSizes.forEach(size => {
      const prodKg = packSizesProducedKg[size] || 0;
      const soldKg = packSizesSoldKg[size] || 0;
      const remKg = Math.max(0, Number((prodKg - soldKg).toFixed(3)));
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
    });
  }

  return reports;
}
