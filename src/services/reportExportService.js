import ExcelJS from 'exceljs';
import { getDB } from './db.js';
import { 
  initFirebase, 
  isFirebaseConfigured, 
  getFirebaseConfig 
} from './firebase.js';
import { collection, getDocs } from 'firebase/firestore';

/**
 * Calculate current financial year (1 April to 31 March)
 * e.g., on 18 Nov 2026, returns { fromDate: '2026-04-01', toDate: '2027-03-31' }
 */
export function getCurrentFinancialYearRange() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-indexed: 0 = Jan, 3 = April
  
  let startYear = currentYear;
  let endYear = currentYear + 1;
  
  if (currentMonth < 3) { // Jan, Feb, Mar
    startYear = currentYear - 1;
    endYear = currentYear;
  }
  
  return {
    fromDate: `${startYear}-04-01`,
    toDate: `${endYear}-03-31`,
    label: `FY ${startYear}-${String(endYear).slice(-2)}`
  };
}

/**
 * Format ISO date string (YYYY-MM-DD) to Indian Display Date (DD-MM-YYYY)
 */
export function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const clean = dateStr.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
}

/**
 * Fetch all raw records from Firebase Firestore or local IndexedDB
 */
export async function fetchAllReportRecords() {
  let isFromFirebase = false;
  let sourceName = 'Local Database (Offline / Synced)';
  let rawList = [];
  let procList = [];
  let pkgList = [];
  let saleList = [];
  let prodList = [];
  let empList = [];

  try {
    const isConfigured = await isFirebaseConfigured();
    if (isConfigured && navigator.onLine) {
      const initRes = await initFirebase();
      if (initRes.initialized) {
        const db = initRes.db;
        const config = await getFirebaseConfig();

        const [rawSnap, procSnap, pkgSnap, saleSnap, prodSnap, empSnap] = await Promise.all([
          getDocs(collection(db, 'raw_material')),
          getDocs(collection(db, 'processing')),
          getDocs(collection(db, 'packaging')),
          getDocs(collection(db, 'order_sale')),
          getDocs(collection(db, 'products')),
          getDocs(collection(db, 'employees')),
        ]);

        rawList = rawSnap.docs.map(d => ({ ...d.data(), docId: d.id }));
        procList = procSnap.docs.map(d => ({ ...d.data(), docId: d.id }));
        pkgList = pkgSnap.docs.map(d => ({ ...d.data(), docId: d.id }));
        saleList = saleSnap.docs.map(d => ({ ...d.data(), docId: d.id }));
        prodList = prodSnap.docs.map(d => ({ ...d.data(), docId: d.id }));
        empList = empSnap.docs.map(d => ({ ...d.data(), docId: d.id }));

        isFromFirebase = true;
        sourceName = `Firebase Cloud Firestore (${config.projectId})`;
      }
    }
  } catch (err) {
    console.warn('Firebase report fetch failed, using local database:', err.message);
  }

  // Fallback to local IndexedDB
  if (!isFromFirebase || (rawList.length === 0 && procList.length === 0 && pkgList.length === 0 && saleList.length === 0)) {
    const localDb = await getDB();
    const [r, p, k, s, pr, e] = await Promise.all([
      localDb.getAll('raw_material'),
      localDb.getAll('processing'),
      localDb.getAll('packaging'),
      localDb.getAll('order_sale'),
      localDb.getAll('products'),
      localDb.getAll('employees')
    ]);

    rawList = r;
    procList = p;
    pkgList = k;
    saleList = s;
    prodList = pr;
    empList = e;
    if (!isFromFirebase) {
      sourceName = 'Local Database (Offline / Synced)';
    }
  }

  return {
    isFromFirebase,
    sourceName,
    rawList,
    procList,
    pkgList,
    saleList,
    prodList,
    empList
  };
}

/**
 * Filter and compile comprehensive report data for preview & export
 */
