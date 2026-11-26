import React, { useState, useEffect } from 'react';
import { 
  Home, 
  PackagePlus, 
  Cog, 
  Boxes, 
  ShoppingBag, 
  ListFilter, 
  User, 
  LogOut, 
  Play, 
  Square, 
  CheckCircle2, 
  Clock, 
  Wifi, 
  WifiOff, 
  RefreshCw,
  Calendar,
  AlertCircle,
  Menu,
  X,
  ChevronRight,
  ShieldCheck,
  Building2,
  Phone,
  Tag,
  Check,
  RotateCcw,
  Edit3,
  Trash2,
  Eye,
  AlertTriangle
} from 'lucide-react';
import { getDB } from '../services/db';
import { getSyncOverview, triggerSync } from '../services/syncService';
import { 
  editRawMaterialEntry, 
  deleteRawMaterialEntry, 
  validateRawMaterialDelete 
} from '../services/inventoryEngine';
import RawMaterialInward from './RawMaterialInward';
import ProcessingModule from './ProcessingModule';
import PackagingModule from './PackagingModule';
import OrderSaleModule from './OrderSaleModule';
import SalesReturnModule from './SalesReturnModule';

function getKolkataDateStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.slice(0, 10).split('-');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dateStr;
}

export default function EmployeePortal({ activeEmployee, onLogout }) {
  // Navigation: 'HOME' | 'raw_material' | 'processing' | 'packaging' | 'order_sale' | 'ENTRIES' | 'PROFILE'
  const [activeTab, setActiveTab] = useState('HOME');
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  
  const [recentEntries, setRecentEntries] = useState([]);
  const [allMyEntries, setAllMyEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncState, setSyncState] = useState({ isOnline: true, pendingCount: 0, statusText: 'ONLINE' });
  const [syncing, setSyncing] = useState(false);

  // Workday session tracker
  const todayStr = getKolkataDateStr();
  const sessionKey = `pss_workday_${activeEmployee?.employee_id || activeEmployee?.id}_${todayStr}`;
  const [workdaySession, setWorkdaySession] = useState(() => {
    try {
      const saved = localStorage.getItem(sessionKey);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Modal States for Employee Entries
  const [detailEntry, setDetailEntry] = useState(null);
  const [editEntry, setEditEntry] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [editReason, setEditReason] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState(null);

  const [deleteEntry, setDeleteEntry] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);

  const handleOpenEditModal = (entry) => {
    setEditEntry(entry);
    setEditFormData({
      date: entry.date,
      batch_id: entry.batch,
      material_name: entry.product,
      quantity_kg: entry.quantity_kg || parseFloat(entry.quantity) || '',
      supplier_name: entry.supplier_name || '',
      invoice_number: entry.invoice_number || '',
      remarks: entry.remarks || ''
    });
    setEditReason('');
    setEditError(null);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editEntry) return;
    if (!editReason.trim()) {
      setEditError('A reason for modifying this entry is mandatory.');
      return;
    }
    setEditLoading(true);
    setEditError(null);
    try {
      const currentUserName = activeEmployee?.name || 'Staff';
      await editRawMaterialEntry(
        editEntry.id,
        {
          date: editFormData.date,
          batch_id: (editFormData.batch_id || '').trim().toUpperCase(),
          material_name: editFormData.material_name,
          supplier_name: editFormData.supplier_name.trim(),
          invoice_number: editFormData.invoice_number.trim() || 'N/A',
          quantity_kg: Number(parseFloat(editFormData.quantity_kg).toFixed(3)),
          remarks: editFormData.remarks.trim()
        },
        editReason.trim(),
        currentUserName,
        'staff'
      );

      setActionFeedback({ type: 'success', text: `Entry ${editEntry.id} updated successfully.` });
      setEditEntry(null);
      await loadEmployeeData();
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditLoading(false);
    }
  };

  const handleOpenDeleteModal = async (entry) => {
    setDeleteEntry(entry);
    setDeleteReason('');
    setDeleteError(null);
    try {
      await validateRawMaterialDelete(entry.id);
    } catch (err) {
      setDeleteError(err.message);
    }
  };

  const handleConfirmDelete = async (e) => {
    e.preventDefault();
    if (!deleteEntry) return;
    if (!deleteReason.trim()) {
      setDeleteError('A deletion reason is mandatory.');
      return;
    }
    setDeleteLoading(true);
    try {
      const currentUserName = activeEmployee?.name || 'Staff';
      await deleteRawMaterialEntry(
        deleteEntry.id,
        deleteReason.trim(),
        currentUserName,
        'staff'
      );

      setActionFeedback({ type: 'success', text: `Entry ${deleteEntry.id} deleted / reversed.` });
      setDeleteEntry(null);
      await loadEmployeeData();
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleStartWorkday = () => {
    const session = {
      startedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      date: todayStr,
      active: true
    };
    localStorage.setItem(sessionKey, JSON.stringify(session));
    setWorkdaySession(session);
  };

  const handleEndWorkday = () => {
    if (!window.confirm('Are you sure you want to end your workday shift?')) return;
    const session = {
      ...workdaySession,
      endedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      active: false
    };
    localStorage.setItem(sessionKey, JSON.stringify(session));
    setWorkdaySession(session);
  };

  // Determine permitted modules
  const getPermittedModules = () => {
    if (activeEmployee?.permitted_modules && Array.isArray(activeEmployee.permitted_modules)) {
      const perms = [...activeEmployee.permitted_modules];
      if (!perms.includes('sales_return')) perms.push('sales_return');
      return perms;
    }
    const role = (activeEmployee?.role || '').toLowerCase();
    if (role.includes('supervisor') || role.includes('manager')) {
      return ['raw_material', 'processing', 'packaging', 'order_sale', 'sales_return'];
    }
    if (role.includes('machine') || role.includes('grinding') || role.includes('operator')) {
      return ['processing', 'sales_return'];
    }
    if (role.includes('packaging')) {
      return ['packaging', 'sales_return'];
    }
    if (role.includes('godown') || role.includes('store') || role.includes('dispatch')) {
      return ['raw_material', 'order_sale', 'sales_return'];
    }
    return ['raw_material', 'processing', 'packaging', 'order_sale', 'sales_return'];
  };

  const permitted = getPermittedModules();

  const loadEmployeeData = async () => {
    try {
      const db = await getDB();
      const empName = activeEmployee?.name || '';
      const empId = activeEmployee?.employee_id || activeEmployee?.id || '';

      const [raw, proc, pkg, sales, returns, sync] = await Promise.all([
        db.getAll('raw_material'),
        db.getAll('processing'),
        db.getAll('packaging'),
        db.getAll('order_sale'),
        db.objectStoreNames.contains('sales_return') ? db.getAll('sales_return') : Promise.resolve([]),
        getSyncOverview()
      ]);

      setSyncState(sync);

      // Match entries recorded by this employee
      const matchEmp = (name, recordedId) => {
        if (recordedId && empId && recordedId.toUpperCase() === empId.toUpperCase()) return true;
        return (name || '').toLowerCase() === empName.toLowerCase();
      };

      const myRaw = raw.filter(r => matchEmp(r.employee_name, r.employee_id)).map(r => ({
        id: r.entry_id,
        raw_record: r,
        moduleStore: 'raw_material',
        module: 'Raw Inward',
        product: r.material_name,
        batch: r.batch_id,
        quantity: `${r.quantity_kg} KG`,
        quantity_kg: r.quantity_kg,
        supplier_name: r.supplier_name,
        invoice_number: r.invoice_number,
        remarks: r.remarks,
        date: r.date || r.timestamp?.slice(0, 10),
        timestamp: r.timestamp || r.date,
        synced: Boolean(r.synced),
        is_reversed: Boolean(r.is_reversed)
      }));

      const myProc = proc.filter(p => matchEmp(p.employee_name, p.employee_id)).map(p => ({
        id: p.entry_id,
        module: 'Processing',
        product: p.material_name || 'Spice',
        batch: p.batch_id,
        quantity: `${p.net_powder_kg} KG Powder`,
        date: p.date || p.timestamp?.slice(0, 10),
        timestamp: p.timestamp || p.date,
        synced: Boolean(p.synced)
      }));

      const myPkg = pkg.filter(k => matchEmp(k.employee_name, k.employee_id)).map(k => ({
        id: k.entry_id,
        module: 'Packaging',
        product: k.product_name,
        batch: k.batch_id,
        quantity: `${k.packet_quantity} Pkts (${k.pack_size_gm}g)`,
        date: k.date || k.timestamp?.slice(0, 10),
        timestamp: k.timestamp || k.date,
        synced: Boolean(k.synced)
      }));

      const mySales = sales.filter(s => matchEmp(s.employee_name, s.employee_id)).map(s => ({
        id: s.entry_id,
        module: 'Order / Sale',
        product: s.product_name,
        batch: s.batch_id,
        quantity: `${s.kg_sold} KG`,
        date: s.date || s.timestamp?.slice(0, 10),
        timestamp: s.timestamp || s.date,
        synced: Boolean(s.synced)
      }));

      const myReturns = (returns || []).filter(r => matchEmp(r.received_by || r.employee_name, r.employee_id)).map(r => ({
        id: r.return_id,
        module: 'Sales Return',
        product: r.product_name,
        batch: r.batch_id,
        quantity: `${r.returned_packets} Pkts`,
        date: r.date || r.timestamp?.slice(0, 10),
        timestamp: r.timestamp || r.date,
        synced: Boolean(r.synced)
      }));

      const merged = [...myRaw, ...myProc, ...myPkg, ...mySales, ...myReturns].sort(
        (a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date)
      );

      setAllMyEntries(merged);
      setRecentEntries(merged.slice(0, 6));
    } catch (err) {
      console.error('Error loading employee portal data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployeeData();
  }, [activeTab]);

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      await triggerSync();
      await loadEmployeeData();
    } catch (e) {
      console.warn('Sync warning:', e.message);
    } finally {
      setSyncing(false);
    }
  };

  const navigateTo = (tab) => {
    setActiveTab(tab);
    setIsMoreMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-20 sm:pb-6">
      
      {/* Top Application Header */}
      <header className="bg-gradient-to-r from-brand-950 via-brand-900 to-slate-900 text-white shadow-lg sticky top-0 z-40 border-b border-brand-800">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2.5 flex items-center justify-between">
          
          {/* Logo & Company Title */}
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white p-1 flex items-center justify-center shrink-0 shadow-md border border-red-200">
              <img 
                src="/logo.jpg" 
                alt="Patel Sahab Spices" 
                className="w-full h-full object-contain rounded-xl" 
              />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="text-xs sm:text-sm font-black tracking-wide uppercase text-white">
                  PATEL SAHAB SPICES
                </span>
                <span className="text-[10px] font-mono font-bold bg-gold-500 text-slate-950 px-1.5 py-0.2 rounded font-mono">
                  {activeEmployee?.employee_id || activeEmployee?.id || 'STAFF'}
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-gold-300/90 font-medium">
                {activeEmployee?.name || 'Factory Employee'} • {activeEmployee?.designation || activeEmployee?.role || 'Operator'}
              </p>
            </div>
          </div>

          {/* Sync Status Badge & Logout */}
          <div className="flex items-center space-x-2">
            
            {/* Sync Badge */}
            <button
              onClick={handleManualSync}
              disabled={syncing}
              className={`flex items-center space-x-1 text-[10px] sm:text-xs font-bold px-2.5 py-1.5 rounded-full border transition active:scale-95 ${
                syncState.isOnline
                  ? syncState.pendingCount > 0
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-red-500/20 text-red-300 border-red-500/40'
              }`}
              title="Click to check sync status"
            >
              <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
              <span className="hidden xs:inline">{syncState.statusText}</span>
              {syncState.pendingCount > 0 && (
                <span className="bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded-full text-[9px] font-black">
                  {syncState.pendingCount}
                </span>
              )}
            </button>

            {/* Logout Button */}
            <button
              onClick={onLogout}
              className="flex items-center space-x-1 px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition active:scale-95"
              title="Logout"
            >
              <LogOut className="w-3.5 h-3.5 text-gold-300" />
              <span className="hidden sm:inline">Logout</span>
            </button>

          </div>
        </div>

        {/* Desktop / Tablet Navigation Row */}
        <nav className="hidden sm:block bg-white border-b border-slate-200">
          <div className="max-w-5xl mx-auto px-4 flex space-x-1 py-1.5 overflow-x-auto no-scrollbar">
            
            <button
              onClick={() => navigateTo('HOME')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-black transition ${
                activeTab === 'HOME'
                  ? 'bg-brand-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              <span>Home</span>
            </button>

            {permitted.includes('raw_material') && (
              <button
                onClick={() => navigateTo('raw_material')}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-black transition ${
                  activeTab === 'raw_material'
                    ? 'bg-amber-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <PackagePlus className="w-3.5 h-3.5" />
                <span>Raw Material</span>
              </button>
            )}

            {permitted.includes('processing') && (
              <button
                onClick={() => navigateTo('processing')}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-black transition ${
                  activeTab === 'processing'
                    ? 'bg-blue-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Cog className="w-3.5 h-3.5" />
                <span>Processing</span>
              </button>
            )}

            {permitted.includes('packaging') && (
              <button
                onClick={() => navigateTo('packaging')}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-black transition ${
                  activeTab === 'packaging'
                    ? 'bg-purple-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Boxes className="w-3.5 h-3.5" />
                <span>Packaging</span>
              </button>
            )}

            {permitted.includes('order_sale') && (
              <button
                onClick={() => navigateTo('order_sale')}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-black transition ${
                  activeTab === 'order_sale'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Order / Sale</span>
              </button>
            )}

            {permitted.includes('sales_return') && (
              <button
                onClick={() => navigateTo('sales_return')}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-black transition ${
                  activeTab === 'sales_return'
                    ? 'bg-rose-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Sales Return</span>
              </button>
            )}

            <button
              onClick={() => navigateTo('ENTRIES')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-black transition ${
                activeTab === 'ENTRIES'
                  ? 'bg-brand-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span>My Entries</span>
            </button>

            <button
              onClick={() => navigateTo('PROFILE')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-black transition ${
                activeTab === 'PROFILE'
                  ? 'bg-brand-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>My Profile</span>
            </button>

          </div>
        </nav>
      </header>

      {/* Main Container Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-3 sm:p-5">
        
        {/* 1. EMPLOYEE HOME VIEW */}
        {activeTab === 'HOME' && (
          <div className="space-y-4 sm:space-y-5 animate-fadeIn">
            
            {/* Workday & Welcome Banner */}
            <div className="bg-gradient-to-r from-brand-900 via-brand-950 to-slate-900 rounded-3xl p-4 sm:p-6 text-white shadow-md border border-brand-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gold-300 bg-white/10 px-2.5 py-0.5 rounded-full border border-white/10">
                      Workstation Portal
                    </span>
                    <span className="text-[11px] font-mono text-gold-300 font-bold">
                      {activeEmployee?.employee_id || 'PSS001'}
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-white">
                    Namaste, {activeEmployee?.name || 'Staff'}!
                  </h2>
                  <p className="text-xs text-slate-300 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-gold-300" />
                    <span>Today: {formatDisplayDate(todayStr)}</span>
                    <span className="text-[10px] text-gold-300/80">• "सर्वे भवन्तु सुखिनः"</span>
                  </p>
                </div>

                {/* Shift Control Pill */}
                <div className="bg-white/10 p-3 rounded-2xl border border-white/15 flex items-center space-x-3 self-start sm:self-auto shadow-inner">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Shift Status</p>
                    <p className="text-xs font-bold text-white mt-0.5 flex items-center gap-1.5">
                      {workdaySession?.active ? (
                        <>
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                          <span className="text-emerald-300">Started {workdaySession.startedAt}</span>
                        </>
                      ) : workdaySession?.endedAt ? (
                        <span className="text-slate-400">Ended {workdaySession.endedAt}</span>
                      ) : (
                        <span className="text-amber-300">Shift Not Started</span>
                      )}
                    </p>
                  </div>

                  {!workdaySession?.active ? (
                    <button
                      onClick={handleStartWorkday}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center space-x-1.5 shadow-sm"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Start Shift</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleEndWorkday}
                      className="px-3.5 py-2 bg-red-600 hover:bg-red-500 active:scale-95 text-white rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center space-x-1.5 shadow-sm"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>End Shift</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Cloud / Offline Sync Status Info Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-black/25 p-3 rounded-2xl border border-white/10 text-xs gap-2">
                <div className="flex items-center space-x-2">
                  {syncState.isOnline ? (
                    <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
                  )}
                  <span>
                    Database Status: <strong className="text-white">{syncState.isOnline ? 'Online (Firebase Connected)' : 'Offline Mode (Local Auto-Save Active)'}</strong>
                  </span>
                </div>
                {syncState.pendingCount > 0 ? (
                  <span className="text-[11px] font-bold text-amber-300 bg-amber-950/80 px-2.5 py-1 rounded-xl border border-amber-500/30">
                    {syncState.pendingCount} offline records waiting to upload
                  </span>
                ) : (
                  <span className="text-[11px] text-emerald-300 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>All records synced</span>
                  </span>
                )}
              </div>
            </div>

            {/* Permitted Inventory Modules Touch Cards */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Your Permitted Inventory Modules
                </h3>
                <span className="text-[11px] text-slate-500">Tap to record new entry</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                
                {/* 1. Raw Material Inward */}
                {permitted.includes('raw_material') && (
                  <button
                    onClick={() => navigateTo('raw_material')}
                    className="p-4 bg-white hover:bg-amber-50/50 rounded-3xl border-2 border-amber-200 text-left transition shadow-xs group flex items-start justify-between active:scale-98"
                  >
                    <div>
                      <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold mb-2.5">
                        <PackagePlus className="w-6 h-6" />
                      </div>
                      <h4 className="text-sm font-black text-slate-900 group-hover:text-amber-800">
                        1. Raw Material Inward
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                        Record Haldi, Mirchi & Dhaniya inward stock arrivals and manual batch numbers
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-amber-800 shrink-0 mt-2" />
                  </button>
                )}

                {/* 2. Processing & Grinding */}
                {permitted.includes('processing') && (
                  <button
                    onClick={() => navigateTo('processing')}
                    className="p-4 bg-white hover:bg-blue-50/50 rounded-3xl border-2 border-blue-200 text-left transition shadow-xs group flex items-start justify-between active:scale-98"
                  >
                    <div>
                      <div className="w-11 h-11 rounded-2xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold mb-2.5">
                        <Cog className="w-6 h-6" />
                      </div>
                      <h4 className="text-sm font-black text-slate-900 group-hover:text-blue-800">
                        2. Processing & Grinding
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                        Raw material cleaning, waste tracking, multi-round grinding & powder yield
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-800 shrink-0 mt-2" />
                  </button>
                )}

                {/* 3. Packaging */}
                {permitted.includes('packaging') && (
                  <button
                    onClick={() => navigateTo('packaging')}
                    className="p-4 bg-white hover:bg-purple-50/50 rounded-3xl border-2 border-purple-200 text-left transition shadow-xs group flex items-start justify-between active:scale-98"
                  >
                    <div>
                      <div className="w-11 h-11 rounded-2xl bg-purple-100 text-purple-800 flex items-center justify-center font-bold mb-2.5">
                        <Boxes className="w-6 h-6" />
                      </div>
                      <h4 className="text-sm font-black text-slate-900 group-hover:text-purple-800">
                        3. Packaging
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                        Packet production (10g, 24g, 50g, 100g, 200g, 500g) & powder consumption
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-purple-800 shrink-0 mt-2" />
                  </button>
                )}

                {/* 4. Order / Sale */}
                {permitted.includes('order_sale') && (
                  <button
                    onClick={() => navigateTo('order_sale')}
                    className="p-4 bg-white hover:bg-emerald-50/50 rounded-3xl border-2 border-emerald-200 text-left transition shadow-xs group flex items-start justify-between active:scale-98"
                  >
                    <div>
                      <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold mb-2.5">
                        <ShoppingBag className="w-6 h-6" />
                      </div>
                      <h4 className="text-sm font-black text-slate-900 group-hover:text-emerald-800">
                        4. Order / Sale Dispatch
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                        Factory dispatch and customer sales strictly in KG weight
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-emerald-800 shrink-0 mt-2" />
                  </button>
                )}

                {/* 5. Sales Return / Old Stock Return */}
                {permitted.includes('sales_return') && (
                  <button
                    onClick={() => navigateTo('sales_return')}
                    className="p-4 bg-white hover:bg-rose-50/50 rounded-3xl border-2 border-rose-200 text-left transition shadow-xs group flex items-start justify-between active:scale-98 sm:col-span-2"
                  >
                    <div>
                      <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-800 flex items-center justify-center font-bold mb-2.5">
                        <RotateCcw className="w-6 h-6" />
                      </div>
                      <h4 className="text-sm font-black text-slate-900 group-hover:text-rose-800">
                        5. Sales Return & Powder Recovery
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                        Return entries, reusable restock, rejected packet classification & spice powder recovery
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-rose-800 shrink-0 mt-2" />
                  </button>
                )}

              </div>
            </div>

            {/* My Recent Entries Feed */}
            <div className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-brand-800" />
                  <span>My Recent Activity</span>
                </h3>
                <button
                  onClick={() => navigateTo('ENTRIES')}
                  className="text-xs font-bold text-brand-800 hover:text-brand-900 underline"
                >
                  View All ({allMyEntries.length})
                </button>
              </div>

              {recentEntries.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {recentEntries.map(entry => (
                    <div key={entry.id} className="py-2.5 flex items-center justify-between text-xs gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-slate-900 truncate">{entry.product}</span>
                          <span className="text-[10px] font-semibold bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-mono shrink-0">
                            {entry.batch}
                          </span>
                          <span className="text-[10px] font-bold text-brand-700 shrink-0">
                            {entry.module}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                          ID: {entry.id} • {formatDisplayDate(entry.date)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono font-black text-slate-900 block">
                          {entry.quantity}
                        </span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${entry.synced ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                          {entry.synced ? 'Synced' : 'Pending'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-400 space-y-1">
                  <Clock className="w-8 h-8 mx-auto text-slate-300 stroke-1" />
                  <p className="text-xs font-medium">No records submitted under your ID today.</p>
                </div>
              )}
            </div>

          </div>
        )}

        {/* 2. RAW MATERIAL INWARD */}
        {activeTab === 'raw_material' && permitted.includes('raw_material') && (
          <div className="space-y-3">
            <div className="flex items-center justify-between sm:hidden pb-1">
              <button 
                onClick={() => navigateTo('HOME')}
                className="text-xs font-bold text-brand-800 flex items-center gap-1"
              >
                ← Back to Home
              </button>
            </div>
            <RawMaterialInward activeEmployee={activeEmployee} />
          </div>
        )}

        {/* 3. PROCESSING & GRINDING */}
        {activeTab === 'processing' && permitted.includes('processing') && (
          <div className="space-y-3">
            <div className="flex items-center justify-between sm:hidden pb-1">
              <button 
                onClick={() => navigateTo('HOME')}
                className="text-xs font-bold text-brand-800 flex items-center gap-1"
              >
                ← Back to Home
              </button>
            </div>
            <ProcessingModule activeEmployee={activeEmployee} />
          </div>
        )}

        {/* 4. PACKAGING */}
        {activeTab === 'packaging' && permitted.includes('packaging') && (
          <div className="space-y-3">
            <div className="flex items-center justify-between sm:hidden pb-1">
              <button 
                onClick={() => navigateTo('HOME')}
                className="text-xs font-bold text-brand-800 flex items-center gap-1"
              >
                ← Back to Home
              </button>
            </div>
            <PackagingModule activeEmployee={activeEmployee} />
          </div>
        )}

        {/* 5. ORDER / SALE */}
        {activeTab === 'order_sale' && permitted.includes('order_sale') && (
          <div className="space-y-3">
            <div className="flex items-center justify-between sm:hidden pb-1">
              <button 
                onClick={() => navigateTo('HOME')}
                className="text-xs font-bold text-brand-800 flex items-center gap-1"
              >
                ← Back to Home
              </button>
            </div>
            <OrderSaleModule activeEmployee={activeEmployee} />
          </div>
        )}

        {/* 6. SALES RETURN & POWDER RECOVERY */}
        {activeTab === 'sales_return' && permitted.includes('sales_return') && (
          <div className="space-y-3">
            <div className="flex items-center justify-between sm:hidden pb-1">
              <button 
                onClick={() => navigateTo('HOME')}
                className="text-xs font-bold text-brand-800 flex items-center gap-1"
              >
                ← Back to Home
              </button>
            </div>
            <SalesReturnModule currentEmployee={activeEmployee} onComplete={loadEmployeeData} userRole="employee" />
          </div>
        )}

        {/* 6. MY ENTRIES */}
        {activeTab === 'ENTRIES' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-6 shadow-xs space-y-4 animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
              <div>
                <h3 className="text-base font-black text-slate-900 uppercase">My Recorded Entries</h3>
                <p className="text-xs text-slate-500">
                  Entries registered under {activeEmployee?.name} ({activeEmployee?.employee_id || activeEmployee?.id})
                </p>
              </div>
              <span className="text-xs font-bold bg-brand-50 text-brand-900 border border-brand-200 px-3 py-1 rounded-full self-start sm:self-auto">
                {allMyEntries.length} Total Records
              </span>
            </div>

            {/* Mobile-First Card View (No Horizontal Scroll Overflow) */}
            {allMyEntries.length > 0 ? (
              <div className="space-y-2.5">
                {allMyEntries.map(entry => (
                  <div 
                    key={entry.id} 
                    className="p-3.5 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-200/80 space-y-2 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-brand-900 text-xs bg-white px-2 py-0.5 rounded border border-slate-200">
                          {entry.id}
                        </span>
                        <span className="text-[11px] font-bold text-slate-700">
                          {entry.module}
                        </span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        entry.synced 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {entry.synced ? 'Synced' : 'Pending Sync'}
                      </span>
                    </div>

                    <div className="flex justify-between items-baseline pt-1">
                      <div>
                        <div className="font-extrabold text-sm text-slate-900">
                          {entry.product}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Batch: <span className="font-mono font-semibold text-slate-800">{entry.batch || 'N/A'}</span> • {formatDisplayDate(entry.date)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-black text-sm text-slate-900">
                          {entry.quantity}
                        </div>
                      </div>
                    </div>

                    {/* Entry Action Buttons */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 mt-1">
                      <span className="text-[10px] text-slate-400 font-medium">
                        {entry.is_reversed ? <span className="text-red-600 font-bold">Reversed</span> : 'Recorded by you'}
                      </span>
                      <div className="flex items-center space-x-1.5">
                        <button
                          type="button"
                          onClick={() => setDetailEntry(entry)}
                          className="px-2 py-1 bg-white hover:bg-slate-200 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 flex items-center space-x-1"
                        >
                          <Eye className="w-3 h-3 text-slate-500" />
                          <span>Details</span>
                        </button>
                        {entry.module === 'Raw Inward' && !entry.is_reversed && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(entry)}
                              className="px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-[10px] font-bold text-blue-800 flex items-center space-x-1"
                            >
                              <Edit3 className="w-3 h-3 text-blue-600" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenDeleteModal(entry)}
                              className="px-2 py-1 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg text-[10px] font-bold text-red-800 flex items-center space-x-1"
                            >
                              <Trash2 className="w-3 h-3 text-red-600" />
                              <span>Delete</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-slate-400 space-y-2">
                <ListFilter className="w-10 h-10 mx-auto text-slate-300 stroke-1" />
                <p className="text-xs font-semibold">No entries have been recorded under your name yet.</p>
              </div>
            )}
          </div>
        )}

        {/* Action Feedback Toast */}
        {actionFeedback && (
          <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50 p-3 bg-emerald-900 text-white rounded-2xl shadow-xl text-xs font-bold flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
            <span>{actionFeedback.text}</span>
          </div>
        )}

        {/* 1. View Details Modal */}
        {detailEntry && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 animate-scaleUp">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-sm font-black text-slate-900 uppercase">Entry Details</h3>
                <button onClick={() => setDetailEntry(null)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 block font-semibold uppercase">ID</span>
                  <span className="font-mono font-bold text-slate-900">{detailEntry.id}</span>
                </div>
                <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 block font-semibold uppercase">Module</span>
                  <span className="font-bold text-brand-900">{detailEntry.module}</span>
                </div>
                <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 block font-semibold uppercase">Product</span>
                  <span className="font-bold text-slate-900">{detailEntry.product}</span>
                </div>
                <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 block font-semibold uppercase">Batch</span>
                  <span className="font-mono font-bold text-slate-900">{detailEntry.batch}</span>
                </div>
                <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 block font-semibold uppercase">Quantity</span>
                  <span className="font-mono font-black text-slate-900">{detailEntry.quantity}</span>
                </div>
                <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 block font-semibold uppercase">Date</span>
                  <span className="font-medium text-slate-900">{formatDisplayDate(detailEntry.date)}</span>
                </div>
                {detailEntry.supplier_name && (
                  <div className="col-span-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-400 block font-semibold uppercase">Supplier</span>
                    <span className="font-medium text-slate-900">{detailEntry.supplier_name}</span>
                  </div>
                )}
                {detailEntry.invoice_number && (
                  <div className="col-span-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-400 block font-semibold uppercase">Invoice No</span>
                    <span className="font-mono font-medium text-slate-900">{detailEntry.invoice_number}</span>
                  </div>
                )}
              </div>
              <div className="flex justify-end pt-2">
                <button onClick={() => setDetailEntry(null)} className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. Edit Raw Material Modal */}
        {editEntry && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 animate-scaleUp">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-sm font-black text-slate-900 uppercase">Edit My Raw Material Entry</h3>
                <button onClick={() => setEditEntry(null)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {editError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 font-semibold">
                  {editError}
                </div>
              )}
              <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Batch Number *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.batch_id}
                    onChange={(e) => setEditFormData({ ...editFormData, batch_id: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Quantity (KG) *</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    required
                    value={editFormData.quantity_kg}
                    onChange={(e) => setEditFormData({ ...editFormData, quantity_kg: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Supplier Name *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.supplier_name}
                    onChange={(e) => setEditFormData({ ...editFormData, supplier_name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Reason for Edit <span className="text-red-500">*</span></label>
                  <textarea
                    rows={2}
                    required
                    placeholder="e.g. Weighbridge correction..."
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  />
                </div>
                <div className="flex justify-end space-x-2 pt-2">
                  <button type="button" onClick={() => setEditEntry(null)} className="px-4 py-2 border rounded-xl font-bold text-slate-600">
                    Cancel
                  </button>
                  <button type="submit" disabled={editLoading} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold">
                    {editLoading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 3. Delete Raw Material Modal */}
        {deleteEntry && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 animate-scaleUp">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 text-red-600">
                <h3 className="text-sm font-black text-slate-900 uppercase">Delete / Reverse Entry</h3>
                <button onClick={() => setDeleteEntry(null)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {deleteError ? (
                <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-xs text-red-900 space-y-1">
                  <strong>Unsafe Deletion Blocked:</strong>
                  <p>{deleteError}</p>
                </div>
              ) : (
                <form onSubmit={handleConfirmDelete} className="space-y-3 text-xs">
                  <p className="text-slate-600">
                    Are you sure you want to delete / reverse entry <strong>{deleteEntry.id}</strong> ({deleteEntry.quantity} of {deleteEntry.product})?
                  </p>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Reason for Deletion <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={2}
                      required
                      placeholder="e.g. Duplicate entry made by mistake..."
                      value={deleteReason}
                      onChange={(e) => setDeleteReason(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                    />
                  </div>
                  <div className="flex justify-end space-x-2 pt-2">
                    <button type="button" onClick={() => setDeleteEntry(null)} className="px-4 py-2 border rounded-xl font-bold text-slate-600">
                      Cancel
                    </button>
                    <button type="submit" disabled={deleteLoading} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold">
                      {deleteLoading ? 'Reversing...' : 'Confirm Deletion'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* 7. MY PROFILE */}
        {activeTab === 'PROFILE' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-6 shadow-xs space-y-5 animate-fadeIn">
            
            <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
              <div className="w-14 h-14 rounded-2xl bg-brand-100 text-brand-900 flex items-center justify-center font-black text-xl border-2 border-brand-200">
                <User className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  {activeEmployee?.name || 'Factory Employee'}
                </h3>
                <p className="text-xs text-brand-800 font-bold font-mono">
                  Employee ID: {activeEmployee?.employee_id || activeEmployee?.id || 'PSS001'}
                </p>
                <p className="text-[11px] text-slate-500">
                  {activeEmployee?.designation || activeEmployee?.role || 'Staff'} • {activeEmployee?.department || 'Production'}
                </p>
              </div>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Mobile Number</span>
                <span className="font-bold text-slate-900 text-sm mt-0.5 block">
                  {activeEmployee?.mobile || 'Not Configured'}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Account Status</span>
                <span className="font-bold text-emerald-700 text-sm mt-0.5 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Active Workstation Account</span>
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 sm:col-span-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">
                  Authorized Factory Modules
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {permitted.map(m => (
                    <span 
                      key={m} 
                      className="px-2.5 py-1 bg-white border border-slate-300 rounded-xl text-[11px] font-bold text-slate-800 flex items-center gap-1"
                    >
                      <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                      <span>{m.replace('_', ' ').toUpperCase()}</span>
                    </span>
                  ))}
                </div>
              </div>

            </div>

            {/* Plant Office Info Card */}
            <div className="p-4 bg-brand-50 rounded-2xl border border-brand-200 text-xs text-brand-950 space-y-2">
              <div className="flex items-center space-x-2 font-bold text-xs text-brand-900">
                <Building2 className="w-4 h-4 text-brand-800" />
                <span>Patel Sahab Spices Manufacturing Facility</span>
              </div>
              <p className="text-[11px] text-slate-700 leading-relaxed">
                <strong>Plant Address:</strong> Village Panwa, Tehsil Kasrawad, Dist. Khargone (M.P.)
              </p>
              <p className="text-[11px] text-slate-600">
                To reset your login password or change permissions, please contact Authorized Signatory <strong>Sujeet Patidar</strong>.
              </p>
            </div>

            <button
              onClick={onLogout}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 active:scale-98 text-white font-bold rounded-2xl text-xs uppercase tracking-wider transition flex items-center justify-center space-x-2"
            >
              <LogOut className="w-4 h-4 text-gold-300" />
              <span>Logout from Workstation</span>
            </button>

          </div>
        )}

      </main>

      {/* MOBILE BOTTOM NAVIGATION BAR (Thumb-friendly for 1-hand use) */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-2xl z-40 px-2 py-1.5 flex items-center justify-around">
        
        {/* 1. Home */}
        <button
          type="button"
          onClick={() => navigateTo('HOME')}
          className={`flex flex-col items-center py-1 px-2.5 rounded-xl transition ${
            activeTab === 'HOME'
              ? 'text-brand-800 font-black'
              : 'text-slate-500 hover:text-slate-800 font-bold'
          }`}
        >
          <Home className={`w-5 h-5 ${activeTab === 'HOME' ? 'stroke-[2.5]' : 'stroke-2'}`} />
          <span className="text-[10px] mt-0.5">Home</span>
        </button>

        {/* 2. Raw Material (if permitted) */}
        {permitted.includes('raw_material') && (
          <button
            type="button"
            onClick={() => navigateTo('raw_material')}
            className={`flex flex-col items-center py-1 px-2.5 rounded-xl transition ${
              activeTab === 'raw_material'
                ? 'text-amber-800 font-black'
                : 'text-slate-500 hover:text-slate-800 font-bold'
            }`}
          >
            <PackagePlus className={`w-5 h-5 ${activeTab === 'raw_material' ? 'stroke-[2.5]' : 'stroke-2'}`} />
            <span className="text-[10px] mt-0.5">Raw</span>
          </button>
        )}

        {/* 3. Processing (if permitted) */}
        {permitted.includes('processing') && (
          <button
            type="button"
            onClick={() => navigateTo('processing')}
            className={`flex flex-col items-center py-1 px-2.5 rounded-xl transition ${
              activeTab === 'processing'
                ? 'text-blue-800 font-black'
                : 'text-slate-500 hover:text-slate-800 font-bold'
            }`}
          >
            <Cog className={`w-5 h-5 ${activeTab === 'processing' ? 'stroke-[2.5]' : 'stroke-2'}`} />
            <span className="text-[10px] mt-0.5">Grinding</span>
          </button>
        )}

        {/* 4. Packaging (if permitted) */}
        {permitted.includes('packaging') && (
          <button
            type="button"
            onClick={() => navigateTo('packaging')}
            className={`flex flex-col items-center py-1 px-2.5 rounded-xl transition ${
              activeTab === 'packaging'
                ? 'text-purple-800 font-black'
                : 'text-slate-500 hover:text-slate-800 font-bold'
            }`}
          >
            <Boxes className={`w-5 h-5 ${activeTab === 'packaging' ? 'stroke-[2.5]' : 'stroke-2'}`} />
            <span className="text-[10px] mt-0.5">Packing</span>
          </button>
        )}

        {/* 5. More Menu Drawer Toggle */}
        <button
          type="button"
          onClick={() => setIsMoreMenuOpen(true)}
          className={`flex flex-col items-center py-1 px-2.5 rounded-xl transition ${
            ['order_sale', 'ENTRIES', 'PROFILE'].includes(activeTab)
              ? 'text-brand-800 font-black'
              : 'text-slate-500 hover:text-slate-800 font-bold'
          }`}
        >
          <Menu className={`w-5 h-5 ${['order_sale', 'ENTRIES', 'PROFILE'].includes(activeTab) ? 'stroke-[2.5]' : 'stroke-2'}`} />
          <span className="text-[10px] mt-0.5">More</span>
        </button>

      </nav>

      {/* MOBILE "MORE" BOTTOM SHEET DRAWER */}
      {isMoreMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end animate-fadeIn sm:hidden">
          <div className="bg-white rounded-t-3xl p-5 shadow-2xl border-t border-slate-200 space-y-4 animate-slideUp">
            
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <span className="font-mono font-bold text-xs bg-gold-400 text-slate-900 px-2 py-0.5 rounded">
                  {activeEmployee?.employee_id || 'PSS001'}
                </span>
                <span className="font-black text-slate-900 text-sm">
                  {activeEmployee?.name}
                </span>
              </div>
              <button 
                onClick={() => setIsMoreMenuOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1 text-sm font-bold text-slate-800">
              
              {permitted.includes('order_sale') && (
                <button
                  onClick={() => navigateTo('order_sale')}
                  className="w-full p-3 rounded-2xl hover:bg-emerald-50 text-left flex items-center justify-between transition"
                >
                  <span className="flex items-center space-x-3 text-emerald-800">
                    <ShoppingBag className="w-5 h-5" />
                    <span>Order / Sale Dispatch (KG)</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              )}

              {permitted.includes('sales_return') && (
                <button
                  onClick={() => navigateTo('sales_return')}
                  className="w-full p-3 rounded-2xl hover:bg-rose-50 text-left flex items-center justify-between transition"
                >
                  <span className="flex items-center space-x-3 text-rose-800">
                    <RotateCcw className="w-5 h-5" />
                    <span>Sales Return & Powder Recovery</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              )}

              <button
                onClick={() => navigateTo('ENTRIES')}
                className="w-full p-3 rounded-2xl hover:bg-slate-100 text-left flex items-center justify-between transition"
              >
                <span className="flex items-center space-x-3">
                  <ListFilter className="w-5 h-5 text-brand-800" />
                  <span>My Recorded Entries ({allMyEntries.length})</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                onClick={() => navigateTo('PROFILE')}
                className="w-full p-3 rounded-2xl hover:bg-slate-100 text-left flex items-center justify-between transition"
              >
                <span className="flex items-center space-x-3">
                  <User className="w-5 h-5 text-slate-700" />
                  <span>My Profile & Workstation Details</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <div className="pt-2 border-t border-slate-100">
                <button
                  onClick={() => { setIsMoreMenuOpen(false); onLogout(); }}
                  className="w-full p-3 rounded-2xl bg-red-50 text-red-700 hover:bg-red-100 text-left flex items-center space-x-3 transition font-black"
                >
                  <LogOut className="w-5 h-5 text-red-600" />
                  <span>Logout from Workstation</span>
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
