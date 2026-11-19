import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Users, 
  Package, 
  RefreshCw, 
  KeyRound, 
  AlertTriangle, 
  CheckCircle2, 
  Trash2, 
  Edit3, 
  Plus, 
  ToggleLeft, 
  ToggleRight, 
  Send, 
  FileText, 
  Database,
  ExternalLink,
  Layers,
  Sparkles,
  RotateCcw,
  Copy,
  Code,
  Check,
  Flame,
  Cloud,
  UploadCloud,
  DownloadCloud,
  FileSpreadsheet,
  Download,
  Calendar,
  Filter
} from 'lucide-react';
import { APPS_SCRIPT_CODE } from '../services/appsScriptTemplate';
import { getDB } from '../services/db';
import { 
  testGoogleAppsScriptConnection, 
  triggerSync, 
  getSyncOverview,
  queueSyncRecord 
} from '../services/syncService';
import { updateAdminPin } from '../services/adminAuth';
import { 
  generateEntryId, 
  generateOrderId, 
  generatePackagingTxId, 
  getTodayDateStr 
} from '../services/inventoryEngine';
import { 
  getFirebaseConfig, 
  saveFirebaseConfig, 
  parseFirebaseConfigText, 
  testFirebaseConnection, 
  syncAllLocalDataToFirestore, 
  pullDataFromFirestore 
} from '../services/firebase';
import { 
  getCurrentFinancialYearRange, 
  formatDisplayDate, 
  compileReportData, 
  generateExcelWorkbook, 
  triggerExcelDownload 
} from '../services/reportExportService';