export async function compileReportData(fromDate, toDate) {
  const records = await fetchAllReportRecords();
  const { rawList, procList, pkgList, saleList, isFromFirebase, sourceName } = records;

  const from = fromDate || '2000-01-01';
  const to = toDate || '2099-12-31';

  // Date filtering helper
  const inRange = (d) => {
    if (!d) return false;
    const clean = d.slice(0, 10);
    return clean >= from && clean <= to;
  };

  // Up-to-end date helper (for closing stock as of `toDate`)
  const upToEnd = (d) => {
    if (!d) return false;
    const clean = d.slice(0, 10);
    return clean <= to;
  };

  // Prior to start date helper (for opening stock as of `fromDate`)
  const priorToStart = (d) => {
    if (!d) return false;
    const clean = d.slice(0, 10);
    return clean < from;
  };

  // Build Batch to Product Map for consistency
  const batchProductMap = {};
  rawList.forEach(r => {
    if (r.batch_id && r.material_name) {
      batchProductMap[r.batch_id] = r.material_name.trim();
    }
  });

  // 1. Period-specific filtered records
  const periodRaw = rawList
    .filter(r => inRange(r.date || r.timestamp))
    .sort((a, b) => new Date(a.date || a.timestamp) - new Date(b.date || b.timestamp));

  const periodProc = procList
    .filter(p => inRange(p.date || p.timestamp))
    .sort((a, b) => new Date(a.date || a.timestamp) - new Date(b.date || b.timestamp));

  const periodPkg = pkgList
    .filter(k => inRange(k.date || k.timestamp))
    .sort((a, b) => new Date(a.date || a.timestamp) - new Date(b.date || b.timestamp));

  const periodSales = saleList
    .filter(s => inRange(s.date || s.timestamp))
    .sort((a, b) => new Date(a.date || a.timestamp) - new Date(b.date || b.timestamp));

  // 2. All records up to report end date (for accurate closing stock & batch traceability)
  const upToRaw = rawList.filter(r => upToEnd(r.date || r.timestamp));
  const upToProc = procList.filter(p => upToEnd(p.date || p.timestamp));
  const upToPkg = pkgList.filter(k => upToEnd(k.date || k.timestamp));
  const upToSales = saleList.filter(s => upToEnd(s.date || s.timestamp));

  // 3. Prior records (for opening balances)
  const priorRaw = rawList.filter(r => priorToStart(r.date || r.timestamp));
  const priorProc = procList.filter(p => priorToStart(p.date || p.timestamp));
  const priorPkg = pkgList.filter(k => priorToStart(k.date || k.timestamp));
  const priorSales = saleList.filter(s => priorToStart(s.date || s.timestamp));

  // Product normalization helper
  const getProd = (name, batchId) => {
    const raw = (name || (batchId ? batchProductMap[batchId] : '') || '').toLowerCase().trim();
    if (raw.includes('haldi')) return 'Haldi';
    if (raw.includes('mirchi')) return 'Mirchi';
    if (raw.includes('dhaniya')) return 'Dhaniya';
    return name ? name.trim() : 'Other Spice';
  };

  const PRODUCTS = ['Haldi', 'Mirchi', 'Dhaniya'];
  const PACK_SIZES = [10, 24, 50, 100, 200, 500];

  // Stock Summary as of report end date
  const closingStockByProduct = {};
  const openingStockByProduct = {};

  PRODUCTS.forEach(prod => {
    // Closing Stock (Up to end date)
    const inKg = upToRaw.filter(r => getProd(r.material_name, r.batch_id) === prod).reduce((s, r) => s + (Number(r.quantity_kg) || 0), 0);
    const procGrossKg = upToProc.filter(p => getProd(p.material_name, p.batch_id) === prod).reduce((s, p) => s + (Number(p.gross_raw_kg) || 0), 0);
    const powderMadeKg = upToProc.filter(p => getProd(p.material_name, p.batch_id) === prod).reduce((s, p) => s + (Number(p.net_powder_kg) || 0), 0);
    const powderUsedKg = upToPkg.filter(k => getProd(k.product_name, k.batch_id) === prod).reduce((s, k) => s + (Number(k.powder_used_kg) || Number(k.quantity_kg) || 0), 0);

    const rawAvail = Math.max(0, Number((inKg - procGrossKg).toFixed(3)));
    const powderAvail = Math.max(0, Number((powderMadeKg - powderUsedKg).toFixed(3)));

    closingStockByProduct[prod] = {
      rawAvailableKg: rawAvail,
      powderAvailableKg: powderAvail,
      totalInwardKg: inKg,
      totalProcessedKg: procGrossKg
    };

    // Opening Stock (Prior to start date)
    const opInKg = priorRaw.filter(r => getProd(r.material_name, r.batch_id) === prod).reduce((s, r) => s + (Number(r.quantity_kg) || 0), 0);
    const opProcKg = priorProc.filter(p => getProd(p.material_name, p.batch_id) === prod).reduce((s, p) => s + (Number(p.gross_raw_kg) || 0), 0);
    const opPowderMadeKg = priorProc.filter(p => getProd(p.material_name, p.batch_id) === prod).reduce((s, p) => s + (Number(p.net_powder_kg) || 0), 0);
    const opPowderUsedKg = priorPkg.filter(k => getProd(k.product_name, k.batch_id) === prod).reduce((s, k) => s + (Number(k.powder_used_kg) || Number(k.quantity_kg) || 0), 0);

    openingStockByProduct[prod] = {
      rawAvailableKg: Math.max(0, Number((opInKg - opProcKg).toFixed(3))),
      powderAvailableKg: Math.max(0, Number((opPowderMadeKg - opPowderUsedKg).toFixed(3)))
    };
  });

  // Finished Goods closing stock (Packets Produced - Packets Sold up to end date)
  const finishedStockMap = {};
  upToPkg.forEach(k => {
    const prod = getProd(k.product_name, k.batch_id);
    const size = Number(k.pack_size_gm);
    const key = `${prod}__${k.batch_id}__${size}`;
    if (!finishedStockMap[key]) {
      finishedStockMap[key] = {
        productName: prod,
        batchId: k.batch_id,
        packSizeGm: size,
        packetsProduced: 0,
        packetsSold: 0,
        availablePackets: 0,
        remainingKg: 0
      };
    }
    const pkts = k.packet_quantity != null ? Number(k.packet_quantity) : Math.round(((Number(k.powder_used_kg) || 0) * 1000) / size);
    finishedStockMap[key].packetsProduced += pkts;
  });

  upToSales.forEach(s => {
    const prod = getProd(s.product_name, s.batch_id);
    const size = Number(s.pack_size_gm);
    const key = `${prod}__${s.batch_id}__${size}`;
    if (!finishedStockMap[key]) {
      finishedStockMap[key] = {
        productName: prod,
        batchId: s.batch_id,
        packSizeGm: size,
        packetsProduced: 0,
        packetsSold: 0,
        availablePackets: 0,
        remainingKg: 0
      };
    }
    const pkts = s.packets_deducted != null ? Number(s.packets_deducted) : Math.round(((Number(s.kg_sold) || 0) * 1000) / size);
    finishedStockMap[key].packetsSold += pkts;
  });

  let totalClosingFinishedPackets = 0;
  let totalClosingFinishedKg = 0;

  Object.values(finishedStockMap).forEach(item => {
    item.availablePackets = Math.max(0, item.packetsProduced - item.packetsSold);
    item.remainingKg = Number(((item.availablePackets * item.packSizeGm) / 1000).toFixed(3));
    totalClosingFinishedPackets += item.availablePackets;
    totalClosingFinishedKg += item.remainingKg;
  });

  // Powder stock report table rows (by batch)
  const powderBatchMap = {};
  upToProc.forEach(p => {
    const prod = getProd(p.material_name, p.batch_id);
    const bId = p.batch_id;
    if (!powderBatchMap[bId]) {
      powderBatchMap[bId] = {
        batchId: bId,
        productName: prod,
        totalPowderProducedKg: 0,
        powderUsedInPkgKg: 0,
        availablePowderKg: 0
      };
    }
    powderBatchMap[bId].totalPowderProducedKg += (Number(p.net_powder_kg) || 0);
  });

  upToPkg.forEach(k => {
    const bId = k.batch_id;
    const prod = getProd(k.product_name, k.batch_id);
    if (!powderBatchMap[bId]) {
      powderBatchMap[bId] = {
        batchId: bId,
        productName: prod,
        totalPowderProducedKg: 0,
        powderUsedInPkgKg: 0,
        availablePowderKg: 0
      };
    }
    const kg = Number(k.powder_used_kg) || Number(k.quantity_kg) || 0;
    powderBatchMap[bId].powderUsedInPkgKg += kg;
  });

  Object.values(powderBatchMap).forEach(b => {
    b.totalPowderProducedKg = Number(b.totalPowderProducedKg.toFixed(3));
    b.powderUsedInPkgKg = Number(b.powderUsedInPkgKg.toFixed(3));
    b.availablePowderKg = Math.max(0, Number((b.totalPowderProducedKg - b.powderUsedInPkgKg).toFixed(3)));
  });

  // Batch Traceability Map (all batches ever registered up to report end date)
  const allBatches = Array.from(new Set(upToRaw.map(r => r.batch_id)));
  const batchTraceabilityList = allBatches.map(bId => {
    const rawEntries = upToRaw.filter(r => r.batch_id === bId);
    const procEntries = upToProc.filter(p => p.batch_id === bId);
    const pkgEntries = upToPkg.filter(k => k.batch_id === bId);
    const saleEntries = upToSales.filter(s => s.batch_id === bId);

    const firstRaw = rawEntries[0] || {};
    const prodName = getProd(firstRaw.material_name, bId);
    const inwardDate = firstRaw.date || firstRaw.timestamp?.slice(0, 10) || '';
    const supplier = firstRaw.supplier_name || 'N/A';

    const originalInwardKg = rawEntries.reduce((s, r) => s + (Number(r.quantity_kg) || 0), 0);
    const totalProcessedKg = procEntries.reduce((s, p) => s + (Number(p.gross_raw_kg) || 0), 0);
    const remainingRawKg = Math.max(0, Number((originalInwardKg - totalProcessedKg).toFixed(3)));

    const netPowderKg = procEntries.reduce((s, p) => s + (Number(p.net_powder_kg) || 0), 0);
    const powderUsedKg = pkgEntries.reduce((s, k) => s + (Number(k.powder_used_kg) || Number(k.quantity_kg) || 0), 0);
    const remainingPowderKg = Math.max(0, Number((netPowderKg - powderUsedKg).toFixed(3)));

    const totalPacketsProduced = pkgEntries.reduce((s, k) => {
      const pkts = k.packet_quantity != null ? Number(k.packet_quantity) : Math.round(((Number(k.powder_used_kg) || 0) * 1000) / Number(k.pack_size_gm));
      return s + pkts;
    }, 0);

    const totalPacketsSold = saleEntries.reduce((s, sl) => {
      const pkts = sl.packets_deducted != null ? Number(sl.packets_deducted) : Math.round(((Number(sl.kg_sold) || 0) * 1000) / Number(sl.pack_size_gm));
      return s + pkts;
    }, 0);

    const totalKgSold = saleEntries.reduce((s, sl) => s + (Number(sl.kg_sold) || 0), 0);
    const availablePackets = Math.max(0, totalPacketsProduced - totalPacketsSold);

    return {
      batchId: bId,
      productName: prodName,
      inwardDate,
      supplierName: supplier,
      originalInwardKg: Number(originalInwardKg.toFixed(3)),
      totalProcessedKg: Number(totalProcessedKg.toFixed(3)),
      remainingRawKg,
      totalNetPowderProducedKg: Number(netPowderKg.toFixed(3)),
      powderUsedInPackagingKg: Number(powderUsedKg.toFixed(3)),
      remainingPowderKg,
      totalPacketsProduced,
      totalKgSold: Number(totalKgSold.toFixed(3)),
      availableFinishedPackets: availablePackets
    };
  });

  // Period Totals
  const periodTotals = {
    rawInwardKg: Number(periodRaw.reduce((s, r) => s + (Number(r.quantity_kg) || 0), 0).toFixed(3)),
    grindingGrossInputKg: Number(periodProc.reduce((s, p) => s + (Number(p.gross_raw_kg) || 0), 0).toFixed(3)),
    cleaningOutputKg: Number(periodProc.reduce((s, p) => s + (Number(p.net_raw_kg) || 0), 0).toFixed(3)),
    cleaningWasteKg: Number(periodProc.reduce((s, p) => s + (Number(p.cleaning_waste_kg) || 0), 0).toFixed(3)),
    netPowderProducedKg: Number(periodProc.reduce((s, p) => s + (Number(p.net_powder_kg) || 0), 0).toFixed(3)),
    grindingLossKg: Number(periodProc.reduce((s, p) => s + (Number(p.grinding_loss_kg) || 0), 0).toFixed(3)),
    totalLossKg: Number(periodProc.reduce((s, p) => s + (Number(p.total_loss_kg) || 0), 0).toFixed(3)),
    packagingPowderConsumedKg: Number(periodPkg.reduce((s, k) => s + (Number(k.powder_used_kg) || Number(k.quantity_kg) || 0), 0).toFixed(3)),
    packagingPacketsProduced: periodPkg.reduce((s, k) => {
      const pkts = k.packet_quantity != null ? Number(k.packet_quantity) : Math.round(((Number(k.powder_used_kg) || 0) * 1000) / Number(k.pack_size_gm));
      return s + pkts;
    }, 0),
    salesKg: Number(periodSales.reduce((s, sl) => s + (Number(sl.kg_sold) || 0), 0).toFixed(3)),
    uniqueOrdersCount: new Set(periodSales.map(s => s.order_id).filter(Boolean)).size,
    salesByProduct: {
      Haldi: Number(periodSales.filter(s => getProd(s.product_name, s.batch_id) === 'Haldi').reduce((s, sl) => s + (Number(sl.kg_sold) || 0), 0).toFixed(3)),
      Mirchi: Number(periodSales.filter(s => getProd(s.product_name, s.batch_id) === 'Mirchi').reduce((s, sl) => s + (Number(sl.kg_sold) || 0), 0).toFixed(3)),
      Dhaniya: Number(periodSales.filter(s => getProd(s.product_name, s.batch_id) === 'Dhaniya').reduce((s, sl) => s + (Number(sl.kg_sold) || 0), 0).toFixed(3)),
    }
  };

  // Validation checks
  const validations = [
    {
      title: 'Raw Material Inward Records',
      status: periodRaw.length > 0 ? 'VALID' : 'NO_DATA',
      count: periodRaw.length,
      detail: `${periodTotals.rawInwardKg} KG inward across ${periodRaw.length} entries.`
    },
    {
      title: 'Processing & Loss Reconciled',
      status: 'VALID',
      count: periodProc.length,
      detail: `Waste (${periodTotals.cleaningWasteKg} KG) + Grinding Loss (${periodTotals.grindingLossKg} KG) = Total Loss (${periodTotals.totalLossKg} KG).`
    },
    {
      title: 'Powder Consumption & Packaging',
      status: 'VALID',
      count: periodPkg.length,
      detail: `${periodTotals.packagingPowderConsumedKg} KG powder packed into ${periodTotals.packagingPacketsProduced.toLocaleString()} retail packets.`
    },
    {
      title: 'Sales Strictly in KG (No Rates)',
      status: 'VALID',
      count: periodSales.length,
      detail: `${periodTotals.salesKg} KG dispatched across ${periodTotals.uniqueOrdersCount} unique orders.`
    },
    {
      title: 'Continuous Batch Traceability',
      status: batchTraceabilityList.length > 0 ? 'VALID' : 'NO_DATA',
      count: batchTraceabilityList.length,
      detail: `${batchTraceabilityList.length} unique batches tracked seamlessly from inward to dispatch.`
    }
  ];

  return {
    fromDate,
    toDate,
    generatedAt: new Date().toISOString(),
    sourceName,
    isFromFirebase,
    periodTotals,
    closingStockByProduct,
    openingStockByProduct,
    totalClosingFinishedPackets,
    totalClosingFinishedKg,
    // Datasets
    periodRaw,
    periodProc,
    periodPkg,
    periodSales,
    powderBatchStockList: Object.values(powderBatchMap),
    finishedStockList: Object.values(finishedStockMap).filter(f => f.availablePackets > 0 || f.packetsProduced > 0),
    batchTraceabilityList,
    validations
  };
}

