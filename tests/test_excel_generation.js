import ExcelJS from 'exceljs';
import { generateExcelWorkbook, getCurrentFinancialYearRange } from '../src/services/reportExportService.js';

async function runExcelVerification() {
  console.log('Testing Excel Workbook Generation for Patel Sahab Spices...');

  // Mock report data matching compileReportData output
  const mockReportData = {
    fromDate: '2026-04-01',
    toDate: '2027-03-31',
    generatedAt: new Date().toISOString(),
    sourceName: 'Local Database (Offline / Synced)',
    isFromFirebase: true,
    periodTotals: {
      rawInwardKg: 2000,
      grindingGrossInputKg: 1000,
      cleaningOutputKg: 950,
      cleaningWasteKg: 50,
      netPowderProducedKg: 900,
      grindingLossKg: 50,
      totalLossKg: 100,
      packagingPowderConsumedKg: 257,
      packagingPacketsProduced: 3000,
      salesKg: 45,
      uniqueOrdersCount: 1,
      salesByProduct: { Haldi: 45, Mirchi: 0, Dhaniya: 0 }
    },
    closingStockByProduct: {
      Haldi: { rawAvailableKg: 1000, powderAvailableKg: 643, totalInwardKg: 1000, totalProcessedKg: 1000 },
      Mirchi: { rawAvailableKg: 500, powderAvailableKg: 0, totalInwardKg: 500, totalProcessedKg: 0 },
      Dhaniya: { rawAvailableKg: 500, powderAvailableKg: 0, totalInwardKg: 500, totalProcessedKg: 0 }
    },
    openingStockByProduct: {
      Haldi: { rawAvailableKg: 0, powderAvailableKg: 0 },
      Mirchi: { rawAvailableKg: 0, powderAvailableKg: 0 },
      Dhaniya: { rawAvailableKg: 0, powderAvailableKg: 0 }
    },
    totalClosingFinishedPackets: 2550,
    totalClosingFinishedKg: 212,
    periodRaw: [
      { date: '2026-11-18', batch_id: 'HAL-001', material_name: 'Haldi', supplier_name: 'Sangli Mandi', invoice_number: 'INV-01', quantity_kg: 1000, employee_name: 'Ramesh Patel', remarks: 'Good quality' }
    ],
    periodProc: [
      { date: '2026-11-18', batch_id: 'HAL-001', material_name: 'Haldi', gross_raw_kg: 1000, net_raw_kg: 950, cleaning_waste_kg: 50, net_powder_kg: 900, grinding_loss_kg: 50, total_loss_kg: 100, employee_name: 'Suresh Kumar', remarks: 'Standard processing' }
    ],
    powderBatchStockList: [
      { batchId: 'HAL-001', productName: 'Haldi', totalPowderProducedKg: 900, powderUsedInPkgKg: 257, availablePowderKg: 643 }
    ],
    periodPkg: [
      { date: '2026-11-18', batch_id: 'HAL-001', product_name: 'Haldi', pack_size_gm: 100, packet_quantity: 500, powder_used_kg: 50, employee_name: 'Dinesh Sharma', remarks: 'Packaging batch 1' }
    ],
    finishedStockList: [
      { productName: 'Haldi', packSizeGm: 100, packetsProduced: 500, packetsSold: 50, availablePackets: 450, totalWeightKg: 45 }
    ],
    periodSales: [
      { date: '2026-11-18', order_id: 'ORD-001', customer_name: 'Indore Kirana Mart', product_name: 'Haldi', pack_size_gm: 100, packets_deducted: 50, kg_sold: 5, batch_id: 'HAL-001', vehicle_number: 'MP-09-AB-1234', employee_name: 'Pooja Verma', remarks: 'Dispatched via tempo' }
    ],
    batchTraceabilityList: [
      { batchId: 'HAL-001', productName: 'Haldi', inwardDate: '2026-11-18', supplierName: 'Sangli Mandi', originalInwardKg: 1000, totalProcessedKg: 1000, remainingRawKg: 0, totalNetPowderProducedKg: 900, powderUsedInPackagingKg: 257, remainingPowderKg: 643, totalPacketsProduced: 3000, totalKgSold: 45, availableFinishedPackets: 2550 }
    ],
    validations: [
      { title: 'Raw Material Inward Records', status: 'VALID', count: 1, detail: 'Inward verified' }
    ]
  };

  const buffer = await generateExcelWorkbook(mockReportData);
  console.log('[PASS] generateExcelWorkbook completed successfully.');
  console.log(`[PASS] Generated buffer length: ${buffer.size || buffer.byteLength || buffer.length || 'valid'} bytes.`);

  // Let's load the workbook back with ExcelJS to inspect sheets
  const wb = new ExcelJS.Workbook();
  const loaded = await wb.xlsx.load(buffer instanceof Blob ? await buffer.arrayBuffer() : buffer);
  
  const expectedSheets = [
    'COMPANY SUMMARY',
    'RAW MATERIAL INWARD',
    'PROCESSING REPORT',
    'POWDER STOCK REPORT',
    'PACKAGING REPORT',
    'FINISHED STOCK REPORT',
    'SALE & DISPATCH REPORT',
    'BATCH TRACEABILITY REPORT'
  ];

  console.log('\nInspecting generated workbook sheets:');
  expectedSheets.forEach((sheetName, idx) => {
    const ws = loaded.getWorksheet(sheetName);
    if (ws) {
      console.log(`[PASS] Sheet ${idx + 1}: "${sheetName}" exists with ${ws.rowCount} rows.`);
    } else {
      console.error(`[FAIL] Sheet ${idx + 1}: "${sheetName}" NOT found!`);
      process.exit(1);
    }
  });

  const fy = getCurrentFinancialYearRange();
  console.log(`\n[PASS] Current Financial Year: ${fy.fromDate} to ${fy.toDate} (${fy.label})`);
  console.log('\nALL EXCEL GENERATION TESTS PASSED 100%!');
}

runExcelVerification().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
