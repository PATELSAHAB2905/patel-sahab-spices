export const APPS_SCRIPT_CODE = `/**
 * PATEL SAHAB SPICES - PRODUCTION & INVENTORY APPS SCRIPT BACKEND
 * TABS: RAW_MATERIAL, PROCESSING, PACKAGING, ORDER_SALE
 */
const SCHEMAS = {
  RAW_MATERIAL: [
    'Entry_ID', 'Date', 'Batch_ID', 'Material_Name', 'Supplier_Name',
    'Invoice_Number', 'Quantity_KG', 'Employee_Name', 'Timestamp', 'Remarks'
  ],
  PROCESSING: [
    'Entry_ID', 'Date', 'Batch_ID', 'Material_Name', 'Processing_Round',
    'Gross_Raw_KG', 'Net_Raw_KG', 'Cleaning_Waste_KG', 'Net_Powder_KG',
    'Grinding_Loss_KG', 'Total_Loss_KG', 'Employee_Name', 'Timestamp', 'Remarks'
  ],
  PACKAGING: [
    'Entry_ID', 'Transaction_ID', 'Date', 'Batch_ID', 'Product_Name',
    'Pack_Size_GM', 'Packet_Quantity', 'Powder_Used_KG', 'Employee_Name',
    'Timestamp', 'Remarks'
  ],
  ORDER_SALE: [
    'Entry_ID', 'Order_ID', 'Date', 'Sale_Method', 'Product_Name',
    'Batch_ID', 'Pack_Size_GM', 'KG_Sold', 'Employee_Name', 'Timestamp', 'Remarks'
  ]
};

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

function doPost(e) {
  const lock = LockService.getScriptLock();
  const acquired = lock.tryLock(30000);
  if (!acquired) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'Server busy: Could not acquire lock'
    })).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    initializeSheetsIfNeeded(ss);

    let payload = (e.postData && e.postData.contents) ? JSON.parse(e.postData.contents) : e.parameter;
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
        skippedCount: results.skippedCount
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

function initializeSheetsIfNeeded(ss) {
  Object.keys(SCHEMAS).forEach(tabName => {
    let sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
    }
    if (sheet.getLastRow() === 0) {
      const headers = SCHEMAS[tabName];
      sheet.appendRow(headers);
      const headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setBackground('#991B1B');
      headerRange.setFontColor('#FFFFFF');
      headerRange.setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  });
}

function processSyncItems(ss, items) {
  let syncedCount = 0;
  let skippedCount = 0;

  items.forEach(item => {
    if (!item || !item.table || !item.data) return;

    const tabName = item.table.toUpperCase();
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) return;

    const data = item.data;
    const entryId = data.entry_id || data.Entry_ID;

    const lastRow = sheet.getLastRow();
    if (lastRow > 1 && entryId) {
      const existingIds = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat().map(String);
      if (existingIds.includes(String(entryId))) {
        skippedCount++;
        return;
      }
    }

    let rowValues = [];
    if (tabName === 'RAW_MATERIAL') {
      rowValues = [
        data.entry_id || '', data.date || '', data.batch_id || '', data.material_name || '',
        data.supplier_name || '', data.invoice_number || '', Number(data.quantity_kg) || 0,
        data.employee_name || '', data.timestamp || '', data.remarks || ''
      ];
    } else if (tabName === 'PROCESSING') {
      rowValues = [
        data.entry_id || '', data.date || '', data.batch_id || '', data.material_name || '',
        data.processing_round || '', Number(data.gross_raw_kg) || 0, Number(data.net_raw_kg) || 0,
        Number(data.cleaning_waste_kg) || 0, Number(data.net_powder_kg) || 0,
        Number(data.grinding_loss_kg) || 0, Number(data.total_loss_kg) || 0,
        data.employee_name || '', data.timestamp || '', data.remarks || ''
      ];
    } else if (tabName === 'PACKAGING') {
      rowValues = [
        data.entry_id || '', data.transaction_id || '', data.date || '', data.batch_id || '',
        data.product_name || '', Number(data.pack_size_gm) || '', Number(data.packet_quantity) || 0,
        Number(data.powder_used_kg) || 0, data.employee_name || '', data.timestamp || '', data.remarks || ''
      ];
    } else if (tabName === 'ORDER_SALE') {
      rowValues = [
        data.entry_id || '', data.order_id || '', data.date || '', data.sale_method || '',
        data.product_name || '', data.batch_id || '', Number(data.pack_size_gm) || '',
        Number(data.kg_sold) || 0, data.employee_name || '', data.timestamp || '', data.remarks || ''
      ];
    }

    sheet.appendRow(rowValues);
    syncedCount++;
  });

  return { syncedCount, skippedCount };
}
`;