const FIRESTORE_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Patel Sahab Spices Production & Inventory
    match /{document=**} {
      allow read, write: if true;
    }
  }
}`;

export default function AdminPanel({ onLockAdmin, activeEmployee, initialSubTab = 'REPORTS_EXPORT' }) {
  const [subTab, setSubTab] = useState(initialSubTab || 'REPORTS_EXPORT'); // 'REPORTS_EXPORT' | 'FIREBASE' | 'SYNC' | 'EMPLOYEES' | 'PRODUCTS' | 'CORRECTIONS' | 'SECURITY' | 'DEMO'
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Sync settings state
  const [scriptUrl, setScriptUrl] = useState('');
  const [syncStatus, setSyncStatus] = useState(null);
  const [queueItems, setQueueItems] = useState([]);
  const [copiedCode, setCopiedCode] = useState(false);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_CODE);
      setCopiedCode(true);
      showMsg('success', 'Google Apps Script code copied to clipboard! Ab apne Google Sheet me paste karein.');
      setTimeout(() => setCopiedCode(false), 3000);
    } catch {
      showMsg('error', 'Clipboard copy failed. Please select and copy code from the box below.');
    }
  };

  // Employees state
  const [employees, setEmployees] = useState([]);
  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [newEmployeeRole, setNewEmployeeRole] = useState('Staff');
  const [editingEmpId, setEditingEmpId] = useState(null);
  const [editEmpName, setEditEmpName] = useState('');
  const [editEmpRole, setEditEmpRole] = useState('');

  // Products state
  const [products, setProducts] = useState([]);
  const [newProductName, setNewProductName] = useState('');
  const [newProductPrefix, setNewProductPrefix] = useState('');

  // PIN state
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  // Corrections / Reversals state
  const [selectedModule, setSelectedModule] = useState('raw_material');
  const [moduleEntries, setModuleEntries] = useState([]);
  const [reversalTarget, setReversalTarget] = useState(null);
  const [reversalReason, setReversalReason] = useState('');

  // Firebase State
  const [firebaseConfig, setFirebaseConfig] = useState({
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
  });
  const [rawConfigInput, setRawConfigInput] = useState('');
  const [isFbConfigured, setIsFbConfigured] = useState(false);
  const [fbTestLoading, setFbTestLoading] = useState(false);
  const [fbSyncLoading, setFbSyncLoading] = useState(false);
  const [fbPullLoading, setFbPullLoading] = useState(false);
  const [fbProgressMsg, setFbProgressMsg] = useState('');
  const [copiedFbRules, setCopiedFbRules] = useState(false);

  // Reports & Export state
  const defaultFY = getCurrentFinancialYearRange();
  const [reportFromDate, setReportFromDate] = useState(defaultFY.fromDate);
  const [reportToDate, setReportToDate] = useState(defaultFY.toDate);
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [activeDatePreset, setActiveDatePreset] = useState('CURRENT_FY');

  const loadReportPreview = async (fDate = reportFromDate, tDate = reportToDate) => {
    setReportLoading(true);
    try {
      const data = await compileReportData(fDate, tDate);
      setReportData(data);
    } catch (err) {
      console.error('Failed to compile report preview:', err);
      showMsg('error', `Report compilation error: ${err.message}`);
    } finally {
      setReportLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!reportFromDate || !reportToDate) {
      showMsg('error', 'Please select both From Date and To Date');
      return;
    }
    if (reportFromDate > reportToDate) {
      showMsg('error', 'From Date cannot be later than To Date');
      return;
    }
    await loadReportPreview(reportFromDate, reportToDate);
    showMsg('success', `Report updated for ${formatDisplayDate(reportFromDate)} to ${formatDisplayDate(reportToDate)}`);
  };

  const handlePresetChange = async (preset) => {
    setActiveDatePreset(preset);
    const today = new Date();
    const currYear = today.getFullYear();
    const currMonth = today.getMonth(); // 0-based
    let f = '';
    let t = '';
    if (preset === 'CURRENT_FY') {
      const fy = getCurrentFinancialYearRange();
      f = fy.fromDate;
      t = fy.toDate;
    } else if (preset === 'LAST_FY') {
      const startYear = currMonth < 3 ? currYear - 2 : currYear - 1;
      const endYear = startYear + 1;
      f = `${startYear}-04-01`;
      t = `${endYear}-03-31`;
    } else if (preset === 'THIS_MONTH') {
      const monthStr = String(currMonth + 1).padStart(2, '0');
      const lastDay = new Date(currYear, currMonth + 1, 0).getDate();
      f = `${currYear}-${monthStr}-01`;
      t = `${currYear}-${monthStr}-${String(lastDay).padStart(2, '0')}`;
    } else if (preset === 'ALL_TIME') {
      f = '2020-01-01';
      t = '2030-12-31';
    }
    setReportFromDate(f);
    setReportToDate(t);
    await loadReportPreview(f, t);
  };

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      let currentData = reportData;
      if (!currentData || currentData.fromDate !== reportFromDate || currentData.toDate !== reportToDate) {
        currentData = await compileReportData(reportFromDate, reportToDate);
        setReportData(currentData);
      }
      const blob = await generateExcelWorkbook(currentData);
      triggerExcelDownload(blob, 'PATEL_SAHAB_SPICES_PRODUCTION_INVENTORY_REPORT.xlsx');
      showMsg('success', 'PATEL_SAHAB_SPICES_PRODUCTION_INVENTORY_REPORT.xlsx downloaded successfully with 8 sheets!');
    } catch (err) {
      console.error('Excel Export failed:', err);
      showMsg('error', `Excel export failed: ${err.message}`);
    } finally {
      setExportingExcel(false);
    }
  };

  useEffect(() => {
    loadAllAdminData();
  }, [subTab]);

  const loadAllAdminData = async () => {
    try {
      const db = await getDB();
      const overview = await getSyncOverview();
      setSyncStatus(overview);
      setScriptUrl(overview.scriptUrl || '');

      const [emps, prods, q, fbCfg] = await Promise.all([
        db.getAll('employees'),
        db.getAll('products'),
        db.getAll('sync_queue'),
        getFirebaseConfig()
      ]);

      setEmployees(emps);
      setProducts(prods);
      setQueueItems(q.reverse());

      if (fbCfg) {
        setFirebaseConfig(fbCfg);
        setIsFbConfigured(Boolean(fbCfg.apiKey && fbCfg.projectId));
      }

      if (subTab === 'CORRECTIONS') {
        await loadModuleEntries(selectedModule);
      }

      if (subTab === 'REPORTS_EXPORT') {
        await loadReportPreview(reportFromDate, reportToDate);
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
    }
  };

  const loadModuleEntries = async (mod) => {
    const db = await getDB();
    const list = await db.getAll(mod);
    list.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));
    setModuleEntries(list.slice(0, 30));
  };

  const showMsg = (type, text) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 5000);
  };

  // 1. Google Sheets Sync Handlers
  const handleSaveScriptUrl = async (e) => {
    e.preventDefault();
    const cleanUrl = scriptUrl.trim();
    if (!cleanUrl) {
      showMsg('error', 'Please enter a URL');
      return;
    }
    if (cleanUrl.includes('docs.google.com/spreadsheets')) {
      showMsg('error', '⚠️ Yeh Google Sheet ka direct link hai! Google Sheets me Extensions > Apps Script me jaa kar Deploy > Web App karke Web App URL (/exec) copy karein.');
      return;
    }
    if (!cleanUrl.endsWith('/exec') && !cleanUrl.includes('script.google.com')) {
      showMsg('error', 'URL should start with https://script.google.com and end with /exec');
      return;
    }
    try {
      const db = await getDB();
      await db.put('settings', {
        key: 'google_apps_script_url',
        value: cleanUrl,
        updatedAt: new Date().toISOString()
      });
      showMsg('success', 'Google Apps Script Web App URL saved successfully.');
      await loadAllAdminData();
    } catch (err) {
      showMsg('error', err.message);
    }
  };

  const handleTestPing = async () => {
    setLoading(true);
    try {
      const res = await testGoogleAppsScriptConnection(scriptUrl);
      showMsg('success', res.message);
    } catch (err) {
      showMsg('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSyncNow = async () => {
    setLoading(true);
    try {
      const res = await triggerSync();
      showMsg('success', res.message || res.warning || 'Sync finished');
      await loadAllAdminData();
    } catch (err) {
      showMsg('error', err.message || 'Sync failed');
    } finally {
      setLoading(false);
    }
  };

  // 2. Employee Management Handlers
  const handleAddEmployee = async (e) => {
    e.preventDefault();
    if (!newEmployeeName.trim()) return;

    try {
      const db = await getDB();
      const id = `EMP-${Date.now().toString().slice(-4)}`;
      const emp = {
        id,
        name: newEmployeeName.trim(),
        role: newEmployeeRole.trim(),
        active: true,
        createdAt: new Date().toISOString()
      };
      await db.put('employees', emp);
      setNewEmployeeName('');
      showMsg('success', `Employee ${emp.name} added successfully.`);
      await loadAllAdminData();
    } catch (err) {
      showMsg('error', err.message);
    }
  };

  const handleToggleEmployeeActive = async (emp) => {
    try {
      const db = await getDB();
      emp.active = !emp.active;
      await db.put('employees', emp);
      showMsg('success', `${emp.name} is now ${emp.active ? 'Active' : 'Deactivated'}.`);
      await loadAllAdminData();
    } catch (err) {
      showMsg('error', err.message);
    }
  };

  const handleSaveEditEmployee = async (empId) => {
    try {
      const db = await getDB();
      const emp = await db.get('employees', empId);
      if (emp) {
        emp.name = editEmpName.trim();
        emp.role = editEmpRole.trim();
        await db.put('employees', emp);
        setEditingEmpId(null);
        showMsg('success', 'Employee updated successfully.');
        await loadAllAdminData();
      }
    } catch (err) {
      showMsg('error', err.message);
    }
  };

  // 3. Product Management Handlers
  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!newProductName.trim() || !newProductPrefix.trim()) return;

    try {
      const db = await getDB();
      const id = `PROD-${Date.now().toString().slice(-4)}`;
      const prod = {
        id,
        name: newProductName.trim(),
        prefix: newProductPrefix.trim().toUpperCase(),
        active: true
      };
      await db.put('products', prod);
      setNewProductName('');
      setNewProductPrefix('');
      showMsg('success', `Product ${prod.name} (${prod.prefix}) created.`);
      await loadAllAdminData();
    } catch (err) {
      showMsg('error', err.message);
    }
  };

  const handleToggleProduct = async (prod) => {
    try {
      const db = await getDB();
      prod.active = !prod.active;
      await db.put('products', prod);
      showMsg('success', `${prod.name} is now ${prod.active ? 'Active' : 'Disabled'}.`);
      await loadAllAdminData();
    } catch (err) {
      showMsg('error', err.message);
    }
  };

  // 4. Change Admin PIN
  const handleChangePin = async (e) => {
    e.preventDefault();
    if (newPin !== confirmPin) {
      showMsg('error', 'New PIN and confirmation do not match.');
      return;
    }

    try {
      await updateAdminPin(currentPin, newPin);
      showMsg('success', 'Admin PIN changed successfully! Please remember your new PIN.');
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
    } catch (err) {
      showMsg('error', err.message);
    }
  };

  // 5. Reversal / Correction Handler
  const handleExecuteReversal = async (e) => {
    e.preventDefault();
    if (!reversalTarget || !reversalReason.trim()) {
      showMsg('error', 'Please enter a justification reason for this reversal.');
      return;
    }

    setLoading(true);
    try {
      const db = await getDB();
      const now = new Date().toISOString();
      const reason = reversalReason.trim();

      // Create a reversal entry with negative or zeroed quantities
      let correctionRecord = null;

      if (selectedModule === 'raw_material') {
        correctionRecord = {
          ...reversalTarget,
          entry_id: generateEntryId('RM-REV'),
          quantity_kg: -Math.abs(Number(reversalTarget.quantity_kg)),
          remarks: `[REVERSAL: Ref ${reversalTarget.entry_id}] ${reason}`,
          timestamp: now,
          employee_name: `ADMIN (${activeEmployee?.name || 'Authorized'})`,
          synced: false
        };
        await db.add('raw_material', correctionRecord);
        await queueSyncRecord('RAW_MATERIAL', correctionRecord);
      } else if (selectedModule === 'processing') {
        correctionRecord = {
          ...reversalTarget,
          entry_id: generateEntryId('PRC-REV'),
          gross_raw_kg: -Math.abs(Number(reversalTarget.gross_raw_kg)),
          net_raw_kg: -Math.abs(Number(reversalTarget.net_raw_kg)),
          cleaning_waste_kg: -Math.abs(Number(reversalTarget.cleaning_waste_kg)),
          net_powder_kg: -Math.abs(Number(reversalTarget.net_powder_kg)),
          grinding_loss_kg: -Math.abs(Number(reversalTarget.grinding_loss_kg)),
          total_loss_kg: -Math.abs(Number(reversalTarget.total_loss_kg)),
          remarks: `[REVERSAL: Ref ${reversalTarget.entry_id}] ${reason}`,
          timestamp: now,
          employee_name: `ADMIN (${activeEmployee?.name || 'Authorized'})`,
          synced: false
        };
        await db.add('processing', correctionRecord);
        await queueSyncRecord('PROCESSING', correctionRecord);
      } else if (selectedModule === 'packaging') {
        correctionRecord = {
          ...reversalTarget,
          entry_id: generateEntryId('PKG-REV'),
          packet_quantity: -Math.abs(Number(reversalTarget.packet_quantity)),
          powder_used_kg: -Math.abs(Number(reversalTarget.powder_used_kg)),
          remarks: `[REVERSAL: Ref ${reversalTarget.entry_id}] ${reason}`,
          timestamp: now,
          employee_name: `ADMIN (${activeEmployee?.name || 'Authorized'})`,
          synced: false
        };
        await db.add('packaging', correctionRecord);
        await queueSyncRecord('PACKAGING', correctionRecord);
      } else if (selectedModule === 'order_sale') {
        correctionRecord = {
          ...reversalTarget,
          entry_id: generateEntryId('SL-REV'),
          kg_sold: -Math.abs(Number(reversalTarget.kg_sold)),
          packets_deducted: -Math.abs(Number(reversalTarget.packets_deducted)),
          remarks: `[REVERSAL: Ref ${reversalTarget.entry_id}] ${reason}`,
          timestamp: now,
          employee_name: `ADMIN (${activeEmployee?.name || 'Authorized'})`,
          synced: false
        };
        await db.add('order_sale', correctionRecord);
        await queueSyncRecord('ORDER_SALE', correctionRecord);
      }

      // Record in audit log
      await db.add('audit_logs', {
        timestamp: now,
        action: 'REVERSAL_CORRECTION',
        module: selectedModule,
        target_entry_id: reversalTarget.entry_id,
        reason: reason,
        admin_employee: activeEmployee?.name || 'Admin',
        reversal_record: correctionRecord
      });

      showMsg('success', `Reversal transaction recorded! Ref: ${correctionRecord.entry_id}. Full audit trail preserved.`);
      setReversalTarget(null);
      setReversalReason('');
      await loadModuleEntries(selectedModule);
    } catch (err) {
      showMsg('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Firebase Operations Handlers
  const handleParseRawFirebase = () => {
    if (!rawConfigInput.trim()) {
      showMsg('error', 'Please paste your Firebase configuration snippet first.');
      return;
    }
    const parsed = parseFirebaseConfigText(rawConfigInput);
    if (parsed && (parsed.apiKey || parsed.projectId)) {
      setFirebaseConfig(prev => ({ ...prev, ...parsed }));
      showMsg('success', `Detected Firebase Project: "${parsed.projectId || 'Found'}". Click "Save Firebase Configuration" to store.`);
    } else {
      showMsg('error', 'Could not detect Firebase keys. Please verify the snippet or fill fields below manually.');
    }
  };

  const handleSaveFirebase = async (e) => {
    if (e) e.preventDefault();
    if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
      showMsg('error', 'API Key and Project ID are required to connect Firebase.');
      return;
    }

    setLoading(true);
    try {
      await saveFirebaseConfig(firebaseConfig);
      setIsFbConfigured(true);
      showMsg('success', `Firebase settings saved successfully for project "${firebaseConfig.projectId}"!`);
      await loadAllAdminData();
    } catch (err) {
      showMsg('error', `Failed to save Firebase config: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTestFirebase = async () => {
    if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
      showMsg('error', 'Please fill API Key and Project ID before testing.');
      return;
    }

    setFbTestLoading(true);
    try {
      const res = await testFirebaseConnection(firebaseConfig);
      setIsFbConfigured(true);
      showMsg('success', res.message || 'Firebase Firestore is connected and writable!');
      await loadAllAdminData();
    } catch (err) {
      showMsg('error', `Firebase Test Failed: ${err.message}. Ensure Cloud Firestore is enabled in Firebase Console.`);
    } finally {
      setFbTestLoading(false);
    }
  };

  const handleSyncAllToFirebase = async () => {
    setFbSyncLoading(true);
    setFbProgressMsg('Starting full upload to Cloud Firestore...');
    try {
      const res = await syncAllLocalDataToFirestore(p => {
        setFbProgressMsg(`Uploading ${p.collection}... (${p.totalUploaded} records processed)`);
      });
      showMsg('success', `All factory data uploaded to Cloud Firestore! ${res.totalUploaded} records synced.`);
      setFbProgressMsg('');
      await loadAllAdminData();
    } catch (err) {
      showMsg('error', `Firebase Upload Failed: ${err.message}`);
      setFbProgressMsg('');
    } finally {
      setFbSyncLoading(false);
    }
  };

  const handlePullFromFirebase = async () => {
    if (!window.confirm('Download all inventory records from Firebase Cloud to this device? Local records will be merged.')) {
      return;
    }
    setFbPullLoading(true);
    setFbProgressMsg('Downloading from Cloud Firestore...');
    try {
      const res = await pullDataFromFirestore(p => {
        setFbProgressMsg(`Downloading ${p.collection}... (${p.totalDownloaded} records processed)`);
      });
      showMsg('success', `Downloaded ${res.totalDownloaded} records from Firebase Cloud!`);
      setFbProgressMsg('');
      await loadAllAdminData();
    } catch (err) {
      showMsg('error', `Firebase Download Failed: ${err.message}`);
      setFbProgressMsg('');
    } finally {
      setFbPullLoading(false);
    }
  };

  const handleCopyFbRules = async () => {
    try {
      await navigator.clipboard.writeText(FIRESTORE_RULES);
      setCopiedFbRules(true);
      showMsg('success', 'Firestore Security Rules copied to clipboard!');
      setTimeout(() => setCopiedFbRules(false), 3000);
    } catch {
      showMsg('error', 'Failed to copy rules to clipboard.');
    }
  };

  // 6. Master Testing Scenario One-Click Seeder (Phase 19 verification!)
  const handleLoadDemoScenario = async () => {
    setLoading(true);
    try {
      const db = await getDB();
      const today = getTodayDateStr();
      const now = new Date().toISOString();

      // Step 1: Raw Material Inward: Haldi = 1000 KG, Batch HAL-001
      // Also Mirchi = 500 KG (MIR-001) & Dhaniya = 500 KG (DHA-001) for the multi-product order!
      const rawHaldi = {
        entry_id: generateEntryId('RM'),
        date: today,
        batch_id: 'HAL-001',
        material_name: 'Haldi',
        supplier_name: 'Sangli Turmeric Mandi',
        invoice_number: 'INV-DEMO-01',
        quantity_kg: 1000,
        employee_name: activeEmployee?.name || 'Ramesh Patel',
        timestamp: now,
        remarks: 'Master Testing Scenario Inward',
        synced: false
      };
      const rawMirchi = {
        entry_id: generateEntryId('RM'),
        date: today,
        batch_id: 'MIR-001',
        material_name: 'Mirchi',
        supplier_name: 'Guntur Chilli Yard',
        invoice_number: 'INV-DEMO-02',
        quantity_kg: 500,
        employee_name: activeEmployee?.name || 'Ramesh Patel',
        timestamp: now,
        remarks: 'Master Testing Scenario Inward',
        synced: false
      };
      const rawDhaniya = {
        entry_id: generateEntryId('RM'),
        date: today,
        batch_id: 'DHA-001',
        material_name: 'Dhaniya',
        supplier_name: 'Ramganj Mandi',
        invoice_number: 'INV-DEMO-03',
        quantity_kg: 500,
        employee_name: activeEmployee?.name || 'Ramesh Patel',
        timestamp: now,
        remarks: 'Master Testing Scenario Inward',
        synced: false
      };

      await db.add('raw_material', rawHaldi);
      await db.add('raw_material', rawMirchi);
      await db.add('raw_material', rawDhaniya);
      await queueSyncRecord('RAW_MATERIAL', rawHaldi);
      await queueSyncRecord('RAW_MATERIAL', rawMirchi);
      await queueSyncRecord('RAW_MATERIAL', rawDhaniya);

      // Step 2: Processing:
      // Round 1 = 300 KG (Cleaned 285, Powder 270, Loss 30)
      // Round 2 = 400 KG (Cleaned 380, Powder 360, Loss 40)
      // Round 3 = 300 KG (Cleaned 285, Powder 270, Loss 30)
      // Total powder produced = 900 KG for HAL-001!
      const p1 = {
        entry_id: generateEntryId('PRC'),
        date: today,
        batch_id: 'HAL-001',
        material_name: 'Haldi',
        processing_round: 1,
        gross_raw_kg: 300,
        net_raw_kg: 285,
        cleaning_waste_kg: 15,
        net_powder_kg: 270,
        grinding_loss_kg: 15,
        total_loss_kg: 30,
        employee_name: 'Suresh Kumar',
        timestamp: now,
        remarks: 'Master Demo Round 1',
        synced: false
      };
      const p2 = {
        entry_id: generateEntryId('PRC'),
        date: today,
        batch_id: 'HAL-001',
        material_name: 'Haldi',
        processing_round: 2,
        gross_raw_kg: 400,
        net_raw_kg: 380,
        cleaning_waste_kg: 20,
        net_powder_kg: 360,
        grinding_loss_kg: 20,
        total_loss_kg: 40,
        employee_name: 'Suresh Kumar',
        timestamp: now,
        remarks: 'Master Demo Round 2',
        synced: false
      };
      const p3 = {
        entry_id: generateEntryId('PRC'),
        date: today,
        batch_id: 'HAL-001',
        material_name: 'Haldi',
        processing_round: 3,
        gross_raw_kg: 300,
        net_raw_kg: 285,
        cleaning_waste_kg: 15,
        net_powder_kg: 270,
        grinding_loss_kg: 15,
        total_loss_kg: 30,
        employee_name: 'Suresh Kumar',
        timestamp: now,
        remarks: 'Master Demo Round 3',
        synced: false
      };

      // Also process Mirchi (300 KG -> 280 KG powder) and Dhaniya (300 KG -> 280 KG powder)
      const pMirchi = {
        entry_id: generateEntryId('PRC'),
        date: today,
        batch_id: 'MIR-001',
        material_name: 'Mirchi',
        processing_round: 1,
        gross_raw_kg: 300,
        net_raw_kg: 288,
        cleaning_waste_kg: 12,
        net_powder_kg: 280,
        grinding_loss_kg: 8,
        total_loss_kg: 20,
        employee_name: 'Suresh Kumar',
        timestamp: now,
        remarks: 'Master Demo Mirchi Round 1',
        synced: false
      };
      const pDhaniya = {
        entry_id: generateEntryId('PRC'),
        date: today,
        batch_id: 'DHA-001',
        material_name: 'Dhaniya',
        processing_round: 1,
        gross_raw_kg: 300,
        net_raw_kg: 288,
        cleaning_waste_kg: 12,
        net_powder_kg: 280,
        grinding_loss_kg: 8,
        total_loss_kg: 20,
        employee_name: 'Suresh Kumar',
        timestamp: now,
        remarks: 'Master Demo Dhaniya Round 1',
        synced: false
      };

      for (const p of [p1, p2, p3, pMirchi, pDhaniya]) {
        await db.add('processing', p);
        await queueSyncRecord('PROCESSING', p);
      }

      // Step 3: Packaging:
      // Convert Haldi powder into packets:
      // 10 GM = 1000 pkts (10 KG)
      // 24 GM = 500 pkts (12 KG)
      // 50 GM = 500 pkts (25 KG)
      // 100 GM = 500 pkts (50 KG)
      // 200 GM = 300 pkts (60 KG)
      // 500 GM = 200 pkts (100 KG)
      // Total powder used = 257 KG
      const txHaldi = generatePackagingTxId();
      const haldiPacks = [
        { size: 10, pkts: 1000, kg: 10 },
        { size: 24, pkts: 500, kg: 12 },
        { size: 50, pkts: 500, kg: 25 },
        { size: 100, pkts: 500, kg: 50 },
        { size: 200, pkts: 300, kg: 60 },
        { size: 500, pkts: 200, kg: 100 },
      ];
      for (const pk of haldiPacks) {
        const pkgRec = {
          entry_id: generateEntryId('PKG'),
          transaction_id: txHaldi,
          date: today,
          batch_id: 'HAL-001',
          product_name: 'Haldi',
          pack_size_gm: pk.size,
          packet_quantity: pk.pkts,
          powder_used_kg: pk.kg,
          employee_name: 'Dinesh Sharma',
          timestamp: now,
          remarks: 'Master Demo Haldi Packaging',
          synced: false
        };
        await db.add('packaging', pkgRec);
        await queueSyncRecord('PACKAGING', pkgRec);
      }

      // Package Mirchi: 200 GM = 200 pkts (40 KG)
      const pkgMirchi = {
        entry_id: generateEntryId('PKG'),
        transaction_id: generatePackagingTxId(),
        date: today,
        batch_id: 'MIR-001',
        product_name: 'Mirchi',
        pack_size_gm: 200,
        packet_quantity: 200,
        powder_used_kg: 40,
        employee_name: 'Dinesh Sharma',
        timestamp: now,
        remarks: 'Master Demo Mirchi Packaging',
        synced: false
      };
      await db.add('packaging', pkgMirchi);
      await queueSyncRecord('PACKAGING', pkgMirchi);

      // Package Dhaniya: 500 GM = 100 pkts (50 KG)
      const pkgDhaniya = {
        entry_id: generateEntryId('PKG'),
        transaction_id: generatePackagingTxId(),
        date: today,
        batch_id: 'DHA-001',
        product_name: 'Dhaniya',
        pack_size_gm: 500,
        packet_quantity: 100,
        powder_used_kg: 50,
        employee_name: 'Dinesh Sharma',
        timestamp: now,
        remarks: 'Master Demo Dhaniya Packaging',
        synced: false
      };
      await db.add('packaging', pkgDhaniya);
      await queueSyncRecord('PACKAGING', pkgDhaniya);

      // Step 4: Multi-Product Sale Order:
      // Order ORD-0001
      // Line 1: Haldi 100 GM, 10 KG (100 pkts)
      // Line 2: Mirchi 200 GM, 15 KG (75 pkts)
      // Line 3: Dhaniya 500 GM, 20 KG (40 pkts)
      // Total Order = 45 KG!
      const demoOrderId = 'ORD-0001';
      const saleLines = [
        { prod: 'Haldi', batch: 'HAL-001', size: 100, kg: 10, pkts: 100 },
        { prod: 'Mirchi', batch: 'MIR-001', size: 200, kg: 15, pkts: 75 },
        { prod: 'Dhaniya', batch: 'DHA-001', size: 500, kg: 20, pkts: 40 },
      ];

      for (const line of saleLines) {
        const saleRec = {
          entry_id: generateEntryId('SL'),
          order_id: demoOrderId,
          date: today,
          sale_method: 'FIFO (Product-wise)',
          product_name: line.prod,
          batch_id: line.batch,
          pack_size_gm: line.size,
          kg_sold: line.kg,
          packets_deducted: line.pkts,
          employee_name: activeEmployee?.name || 'Ramesh Patel',
          timestamp: now,
          remarks: 'Master Demo Multi-Product Order (45 KG Total)',
          synced: false
        };
        await db.add('order_sale', saleRec);
        await queueSyncRecord('ORDER_SALE', saleRec);
      }

      showMsg('success', 'Master Testing Scenario Loaded! 3 Batches, 3 Rounds of Processing, Multi-Pack Packaging, and 45 KG Multi-Product Order populated successfully.');
      await loadAllAdminData();
    } catch (err) {
      showMsg('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Reset entire DB to initial state
  const handleResetData = async () => {
    if (!window.confirm('CAUTION: This will delete all local transactions. Are you sure you want to reset?')) {
      return;
    }

    try {
      const db = await getDB();
      const tx = db.transaction(['raw_material', 'processing', 'packaging', 'order_sale', 'sync_queue', 'audit_logs'], 'readwrite');
      await tx.objectStore('raw_material').clear();
      await tx.objectStore('processing').clear();
      await tx.objectStore('packaging').clear();
      await tx.objectStore('order_sale').clear();
      await tx.objectStore('sync_queue').clear();
      await tx.objectStore('audit_logs').clear();
      await tx.done;

      showMsg('success', 'All local factory transactions cleared.');
      await loadAllAdminData();
    } catch (err) {
      showMsg('error', err.message);
    }
  };

  return (
    <div className="space-y-6 pb-20 md:pb-6 animate-fadeIn">
      
      {/* Admin Title Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-brand-950 to-slate-900 rounded-2xl p-4 sm:p-5 text-white shadow-md border border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-11 h-11 rounded-xl bg-white/10 text-gold-400 flex items-center justify-center border border-gold-400/40">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-black tracking-tight text-white">
                ADMINISTRATION PANEL
              </h2>
              <span className="text-[10px] font-bold bg-emerald-600 px-2 py-0.5 rounded text-white uppercase tracking-wider">
                Authorized
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Excel Reports & Export, Cloud Database, Staff, Reversals & System Audits
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setSubTab('REPORTS_EXPORT')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition flex items-center space-x-1.5 shadow-sm ${
              subTab === 'REPORTS_EXPORT'
                ? 'bg-emerald-400 text-slate-950 ring-2 ring-emerald-300'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-100" />
            <span>Reports & Export (.xlsx)</span>
          </button>

          <button
            onClick={onLockAdmin}
            className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5"
          >
            <KeyRound className="w-3.5 h-3.5 text-gold-300" />
            <span>Lock Admin</span>
          </button>
        </div>
      </div>

      {/* Toast Feedback */}
      {feedback && (
        <div className={`p-3.5 rounded-xl border text-xs sm:text-sm font-semibold flex items-center space-x-2.5 shadow-xs ${
          feedback.type === 'success' 
            ? 'bg-emerald-50 border-emerald-300 text-emerald-900' 
            : 'bg-red-50 border-red-300 text-red-900'
        }`}>
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Sub Tabs */}
      <div className="flex space-x-1.5 bg-white p-2 rounded-xl border border-slate-200 overflow-x-auto shadow-xs">
        {[
          { id: 'REPORTS_EXPORT', label: '📊 Reports & Export (Excel)', icon: FileSpreadsheet, highlight: true },
          { id: 'FIREBASE', label: 'Firebase Cloud', icon: Flame },
          { id: 'SYNC', label: 'Google Sheets Sync', icon: Database },
          { id: 'EMPLOYEES', label: 'Employees', icon: Users },
          { id: 'PRODUCTS', label: 'Products & Prefixes', icon: Package },
          { id: 'CORRECTIONS', label: 'Reversals & Audit', icon: RotateCcw },
          { id: 'DEMO', label: 'Scenario Testing', icon: Sparkles },
          { id: 'SECURITY', label: 'Security (PIN)', icon: KeyRound },
        ].map(t => {
          const Icon = t.icon;
          const isActive = subTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-black transition whitespace-nowrap ${
                isActive
                  ? t.highlight
                    ? 'bg-emerald-700 text-white shadow-md ring-2 ring-emerald-900'
                    : 'bg-brand-900 text-white shadow-xs'
                  : t.highlight
                    ? 'bg-emerald-50 text-emerald-800 border-2 border-emerald-400 hover:bg-emerald-100 font-black'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-gold-300' : t.highlight ? 'text-emerald-700' : 'text-slate-400'}`} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Sub Tab: Reports & Export */}
      {subTab === 'REPORTS_EXPORT' && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="bg-gradient-to-r from-emerald-950 via-brand-950 to-slate-900 rounded-2xl p-5 text-white shadow-md border border-emerald-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shrink-0">
                <FileSpreadsheet className="w-7 h-7" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-lg font-black tracking-tight text-white">
                    REPORTS & EXPORT
                  </h3>
                  <span className="text-[10px] font-bold bg-emerald-600/90 text-white px-2 py-0.5 rounded uppercase tracking-wider">
                    8 Sheets
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  Production, Inventory & Batch Traceability Records (Single Excel Workbook)
                </p>
                <p className="text-[11px] text-emerald-300/80 mt-0.5 font-medium">
                  PATEL SAHAB ENTERPRISES LLP • Plant: Village Panwa, Tehsil Kasrawad, Khargone (M.P.)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                onClick={handleExportExcel}
                disabled={exportingExcel || reportLoading}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md transition flex items-center space-x-2"
              >
                {exportingExcel ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <Download className="w-4 h-4 text-emerald-100" />
                )}
                <span>{exportingExcel ? 'Generating Excel...' : 'Export to Excel (.xlsx)'}</span>
              </button>
            </div>
          </div>

          {/* Date Filter & Control Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-emerald-700" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Select Reporting Period
                </span>
                {reportData?.sourceName && (
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">
                    Source: {reportData.sourceName}
                  </span>
                )}
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'CURRENT_FY', label: 'Current Financial Year' },
                  { id: 'LAST_FY', label: 'Last Financial Year' },
                  { id: 'THIS_MONTH', label: 'This Month' },
                  { id: 'ALL_TIME', label: 'All Time' }
                ].map(p => (
                  <button
                    key={p.id}
                    onClick={() => handlePresetChange(p.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                      activeDatePreset === p.id
                        ? 'bg-emerald-800 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  value={reportFromDate}
                  onChange={(e) => {
                    setReportFromDate(e.target.value);
                    setActiveDatePreset('CUSTOM');
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  value={reportToDate}
                  onChange={(e) => {
                    setReportToDate(e.target.value);
                    setActiveDatePreset('CUSTOM');
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <button
                  onClick={handleGenerateReport}
                  disabled={reportLoading}
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${reportLoading ? 'animate-spin' : ''}`} />
                  <span>{reportLoading ? 'Compiling...' : 'Generate Report'}</span>
                </button>
              </div>

              <div>
                <button
                  onClick={handleExportExcel}
                  disabled={exportingExcel || reportLoading}
                  className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 shadow-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{exportingExcel ? 'Writing Excel...' : 'Download Excel (.xlsx)'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Loading Indicator */}
          {reportLoading && (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
              <p className="text-sm font-bold text-slate-800">Reading records and computing reconciliations...</p>
              <p className="text-xs text-slate-500">Querying Raw Inward, Grinding, Packaging, Sales and Batches</p>
            </div>
          )}

          {/* Summary of Selected Period */}
          {reportData && !reportLoading && (
            <>
              {/* 4 Highlight Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* Total Raw Material Received */}
                <div className="bg-white rounded-2xl border border-amber-200/80 p-4 shadow-xs relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-amber-50 rounded-bl-full pointer-events-none" />
                  <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">
                    Raw Material Received
                  </p>
                  <p className="text-2xl font-black text-slate-900 mt-1">
                    {reportData.periodTotals.rawInwardKg.toLocaleString('en-IN', { minimumFractionDigits: 3 })}
                    <span className="text-xs font-bold text-slate-500 ml-1">KG</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {reportData.periodRaw.length} inward entries in period
                  </p>
                </div>

                {/* Total Powder Produced */}
                <div className="bg-white rounded-2xl border border-blue-200/80 p-4 shadow-xs relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 rounded-bl-full pointer-events-none" />
                  <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">
                    Total Powder Produced
                  </p>
                  <p className="text-2xl font-black text-slate-900 mt-1">
                    {reportData.periodTotals.netPowderProducedKg.toLocaleString('en-IN', { minimumFractionDigits: 3 })}
                    <span className="text-xs font-bold text-slate-500 ml-1">KG</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Loss: {reportData.periodTotals.totalLossKg} KG ({reportData.periodProc.length} grinding runs)
                  </p>
                </div>

                {/* Total Packets Packed */}
                <div className="bg-white rounded-2xl border border-purple-200/80 p-4 shadow-xs relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-purple-50 rounded-bl-full pointer-events-none" />
                  <p className="text-[11px] font-bold text-purple-700 uppercase tracking-wider">
                    Total Packets Packed
                  </p>
                  <p className="text-2xl font-black text-slate-900 mt-1">
                    {reportData.periodTotals.packagingPacketsProduced.toLocaleString('en-IN')}
                    <span className="text-xs font-bold text-slate-500 ml-1">Packets</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Powder used: {reportData.periodTotals.packagingPowderConsumedKg} KG ({reportData.periodPkg.length} logs)
                  </p>
                </div>

                {/* Total Finished Goods Dispatched */}
                <div className="bg-white rounded-2xl border border-emerald-200/80 p-4 shadow-xs relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-50 rounded-bl-full pointer-events-none" />
                  <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
                    Finished Goods Dispatched
                  </p>
                  <p className="text-2xl font-black text-slate-900 mt-1">
                    {reportData.periodTotals.salesKg.toLocaleString('en-IN', { minimumFractionDigits: 3 })}
                    <span className="text-xs font-bold text-slate-500 ml-1">KG</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {reportData.periodTotals.uniqueOrdersCount} orders ({reportData.periodSales.length} items sold)
                  </p>
                </div>
              </div>

              {/* Master Stock Summary Card (As of selected To Date) */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <div className="flex items-center space-x-2">
                    <Package className="w-4 h-4 text-emerald-700" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Product-Wise Available Stock Balance (As of {formatDisplayDate(reportData.toDate)})
                    </h4>
                  </div>
                  <span className="text-[11px] text-slate-500 font-semibold">
                    Formula: Available = Received/Produced - Consumed/Sold
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                        <th className="py-2.5 px-3">Product Name</th>
                        <th className="py-2.5 px-3 text-right">Raw Available (KG)</th>
                        <th className="py-2.5 px-3 text-right">Powder Available (KG)</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {['Haldi', 'Mirchi', 'Dhaniya'].map(prod => {
                        const stock = reportData.closingStockByProduct[prod] || { rawAvailableKg: 0, powderAvailableKg: 0 };
                        return (
                          <tr key={prod} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-3 font-bold text-slate-900">{prod}</td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-700">
                              {stock.rawAvailableKg.toLocaleString('en-IN', { minimumFractionDigits: 3 })} KG
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-700">
                              {stock.powderAvailableKg.toLocaleString('en-IN', { minimumFractionDigits: 3 })} KG
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                Reconciled
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-slate-50/90 font-bold text-slate-900 border-t border-slate-300">
                        <td className="py-2.5 px-3">Total Finished Goods in Stock</td>
                        <td colSpan="3" className="py-2.5 px-3 text-right font-mono text-emerald-700">
                          {reportData.totalClosingFinishedPackets.toLocaleString('en-IN')} Packets ({reportData.totalClosingFinishedKg.toLocaleString('en-IN', { minimumFractionDigits: 3 })} KG)
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 8 Sections / Sheets Record Counts */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
                <div className="flex items-center space-x-2 pb-2 border-b border-slate-100">
                  <Layers className="w-4 h-4 text-emerald-700" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Complete Workbook Sheet Breakdown (8 Sheets)
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { num: 'Sheet 1', title: 'COMPANY SUMMARY', count: 'Cover & KPIs', desc: 'Legal entity, signatory & master stock' },
                    { num: 'Sheet 2', title: 'RAW MATERIAL INWARD', count: `${reportData.periodRaw.length} Records`, desc: `${reportData.periodTotals.rawInwardKg} KG inward` },
                    { num: 'Sheet 3', title: 'PROCESSING REPORT', count: `${reportData.periodProc.length} Records`, desc: `${reportData.periodTotals.netPowderProducedKg} KG powder made` },
                    { num: 'Sheet 4', title: 'POWDER STOCK REPORT', count: `${reportData.powderBatchStockList.length} Batches`, desc: 'Batch-wise powder balances' },
                    { num: 'Sheet 5', title: 'PACKAGING REPORT', count: `${reportData.periodPkg.length} Records`, desc: `${reportData.periodTotals.packagingPacketsProduced} pkts produced` },
                    { num: 'Sheet 6', title: 'FINISHED STOCK REPORT', count: `${reportData.finishedStockList.length} SKUs`, desc: 'Packets available by size' },
                    { num: 'Sheet 7', title: 'SALE & DISPATCH REPORT', count: `${reportData.periodSales.length} Items`, desc: `${reportData.periodTotals.salesKg} KG sold (no rates)` },
                    { num: 'Sheet 8', title: 'BATCH TRACEABILITY REPORT', count: `${reportData.batchTraceabilityList.length} Batches`, desc: 'Full batch lifecycle tracked' }
                  ].map(sh => (
                    <div key={sh.num} className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-emerald-700 uppercase">{sh.num}</span>
                        <span className="text-[11px] font-black text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                          {sh.count}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-900 mt-1 truncate">{sh.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{sh.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Validation Status Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
                <div className="flex items-center space-x-2 pb-2 border-b border-slate-100">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Data Integrity & Audit Validations
                  </h4>
                </div>

                <div className="space-y-2">
                  {reportData.validations.map((v, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="flex items-center space-x-2.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-slate-900">{v.title}</p>
                          <p className="text-[11px] text-slate-500">{v.detail}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-emerald-100 text-emerald-800 shrink-0 self-start sm:self-auto">
                        {v.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Big Download Banner */}
              <div className="bg-gradient-to-r from-emerald-900 to-slate-900 rounded-2xl p-5 text-white shadow-md border border-emerald-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-black text-white uppercase tracking-wider">
                    Ready to Download Complete Excel Workbook
                  </h4>
                  <p className="text-xs text-emerald-200 mt-0.5">
                    File: <span className="font-mono font-bold text-white">PATEL_SAHAB_SPICES_PRODUCTION_INVENTORY_REPORT.xlsx</span>
                  </p>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    Styled with dark green headers (#14532D), freeze panes, auto-fit column widths, thin borders, and formula checks.
                  </p>
                </div>

                <button
                  onClick={handleExportExcel}
                  disabled={exportingExcel}
                  className="px-5 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg transition flex items-center justify-center space-x-2 shrink-0"
                >
                  {exportingExcel ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                  ) : (
                    <Download className="w-4 h-4 text-slate-950" />
                  )}
                  <span>{exportingExcel ? 'Generating Workbook...' : 'Download Complete Excel'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Sub Tab: Firebase Cloud Integration */}
      {subTab === 'FIREBASE' && (
        <div className="space-y-4">
          
          {/* Status & Overview Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 text-orange-600 flex items-center justify-center font-bold">
                  <Flame className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                    <span>Firebase Cloud Firestore Integration</span>
                    {isFbConfigured ? (
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                        Configured
                      </span>
                    ) : (
                      <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
                        Not Connected
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Real-time cloud database for multi-device sync, instant backups, and multi-location factory access.
                  </p>
                </div>
              </div>

              {isFbConfigured && (
                <button
                  type="button"
                  onClick={handleTestFirebase}
                  disabled={fbTestLoading}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 shadow-xs transition self-start sm:self-auto disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${fbTestLoading ? 'animate-spin' : ''}`} />
                  <span>{fbTestLoading ? 'Testing...' : 'Test Connection Live'}</span>
                </button>
              )}
            </div>

            {/* Project Info Pill */}
            {isFbConfigured && (
              <div className="p-3 bg-orange-50/70 rounded-xl border border-orange-200 text-xs flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <span className="text-slate-600">Active Firebase Project:</span>
                  <span className="font-mono font-bold text-orange-950 bg-white px-2 py-0.5 rounded border border-orange-200">
                    {firebaseConfig.projectId}
                  </span>
                </div>
                <div className="text-slate-500 text-[11px]">
                  Last Cloud Sync: {syncStatus?.lastFirebaseSyncTime ? new Date(syncStatus.lastFirebaseSyncTime).toLocaleString() : 'Never'}
                </div>
              </div>
            )}
          </div>

          {/* Quick Paste Box */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-orange-600" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                1-Click Quick Setup (Paste from Firebase Console)
              </h4>
            </div>
            <p className="text-xs text-slate-600">
              Firebase Console se <code>const firebaseConfig = &#123; ... &#125;;</code> wala block yahan paste karein aur "Auto-Fill" click karein:
            </p>
            <div className="space-y-2">
              <textarea
                rows={3}
                placeholder={`const firebaseConfig = {\n  apiKey: "AIzaSy...",\n  authDomain: "...",\n  projectId: "...",\n  ...\n};`}
                value={rawConfigInput}
                onChange={(e) => setRawConfigInput(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 font-mono text-xs rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-orange-600 text-slate-800"
              />
              <button
                type="button"
                onClick={handleParseRawFirebase}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 transition"
              >
                <Sparkles className="w-3.5 h-3.5 text-gold-300" />
                <span>Auto-Detect & Fill Config Fields</span>
              </button>
            </div>
          </div>

          {/* Detailed Config Form */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Firebase Configuration Parameters
            </h4>

            <form onSubmit={handleSaveFirebase} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Project ID *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. patel-sahab-spices"
                    value={firebaseConfig.projectId}
                    onChange={(e) => setFirebaseConfig(prev => ({ ...prev, projectId: e.target.value }))}
                    className="w-full bg-white border border-slate-300 font-mono text-xs font-bold rounded-xl px-3 py-2 text-slate-900 focus:ring-2 focus:ring-orange-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    API Key *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="AIzaSy..."
                    value={firebaseConfig.apiKey}
                    onChange={(e) => setFirebaseConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                    className="w-full bg-white border border-slate-300 font-mono text-xs font-bold rounded-xl px-3 py-2 text-slate-900 focus:ring-2 focus:ring-orange-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Auth Domain
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. patel-sahab-spices.firebaseapp.com"
                    value={firebaseConfig.authDomain}
                    onChange={(e) => setFirebaseConfig(prev => ({ ...prev, authDomain: e.target.value }))}
                    className="w-full bg-white border border-slate-300 font-mono text-xs rounded-xl px-3 py-2 text-slate-900 focus:ring-2 focus:ring-orange-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Storage Bucket
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. patel-sahab-spices.appspot.com"
                    value={firebaseConfig.storageBucket}
                    onChange={(e) => setFirebaseConfig(prev => ({ ...prev, storageBucket: e.target.value }))}
                    className="w-full bg-white border border-slate-300 font-mono text-xs rounded-xl px-3 py-2 text-slate-900 focus:ring-2 focus:ring-orange-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Messaging Sender ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 123456789012"
                    value={firebaseConfig.messagingSenderId}
                    onChange={(e) => setFirebaseConfig(prev => ({ ...prev, messagingSenderId: e.target.value }))}
                    className="w-full bg-white border border-slate-300 font-mono text-xs rounded-xl px-3 py-2 text-slate-900 focus:ring-2 focus:ring-orange-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    App ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 1:123456789012:web:abcdef..."
                    value={firebaseConfig.appId}
                    onChange={(e) => setFirebaseConfig(prev => ({ ...prev, appId: e.target.value }))}
                    className="w-full bg-white border border-slate-300 font-mono text-xs rounded-xl px-3 py-2 text-slate-900 focus:ring-2 focus:ring-orange-600"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center space-x-2 shadow-md transition disabled:opacity-50"
                >
                  <Flame className="w-4 h-4 text-white" />
                  <span>{loading ? 'Saving...' : 'Save Firebase Configuration'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleTestFirebase}
                  disabled={fbTestLoading || !firebaseConfig.projectId}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-800 font-bold rounded-xl text-xs flex items-center space-x-1.5 transition disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${fbTestLoading ? 'animate-spin' : ''}`} />
                  <span>Test Connection</span>
                </button>
              </div>
            </form>
          </div>

          {/* Cloud Synchronization & Backup Actions */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Cloud Operations & Multi-Device Sync
            </h4>

            {fbProgressMsg && (
              <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl text-xs font-semibold flex items-center space-x-2">
                <RefreshCw className="w-4 h-4 text-blue-700 animate-spin shrink-0" />
                <span>{fbProgressMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center space-x-2 text-slate-800 font-bold text-xs">
                  <UploadCloud className="w-4 h-4 text-orange-600" />
                  <span>Upload Local Data to Firebase</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Upload all current factory entries (Raw Material, Processing, Packaging, Sales, Products, Staff) to Cloud Firestore.
                </p>
                <button
                  type="button"
                  onClick={handleSyncAllToFirebase}
                  disabled={fbSyncLoading || !isFbConfigured}
                  className="w-full py-2 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-bold rounded-lg text-xs flex items-center justify-center space-x-1.5 transition disabled:opacity-50"
                >
                  <UploadCloud className={`w-3.5 h-3.5 ${fbSyncLoading ? 'animate-bounce' : ''}`} />
                  <span>{fbSyncLoading ? 'Uploading...' : 'Sync All Data to Cloud Firestore'}</span>
                </button>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center space-x-2 text-slate-800 font-bold text-xs">
                  <DownloadCloud className="w-4 h-4 text-blue-600" />
                  <span>Download / Restore from Firebase</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Naye mobile ya tablet par factory database restore karein. Cloud se saara stock data download ho jayega.
                </p>
                <button
                  type="button"
                  onClick={handlePullFromFirebase}
                  disabled={fbPullLoading || !isFbConfigured}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-900 active:scale-95 text-white font-bold rounded-lg text-xs flex items-center justify-center space-x-1.5 transition disabled:opacity-50"
                >
                  <DownloadCloud className={`w-3.5 h-3.5 ${fbPullLoading ? 'animate-bounce' : ''}`} />
                  <span>{fbPullLoading ? 'Downloading...' : 'Pull Cloud Data to this Device'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Step-by-Step 3-Minute Setup Guide */}
          <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-md space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center space-x-2">
                <Flame className="w-5 h-5 text-orange-400" />
                <h4 className="font-bold text-sm">Firebase Cloud Firestore Setup Guide (3 Steps)</h4>
              </div>
              <a
                href="https://console.firebase.google.com/"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-orange-300 hover:underline flex items-center space-x-1"
              >
                <span>Open Firebase Console</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-white/5 rounded-xl border border-white/10 space-y-1">
                <div className="font-bold text-orange-300">Step 1: Create Project</div>
                <p className="text-slate-300 text-[11px]">
                  Go to <strong>console.firebase.google.com</strong> &gt; Click <strong>"Add project"</strong> &gt; Name it <code>patel-sahab-spices</code>.
                </p>
              </div>

              <div className="p-3 bg-white/5 rounded-xl border border-white/10 space-y-1">
                <div className="font-bold text-orange-300">Step 2: Add Web App &lt;/&gt;</div>
                <p className="text-slate-300 text-[11px]">
                  Project Overview me <strong>Web icon (&lt;/&gt;)</strong> click karein &gt; App name dalein &gt; Diye gaye <code>firebaseConfig</code> ko copy karke upar paste karein.
                </p>
              </div>

              <div className="p-3 bg-white/5 rounded-xl border border-white/10 space-y-1">
                <div className="font-bold text-orange-300">Step 3: Enable Firestore</div>
                <p className="text-slate-300 text-[11px]">
                  Left menu me <strong>Build &gt; Firestore Database</strong> &gt; Click <strong>"Create database"</strong> &gt; Choose <strong>"Test mode"</strong>.
                </p>
              </div>
            </div>

            {/* Ready Security Rules */}
            <div className="p-3.5 bg-black/40 rounded-xl border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-orange-300 uppercase tracking-wider">
                  Cloud Firestore Security Rules (Production / Godown Ready)
                </span>
                <button
                  type="button"
                  onClick={handleCopyFbRules}
                  className="px-2.5 py-1 bg-white/10 hover:bg-white/20 active:scale-95 text-white rounded text-xs flex items-center space-x-1 font-semibold transition"
                >
                  {copiedFbRules ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-300" />}
                  <span>{copiedFbRules ? 'Copied!' : 'Copy Rules'}</span>
                </button>
              </div>
              <pre className="font-mono text-[11px] text-slate-300 overflow-x-auto p-2 bg-black/50 rounded">
                {FIRESTORE_RULES}
              </pre>
            </div>
          </div>

        </div>
      )}

      {/* Sub Tab 1: Google Sheets Sync Management */}
      {subTab === 'SYNC' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                  Google Apps Script Web App Integration
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Connect your Google Spreadsheet to synchronize all 4 modules atomically
                </p>
              </div>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                syncStatus?.hasScriptUrl ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {syncStatus?.hasScriptUrl ? 'API Endpoint Active' : 'URL Not Configured'}
              </span>
            </div>

            <form onSubmit={handleSaveScriptUrl} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Google Apps Script Web App URL (ends with /exec)
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                    value={scriptUrl}
                    onChange={(e) => setScriptUrl(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-brand-700"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-brand-800 hover:bg-brand-900 text-white font-bold rounded-xl text-xs transition active:scale-95 shrink-0"
                  >
                    Save URL
                  </button>
                </div>
              </div>

              {scriptUrl.includes('docs.google.com/spreadsheets') && (
                <div className="p-3.5 bg-amber-50 border-2 border-amber-400 rounded-xl text-xs text-amber-950 space-y-2 shadow-xs">
                  <div className="font-black text-amber-900 flex items-center gap-2 text-sm">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <span>Yeh Google Sheet Spreadsheet ka direct link hai (Web App URL nahi hai!)</span>
                  </div>
                  <p className="leading-relaxed">
                    Google Sheets direct POST request accept nahi karta (isliye <strong>HTTP 405</strong> error aata hai). Sync karne ke liye aapko Google Sheet ke andar <strong>Apps Script ko Web App deploy</strong> karna hota hai, jisse <code className="font-mono bg-white px-1 py-0.5 rounded border border-amber-300">https://script.google.com/macros/s/.../exec</code> URL milta hai.
                  </p>
                  <div className="bg-white p-3 rounded-lg border border-amber-300 space-y-2 font-medium text-slate-800">
                    <div className="font-bold text-slate-900 uppercase text-[11px] text-brand-900">
                      Ise 2 minute me connect karne ke 4 aasan steps:
                    </div>
                    <div>
                      1. Upar agle tab me khuli hui Google Sheet tab <strong>INVENTORY APP - Google Sheet</strong> par jayein.
                    </div>
                    <div>
                      2. Upar menu me <strong>Extensions</strong> &gt; <strong>Apps Script</strong> par click karein (ya jo <em>Untitled project</em> tab pehle se khula hai wahan jayein).
                    </div>
                    <div>
                      3. Niche diye gaye button par click karke code copy karein aur wahan pura code replace karke <strong>Save (Ctrl+S)</strong> karein:
                    </div>

                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={handleCopyCode}
                        className="w-full sm:w-auto px-4 py-2 bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center justify-center space-x-2 shadow-sm transition"
                      >
                        {copiedCode ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4 text-white" />}
                        <span>{copiedCode ? 'Code Copied to Clipboard!' : 'Click Here to Copy Google Apps Script Code'}</span>
                      </button>
                    </div>

                    <div>
                      4. Upar blue button <strong>Deploy</strong> &gt; <strong>New deployment</strong> par click karein, gear icon se <strong>Web app</strong> select karein.
                    </div>
                    <div>
                      5. <em>Who has access</em> me <strong>Anyone</strong> select karein aur <strong>Deploy</strong> dabayein.
                    </div>
                    <div>
                      6. Jo <strong>Web app URL</strong> milega (jo <code className="font-mono text-emerald-800 font-bold">/exec</code> par khatam hota hai), use copy karke yahan paste karein!
                    </div>

                    <details className="mt-2 bg-slate-900 text-slate-100 rounded-lg p-2.5 text-[11px] font-mono">
                      <summary className="cursor-pointer font-sans font-bold text-gold-300">
                        View Raw Code.gs (Manual Copy Option)
                      </summary>
                      <pre className="mt-2 p-2 bg-black/40 rounded overflow-x-auto max-h-56 text-[10px] text-slate-200 select-all">
                        {APPS_SCRIPT_CODE}
                      </pre>
                    </details>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleTestPing}
                  disabled={loading || !scriptUrl}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-800 font-bold rounded-xl text-xs flex items-center space-x-1.5 transition disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5 text-blue-600" />
                  <span>Test Connection (Ping)</span>
                </button>

                <button
                  type="button"
                  onClick={handleManualSyncNow}
                  disabled={loading || !scriptUrl || scriptUrl.includes('docs.google.com/spreadsheets')}
                  className="px-3.5 py-2 bg-gold-500 hover:bg-gold-600 active:scale-95 text-slate-950 font-bold rounded-xl text-xs flex items-center space-x-1.5 transition disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Sync Pending Records Now</span>
                </button>
              </div>
            </form>

            {/* Quick Copy Script Box for General Use */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-brand-800" />
                  <span>Google Apps Script Backend Code (`Code.gs`)</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Ye code Google Sheet ke Apps Script editor me paste karke Web App deploy hota hai.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCopyCode}
                className="px-3 py-1.5 bg-brand-800 hover:bg-brand-900 active:scale-95 text-white font-bold rounded-lg text-xs flex items-center space-x-1.5 transition shrink-0"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5 text-white" />}
                <span>{copiedCode ? 'Copied!' : 'Copy Code.gs'}</span>
              </button>
            </div>
          </div>

          {/* Sync Queue Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  Synchronization Queue Log
                </h4>
                <p className="text-[11px] text-slate-500">
                  Pending: {queueItems.filter(q => q.status === 'PENDING').length} | Synced: {queueItems.filter(q => q.status === 'SYNCED').length} | Failed: {queueItems.filter(q => q.status === 'FAILED').length}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-[10px] sticky top-0">
                  <tr>
                    <th className="p-2">Queued At</th>
                    <th className="p-2">Table</th>
                    <th className="p-2">Entry ID</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Attempts</th>
                    <th className="p-2">Error Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {queueItems.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-4 text-center text-slate-400 font-sans">
                        Sync queue is currently empty.
                      </td>
                    </tr>
                  ) : (
                    queueItems.map(item => (
                      <tr key={item.queue_id} className="hover:bg-slate-50">
                        <td className="p-2 text-slate-500">{item.created_at ? new Date(item.created_at).toLocaleTimeString() : ''}</td>
                        <td className="p-2 font-bold text-slate-800">{item.table}</td>
                        <td className="p-2 text-brand-900">{item.data?.entry_id || 'N/A'}</td>
                        <td className="p-2 font-sans font-bold">
                          <span className={`px-1.5 py-0.2 rounded text-[10px] ${
                            item.status === 'SYNCED' ? 'bg-emerald-100 text-emerald-800' :
                            item.status === 'FAILED' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="p-2">{item.attempts || 0}</td>
                        <td className="p-2 font-sans text-red-600 text-[10px] truncate max-w-[200px]">
                          {item.error_message || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Sub Tab 2: Employee Management */}
      {subTab === 'EMPLOYEES' && (
        <div className="space-y-4">
          {/* Add Employee Form */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-3">
              Add Factory Employee
            </h3>
            <form onSubmit={handleAddEmployee} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                placeholder="Full Name (e.g. Ramesh Patel)"
                value={newEmployeeName}
                onChange={(e) => setNewEmployeeName(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-brand-700"
              />
              <input
                type="text"
                placeholder="Role (e.g. Godown Incharge)"
                value={newEmployeeRole}
                onChange={(e) => setNewEmployeeRole(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-brand-700"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-brand-800 hover:bg-brand-900 active:scale-95 text-white font-bold rounded-xl text-xs transition flex items-center justify-center space-x-1.5 shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Add Employee</span>
              </button>
            </form>
          </div>

          {/* Employees List */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                Configured Factory Employees ({employees.length})
              </h4>
            </div>

            <div className="divide-y divide-slate-100">
              {employees.map(emp => {
                const isEditing = editingEmpId === emp.id;
                return (
                  <div key={emp.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                        emp.active ? 'bg-brand-800 text-white' : 'bg-slate-200 text-slate-500'
                      }`}>
                        {emp.name.charAt(0)}
                      </div>

                      {isEditing ? (
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={editEmpName}
                            onChange={(e) => setEditEmpName(e.target.value)}
                            className="text-xs p-1 border rounded"
                          />
                          <input
                            type="text"
                            value={editEmpRole}
                            onChange={(e) => setEditEmpRole(e.target.value)}
                            className="text-xs p-1 border rounded"
                          />
                          <button
                            onClick={() => handleSaveEditEmployee(emp.id)}
                            className="text-xs px-2 py-1 bg-emerald-600 text-white rounded font-bold"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-slate-900 text-xs">{emp.name}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                              emp.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                            }`}>
                              {emp.active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500">{emp.role || 'Staff'}</div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center space-x-2 self-end sm:self-auto">
                      {!isEditing && (
                        <button
                          onClick={() => {
                            setEditingEmpId(emp.id);
                            setEditEmpName(emp.name);
                            setEditEmpRole(emp.role || '');
                          }}
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded"
                          title="Edit Name/Role"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        onClick={() => handleToggleEmployeeActive(emp)}
                        className={`text-xs px-2.5 py-1 rounded-lg font-bold border transition ${
                          emp.active 
                            ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                        }`}
                      >
                        {emp.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Sub Tab 3: Product Management & Prefixes */}
      {subTab === 'PRODUCTS' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-3">
              Add New Spice Product
            </h3>
            <form onSubmit={handleAddProduct} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                placeholder="Product Name (e.g. Kali Mirch)"
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-brand-700"
              />
              <input
                type="text"
                required
                maxLength={4}
                placeholder="Batch Prefix (e.g. KAL)"
                value={newProductPrefix}
                onChange={(e) => setNewProductPrefix(e.target.value.toUpperCase())}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold uppercase text-slate-900 focus:ring-2 focus:ring-brand-700"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-brand-800 hover:bg-brand-900 active:scale-95 text-white font-bold rounded-xl text-xs transition flex items-center justify-center space-x-1.5 shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Save Product</span>
              </button>
            </form>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                Configured Spice Products ({products.length})
              </h4>
            </div>

            <div className="divide-y divide-slate-100">
              {products.map(prod => (
                <div key={prod.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-8 rounded-lg bg-gold-50 border border-gold-300 flex items-center justify-center font-mono font-black text-xs text-gold-900">
                      {prod.prefix}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-xs">{prod.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">Example Batch: {prod.prefix}-001</div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggleProduct(prod)}
                    className={`text-xs px-2.5 py-1 rounded-lg font-bold border transition ${
                      prod.active !== false
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {prod.active !== false ? 'Active' : 'Disabled'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sub Tab 4: Reversals & Corrections (No Hard Deletes) */}
      {subTab === 'CORRECTIONS' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-xs text-amber-950 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
              <span>Traceable Inventory Corrections Policy</span>
            </div>
            <p>
              In accordance with factory compliance, production transactions are never permanently deleted. To fix an incorrect entry, select the entry below and record an authorized Reversal/Adjustment. An equal and opposite ledger transaction is created with full audit notes.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-700 uppercase">
                Select Module to Review:
              </label>
              <select
                value={selectedModule}
                onChange={(e) => {
                  setSelectedModule(e.target.value);
                  loadModuleEntries(e.target.value);
                }}
                className="bg-slate-50 border border-slate-300 text-slate-900 font-bold rounded-lg px-3 py-1.5 text-xs"
              >
                <option value="raw_material">Raw Material Inward</option>
                <option value="processing">Processing & Grinding</option>
                <option value="packaging">Packaging</option>
                <option value="order_sale">Order / Sale</option>
              </select>
            </div>

            {/* Selected Entry Reversal Modal / Box */}
            {reversalTarget && (
              <form onSubmit={handleExecuteReversal} className="p-4 bg-red-50 border-2 border-red-300 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-red-900 text-xs uppercase">
                    Confirm Reversal for {reversalTarget.entry_id}
                  </h4>
                  <button
                    type="button"
                    onClick={() => setReversalTarget(null)}
                    className="text-red-700 font-bold text-xs"
                  >
                    Cancel
                  </button>
                </div>

                <div className="text-xs text-red-800">
                  Batch: <strong>{reversalTarget.batch_id}</strong> | Product: <strong>{reversalTarget.material_name || reversalTarget.product_name}</strong>
                </div>

                <input
                  type="text"
                  required
                  placeholder="Mandatory justification reason for reversal (e.g. Weighbridge scale re-calibrated)"
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  className="w-full bg-white border border-red-300 rounded-lg p-2 text-xs text-slate-900"
                />

                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-red-700 hover:bg-red-800 active:scale-95 text-white font-black text-xs rounded-lg transition"
                >
                  {loading ? 'Executing Reversal...' : 'Post Reversal Transaction'}
                </button>
              </form>
            )}

            {/* Entries Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-[10px]">
                  <tr>
                    <th className="p-2">Date</th>
                    <th className="p-2">Entry ID</th>
                    <th className="p-2">Batch</th>
                    <th className="p-2">Product</th>
                    <th className="p-2">Recorded By</th>
                    <th className="p-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {moduleEntries.map(item => (
                    <tr key={item.entry_id} className="hover:bg-slate-50">
                      <td className="p-2">{item.date}</td>
                      <td className="p-2 font-mono text-[11px]">{item.entry_id}</td>
                      <td className="p-2 font-mono font-bold text-brand-900">{item.batch_id}</td>
                      <td className="p-2 font-bold">{item.material_name || item.product_name}</td>
                      <td className="p-2 text-slate-600">{item.employee_name}</td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() => setReversalTarget(item)}
                          className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded text-[10px] border border-red-200"
                        >
                          Reverse Entry
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Sub Tab 5: Scenario Testing & Demo Generator */}
      {subTab === 'DEMO' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center space-x-2 text-brand-900">
            <Sparkles className="w-5 h-5 text-gold-500" />
            <h3 className="font-black text-sm uppercase">Phase 19 Master Testing Scenario</h3>
          </div>

          <p className="text-xs text-slate-600">
            Instantly seed the entire 4-module production pipeline described in the master specification to test all calculations, multi-round processing, multi-pack packaging, and FIFO sales:
          </p>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1.5 font-medium">
            <div>1. <strong>Raw Material Inward:</strong> Haldi (HAL-001) = 1,000 KG</div>
            <div>2. <strong>Multi-Round Processing:</strong> Round 1 = 300 KG, Round 2 = 400 KG, Round 3 = 300 KG</div>
            <div>3. <strong>Packaging:</strong> Converted to 10g, 24g, 50g, 100g, 200g, 500g finished stock (KG)</div>
            <div>4. <strong>Multi-Product Sale:</strong> Order ORD-0001 with Haldi (10 KG), Mirchi (15 KG), Dhaniya (20 KG) = 45 KG Total</div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              onClick={handleLoadDemoScenario}
              disabled={loading}
              className="px-5 py-2.5 bg-brand-800 hover:bg-brand-900 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center space-x-2 shadow-md transition disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 text-gold-300" />
              <span>{loading ? 'Populating Pipeline...' : 'Seed Master Testing Scenario Data'}</span>
            </button>

            <button
              onClick={handleResetData}
              className="px-4 py-2.5 bg-slate-100 hover:bg-red-50 text-red-700 font-bold rounded-xl text-xs border border-slate-200 hover:border-red-300 transition active:scale-95"
            >
              Reset All Transactions
            </button>
          </div>
        </div>
      )}

      {/* Sub Tab 6: Admin PIN Security */}
      {subTab === 'SECURITY' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs max-w-md space-y-4">
          <div className="flex items-center space-x-2 text-slate-900">
            <KeyRound className="w-5 h-5 text-brand-800" />
            <h3 className="font-bold text-sm uppercase">Change Admin PIN</h3>
          </div>

          <form onSubmit={handleChangePin} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Current PIN *
              </label>
              <input
                type="password"
                required
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value)}
                placeholder="Current PIN (Default: 1234)"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                New PIN *
              </label>
              <input
                type="password"
                required
                minLength={4}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder="At least 4 digits"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Confirm New PIN *
              </label>
              <input
                type="password"
                required
                minLength={4}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                placeholder="Repeat new PIN"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-brand-800 hover:bg-brand-900 active:scale-95 text-white font-bold rounded-xl text-xs transition shadow-xs"
            >
              Update Admin PIN
            </button>
          </form>
        </div>
      )}

    </div>
  );
}
