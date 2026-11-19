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
  AlertCircle
} from 'lucide-react';
import { getDB } from '../services/db';
import { getSyncOverview, triggerSync } from '../services/syncService';
import RawMaterialInward from './RawMaterialInward';
import ProcessingModule from './ProcessingModule';
import PackagingModule from './PackagingModule';
import OrderSaleModule from './OrderSaleModule';

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
  const [activeTab, setActiveTab] = useState('HOME'); // 'HOME' | 'raw_material' | 'processing' | 'packaging' | 'order_sale' | 'ENTRIES' | 'PROFILE'
  const [recentEntries, setRecentEntries] = useState([]);
  const [allMyEntries, setAllMyEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncState, setSyncState] = useState({ isOnline: true, pendingCount: 0, statusText: 'ONLINE' });
  const [syncing, setSyncing] = useState(false);

  // Workday session tracker
  const todayStr = getKolkataDateStr();
  const sessionKey = `pss_workday_${activeEmployee?.id}_${todayStr}`;
  const [workdaySession, setWorkdaySession] = useState(() => {
    try {
      const saved = localStorage.getItem(sessionKey);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

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
      return activeEmployee.permitted_modules;
    }
    const role = (activeEmployee?.role || '').toLowerCase();
    if (role.includes('supervisor') || role.includes('manager')) {
      return ['raw_material', 'processing', 'packaging', 'order_sale'];
    }
    if (role.includes('machine') || role.includes('grinding') || role.includes('operator')) {
      return ['processing'];
    }
    if (role.includes('packaging')) {
      return ['packaging'];
    }
    if (role.includes('godown') || role.includes('store') || role.includes('dispatch')) {
      return ['raw_material', 'order_sale'];
    }
    return ['raw_material', 'processing', 'packaging', 'order_sale'];
  };

  const permitted = getPermittedModules();

  const loadEmployeeData = async () => {
    try {
      const db = await getDB();
      const empName = activeEmployee?.name || '';

      const [raw, proc, pkg, sales, sync] = await Promise.all([
        db.getAll('raw_material'),
        db.getAll('processing'),
        db.getAll('packaging'),
        db.getAll('order_sale'),
        getSyncOverview()
      ]);

      setSyncState(sync);

      // Collect entries created by this employee
      const matchEmp = (name) => (name || '').toLowerCase() === empName.toLowerCase();

      const myRaw = raw.filter(r => matchEmp(r.employee_name)).map(r => ({
        id: r.entry_id,
        module: 'Raw Inward',
        product: r.material_name,
        batch: r.batch_id,
        quantity: `${r.quantity_kg} KG`,
        date: r.date || r.timestamp?.slice(0, 10),
        timestamp: r.timestamp || r.date
      }));

      const myProc = proc.filter(p => matchEmp(p.employee_name)).map(p => ({
        id: p.entry_id,
        module: 'Processing',
        product: p.material_name || 'Spice',
        batch: p.batch_id,
        quantity: `${p.net_powder_kg} KG Powder`,
        date: p.date || p.timestamp?.slice(0, 10),
        timestamp: p.timestamp || p.date
      }));

      const myPkg = pkg.filter(k => matchEmp(k.employee_name)).map(k => ({
        id: k.entry_id,
        module: 'Packaging',
        product: k.product_name,
        batch: k.batch_id,
        quantity: `${k.packet_quantity} Pkts (${k.pack_size_gm}g)`,
        date: k.date || k.timestamp?.slice(0, 10),
        timestamp: k.timestamp || k.date
      }));

      const mySales = sales.filter(s => matchEmp(s.employee_name)).map(s => ({
        id: s.entry_id,
        module: 'Order / Sale',
        product: s.product_name,
        batch: s.batch_id,
        quantity: `${s.kg_sold} KG`,
        date: s.date || s.timestamp?.slice(0, 10),
        timestamp: s.timestamp || s.date
      }));

      const merged = [...myRaw, ...myProc, ...myPkg, ...mySales].sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
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

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      
      {/* Top Employee Header */}
      <header className="bg-gradient-to-r from-brand-950 via-slate-900 to-brand-950 text-white shadow-md sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gold-400/20 text-gold-300 flex items-center justify-center border border-gold-400/40">
              <User className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-sm sm:text-base font-black text-white uppercase tracking-wider">
                  {activeEmployee?.name || 'Factory Staff'}
                </h1>
                <span className="text-[10px] font-bold bg-white/10 text-gold-300 px-2 py-0.5 rounded border border-white/10">
                  {activeEmployee?.role || 'Operator'}
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                PATEL SAHAB SPICES • Factory Workstation
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Sync Status Badge */}
            <button
              onClick={handleManualSync}
              disabled={syncing}
              className={`flex items-center space-x-1 text-[11px] font-bold px-2.5 py-1 rounded-full border transition active:scale-95 ${
                syncState.isOnline
                  ? syncState.pendingCount > 0
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-red-500/20 text-red-300 border-red-500/40'
              }`}
              title="Click to check sync status"
            >
              <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{syncState.statusText}</span>
              {syncState.pendingCount > 0 && (
                <span className="bg-amber-400 text-slate-950 px-1 rounded-full text-[9px]">
                  {syncState.pendingCount}
                </span>
              )}
            </button>

            {/* Logout Button */}
            <button
              onClick={onLogout}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition active:scale-95"
              title="Logout from Employee Workstation"
            >
              <LogOut className="w-3.5 h-3.5 text-gold-300" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        {/* Employee Navigation Bar */}
        <nav className="bg-white border-b border-slate-200">
          <div className="max-w-4xl mx-auto px-2 flex space-x-1 py-1.5 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveTab('HOME')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-black whitespace-nowrap transition ${
                activeTab === 'HOME'
                  ? 'bg-brand-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              <span>Employee Home</span>
            </button>

            {permitted.includes('raw_material') && (
              <button
                onClick={() => setActiveTab('raw_material')}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-black whitespace-nowrap transition ${
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
                onClick={() => setActiveTab('processing')}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-black whitespace-nowrap transition ${
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
                onClick={() => setActiveTab('packaging')}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-black whitespace-nowrap transition ${
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
                onClick={() => setActiveTab('order_sale')}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-black whitespace-nowrap transition ${
                  activeTab === 'order_sale'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Order / Sale</span>
              </button>
            )}

            <button
              onClick={() => setActiveTab('ENTRIES')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-black whitespace-nowrap transition ${
                activeTab === 'ENTRIES'
                  ? 'bg-brand-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span>My Entries</span>
            </button>

            <button
              onClick={() => setActiveTab('PROFILE')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-black whitespace-nowrap transition ${
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

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6">
        
        {/* EMPLOYEE HOME */}
        {activeTab === 'HOME' && (
          <div className="space-y-5 animate-fadeIn">
            
            {/* Workday & Welcome Card */}
            <div className="bg-gradient-to-r from-brand-900 via-brand-950 to-slate-900 rounded-2xl p-5 text-white shadow-md border border-brand-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gold-400 bg-white/10 px-2 py-0.5 rounded">
                    Employee Workstation
                  </span>
                  <h2 className="text-xl font-black text-white mt-1">
                    Namaste, {activeEmployee?.name || 'Staff'}!
                  </h2>
                  <p className="text-xs text-slate-300 flex items-center gap-1.5 mt-0.5">
                    <Calendar className="w-3.5 h-3.5 text-gold-300" />
                    <span>Today: {formatDisplayDate(todayStr)} (Asia/Kolkata)</span>
                  </p>
                </div>

                {/* Start / End Day Session Controls */}
                <div className="bg-white/10 p-3 rounded-xl border border-white/15 flex items-center space-x-3 self-start sm:self-auto">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Workday Status</p>
                    <p className="text-xs font-bold text-white mt-0.5 flex items-center gap-1">
                      {workdaySession?.active ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                          <span className="text-emerald-300">Started at {workdaySession.startedAt}</span>
                        </>
                      ) : workdaySession?.endedAt ? (
                        <span className="text-slate-400">Ended at {workdaySession.endedAt}</span>
                      ) : (
                        <span className="text-amber-300">Not started yet</span>
                      )}
                    </p>
                  </div>

                  {!workdaySession?.active ? (
                    <button
                      onClick={handleStartWorkday}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-xs active:scale-95"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Start Shift</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleEndWorkday}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-xs active:scale-95"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>End Shift</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Sync Status Banner */}
              <div className="flex items-center justify-between bg-black/20 p-2.5 rounded-xl border border-white/10 text-xs">
                <div className="flex items-center space-x-2">
                  {syncState.isOnline ? (
                    <Wifi className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <WifiOff className="w-4 h-4 text-amber-400" />
                  )}
                  <span>
                    Database Status: <strong className="text-white">{syncState.isOnline ? 'Online Cloud Synced' : 'Offline Mode (Local Auto-Save)'}</strong>
                  </span>
                </div>
                {syncState.pendingCount > 0 && (
                  <span className="text-[11px] font-bold text-amber-300 bg-amber-900/60 px-2 py-0.5 rounded">
                    {syncState.pendingCount} offline records waiting to upload
                  </span>
                )}
              </div>
            </div>

            {/* Permitted Modules Fast-Access Action Cards */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
                Your Permitted Work Modules
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {permitted.includes('raw_material') && (
                  <button
                    onClick={() => setActiveTab('raw_material')}
                    className="p-4 bg-white hover:bg-amber-50/50 rounded-2xl border-2 border-amber-200 text-left transition shadow-xs group flex items-start justify-between"
                  >
                    <div>
                      <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold mb-2">
                        <PackagePlus className="w-5 h-5" />
                      </div>
                      <h4 className="text-sm font-black text-slate-900 group-hover:text-amber-800">
                        1. Raw Material Inward
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Record Haldi, Mirchi, Dhaniya inward stock arrivals and custom batch numbers
                      </p>
                    </div>
                  </button>
                )}

                {permitted.includes('processing') && (
                  <button
                    onClick={() => setActiveTab('processing')}
                    className="p-4 bg-white hover:bg-blue-50/50 rounded-2xl border-2 border-blue-200 text-left transition shadow-xs group flex items-start justify-between"
                  >
                    <div>
                      <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold mb-2">
                        <Cog className="w-5 h-5" />
                      </div>
                      <h4 className="text-sm font-black text-slate-900 group-hover:text-blue-800">
                        2. Processing & Grinding
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Cleaning, grinding losses and multi-round powder production
                      </p>
                    </div>
                  </button>
                )}

                {permitted.includes('packaging') && (
                  <button
                    onClick={() => setActiveTab('packaging')}
                    className="p-4 bg-white hover:bg-purple-50/50 rounded-2xl border-2 border-purple-200 text-left transition shadow-xs group flex items-start justify-between"
                  >
                    <div>
                      <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center font-bold mb-2">
                        <Boxes className="w-5 h-5" />
                      </div>
                      <h4 className="text-sm font-black text-slate-900 group-hover:text-purple-800">
                        3. Retail Packaging
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Pack 10g, 24g, 50g, 100g, 200g, 500g pouches from powder stock
                      </p>
                    </div>
                  </button>
                )}

                {permitted.includes('order_sale') && (
                  <button
                    onClick={() => setActiveTab('order_sale')}
                    className="p-4 bg-white hover:bg-emerald-50/50 rounded-2xl border-2 border-emerald-200 text-left transition shadow-xs group flex items-start justify-between"
                  >
                    <div>
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold mb-2">
                        <ShoppingBag className="w-5 h-5" />
                      </div>
                      <h4 className="text-sm font-black text-slate-900 group-hover:text-emerald-800">
                        4. Order / Sale Dispatch
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Direct sales and customer dispatches strictly in KG weight
                      </p>
                    </div>
                  </button>
                )}
              </div>
            </div>

            {/* My Recent Entries Feed */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-brand-800" />
                  <span>My Recent Entries</span>
                </h3>
                <button
                  onClick={() => setActiveTab('ENTRIES')}
                  className="text-xs font-bold text-brand-700 hover:underline"
                >
                  View All ({allMyEntries.length})
                </button>
              </div>

              {recentEntries.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {recentEntries.map(entry => (
                    <div key={entry.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-slate-900">{entry.product}</span>
                          <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-mono">
                            {entry.batch}
                          </span>
                          <span className="text-[10px] font-bold text-brand-700">
                            {entry.module}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          ID: {entry.id} • {formatDisplayDate(entry.date)}
                        </p>
                      </div>
                      <span className="font-mono font-bold text-slate-800">
                        {entry.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 py-3 text-center">
                  You haven't recorded any entries yet today.
                </p>
              )}
            </div>

          </div>
        )}

        {/* WORK MODULE: RAW MATERIAL */}
        {activeTab === 'raw_material' && permitted.includes('raw_material') && (
          <RawMaterialInward activeEmployee={activeEmployee} />
        )}

        {/* WORK MODULE: PROCESSING */}
        {activeTab === 'processing' && permitted.includes('processing') && (
          <ProcessingModule activeEmployee={activeEmployee} />
        )}

        {/* WORK MODULE: PACKAGING */}
        {activeTab === 'packaging' && permitted.includes('packaging') && (
          <PackagingModule activeEmployee={activeEmployee} />
        )}

        {/* WORK MODULE: ORDER / SALE */}
        {activeTab === 'order_sale' && permitted.includes('order_sale') && (
          <OrderSaleModule activeEmployee={activeEmployee} />
        )}

        {/* MY ENTRIES LIST */}
        {activeTab === 'ENTRIES' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-900">My Recorded Entries</h3>
                <p className="text-xs text-slate-500">History of entries submitted under your name ({activeEmployee?.name})</p>
              </div>
              <span className="text-xs font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full">
                {allMyEntries.length} Records
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Entry ID</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Module</th>
                    <th className="py-2.5 px-3">Product</th>
                    <th className="py-2.5 px-3">Batch ID</th>
                    <th className="py-2.5 px-3 text-right">Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {allMyEntries.length > 0 ? (
                    allMyEntries.map(entry => (
                      <tr key={entry.id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{entry.id}</td>
                        <td className="py-2.5 px-3">{formatDisplayDate(entry.date)}</td>
                        <td className="py-2.5 px-3 font-bold text-brand-800">{entry.module}</td>
                        <td className="py-2.5 px-3 font-semibold">{entry.product}</td>
                        <td className="py-2.5 px-3 font-mono">{entry.batch}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">{entry.quantity}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="py-6 text-center text-slate-400">
                        No entries recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* MY PROFILE */}
        {activeTab === 'PROFILE' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs max-w-lg mx-auto space-y-5 animate-fadeIn">
            <div className="flex items-center space-x-3.5 pb-4 border-b border-slate-100">
              <div className="w-12 h-12 rounded-2xl bg-brand-900 text-gold-300 flex items-center justify-center font-bold text-lg">
                <User className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 uppercase">
                  {activeEmployee?.name || 'Staff Member'}
                </h3>
                <p className="text-xs text-slate-500 font-semibold">
                  Employee ID: {activeEmployee?.id} • Role: {activeEmployee?.role}
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Authorized Work Modules
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {permitted.map(mod => (
                    <span key={mod} className="bg-white border border-slate-200 px-2 py-0.5 rounded font-bold text-slate-700 capitalize">
                      {mod.replace('_', ' ')}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Today's Shift Attendance
                </p>
                <p className="text-slate-800 font-semibold">
                  Shift: {workdaySession?.startedAt ? `Started at ${workdaySession.startedAt}` : 'Shift not started'}
                  {workdaySession?.endedAt && ` • Finished at ${workdaySession.endedAt}`}
                </p>
              </div>

              <div className="pt-2">
                <button
                  onClick={onLogout}
                  className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition flex items-center justify-center space-x-2 shadow-xs"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout from Workstation</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </main>

    </div>
  );
}
