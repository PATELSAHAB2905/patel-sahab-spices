/**
 * =========================================================================
 * PATEL SAHAB SPICES - PRODUCTION & INVENTORY MANAGEMENT SYSTEM
 * Google Apps Script Web App API Backend
 * =========================================================================
 *
 * TABS MANAGED:
 * 1. RAW_MATERIAL
 * 2. PROCESSING
 * 3. PACKAGING
 * 4. ORDER_SALE
 *
 * DEPLOYMENT INSTRUCTIONS:
 * 1. Open Google Sheets (create a new blank spreadsheet or use an existing one).
 * 2. Click "Extensions" > "Apps Script".
 * 3. Delete existing code in Code.gs and paste this entire code.
 * 4. Click "Deploy" > "New deployment".
 * 5. Select type: "Web app".
 * 6. Configuration:
 *    - Description: "Patel Sahab Spices Inventory API v1"
 *    - Execute as: "Me" (your email)
 *    - Who has access: "Anyone" (allows app to upload entries)
 * 7. Click "Deploy", authorize permissions when prompted.
 * 8. Copy the Web App URL (ends with /exec).
 * 9. Paste this Web App URL into Admin Settings in the Patel Sahab Spices App.
 */

// Define sheet schema headers for automatic initialization
const SCHEMAS = {
  RAW_MATERIAL: [
    'Entry_ID',
    'Date',
    'Batch_ID',
    'Material_Name',
    'Supplier_Name',
    'Invoice_Number',
    'Quantity_KG',
    'Employee_Name',
    'Timestamp',
    'Remarks'
  ],
  PROCESSING: [
    'Entry_ID',
    'Date',
    'Batch_ID',
    'Material_Name',
    'Processing_Round',
    'Gross_Raw_KG',
    'Net_Raw_KG',
    'Cleaning_Waste_KG',
    'Net_Powder_KG',
    'Grinding_Loss_KG',
    'Total_Loss_KG',
    'Employee_Name',
    'Timestamp',
    'Remarks'
  ],
  PACKAGING: [
    'Entry_ID',
    'Transaction_ID',
    'Date',
    'Batch_ID',
    'Product_Name',
    'Pack_Size_GM',
    'Packet_Quantity',
    'Powder_Used_KG',
    'Employee_Name',
    'Timestamp',
    'Remarks'
  ],
  ORDER_SALE: [
    'Entry_ID',
    'Order_ID',
    'Date',
    'Sale_Method',
    'Product_Name',
    'Batch_ID',
    'Pack_Size_GM',
    'KG_Sold',
    'Employee_Name',
    'Timestamp',
    'Remarks'
  ]
};

