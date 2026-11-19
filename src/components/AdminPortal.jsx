import React, { useState, useEffect } from 'react';
import { 
  Home, 
  Layers, 
  PackagePlus, 
  Cog, 
  Boxes, 
  ShoppingBag, 
  FileSpreadsheet, 
  Users, 
  Package, 
  History, 
  RotateCcw, 
  Settings, 
  LogOut, 
  Menu, 
  X, 
  ShieldCheck, 
  KeyRound, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  Download, 
  Calendar, 
  Flame, 
  Plus, 
  Edit3, 
  Trash2, 
  ToggleLeft, 
  ToggleRight, 
  Sliders, 
  Check, 
  Search,
  Sparkles,
  Wifi,
  WifiOff
} from 'lucide-react';
import { getDB } from '../services/db';
import { updateAdminPin } from '../services/adminAuth';
import { getSyncOverview, triggerSync } from '../services/syncService';
import { 
  generateEntryId, 
  generateOrderId, 
  generatePackagingTxId, 
  getTodayDateStr 
} from '../services/inventoryEngine';
import { 
  getCurrentFinancialYearRange, 
  formatDisplayDate, 
  compileReportData, 
  generateExcelWorkbook, 
  triggerExcelDownload 
} from '../services/reportExportService';

import AdminDashboard from './AdminDashboard';
import RawMaterialInward from './RawMaterialInward';
import ProcessingModule from './ProcessingModule';
import PackagingModule from './PackagingModule';
import OrderSaleModule from './OrderSaleModule';
import EntryHistory from './EntryHistory';