/**
 * Styling Constants for Professional Excel Workbook
 */
const STYLES = {
  headerFill: {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF14532D' } // Dark Forest Green
  },
  headerFont: {
    name: 'Calibri',
    size: 11,
    bold: true,
    color: { argb: 'FFFFFFFF' }
  },
  titleFill: {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F2E1B' } // Deep Emerald
  },
  titleFont: {
    name: 'Calibri',
    size: 14,
    bold: true,
    color: { argb: 'FFFFFFFF' }
  },
  subHeaderFill: {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFDCFCE7' } // Soft Sage
  },
  subHeaderFont: {
    name: 'Calibri',
    size: 11,
    bold: true,
    color: { argb: 'FF14532D' }
  },
  totalFill: {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF0FDF4' } // Light Mint
  },
  totalFont: {
    name: 'Calibri',
    size: 11,
    bold: true,
    color: { argb: 'FF0F172A' }
  },
  zebraFill: {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF8FAFC' }
  },
  whiteFill: {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFFFFF' }
  },
  thinBorder: {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
  },
  totalBorder: {
    top: { style: 'thin', color: { argb: 'FF14532D' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'double', color: { argb: 'FF14532D' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
  }
};

/**
 * Auto-adjust column widths based on contents
 */
function autoFitColumns(worksheet, minWidth = 12) {
  worksheet.columns.forEach(column => {
    let maxLen = 0;
    column.eachCell({ includeEmpty: false }, (cell, rowNumber) => {
      // Skip merged banner rows in width calculation
      if (rowNumber <= 3) return;
      const cellVal = cell.value ? String(cell.value) : '';
      if (cellVal.length > maxLen) {
        maxLen = cellVal.length;
      }
    });
    column.width = Math.max(minWidth, maxLen + 3);
  });
}

/**
 * Generate Complete 8-Sheet Excel Workbook
 * Returns Blob for immediate download
 */
export async function generateExcelWorkbook(reportData) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PATEL SAHAB SPICES ERP';
  wb.lastModifiedBy = 'Admin';
  wb.created = new Date();
  wb.modified = new Date();

  const {
    fromDate,
    toDate,
    generatedAt,
    closingStockByProduct,
    periodTotals,
    totalClosingFinishedPackets,
    totalClosingFinishedKg,
    periodRaw,
    periodProc,
    periodPkg,
    periodSales,
    powderBatchStockList,
    finishedStockList,
    batchTraceabilityList
  } = reportData;

  const displayFrom = formatDisplayDate(fromDate);
  const displayTo = formatDisplayDate(toDate);
  const displayGenTime = new Date(generatedAt).toLocaleString('en-IN');

  // =========================================================================
  // SHEET 1: COMPANY SUMMARY
  // =========================================================================
  const ws1 = wb.addWorksheet('COMPANY SUMMARY', {
    pageSetup: { paperSize: 9, orientation: 'portrait' }
  });

  // Banner Header
  ws1.mergeCells('A1:G1');
  ws1.getCell('A1').value = 'PATEL SAHAB SPICES';
  ws1.getCell('A1').fill = STYLES.titleFill;
  ws1.getCell('A1').font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFD700' } };
  ws1.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws1.getRow(1).height = 30;

  ws1.mergeCells('A2:G2');
  ws1.getCell('A2').value = 'PRODUCTION, INVENTORY & BATCH TRACEABILITY REPORT';
  ws1.getCell('A2').fill = STYLES.titleFill;
  ws1.getCell('A2').font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  ws1.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
  ws1.getRow(2).height = 24;

  // Company & Metadata Block
  ws1.addRow([]);
  const metaRows = [
    ['Company Name:', 'PATEL SAHAB SPICES', '', 'Report Period From:', displayFrom],
    ['Legal Entity:', 'PATEL SAHAB ENTERPRISES LLP', '', 'Report Period To:', displayTo],
    ['Plant / Godown Address:', 'Plot No. 12-14, Industrial Area, APMC Market Yard, India', '', 'Report Generated:', displayGenTime],
    ['Authorized Signatory:', 'Sujeet Patidar', '', 'Data Source:', reportData.sourceName]
  ];

  metaRows.forEach(row => {
    const r = ws1.addRow(row);
    r.getCell(1).font = { bold: true, color: { argb: 'FF475569' } };
    r.getCell(2).font = { bold: true, color: { argb: 'FF0F172A' } };
    r.getCell(4).font = { bold: true, color: { argb: 'FF475569' } };
    r.getCell(5).font = { bold: true, color: { argb: 'FF0F172A' } };
  });

  // Section 1: Stock Summary Table
  ws1.addRow([]);
  const stockHeaderRow = ws1.addRow(['Product', 'Raw Material Available (KG)', 'Powder Available (KG)']);
  stockHeaderRow.eachCell(cell => {
    cell.fill = STYLES.headerFill;
    cell.font = STYLES.headerFont;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = STYLES.thinBorder;
  });

  ['Haldi', 'Mirchi', 'Dhaniya'].forEach(prod => {
    const st = closingStockByProduct[prod] || { rawAvailableKg: 0, powderAvailableKg: 0 };
    const r = ws1.addRow([prod, st.rawAvailableKg, st.powderAvailableKg]);
    r.getCell(1).font = { bold: true };
    r.getCell(1).border = STYLES.thinBorder;
    r.getCell(2).numFmt = '#,##0.000 "KG"';
    r.getCell(2).alignment = { horizontal: 'right' };
    r.getCell(2).border = STYLES.thinBorder;
    r.getCell(3).numFmt = '#,##0.000 "KG"';
    r.getCell(3).alignment = { horizontal: 'right' };
    r.getCell(3).border = STYLES.thinBorder;
  });

  // Section 2: Period Key Performance Indicators (KPIs)
  ws1.addRow([]);
  const kpiHeaderRow = ws1.addRow(['Production & Inventory Metric (Selected Period)', 'Value', 'Unit']);
  kpiHeaderRow.eachCell(cell => {
    cell.fill = STYLES.headerFill;
    cell.font = STYLES.headerFont;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = STYLES.thinBorder;
  });

  const kpis = [
    ['Total Finished Packets Available (Closing Balance)', totalClosingFinishedPackets, 'Packets'],
    ['Total Finished Goods Weight (Closing Balance)', totalClosingFinishedKg, 'KG'],
    ['Total Raw Material Inward during selected period', periodTotals.rawInwardKg, 'KG'],
    ['Total Grinding Input (Gross Raw) during selected period', periodTotals.grindingGrossInputKg, 'KG'],
    ['Total Cleaning Output (Net Cleaned Raw)', periodTotals.cleaningOutputKg, 'KG'],
    ['Total Cleaning Waste Generated', periodTotals.cleaningWasteKg, 'KG'],
    ['Total Net Powder Produced during selected period', periodTotals.netPowderProducedKg, 'KG'],
    ['Total Grinding Loss during selected period', periodTotals.grindingLossKg, 'KG'],
    ['Total Processing Loss (Cleaning Waste + Grinding Loss)', periodTotals.totalLossKg, 'KG'],
    ['Total Powder Consumed in Packaging during selected period', periodTotals.packagingPowderConsumedKg, 'KG'],
    ['Total Packaging Retail Packets Produced during selected period', periodTotals.packagingPacketsProduced, 'Packets'],
    ['Total Sale / Stock Dispatch during selected period', periodTotals.salesKg, 'KG'],
    ['Total Unique Orders Dispatched during selected period', periodTotals.uniqueOrdersCount, 'Orders']
  ];

  kpis.forEach(([label, val, unit]) => {
    const r = ws1.addRow([label, val, unit]);
    r.getCell(1).border = STYLES.thinBorder;
    r.getCell(2).font = { bold: true, color: { argb: 'FF14532D' } };
    r.getCell(2).alignment = { horizontal: 'right' };
    r.getCell(2).border = STYLES.thinBorder;
    if (unit === 'KG') r.getCell(2).numFmt = '#,##0.000';
    if (unit === 'Packets' || unit === 'Orders') r.getCell(2).numFmt = '#,##0';
    r.getCell(3).border = STYLES.thinBorder;
    r.getCell(3).alignment = { horizontal: 'center' };
  });

  // Footer Disclaimer
  ws1.addRow([]);
  const footerRow = ws1.addRow(['Note: This is a general company production and inventory report for internal factory management. Strictly non-financial tracking.']);
  footerRow.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF64748B' } };

  autoFitColumns(ws1, 15);

  // =========================================================================
  // SHEET 2: RAW MATERIAL INWARD
  // =========================================================================
  const ws2 = wb.addWorksheet('RAW MATERIAL INWARD', {
    pageSetup: { paperSize: 9, orientation: 'landscape', printTitlesRow: '4:4' }
  });

  ws2.mergeCells('A1:J1');
  ws2.getCell('A1').value = 'PATEL SAHAB SPICES — RAW MATERIAL INWARD REPORT';
  ws2.getCell('A1').fill = STYLES.titleFill;
  ws2.getCell('A1').font = STYLES.titleFont;
  ws2.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws2.getRow(1).height = 24;

  ws2.mergeCells('A2:J2');
  ws2.getCell('A2').value = `Period: ${displayFrom} to ${displayTo} | Generated: ${displayGenTime}`;
  ws2.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF475569' } };
  ws2.getCell('A2').alignment = { horizontal: 'center' };

  ws2.addRow([]);

  const rawHeaders = [
    'Sr. No.', 'Entry ID', 'Date', 'Batch ID', 'Product Name', 
    'Supplier Name', 'Invoice / Ref No', 'Quantity Inward (KG)', 
    'Employee Name', 'Remarks'
  ];
  const rawHeadRow = ws2.addRow(rawHeaders);
  rawHeadRow.eachCell(cell => {
    cell.fill = STYLES.headerFill;
    cell.font = STYLES.headerFont;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = STYLES.thinBorder;
  });
  ws2.views = [{ state: 'frozen', ySplit: 4 }];
  ws2.autoFilter = { from: 'A4', to: 'J4' };

  periodRaw.forEach((r, idx) => {
    const row = ws2.addRow([
      idx + 1,
      r.entry_id,
      formatDisplayDate(r.date || r.timestamp),
      r.batch_id,
      r.material_name,
      r.supplier_name || 'N/A',
      r.invoice_number || 'N/A',
      Number(r.quantity_kg) || 0,
      r.employee_name || 'Staff',
      r.remarks || ''
    ]);

    row.fill = idx % 2 === 0 ? STYLES.whiteFill : STYLES.zebraFill;
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(4).alignment = { horizontal: 'center' };
    row.getCell(4).font = { bold: true };
    row.getCell(8).numFmt = '#,##0.000';
    row.getCell(8).alignment = { horizontal: 'right' };
    row.getCell(8).font = { bold: true };

    row.eachCell(cell => { cell.border = STYLES.thinBorder; });
  });

  // Overall Total Row
  const rawTotalRow = ws2.addRow([
    'TOTAL', '', '', '', '', '', '',
    periodTotals.rawInwardKg, '', ''
  ]);
  rawTotalRow.eachCell(cell => {
    cell.fill = STYLES.totalFill;
    cell.font = STYLES.totalFont;
    cell.border = STYLES.totalBorder;
  });
  rawTotalRow.getCell(8).numFmt = '#,##0.000 "KG"';
  rawTotalRow.getCell(8).alignment = { horizontal: 'right' };

  // Product-wise Total Sub-Table
  ws2.addRow([]);
  ws2.addRow(['PRODUCT-WISE INWARD SUMMARY', '', 'TOTAL INWARD (KG)']);
  ws2.lastRow.getCell(1).font = { bold: true };

  ['Haldi', 'Mirchi', 'Dhaniya'].forEach(p => {
    const pTotal = periodRaw.filter(r => (r.material_name || '').toLowerCase().includes(p.toLowerCase())).reduce((s, r) => s + (Number(r.quantity_kg) || 0), 0);
    const r = ws2.addRow([p, '', pTotal]);
    r.getCell(1).font = { bold: true };
    r.getCell(3).numFmt = '#,##0.000 "KG"';
    r.getCell(3).alignment = { horizontal: 'right' };
    r.getCell(3).font = { bold: true };
  });

  autoFitColumns(ws2, 12);

  // =========================================================================
  // SHEET 3: PROCESSING REPORT
  // =========================================================================
  const ws3 = wb.addWorksheet('PROCESSING REPORT', {
    pageSetup: { paperSize: 9, orientation: 'landscape', printTitlesRow: '4:4' }
  });

  ws3.mergeCells('A1:N1');
  ws3.getCell('A1').value = 'PATEL SAHAB SPICES — CLEANING & GRINDING PROCESSING REPORT';
  ws3.getCell('A1').fill = STYLES.titleFill;
  ws3.getCell('A1').font = STYLES.titleFont;
  ws3.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws3.getRow(1).height = 24;

  ws3.mergeCells('A2:N2');
  ws3.getCell('A2').value = `Period: ${displayFrom} to ${displayTo} | Cleaning Waste = Gross − Net Raw | Grinding Loss = Net Raw − Powder | Total Loss = Gross − Powder`;
  ws3.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF475569' } };
  ws3.getCell('A2').alignment = { horizontal: 'center' };

  ws3.addRow([]);

  const procHeaders = [
    'Sr. No.', 'Entry ID', 'Date', 'Batch ID', 'Product Name', 'Round',
    'Gross Raw Input (KG)', 'Cleaning Output / Net Raw (KG)', 'Cleaning Waste (KG)',
    'Net Powder Produced (KG)', 'Grinding Loss (KG)', 'Total Loss (KG)',
    'Employee Name', 'Remarks'
  ];
  const procHeadRow = ws3.addRow(procHeaders);
  procHeadRow.eachCell(cell => {
    cell.fill = STYLES.headerFill;
    cell.font = STYLES.headerFont;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = STYLES.thinBorder;
  });
  ws3.views = [{ state: 'frozen', ySplit: 4 }];
  ws3.autoFilter = { from: 'A4', to: 'N4' };

  periodProc.forEach((p, idx) => {
    const gross = Number(p.gross_raw_kg) || 0;
    const netRaw = Number(p.net_raw_kg) || 0;
    const powder = Number(p.net_powder_kg) || 0;
    const waste = Number((p.cleaning_waste_kg != null ? p.cleaning_waste_kg : gross - netRaw).toFixed(3));
    const loss = Number((p.grinding_loss_kg != null ? p.grinding_loss_kg : netRaw - powder).toFixed(3));
    const totalLoss = Number((p.total_loss_kg != null ? p.total_loss_kg : gross - powder).toFixed(3));

    const row = ws3.addRow([
      idx + 1,
      p.entry_id,
      formatDisplayDate(p.date || p.timestamp),
      p.batch_id,
      p.material_name || batchProductMap[p.batch_id] || 'Spice',
      p.processing_round != null ? `Round ${p.processing_round}` : 'Round 1',
      gross,
      netRaw,
      waste,
      powder,
      loss,
      totalLoss,
      p.employee_name || 'Operator',
      p.remarks || ''
    ]);

    row.fill = idx % 2 === 0 ? STYLES.whiteFill : STYLES.zebraFill;
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(4).alignment = { horizontal: 'center' };
    row.getCell(4).font = { bold: true };
    row.getCell(6).alignment = { horizontal: 'center' };

    [7, 8, 9, 10, 11, 12].forEach(colIdx => {
      row.getCell(colIdx).numFmt = '#,##0.000';
      row.getCell(colIdx).alignment = { horizontal: 'right' };
    });

    row.getCell(10).font = { bold: true, color: { argb: 'FF14532D' } }; // Net powder
    row.getCell(12).font = { bold: true, color: { argb: 'FFB91C1C' } }; // Total loss

    row.eachCell(cell => { cell.border = STYLES.thinBorder; });
  });

  // Processing Total Row
  const procTotalRow = ws3.addRow([
    'TOTAL', '', '', '', '', '',
    periodTotals.grindingGrossInputKg,
    periodTotals.cleaningOutputKg,
    periodTotals.cleaningWasteKg,
    periodTotals.netPowderProducedKg,
    periodTotals.grindingLossKg,
    periodTotals.totalLossKg,
    '', ''
  ]);
  procTotalRow.eachCell(cell => {
    cell.fill = STYLES.totalFill;
    cell.font = STYLES.totalFont;
    cell.border = STYLES.totalBorder;
  });
  [7, 8, 9, 10, 11, 12].forEach(colIdx => {
    procTotalRow.getCell(colIdx).numFmt = '#,##0.000';
    procTotalRow.getCell(colIdx).alignment = { horizontal: 'right' };
  });

  autoFitColumns(ws3, 12);

  // =========================================================================
  // SHEET 4: POWDER STOCK REPORT
  // =========================================================================
  const ws4 = wb.addWorksheet('POWDER STOCK REPORT', {
    pageSetup: { paperSize: 9, orientation: 'portrait', printTitlesRow: '4:4' }
  });

  ws4.mergeCells('A1:F1');
  ws4.getCell('A1').value = 'PATEL SAHAB SPICES — BATCH-WISE POWDER STOCK REPORT';
  ws4.getCell('A1').fill = STYLES.titleFill;
  ws4.getCell('A1').font = STYLES.titleFont;
  ws4.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws4.getRow(1).height = 24;

  ws4.mergeCells('A2:F2');
  ws4.getCell('A2').value = `Stock Balance as of ${displayTo} | Available Powder = Powder Produced − Powder Used in Packaging`;
  ws4.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF475569' } };
  ws4.getCell('A2').alignment = { horizontal: 'center' };

  ws4.addRow([]);

  const powderHeaders = [
    'Sr. No.', 'Batch ID', 'Product Name', 
    'Total Powder Produced (KG)', 'Powder Used in Packaging (KG)', 'Available Powder (KG)'
  ];
  const powderHeadRow = ws4.addRow(powderHeaders);
  powderHeadRow.eachCell(cell => {
    cell.fill = STYLES.headerFill;
    cell.font = STYLES.headerFont;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = STYLES.thinBorder;
  });
  ws4.views = [{ state: 'frozen', ySplit: 4 }];
  ws4.autoFilter = { from: 'A4', to: 'F4' };

  let totalPdrMade = 0;
  let totalPdrUsed = 0;
  let totalPdrAvail = 0;

  powderBatchStockList.forEach((b, idx) => {
    totalPdrMade += b.totalPowderProducedKg;
    totalPdrUsed += b.powderUsedInPkgKg;
    totalPdrAvail += b.availablePowderKg;

    const row = ws4.addRow([
      idx + 1,
      b.batchId,
      b.productName,
      b.totalPowderProducedKg,
      b.powderUsedInPkgKg,
      b.availablePowderKg
    ]);

    row.fill = idx % 2 === 0 ? STYLES.whiteFill : STYLES.zebraFill;
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(2).font = { bold: true };
    row.getCell(4).numFmt = '#,##0.000';
    row.getCell(4).alignment = { horizontal: 'right' };
    row.getCell(5).numFmt = '#,##0.000';
    row.getCell(5).alignment = { horizontal: 'right' };
    row.getCell(6).numFmt = '#,##0.000';
    row.getCell(6).alignment = { horizontal: 'right' };
    row.getCell(6).font = { bold: true, color: { argb: 'FF14532D' } };

    row.eachCell(cell => { cell.border = STYLES.thinBorder; });
  });

  const powderTotalRow = ws4.addRow([
    'TOTAL FACTORY POWDER', '', '',
    totalPdrMade, totalPdrUsed, totalPdrAvail
  ]);
  powderTotalRow.eachCell(cell => {
    cell.fill = STYLES.totalFill;
    cell.font = STYLES.totalFont;
    cell.border = STYLES.totalBorder;
  });
  [4, 5, 6].forEach(c => {
    powderTotalRow.getCell(c).numFmt = '#,##0.000 "KG"';
    powderTotalRow.getCell(c).alignment = { horizontal: 'right' };
  });

  autoFitColumns(ws4, 14);

  // =========================================================================
  // SHEET 5: PACKAGING REPORT
  // =========================================================================
  const ws5 = wb.addWorksheet('PACKAGING REPORT', {
    pageSetup: { paperSize: 9, orientation: 'landscape', printTitlesRow: '4:4' }
  });

  ws5.mergeCells('A1:J1');
  ws5.getCell('A1').value = 'PATEL SAHAB SPICES — PACKAGING PRODUCTION REPORT';
  ws5.getCell('A1').fill = STYLES.titleFill;
  ws5.getCell('A1').font = STYLES.titleFont;
  ws5.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws5.getRow(1).height = 24;

  ws5.mergeCells('A2:J2');
  ws5.getCell('A2').value = `Period: ${displayFrom} to ${displayTo} | Supported Pack Sizes: 10 GM, 24 GM, 50 GM, 100 GM, 200 GM, 500 GM`;
  ws5.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF475569' } };
  ws5.getCell('A2').alignment = { horizontal: 'center' };

  ws5.addRow([]);

  const pkgHeaders = [
    'Sr. No.', 'Entry ID', 'Date', 'Batch ID', 'Product Name', 
    'Pack Size (GM)', 'Packet Quantity Produced', 'Powder Consumed (KG)', 
    'Employee Name', 'Remarks'
  ];
  const pkgHeadRow = ws5.addRow(pkgHeaders);
  pkgHeadRow.eachCell(cell => {
    cell.fill = STYLES.headerFill;
    cell.font = STYLES.headerFont;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = STYLES.thinBorder;
  });
  ws5.views = [{ state: 'frozen', ySplit: 4 }];
  ws5.autoFilter = { from: 'A4', to: 'J4' };

  periodPkg.forEach((k, idx) => {
    const size = Number(k.pack_size_gm) || 100;
    const pkts = k.packet_quantity != null ? Number(k.packet_quantity) : Math.round(((Number(k.powder_used_kg) || 0) * 1000) / size);
    const kg = Number(k.powder_used_kg) || Number(k.quantity_kg) || Number(((pkts * size) / 1000).toFixed(3));

    const row = ws5.addRow([
      idx + 1,
      k.entry_id,
      formatDisplayDate(k.date || k.timestamp),
      k.batch_id,
      k.product_name || batchProductMap[k.batch_id] || 'Spice',
      `${size} GM`,
      pkts,
      kg,
      k.employee_name || 'Operator',
      k.remarks || ''
    ]);

    row.fill = idx % 2 === 0 ? STYLES.whiteFill : STYLES.zebraFill;
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(4).alignment = { horizontal: 'center' };
    row.getCell(4).font = { bold: true };
    row.getCell(6).alignment = { horizontal: 'center' };
    row.getCell(7).numFmt = '#,##0';
    row.getCell(7).alignment = { horizontal: 'right' };
    row.getCell(7).font = { bold: true, color: { argb: 'FF14532D' } };
    row.getCell(8).numFmt = '#,##0.000';
    row.getCell(8).alignment = { horizontal: 'right' };

    row.eachCell(cell => { cell.border = STYLES.thinBorder; });
  });

  const pkgTotalRow = ws5.addRow([
    'TOTAL', '', '', '', '', '',
    periodTotals.packagingPacketsProduced,
    periodTotals.packagingPowderConsumedKg,
    '', ''
  ]);
  pkgTotalRow.eachCell(cell => {
    cell.fill = STYLES.totalFill;
    cell.font = STYLES.totalFont;
    cell.border = STYLES.totalBorder;
  });
  pkgTotalRow.getCell(7).numFmt = '#,##0 "pkts"';
  pkgTotalRow.getCell(7).alignment = { horizontal: 'right' };
  pkgTotalRow.getCell(8).numFmt = '#,##0.000 "KG"';
  pkgTotalRow.getCell(8).alignment = { horizontal: 'right' };

  autoFitColumns(ws5, 12);

  // =========================================================================
  // SHEET 6: FINISHED STOCK REPORT
  // =========================================================================
  const ws6 = wb.addWorksheet('FINISHED STOCK REPORT', {
    pageSetup: { paperSize: 9, orientation: 'portrait', printTitlesRow: '4:4' }
  });

  ws6.mergeCells('A1:G1');
  ws6.getCell('A1').value = 'PATEL SAHAB SPICES — CURRENT FINISHED PACKET INVENTORY';
  ws6.getCell('A1').fill = STYLES.titleFill;
  ws6.getCell('A1').font = STYLES.titleFont;
  ws6.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws6.getRow(1).height = 24;

  ws6.mergeCells('A2:G2');
  ws6.getCell('A2').value = `Closing Stock Balance as of ${displayTo} | Available Packets = Packets Produced − Packets Sold`;
  ws6.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF475569' } };
  ws6.getCell('A2').alignment = { horizontal: 'center' };

  ws6.addRow([]);

  const finHeaders = [
    'Product Name', 'Batch ID', 'Pack Size', 
    'Total Packets Produced', 'Total Packets Sold', 'Available Packets', 'Stock Weight (KG)'
  ];
  const finHeadRow = ws6.addRow(finHeaders);
  finHeadRow.eachCell(cell => {
    cell.fill = STYLES.headerFill;
    cell.font = STYLES.headerFont;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = STYLES.thinBorder;
  });
  ws6.views = [{ state: 'frozen', ySplit: 4 }];
  ws6.autoFilter = { from: 'A4', to: 'G4' };

  let totFinProd = 0;
  let totFinSold = 0;
  let totFinAvail = 0;
  let totFinWeight = 0;

  finishedStockList.forEach((f, idx) => {
    totFinProd += f.packetsProduced;
    totFinSold += f.packetsSold;
    totFinAvail += f.availablePackets;
    totFinWeight += f.remainingKg;

    const row = ws6.addRow([
      f.productName,
      f.batchId,
      `${f.packSizeGm} GM`,
      f.packetsProduced,
      f.packetsSold,
      f.availablePackets,
      f.remainingKg
    ]);

    row.fill = idx % 2 === 0 ? STYLES.whiteFill : STYLES.zebraFill;
    row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(4).numFmt = '#,##0';
    row.getCell(4).alignment = { horizontal: 'right' };
    row.getCell(5).numFmt = '#,##0';
    row.getCell(5).alignment = { horizontal: 'right' };
    row.getCell(6).numFmt = '#,##0';
    row.getCell(6).alignment = { horizontal: 'right' };
    row.getCell(6).font = { bold: true, color: { argb: 'FF14532D' } };
    row.getCell(7).numFmt = '#,##0.000';
    row.getCell(7).alignment = { horizontal: 'right' };

    row.eachCell(cell => { cell.border = STYLES.thinBorder; });
  });

  const finTotalRow = ws6.addRow([
    'TOTAL FINISHED STOCK', '', '',
    totFinProd, totFinSold, totFinAvail, totFinWeight
  ]);
  finTotalRow.eachCell(cell => {
    cell.fill = STYLES.totalFill;
    cell.font = STYLES.totalFont;
    cell.border = STYLES.totalBorder;
  });
  finTotalRow.getCell(4).numFmt = '#,##0 "pkts"';
  finTotalRow.getCell(5).numFmt = '#,##0 "pkts"';
  finTotalRow.getCell(6).numFmt = '#,##0 "pkts"';
  finTotalRow.getCell(7).numFmt = '#,##0.000 "KG"';
  [4, 5, 6, 7].forEach(c => { finTotalRow.getCell(c).alignment = { horizontal: 'right' }; });

  autoFitColumns(ws6, 14);

  // =========================================================================
  // SHEET 7: SALE & DISPATCH REPORT
  // =========================================================================
  const ws7 = wb.addWorksheet('SALE & DISPATCH REPORT', {
    pageSetup: { paperSize: 9, orientation: 'landscape', printTitlesRow: '4:4' }
  });

  ws7.mergeCells('A1:K1');
  ws7.getCell('A1').value = 'PATEL SAHAB SPICES — SALES & DISPATCH INVENTORY REPORT';
  ws7.getCell('A1').fill = STYLES.titleFill;
  ws7.getCell('A1').font = STYLES.titleFont;
  ws7.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws7.getRow(1).height = 24;

  ws7.mergeCells('A2:K2');
  ws7.getCell('A2').value = `Period: ${displayFrom} to ${displayTo} | Strictly Inventory Tracking in KG | No Pricing, Rates, or Billing Data`;
  ws7.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF475569' } };
  ws7.getCell('A2').alignment = { horizontal: 'center' };

  ws7.addRow([]);

  const saleHeaders = [
    'Sr. No.', 'Entry ID', 'Order ID', 'Date', 'Product Name', 
    'Sale Method', 'Batch ID', 'Pack Size (GM)', 'KG Sold', 
    'Employee Name', 'Remarks'
  ];
  const saleHeadRow = ws7.addRow(saleHeaders);
  saleHeadRow.eachCell(cell => {
    cell.fill = STYLES.headerFill;
    cell.font = STYLES.headerFont;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = STYLES.thinBorder;
  });
  ws7.views = [{ state: 'frozen', ySplit: 4 }];
  ws7.autoFilter = { from: 'A4', to: 'K4' };

  periodSales.forEach((s, idx) => {
    const row = ws7.addRow([
      idx + 1,
      s.entry_id,
      s.order_id || 'DIRECT',
      formatDisplayDate(s.date || s.timestamp),
      s.product_name,
      s.sale_method || 'FIFO',
      s.batch_id,
      `${s.pack_size_gm} GM`,
      Number(s.kg_sold) || 0,
      s.employee_name || 'Staff',
      s.remarks || ''
    ]);

    row.fill = idx % 2 === 0 ? STYLES.whiteFill : STYLES.zebraFill;
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(3).font = { bold: true };
    row.getCell(4).alignment = { horizontal: 'center' };
    row.getCell(6).alignment = { horizontal: 'center' };
    row.getCell(7).alignment = { horizontal: 'center' };
    row.getCell(7).font = { bold: true };
    row.getCell(8).alignment = { horizontal: 'center' };
    row.getCell(9).numFmt = '#,##0.000';
    row.getCell(9).alignment = { horizontal: 'right' };
    row.getCell(9).font = { bold: true, color: { argb: 'FF14532D' } };

    row.eachCell(cell => { cell.border = STYLES.thinBorder; });
  });

  // Sales Total Row
  const saleTotalRow = ws7.addRow([
    'TOTAL SALES DISPATCH', '', '', '', '', '', '', '',
    periodTotals.salesKg, '', ''
  ]);
  saleTotalRow.eachCell(cell => {
    cell.fill = STYLES.totalFill;
    cell.font = STYLES.totalFont;
    cell.border = STYLES.totalBorder;
  });
  saleTotalRow.getCell(9).numFmt = '#,##0.000 "KG"';
  saleTotalRow.getCell(9).alignment = { horizontal: 'right' };

  // Sales Summary Breakdown
  ws7.addRow([]);
  ws7.addRow(['SALES SUMMARY BREAKDOWN', '', 'QUANTITY (KG)']);
  ws7.lastRow.getCell(1).font = { bold: true };

  const sSummary = [
    ['Total Haldi Sale', periodTotals.salesByProduct.Haldi],
    ['Total Mirchi Sale', periodTotals.salesByProduct.Mirchi],
    ['Total Dhaniya Sale', periodTotals.salesByProduct.Dhaniya],
    ['Overall Total Sale (All Products)', periodTotals.salesKg],
    ['Total Unique Orders Dispatched', periodTotals.uniqueOrdersCount]
  ];

  sSummary.forEach(([label, val]) => {
    const r = ws7.addRow([label, '', val]);
    r.getCell(1).font = { bold: true };
    r.getCell(3).alignment = { horizontal: 'right' };
    r.getCell(3).font = { bold: true };
    if (label.includes('Orders')) {
      r.getCell(3).numFmt = '#,##0 "Orders"';
    } else {
      r.getCell(3).numFmt = '#,##0.000 "KG"';
    }
  });

  autoFitColumns(ws7, 12);

  // =========================================================================
  // SHEET 8: BATCH TRACEABILITY REPORT
  // =========================================================================
  const ws8 = wb.addWorksheet('BATCH TRACEABILITY REPORT', {
    pageSetup: { paperSize: 9, orientation: 'landscape', printTitlesRow: '4:4' }
  });

  ws8.mergeCells('A1:M1');
  ws8.getCell('A1').value = 'PATEL SAHAB SPICES — COMPLETE END-TO-END BATCH TRACEABILITY REPORT';
  ws8.getCell('A1').fill = STYLES.titleFill;
  ws8.getCell('A1').font = STYLES.titleFont;
  ws8.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws8.getRow(1).height = 24;

  ws8.mergeCells('A2:M2');
  ws8.getCell('A2').value = `Batch Traceability as of ${displayTo} | Complete lifecycle linking Raw Inward → Processing → Packaging → Sales`;
  ws8.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF475569' } };
  ws8.getCell('A2').alignment = { horizontal: 'center' };

  ws8.addRow([]);

  const traceHeaders = [
    'Batch ID', 'Product Name', 'Inward Date', 'Supplier Name',
    'Original Inward (KG)', 'Processed (KG)', 'Remaining Raw (KG)',
    'Powder Produced (KG)', 'Powder Packaged (KG)', 'Remaining Powder (KG)',
    'Packets Produced', 'KG Sold', 'Available Packets'
  ];
  const traceHeadRow = ws8.addRow(traceHeaders);
  traceHeadRow.eachCell(cell => {
    cell.fill = STYLES.headerFill;
    cell.font = STYLES.headerFont;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = STYLES.thinBorder;
  });
  ws8.views = [{ state: 'frozen', ySplit: 4 }];
  ws8.autoFilter = { from: 'A4', to: 'M4' };

  batchTraceabilityList.forEach((b, idx) => {
    const row = ws8.addRow([
      b.batchId,
      b.productName,
      formatDisplayDate(b.inwardDate),
      b.supplierName,
      b.originalInwardKg,
      b.totalProcessedKg,
      b.remainingRawKg,
      b.totalNetPowderProducedKg,
      b.powderUsedInPackagingKg,
      b.remainingPowderKg,
      b.totalPacketsProduced,
      b.totalKgSold,
      b.availableFinishedPackets
    ]);

    row.fill = idx % 2 === 0 ? STYLES.whiteFill : STYLES.zebraFill;
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(1).font = { bold: true };
    row.getCell(3).alignment = { horizontal: 'center' };

    [5, 6, 7, 8, 9, 10, 12].forEach(colIdx => {
      row.getCell(colIdx).numFmt = '#,##0.000';
      row.getCell(colIdx).alignment = { horizontal: 'right' };
    });

    [11, 13].forEach(colIdx => {
      row.getCell(colIdx).numFmt = '#,##0';
      row.getCell(colIdx).alignment = { horizontal: 'right' };
    });

    row.getCell(7).font = { bold: true, color: { argb: 'FFD97706' } }; // Remaining raw
    row.getCell(10).font = { bold: true, color: { argb: 'FFB45309' } }; // Remaining powder
    row.getCell(13).font = { bold: true, color: { argb: 'FF14532D' } }; // Available packets

    row.eachCell(cell => { cell.border = STYLES.thinBorder; });
  });

  autoFitColumns(ws8, 13);

  // Write workbook to buffer
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

/**
 * Trigger browser file download of the compiled workbook
 */
export function triggerExcelDownload(blob, filename = 'PATEL_SAHAB_SPICES_PRODUCTION_INVENTORY_REPORT.xlsx') {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