/**
 * Handle HTTP GET - for connection testing and status
 */
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    initializeSheetsIfNeeded(ss);
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Patel Sahab Spices Inventory API is active and connected',
      spreadsheetName: ss.getName(),
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle HTTP POST - for batch synchronization, corrections, and testing
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  // Wait up to 30 seconds for concurrent write safety
  const acquired = lock.tryLock(30000);
  if (!acquired) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'Server busy: Could not acquire lock for atomic update. Please retry.'
    })).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    initializeSheetsIfNeeded(ss);

    let payload;
    if (e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else {
      payload = e.parameter;
    }

    const action = payload.action || 'sync';

    if (action === 'ping') {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Connection verified with Google Sheets: ' + ss.getName(),
        timestamp: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'sync') {
      const results = processSyncItems(ss, payload.items || [payload.item]);
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        syncedCount: results.syncedCount,
        skippedCount: results.skippedCount,
        details: results.details,
        timestamp: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'correction') {
      const result = processCorrection(ss, payload);
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Correction recorded successfully',
        result: result,
        timestamp: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'Unknown action: ' + action
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Initialize tabs and styled headers if not already present
 */
function initializeSheetsIfNeeded(ss) {
  Object.keys(SCHEMAS).forEach(tabName => {
    let sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
    }
    // Check if header row exists
    if (sheet.getLastRow() === 0) {
      const headers = SCHEMAS[tabName];
      sheet.appendRow(headers);
      
      // Style header row: Dark Red background (#991B1B) with White bold text
      const headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setBackground('#991B1B');
      headerRange.setFontColor('#FFFFFF');
      headerRange.setFontWeight('bold');
      headerRange.setHorizontalAlignment('center');
      sheet.setFrozenRows(1);
    }
  });
}

/**
 * Process array of sync items with duplicate prevention
 */
function processSyncItems(ss, items) {
  let syncedCount = 0;
  let skippedCount = 0;
  const details = [];

  items.forEach(item => {
    if (!item || !item.table || !item.data) return;

    const tabName = item.table.toUpperCase();
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      details.push({ entry_id: item.data.entry_id, status: 'error', error: 'Sheet not found: ' + tabName });
      return;
    }

    const data = item.data;
    const entryId = data.entry_id || data.Entry_ID;

    // Check duplicate Entry_ID in column 1
    const lastRow = sheet.getLastRow();
    if (lastRow > 1 && entryId) {
      const existingIds = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat().map(String);
      if (existingIds.includes(String(entryId))) {
        skippedCount++;
        details.push({ entry_id: entryId, status: 'duplicate_skipped' });
        return;
      }
    }

    // Build row values strictly matching schema
    let rowValues = [];
    if (tabName === 'RAW_MATERIAL') {
      rowValues = [
        data.entry_id || '',
        data.date || '',
        data.batch_id || '',
        data.material_name || '',
        data.supplier_name || '',
        data.invoice_number || '',
        Number(data.quantity_kg) || 0,
        data.employee_name || '',
        data.timestamp || '',
        data.remarks || ''
      ];
    } else if (tabName === 'PROCESSING') {
      rowValues = [
        data.entry_id || '',
        data.date || '',
        data.batch_id || '',
        data.material_name || '',
        data.processing_round || '',
        Number(data.gross_raw_kg) || 0,
        Number(data.net_raw_kg) || 0,
        Number(data.cleaning_waste_kg) || 0,
        Number(data.net_powder_kg) || 0,
        Number(data.grinding_loss_kg) || 0,
        Number(data.total_loss_kg) || 0,
        data.employee_name || '',
        data.timestamp || '',
        data.remarks || ''
      ];
    } else if (tabName === 'PACKAGING') {
      rowValues = [
        data.entry_id || '',
        data.transaction_id || '',
        data.date || '',
        data.batch_id || '',
        data.product_name || '',
        Number(data.pack_size_gm) || '',
        Number(data.packet_quantity) || 0,
        Number(data.powder_used_kg) || 0,
        data.employee_name || '',
        data.timestamp || '',
        data.remarks || ''
      ];
    } else if (tabName === 'ORDER_SALE') {
      rowValues = [
        data.entry_id || '',
        data.order_id || '',
        data.date || '',
        data.sale_method || '',
        data.product_name || '',
        data.batch_id || '',
        Number(data.pack_size_gm) || '',
        Number(data.kg_sold) || 0,
        data.employee_name || '',
        data.timestamp || '',
        data.remarks || ''
      ];
    }

    sheet.appendRow(rowValues);
    syncedCount++;
    details.push({ entry_id: entryId, status: 'synced' });
  });

  return { syncedCount, skippedCount, details };
}

/**
 * Handle Correction entries (reversal records with note)
 */
function processCorrection(ss, payload) {
  const { table, correctionData, reason } = payload;
  const tabName = table.toUpperCase();
  const sheet = ss.getSheetByName(tabName);
  if (!sheet) throw new Error('Sheet not found: ' + tabName);

  // Append correction record with remarks tagged with [CORRECTION]
  const modifiedItem = {
    table: tabName,
    data: {
      ...correctionData,
      remarks: `[CORRECTION: ${reason || 'Admin Adjustment'}] ${correctionData.remarks || ''}`
    }
  };
  return processSyncItems(ss, [modifiedItem]);
}