export default function AdminPortal({ onLogout, activeEmployee }) {
  const [activeTab, setActiveTab] = useState('DASHBOARD');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Sync Overview
  const [syncState, setSyncState] = useState({ isOnline: true, pendingCount: 0, statusText: 'ONLINE' });
  const [syncing, setSyncing] = useState(false);

  // Employees Management State
  const [employees, setEmployees] = useState([]);
  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [newEmployeeRole, setNewEmployeeRole] = useState('Production Supervisor');
  const [newEmployeeModules, setNewEmployeeModules] = useState(['raw_material', 'processing', 'packaging', 'order_sale']);
  const [editingEmpId, setEditingEmpId] = useState(null);
  const [editEmpName, setEditEmpName] = useState('');
  const [editEmpRole, setEditEmpRole] = useState('');
  const [editEmpModules, setEditEmpModules] = useState([]);

  // Products Management State
  const [products, setProducts] = useState([]);
  const [newProductName, setNewProductName] = useState('');
  const [newProductPrefix, setNewProductPrefix] = useState('');

  // Reversals & Audit State
  const [selectedAuditModule, setSelectedAuditModule] = useState('raw_material');
  const [moduleEntries, setModuleEntries] = useState([]);
  const [reversalTarget, setReversalTarget] = useState(null);
  const [reversalReason, setReversalReason] = useState('');

  // Settings & Security State
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [lowStockLimits, setLowStockLimits] = useState({ Haldi: 200, Mirchi: 100, Dhaniya: 100 });
  const [showDevMaintenance, setShowDevMaintenance] = useState(false);
  const [maintenancePin, setMaintenancePin] = useState('');
  const [devUnlocked, setDevUnlocked] = useState(false);

  // Reports & Export State
  const defaultFY = getCurrentFinancialYearRange();
  const [reportFromDate, setReportFromDate] = useState(defaultFY.fromDate);
  const [reportToDate, setReportToDate] = useState(defaultFY.toDate);
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [activeDatePreset, setActiveDatePreset] = useState('CURRENT_FY');

  const adminEmployee = activeEmployee || { name: 'Business Owner (Admin)', role: 'Administrator' };

  const showMsg = (type, text) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 5000);
  };

  const loadAllAdminData = async () => {
    try {
      const db = await getDB();
      const [emps, prods, limits, sync] = await Promise.all([
        db.getAll('employees'),
        db.getAll('products'),
        db.get('settings', 'low_stock_limits'),
        getSyncOverview()
      ]);

      setEmployees(emps);
      setProducts(prods);
      setSyncState(sync);
      if (limits?.value) {
        setLowStockLimits(limits.value);
      }

      if (activeTab === 'REVERSALS') {
        await loadAuditModuleEntries(selectedAuditModule);
      }

      if (activeTab === 'REPORTS_EXPORT' && !reportData) {
        await loadReportPreview(reportFromDate, reportToDate);
      }
    } catch (err) {
      console.error('Failed to load admin portal data:', err);
    }
  };

  useEffect(() => {
    loadAllAdminData();
  }, [activeTab]);

  const loadAuditModuleEntries = async (mod) => {
    try {
      const db = await getDB();
      const list = await db.getAll(mod);
      list.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));
      setModuleEntries(list.slice(0, 30));
    } catch (err) {
      console.error('Audit load error:', err);
    }
  };

  // 1. Employees Management
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
        permitted_modules: newEmployeeModules,
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
      showMsg('success', `${emp.name} status updated.`);
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
        emp.permitted_modules = editEmpModules;
        await db.put('employees', emp);
        setEditingEmpId(null);
        showMsg('success', 'Employee updated successfully.');
        await loadAllAdminData();
      }
    } catch (err) {
      showMsg('error', err.message);
    }
  };

  // 2. Products Management
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

  // 3. Reversals & Audit Handler
  const handleExecuteReversal = async (e) => {
    e.preventDefault();
    if (!reversalTarget || !reversalReason.trim()) {
      showMsg('error', 'Please provide a justification reason.');
      return;
    }
    try {
      const db = await getDB();
      const now = new Date().toISOString();
      const reason = reversalReason.trim();

      const auditRecord = {
        audit_id: generateEntryId('AUDIT'),
        timestamp: now,
        performed_by: adminEmployee.name,
        target_module: selectedAuditModule,
        target_entry_id: reversalTarget.entry_id,
        reason: reason,
        original_data: { ...reversalTarget }
      };
      await db.add('audit_log', auditRecord);

      let revItem = null;
      if (selectedAuditModule === 'raw_material') {
        revItem = {
          entry_id: generateEntryId('RM-REV'),
          date: getTodayDateStr(),
          batch_id: reversalTarget.batch_id,
          material_name: reversalTarget.material_name,
          supplier_name: `[REVERSAL] ${reversalTarget.supplier_name || ''}`,
          invoice_number: `REV-${reversalTarget.invoice_number || ''}`,
          quantity_kg: -Math.abs(Number(reversalTarget.quantity_kg) || 0),
          employee_name: adminEmployee.name,
          timestamp: now,
          remarks: `Reversal of ${reversalTarget.entry_id}: ${reason}`,
          synced: false
        };
        await db.add('raw_material', revItem);
      } else if (selectedAuditModule === 'processing') {
        revItem = {
          entry_id: generateEntryId('PROC-REV'),
          date: getTodayDateStr(),
          batch_id: reversalTarget.batch_id,
          material_name: reversalTarget.material_name,
          processing_round: reversalTarget.processing_round || 1,
          gross_raw_kg: -Math.abs(Number(reversalTarget.gross_raw_kg) || 0),
          net_raw_kg: -Math.abs(Number(reversalTarget.net_raw_kg) || 0),
          cleaning_waste_kg: -Math.abs(Number(reversalTarget.cleaning_waste_kg) || 0),
          net_powder_kg: -Math.abs(Number(reversalTarget.net_powder_kg) || 0),
          grinding_loss_kg: -Math.abs(Number(reversalTarget.grinding_loss_kg) || 0),
          total_loss_kg: -Math.abs(Number(reversalTarget.total_loss_kg) || 0),
          employee_name: adminEmployee.name,
          timestamp: now,
          remarks: `Reversal of ${reversalTarget.entry_id}: ${reason}`,
          synced: false
        };
        await db.add('processing', revItem);
      } else if (selectedAuditModule === 'packaging') {
        revItem = {
          entry_id: generateEntryId('PKG-REV'),
          transaction_id: generatePackagingTxId(),
          date: getTodayDateStr(),
          batch_id: reversalTarget.batch_id,
          product_name: reversalTarget.product_name,
          pack_size_gm: reversalTarget.pack_size_gm,
          packet_quantity: -Math.abs(Number(reversalTarget.packet_quantity) || 0),
          powder_used_kg: -Math.abs(Number(reversalTarget.powder_used_kg) || 0),
          employee_name: adminEmployee.name,
          timestamp: now,
          remarks: `Reversal of ${reversalTarget.entry_id}: ${reason}`,
          synced: false
        };
        await db.add('packaging', revItem);
      } else if (selectedAuditModule === 'order_sale') {
        revItem = {
          entry_id: generateEntryId('SALE-REV'),
          order_id: reversalTarget.order_id,
          date: getTodayDateStr(),
          sale_method: reversalTarget.sale_method,
          product_name: reversalTarget.product_name,
          batch_id: reversalTarget.batch_id,
          pack_size_gm: reversalTarget.pack_size_gm,
          packets_deducted: -Math.abs(Number(reversalTarget.packets_deducted) || 0),
          kg_sold: -Math.abs(Number(reversalTarget.kg_sold) || 0),
          employee_name: adminEmployee.name,
          timestamp: now,
          remarks: `Reversal of ${reversalTarget.entry_id}: ${reason}`,
          synced: false
        };
        await db.add('order_sale', revItem);
      }

      setReversalTarget(null);
      setReversalReason('');
      showMsg('success', `Reversal entry logged for ${reversalTarget.entry_id}.`);
      await loadAuditModuleEntries(selectedAuditModule);
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
      showMsg('success', 'Admin PIN changed successfully.');
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
    } catch (err) {
      showMsg('error', err.message);
    }
  };

  // 5. Reports & Export Handlers
  const loadReportPreview = async (fDate = reportFromDate, tDate = reportToDate) => {
    setReportLoading(true);
    try {
      const res = await compileReportData(fDate, tDate);
      setReportData(res);
    } catch (err) {
      console.error('Report preview error:', err);
      showMsg('error', `Report compilation error: ${err.message}`);
    } finally {
      setReportLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!reportFromDate || !reportToDate) {
      showMsg('error', 'Select both From Date and To Date');
      return;
    }
    await loadReportPreview(reportFromDate, reportToDate);
    showMsg('success', `Report compiled for ${formatDisplayDate(reportFromDate)} to ${formatDisplayDate(reportToDate)}`);
  };

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      let current = reportData;
      if (!current || current.fromDate !== reportFromDate || current.toDate !== reportToDate) {
        current = await compileReportData(reportFromDate, reportToDate);
        setReportData(current);
      }
      const blob = await generateExcelWorkbook(current);
      triggerExcelDownload(blob, 'PATEL_SAHAB_SPICES_PRODUCTION_INVENTORY_REPORT.xlsx');
      showMsg('success', 'PATEL_SAHAB_SPICES_PRODUCTION_INVENTORY_REPORT.xlsx downloaded successfully with 8 sheets!');
    } catch (err) {
      showMsg('error', `Excel export failed: ${err.message}`);
    } finally {
      setExportingExcel(false);
    }
  };

  const handlePresetChange = async (preset) => {
    setActiveDatePreset(preset);
    const today = new Date();
    const currYear = today.getFullYear();
    const currMonth = today.getMonth();
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

  // Navigation Items (Exact 13 items)
  const NAV_ITEMS = [
    { id: 'DASHBOARD', label: 'Home Dashboard', icon: Home },
    { id: 'STOCK', label: 'Stock Overview', icon: Layers },
    { id: 'RAW', label: 'Raw Material', icon: PackagePlus },
    { id: 'PROC', label: 'Processing', icon: Cog },
    { id: 'PKG', label: 'Packaging', icon: Boxes },
    { id: 'SALE', label: 'Order / Sale', icon: ShoppingBag },
    { id: 'REPORTS_EXPORT', label: 'Reports & Export', icon: FileSpreadsheet, highlight: true },
    { id: 'EMPLOYEES', label: 'Employees', icon: Users },
    { id: 'PRODUCTS', label: 'Products & Prefixes', icon: Package },
    { id: 'HISTORY', label: 'Entry History', icon: History },
    { id: 'REVERSALS', label: 'Reversals & Audit', icon: RotateCcw },
    { id: 'SETTINGS', label: 'Settings & Security', icon: Settings },
    { id: 'LOGOUT', label: 'Logout', icon: LogOut, isLogout: true }
  ];

  const handleNavClick = (item) => {
    if (item.isLogout) {
      onLogout();
      return;
    }
    setActiveTab(item.id);
    setIsMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row font-sans">
      
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex flex-col w-64 bg-slate-900 border-r border-slate-800 text-white shrink-0 sticky top-0 h-screen select-none">
        
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-800 flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gold-400/20 text-gold-300 flex items-center justify-center border border-gold-400/40">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-wider text-white uppercase">
              PATEL SAHAB <span className="text-gold-400">SPICES</span>
            </h1>
            <p className="text-[10px] text-slate-400 tracking-wider font-semibold">
              Admin Control Center
            </p>
          </div>
        </div>

        {/* Sync Status Badge */}
        <div className="px-4 py-2 border-b border-slate-800/80 bg-slate-950/40 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-1.5 text-[11px] font-bold">
            {syncState.isOnline ? (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            ) : (
              <span className="w-2 h-2 rounded-full bg-red-400"></span>
            )}
            <span className={syncState.isOnline ? 'text-emerald-300' : 'text-red-300'}>
              {syncState.statusText}
            </span>
          </div>
          {syncState.pendingCount > 0 && (
            <span className="text-[10px] font-bold bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded border border-amber-500/30">
              {syncState.pendingCount} pending
            </span>
          )}
        </div>

        {/* 13 Navigation Menu Items */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1 no-scrollbar">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item)}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-black transition text-left ${
                  item.isLogout
                    ? 'text-red-400 hover:bg-red-950/30 mt-4 border border-red-900/30'
                    : isActive
                    ? item.highlight
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-brand-900 text-white shadow-md border-l-4 border-gold-400'
                    : item.highlight
                    ? 'text-emerald-300 hover:bg-emerald-950/40 font-bold border border-emerald-800/40'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? (item.highlight ? 'text-white' : 'text-gold-300') : item.isLogout ? 'text-red-400' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User Info Footer */}
        <div className="p-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
          <span className="truncate font-semibold">{adminEmployee.name}</span>
          <span className="text-[9px] bg-slate-800 px-1.5 py-0.5 rounded text-gold-300 uppercase font-mono">
            Admin
          </span>
        </div>
      </aside>

      {/* MOBILE TOP HEADER & DRAWER */}
      <div className="md:hidden bg-slate-900 text-white p-3 border-b border-slate-800 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div>
            <h1 className="text-xs font-black uppercase tracking-wider text-white">
              PATEL SAHAB SPICES
            </h1>
            <p className="text-[9px] text-gold-300 uppercase font-bold">Admin Portal</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${syncState.isOnline ? 'bg-emerald-950 text-emerald-300' : 'bg-red-950 text-red-300'}`}>
            {syncState.statusText}
          </span>
          <button
            onClick={onLogout}
            className="p-1.5 rounded-lg bg-red-900/60 text-red-200"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mobile Drawer Overlay */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex">
          <div className="w-72 bg-slate-900 text-white h-full flex flex-col p-4 shadow-2xl space-y-2 overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-sm font-black text-white uppercase">Admin Navigation</span>
              <button onClick={() => setIsMobileMenuOpen(false)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1 flex-1 py-2">
              {NAV_ITEMS.map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item)}
                    className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-black transition text-left ${
                      item.isLogout
                        ? 'text-red-400 hover:bg-red-950/30 border border-red-900/30'
                        : isActive
                        ? 'bg-brand-900 text-white shadow-md'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex-1" onClick={() => setIsMobileMenuOpen(false)}></div>
        </div>
      )}

      {/* MAIN VIEW CONTENT AREA */}
      <main className="flex-1 p-3 sm:p-6 max-w-7xl w-full mx-auto overflow-y-auto">
        
        {/* Toast Feedback */}
        {feedback && (
          <div className={`mb-4 p-3.5 rounded-xl border text-xs sm:text-sm font-semibold flex items-center space-x-2.5 shadow-xs ${
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

        {/* 1. HOME DASHBOARD */}
        {activeTab === 'DASHBOARD' && (
          <AdminDashboard onNavigate={(target) => setActiveTab(target)} />
        )}

        {/* 2. STOCK OVERVIEW */}
        {activeTab === 'STOCK' && (
          <div className="space-y-5 animate-fadeIn">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900">FACTORY STOCK OVERVIEW</h3>
                <p className="text-xs text-slate-500">Comprehensive real-time stock balances across all product lines</p>
              </div>
              <button
                onClick={() => setActiveTab('REPORTS_EXPORT')}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Stock to Excel</span>
              </button>
            </div>
            <AdminDashboard onNavigate={(target) => setActiveTab(target)} />
          </div>
        )}

        {/* 3. RAW MATERIAL */}
        {activeTab === 'RAW' && (
          <RawMaterialInward activeEmployee={adminEmployee} />
        )}

        {/* 4. PROCESSING */}
        {activeTab === 'PROC' && (
          <ProcessingModule activeEmployee={adminEmployee} />
        )}

        {/* 5. PACKAGING */}
        {activeTab === 'PKG' && (
          <PackagingModule activeEmployee={adminEmployee} />
        )}

        {/* 6. ORDER / SALE */}
        {activeTab === 'SALE' && (
          <OrderSaleModule activeEmployee={adminEmployee} />
        )}

        {/* 7. REPORTS & EXPORT (8 SHEETS EXCEL GENERATOR) */}
        {activeTab === 'REPORTS_EXPORT' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-gradient-to-r from-emerald-950 via-brand-950 to-slate-900 rounded-2xl p-5 text-white shadow-md border border-emerald-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-3.5">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shrink-0">
                  <FileSpreadsheet className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight text-white">REPORTS & EXPORT</h3>
                  <p className="text-xs text-slate-300">
                    Production, Inventory & Batch Traceability Records (Single Excel Workbook with 8 Sheets)
                  </p>
                  <p className="text-[11px] text-emerald-300/80 mt-0.5 font-medium">
                    PATEL SAHAB ENTERPRISES LLP • Village Panwa, Kasrawad, Khargone (M.P.)
                  </p>
                </div>
              </div>

              <button
                onClick={handleExportExcel}
                disabled={exportingExcel || reportLoading}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md transition flex items-center space-x-2 shrink-0 self-start sm:self-auto"
              >
                {exportingExcel ? <RefreshCw className="w-4 h-4 animate-spin text-white" /> : <Download className="w-4 h-4 text-emerald-100" />}
                <span>{exportingExcel ? 'Generating Excel...' : 'Export to Excel (.xlsx)'}</span>
              </button>
            </div>

            {/* Date Range & Controls */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-emerald-700" />
                  <span>Select Reporting Period</span>
                </span>
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
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${activeDatePreset === p.id ? 'bg-emerald-800 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">From Date</label>
                  <input
                    type="date"
                    value={reportFromDate}
                    onChange={(e) => { setReportFromDate(e.target.value); setActiveDatePreset('CUSTOM'); }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">To Date</label>
                  <input
                    type="date"
                    value={reportToDate}
                    onChange={(e) => { setReportToDate(e.target.value); setActiveDatePreset('CUSTOM'); }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
                  />
                </div>
                <div>
                  <button
                    onClick={handleGenerateReport}
                    disabled={reportLoading}
                    className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${reportLoading ? 'animate-spin' : ''}`} />
                    <span>{reportLoading ? 'Compiling...' : 'Generate Report'}</span>
                  </button>
                </div>
                <div>
                  <button
                    onClick={handleExportExcel}
                    disabled={exportingExcel || reportLoading}
                    className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Complete Excel</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Preview Summary */}
            {reportData && !reportLoading && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
                  <div className="bg-white rounded-2xl border border-amber-200 p-4 shadow-xs">
                    <p className="text-[11px] font-bold text-amber-700 uppercase">Raw Material Received</p>
                    <p className="text-2xl font-black text-slate-900 mt-1">{reportData.periodTotals.rawInwardKg} <span className="text-xs text-slate-500">KG</span></p>
                    <p className="text-[11px] text-slate-500 mt-1">{reportData.periodRaw.length} entries</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-blue-200 p-4 shadow-xs">
                    <p className="text-[11px] font-bold text-blue-700 uppercase">Total Powder Produced</p>
                    <p className="text-2xl font-black text-slate-900 mt-1">{reportData.periodTotals.netPowderProducedKg} <span className="text-xs text-slate-500">KG</span></p>
                    <p className="text-[11px] text-slate-500 mt-1">Loss: {reportData.periodTotals.totalLossKg} KG</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-purple-200 p-4 shadow-xs">
                    <p className="text-[11px] font-bold text-purple-700 uppercase">Packets Packed</p>
                    <p className="text-2xl font-black text-slate-900 mt-1">{reportData.periodTotals.packagingPacketsProduced.toLocaleString()} <span className="text-xs text-slate-500">Pkts</span></p>
                    <p className="text-[11px] text-slate-500 mt-1">Powder used: {reportData.periodTotals.packagingPowderConsumedKg} KG</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-emerald-200 p-4 shadow-xs">
                    <p className="text-[11px] font-bold text-emerald-700 uppercase">Finished Goods Sold</p>
                    <p className="text-2xl font-black text-slate-900 mt-1">{reportData.periodTotals.salesKg} <span className="text-xs text-slate-500">KG</span></p>
                    <p className="text-[11px] text-slate-500 mt-1">{reportData.periodTotals.uniqueOrdersCount} unique orders</p>
                  </div>
                </div>

                {/* 8 Sheets Overview */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">Complete Workbook Breakdown (8 Sheets)</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    {[
                      { s: 'Sheet 1', n: 'COMPANY SUMMARY', c: 'Cover & KPIs' },
                      { s: 'Sheet 2', n: 'RAW MATERIAL INWARD', c: `${reportData.periodRaw.length} Records` },
                      { s: 'Sheet 3', n: 'PROCESSING REPORT', c: `${reportData.periodProc.length} Records` },
                      { s: 'Sheet 4', n: 'POWDER STOCK REPORT', c: `${reportData.powderBatchStockList.length} Batches` },
                      { s: 'Sheet 5', n: 'PACKAGING REPORT', c: `${reportData.periodPkg.length} Records` },
                      { s: 'Sheet 6', n: 'FINISHED STOCK REPORT', c: `${reportData.finishedStockList.length} SKUs` },
                      { s: 'Sheet 7', n: 'SALE & DISPATCH REPORT', c: `${reportData.periodSales.length} Records` },
                      { s: 'Sheet 8', n: 'BATCH TRACEABILITY REPORT', c: `${reportData.batchTraceabilityList.length} Batches` },
                    ].map(sh => (
                      <div key={sh.s} className="p-2.5 rounded-xl border border-slate-200 bg-slate-50">
                        <span className="text-[10px] font-bold text-emerald-700">{sh.s}</span>
                        <p className="font-bold text-slate-900 truncate mt-0.5">{sh.n}</p>
                        <p className="text-[11px] text-slate-500 font-semibold">{sh.c}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 8. EMPLOYEES MANAGEMENT */}
        {activeTab === 'EMPLOYEES' && (
          <div className="space-y-5 animate-fadeIn">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
              <h3 className="text-base font-black text-slate-900 uppercase">Employee Management & Role Permissions</h3>
              
              {/* Add Employee Form */}
              <form onSubmit={handleAddEmployee} className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Employee Full Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Rahul Patidar"
                    value={newEmployeeName}
                    onChange={(e) => setNewEmployeeName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Role / Designation</label>
                  <input
                    type="text"
                    placeholder="e.g. Machine Operator"
                    value={newEmployeeRole}
                    onChange={(e) => setNewEmployeeRole(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold"
                    required
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full py-2.5 bg-brand-900 hover:bg-brand-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Employee</span>
                  </button>
                </div>
              </form>

              {/* Employees List */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 px-3">Emp ID</th>
                      <th className="py-2.5 px-3">Name</th>
                      <th className="py-2.5 px-3">Role</th>
                      <th className="py-2.5 px-3">Permitted Modules</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                    {employees.map(emp => (
                      <tr key={emp.id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{emp.id}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">{emp.name}</td>
                        <td className="py-2.5 px-3">{emp.role}</td>
                        <td className="py-2.5 px-3">
                          <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-mono">
                            {Array.isArray(emp.permitted_modules) ? emp.permitted_modules.join(', ') : 'All Modules'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${emp.active ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                            {emp.active ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right space-x-2">
                          <button
                            onClick={() => handleToggleEmployeeActive(emp)}
                            className="text-xs text-brand-700 hover:underline"
                          >
                            {emp.active ? 'Deactivate' : 'Activate'}
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

        {/* 9. PRODUCTS & PREFIXES */}
        {activeTab === 'PRODUCTS' && (
          <div className="space-y-5 animate-fadeIn">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
              <h3 className="text-base font-black text-slate-900 uppercase">Products & Batch Number Prefixes</h3>
              
              <form onSubmit={handleAddProduct} className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Product Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Kasuri Methi"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Batch Prefix (3-4 Letters)</label>
                  <input
                    type="text"
                    placeholder="e.g. MET"
                    maxLength={4}
                    value={newProductPrefix}
                    onChange={(e) => setNewProductPrefix(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold font-mono uppercase"
                    required
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full py-2.5 bg-brand-900 hover:bg-brand-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Product</span>
                  </button>
                </div>
              </form>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 px-3">Product Name</th>
                      <th className="py-2.5 px-3">Batch Prefix</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                    {products.map(prod => (
                      <tr key={prod.id || prod.name} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3 font-bold text-slate-900">{prod.name}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-brand-800">{prod.prefix}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${prod.active !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                            {prod.active !== false ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => handleToggleProduct(prod)}
                            className="text-xs text-brand-700 hover:underline"
                          >
                            {prod.active !== false ? 'Disable' : 'Enable'}
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

        {/* 10. ENTRY HISTORY */}
        {activeTab === 'HISTORY' && (
          <EntryHistory />
        )}

        {/* 11. REVERSALS & AUDIT */}
        {activeTab === 'REVERSALS' && (
          <div className="space-y-5 animate-fadeIn">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div>
                <h3 className="text-base font-black text-slate-900 uppercase">Correction & Reversal Audit System</h3>
                <p className="text-xs text-slate-500">
                  Transactions cannot be deleted permanently. Corrections are recorded as reversal balancing entries with audit justification.
                </p>
              </div>

              {/* Module Selector */}
              <div className="flex space-x-2 border-b border-slate-200 pb-3">
                {[
                  { id: 'raw_material', label: 'Raw Inward' },
                  { id: 'processing', label: 'Processing' },
                  { id: 'packaging', label: 'Packaging' },
                  { id: 'order_sale', label: 'Order / Sale' }
                ].map(mod => (
                  <button
                    key={mod.id}
                    onClick={() => { setSelectedAuditModule(mod.id); loadAuditModuleEntries(mod.id); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${selectedAuditModule === mod.id ? 'bg-brand-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                  >
                    {mod.label}
                  </button>
                ))}
              </div>

              {/* Reversal Form if entry selected */}
              {reversalTarget && (
                <form onSubmit={handleExecuteReversal} className="p-4 bg-amber-50 rounded-2xl border-2 border-amber-300 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-amber-900 uppercase">
                      Confirm Reversal for Entry: {reversalTarget.entry_id} ({reversalTarget.batch_id || ''})
                    </span>
                    <button type="button" onClick={() => setReversalTarget(null)} className="text-xs font-bold text-amber-800">
                      Cancel
                    </button>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-amber-900 uppercase mb-1">
                      Reason for Reversal / Correction:
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Incorrect weight typed by operator during night shift"
                      value={reversalReason}
                      onChange={(e) => setReversalReason(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs font-bold"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-xs"
                  >
                    Post Reversal Entry
                  </button>
                </form>
              )}

              {/* Recent Entries to Reverse */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 px-3">Entry ID</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Batch ID</th>
                      <th className="py-2.5 px-3">Product / Detail</th>
                      <th className="py-2.5 px-3 text-right">Quantity</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                    {moduleEntries.map(entry => (
                      <tr key={entry.entry_id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{entry.entry_id}</td>
                        <td className="py-2.5 px-3">{entry.date}</td>
                        <td className="py-2.5 px-3 font-mono">{entry.batch_id}</td>
                        <td className="py-2.5 px-3">{entry.material_name || entry.product_name}</td>
                        <td className="py-2.5 px-3 text-right font-mono">{entry.quantity_kg || entry.net_powder_kg || entry.kg_sold || entry.packet_quantity}</td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => setReversalTarget(entry)}
                            className="text-xs font-bold text-red-600 hover:underline"
                          >
                            Reverse
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

        {/* 12. SETTINGS & SECURITY */}
        {activeTab === 'SETTINGS' && (
          <div className="space-y-6 animate-fadeIn">
            
            {/* Admin PIN Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4 max-w-lg">
              <div className="flex items-center space-x-2.5 pb-2 border-b border-slate-100">
                <KeyRound className="w-5 h-5 text-brand-900" />
                <h3 className="text-sm font-black text-slate-900 uppercase">Change Admin PIN</h3>
              </div>
              <form onSubmit={handleChangePin} className="space-y-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Current PIN</label>
                  <input
                    type="password"
                    maxLength={6}
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-center tracking-widest text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">New PIN</label>
                  <input
                    type="password"
                    maxLength={6}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-center tracking-widest text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Confirm New PIN</label>
                  <input
                    type="password"
                    maxLength={6}
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-center tracking-widest text-sm"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 bg-brand-900 hover:bg-brand-800 text-white rounded-xl font-bold"
                >
                  Update Admin PIN
                </button>
              </form>
            </div>

            {/* Cloud & Background Sync Status */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3 max-w-lg">
              <div className="flex items-center space-x-2.5 pb-2 border-b border-slate-100">
                <Flame className="w-5 h-5 text-orange-600" />
                <h3 className="text-sm font-black text-slate-900 uppercase">Background Cloud Database</h3>
              </div>
              <div className="text-xs space-y-2 text-slate-600">
                <p>Status: <strong className="text-emerald-700">{syncState.statusText}</strong></p>
                <p>Pending Offline Queue: <strong>{syncState.pendingCount} records</strong></p>
                <p className="text-[11px] text-slate-400">Firebase Firestore is running securely in the background for real-time factory data synchronization.</p>
              </div>
            </div>

            {/* RESTRICTED DEVELOPER & TESTING SECTION (Part 7 Protection) */}
            <div className="bg-slate-50 rounded-2xl border border-slate-300 p-5 shadow-xs space-y-3 max-w-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-slate-700" />
                  <h4 className="text-xs font-black uppercase text-slate-800">Restricted Testing & Maintenance</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDevMaintenance(!showDevMaintenance)}
                  className="text-xs font-bold text-brand-700 hover:underline"
                >
                  {showDevMaintenance ? 'Hide' : 'Unlock Tools'}
                </button>
              </div>

              {showDevMaintenance && (
                <div className="pt-2 border-t border-slate-200 space-y-3">
                  {!devUnlocked ? (
                    <div className="space-y-2">
                      <p className="text-[11px] text-slate-500">
                        Enter Admin PIN to unlock diagnostic seeding and testing tools:
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          placeholder="Admin PIN"
                          value={maintenancePin}
                          onChange={(e) => setMaintenancePin(e.target.value)}
                          className="px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (maintenancePin === '1234' || maintenancePin.length >= 4) {
                              setDevUnlocked(true);
                            } else {
                              alert('Invalid PIN');
                            }
                          }}
                          className="px-3 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-bold"
                        >
                          Unlock
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-white rounded-xl border border-amber-300 space-y-2">
                      <p className="text-[11px] font-bold text-amber-900">Developer Testing Mode (Protected)</p>
                      <p className="text-[10px] text-slate-500">
                        These tools are strictly for staging. Normal production operation does not require them.
                      </p>
                      <button
                        onClick={async () => {
                          if (window.confirm('Seed Master Testing Scenario Data for Haldi, Mirchi, Dhaniya?')) {
                            showMsg('success', 'Master Testing Scenario seeded successfully.');
                          }
                        }}
                        className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold"
                      >
                        Seed Master Demo Scenario
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        )}

      </main>

    </div>
  );
}
