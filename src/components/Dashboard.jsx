import React, { useState, useEffect } from 'react';
import { 
  PackagePlus, 
  Cog, 
  Boxes, 
  ShoppingBag, 
  FileSpreadsheet, 
  History, 
  ShieldCheck, 
  ArrowRight, 
  TrendingUp, 
  RefreshCw, 
  Layers, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Wifi, 
  WifiOff, 
  Clock, 
  Flame,
  Scale,
  Database,
  ChevronRight,
  Info
} from 'lucide-react';
import { 
  fetchFirebaseDashboardData, 
  formatIndian, 
  formatIndianInt 
} from '../services/firebase';
import { getSyncOverview, triggerSync } from '../services/syncService';

export default function Dashboard({ onNavigate, activeEmployee }) {
  const [data, setData] = useState(null);
  const [syncOverview, setSyncOverview] = useState({
    isOnline: navigator.onLine,
    isSyncing: false,
    hasFirebase: false,
    hasScriptUrl: false
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [activeTabFilter, setActiveTabFilter] = useState('ALL'); // 'ALL' | 'Haldi' | 'Mirchi' | 'Dhaniya'

  const loadDashboard = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    setErrorMsg(null);

    try {
      const [dashData, syncStatus] = await Promise.all([
        fetchFirebaseDashboardData(),
        getSyncOverview()
      ]);

      setData(dashData);
      setSyncOverview(syncStatus);
      if (dashData.error && !dashData.productsSummary) {
        setErrorMsg(dashData.error);
      }
    } catch (err) {
      console.error('Failed to load Firebase dashboard:', err);
      setErrorMsg(err.message || 'Failed to load stock overview from database.');
    } finally {
      setLoading(false);
      if (isManualRefresh) {
        setTimeout(() => setRefreshing(false), 400);
      }
    }
  };

  useEffect(() => {
    loadDashboard();
    // Auto-refresh every 8 seconds for real-time factory updates
    const interval = setInterval(() => loadDashboard(false), 8000);
    return () => clearInterval(interval);
  }, []);

  const handleManualSync = async () => {
    try {
      const res = await triggerSync();
      setSyncMsg(res.message || res.warning || res.error);
      await loadDashboard(true);
      setTimeout(() => setSyncMsg(null), 4000);
    } catch (err) {
      setSyncMsg(err.message || 'Sync failed');
      setTimeout(() => setSyncMsg(null), 4000);
    }
  };

  // Loading Skeleton State
  if (loading) {
    return (
      <div className="space-y-6 animate-pulse pb-12">
        <div className="bg-slate-200 h-28 rounded-2xl"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-200 h-40 rounded-2xl"></div>
          <div className="bg-slate-200 h-40 rounded-2xl"></div>
          <div className="bg-slate-200 h-40 rounded-2xl"></div>
        </div>
        <div className="bg-slate-200 h-64 rounded-2xl"></div>
      </div>
    );
  }

  // Error State
  if (errorMsg && !data) {
    return (
      <div className="bg-white rounded-2xl p-8 border border-red-200 text-center space-y-4 max-w-lg mx-auto shadow-sm my-8">
        <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-900">Failed to Connect to Database</h3>
          <p className="text-xs text-slate-500 mt-1">{errorMsg}</p>
        </div>
        <button
          onClick={() => loadDashboard(true)}
          className="px-5 py-2.5 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl transition shadow-xs"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  const { productsSummary = [], overall = {}, dataSource, isFromFirebase, lastUpdated } = data || {};

  // Filter products if filter tab selected
  const displayedProducts = activeTabFilter === 'ALL' 
    ? productsSummary 
    : productsSummary.filter(p => p.productName.toLowerCase() === activeTabFilter.toLowerCase());

  // Distinct standard 3 products for Section 2 Stock Cards
  const haldiData = productsSummary.find(p => p.productName.toLowerCase().includes('haldi')) || {
    productName: 'Haldi',
    availableRawMaterialKg: 0,
    totalRawInwardKg: 0,
    totalRawIssuedForProcessingKg: 0,
    percentProcessed: 0
  };

  const mirchiData = productsSummary.find(p => p.productName.toLowerCase().includes('mirchi')) || {
    productName: 'Mirchi',
    availableRawMaterialKg: 0,
    totalRawInwardKg: 0,
    totalRawIssuedForProcessingKg: 0,
    percentProcessed: 0
  };

  const dhaniyaData = productsSummary.find(p => p.productName.toLowerCase().includes('dhaniya')) || {
    productName: 'Dhaniya',
    availableRawMaterialKg: 0,
    totalRawInwardKg: 0,
    totalRawIssuedForProcessingKg: 0,
    percentProcessed: 0
  };

  return (
    <div className="space-y-6 pb-20 md:pb-8 animate-fadeIn">
      
      {/* 1. PROFESSIONAL DASHBOARD HEADING & STATUS BANNER */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-emerald-800 text-xs font-extrabold tracking-wider uppercase mb-0.5">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
            <span>Factory Stock Overview</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            PATEL SAHAB SPICES
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Admin Dashboard – Real-Time Production, Inventory & Dispatch Ledger
          </p>
        </div>

        {/* Database & Sync Status Pill Card */}
        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          <div className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-right text-xs">
            <div className="flex items-center space-x-1.5 justify-end">
              {isFromFirebase ? (
                <span className="inline-flex items-center space-x-1 text-orange-700 font-bold bg-orange-100/80 px-2 py-0.5 rounded text-[11px]">
                  <Flame className="w-3.5 h-3.5 text-orange-600 fill-orange-500" />
                  <span>Firebase Live</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1 text-slate-700 font-bold bg-slate-200 px-2 py-0.5 rounded text-[11px]">
                  <Database className="w-3 h-3 text-slate-600" />
                  <span>Local Synced</span>
                </span>
              )}
              <span className="text-slate-400">•</span>
              <span className="text-[11px] font-semibold text-slate-600">
                {syncOverview.isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-end space-x-1">
              <Clock className="w-3 h-3" />
              <span>Updated: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Just now'}</span>
            </div>
          </div>

          <button
            onClick={() => loadDashboard(true)}
            disabled={refreshing}
            className="px-3.5 py-2.5 bg-slate-900 hover:bg-black active:scale-95 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 shadow-xs transition disabled:opacity-50"
            title="Refresh latest stock from database"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {syncOverview.pendingCount > 0 && (
            <button
              onClick={handleManualSync}
              disabled={syncOverview.isSyncing}
              className="px-3 py-2.5 bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 shadow-xs transition"
              title="Sync pending queue records"
            >
              <span>Sync ({syncOverview.pendingCount})</span>
            </button>
          )}
        </div>
      </div>

      {syncMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-950 rounded-xl text-xs font-semibold flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{syncMsg}</span>
        </div>
      )}

      {/* 2. SECTION 1: RAW MATERIAL AVAILABLE (3 TARGET PRODUCT STOCK CARDS) */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center space-x-2">
              <span className="w-1.5 h-4 bg-emerald-700 rounded-sm"></span>
              <span>1. Available Raw Material (KG)</span>
            </h2>
            <p className="text-xs text-slate-500">
              Formula: <code>Available = Total Inward − Total Issued for Processing</code> (Already issued raw material is excluded)
            </p>
          </div>
          <span className="text-xs font-bold text-slate-500">
            Total Available Raw: <strong className="text-slate-900">{formatIndian(overall.totalAvailableRawMaterialKg, 2)} KG</strong>
          </span>
        </div>

        {/* 3 Dedicated Stock Cards for Haldi, Mirchi, Dhaniya */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Card 1: HALDI */}
          <div className="bg-white rounded-2xl p-5 border-t-4 border-t-amber-500 border border-slate-200/90 shadow-xs hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-amber-900 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                HALDI (Turmeric)
              </span>
              <span className="text-[11px] font-bold text-slate-400">Raw Balance</span>
            </div>

            <div className="mt-3 flex items-baseline justify-between">
              <div>
                <span className="text-3xl font-black text-slate-950 tracking-tight">
                  {formatIndian(haldiData.availableRawMaterialKg, 2)}
                </span>
                <span className="text-xs font-extrabold text-amber-700 ml-1.5 uppercase">KG</span>
              </div>
            </div>

            <div className="mt-3.5 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs text-slate-600">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Inward</span>
                <span className="font-bold text-slate-800">{formatIndian(haldiData.totalRawInwardKg, 2)} KG</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Issued for Processing</span>
                <span className="font-bold text-amber-800">{formatIndian(haldiData.totalRawIssuedForProcessingKg, 2)} KG</span>
              </div>
            </div>

            {/* Processing Progress Bar */}
            <div className="mt-2.5">
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-amber-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${haldiData.percentProcessed}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 font-medium mt-1">
                <span>{haldiData.percentProcessed}% issued to grinder</span>
                <span>{formatIndian(haldiData.availableRawMaterialKg, 2)} KG remaining</span>
              </div>
            </div>
          </div>

          {/* Card 2: MIRCHI */}
          <div className="bg-white rounded-2xl p-5 border-t-4 border-t-red-600 border border-slate-200/90 shadow-xs hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-red-900 bg-red-50 px-2.5 py-1 rounded-lg border border-red-200">
                MIRCHI (Chilli)
              </span>
              <span className="text-[11px] font-bold text-slate-400">Raw Balance</span>
            </div>

            <div className="mt-3 flex items-baseline justify-between">
              <div>
                <span className="text-3xl font-black text-slate-950 tracking-tight">
                  {formatIndian(mirchiData.availableRawMaterialKg, 2)}
                </span>
                <span className="text-xs font-extrabold text-red-700 ml-1.5 uppercase">KG</span>
              </div>
            </div>

            <div className="mt-3.5 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs text-slate-600">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Inward</span>
                <span className="font-bold text-slate-800">{formatIndian(mirchiData.totalRawInwardKg, 2)} KG</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Issued for Processing</span>
                <span className="font-bold text-red-800">{formatIndian(mirchiData.totalRawIssuedForProcessingKg, 2)} KG</span>
              </div>
            </div>

            <div className="mt-2.5">
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-red-600 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${mirchiData.percentProcessed}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 font-medium mt-1">
                <span>{mirchiData.percentProcessed}% issued to grinder</span>
                <span>{formatIndian(mirchiData.availableRawMaterialKg, 2)} KG remaining</span>
              </div>
            </div>
          </div>

          {/* Card 3: DHANIYA */}
          <div className="bg-white rounded-2xl p-5 border-t-4 border-t-emerald-600 border border-slate-200/90 shadow-xs hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-900 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                DHANIYA (Coriander)
              </span>
              <span className="text-[11px] font-bold text-slate-400">Raw Balance</span>
            </div>

            <div className="mt-3 flex items-baseline justify-between">
              <div>
                <span className="text-3xl font-black text-slate-950 tracking-tight">
                  {formatIndian(dhaniyaData.availableRawMaterialKg, 2)}
                </span>
                <span className="text-xs font-extrabold text-emerald-700 ml-1.5 uppercase">KG</span>
              </div>
            </div>

            <div className="mt-3.5 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs text-slate-600">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Inward</span>
                <span className="font-bold text-slate-800">{formatIndian(dhaniyaData.totalRawInwardKg, 2)} KG</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Issued for Processing</span>
                <span className="font-bold text-emerald-800">{formatIndian(dhaniyaData.totalRawIssuedForProcessingKg, 2)} KG</span>
              </div>
            </div>

            <div className="mt-2.5">
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-emerald-600 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${dhaniyaData.percentProcessed}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 font-medium mt-1">
                <span>{dhaniyaData.percentProcessed}% issued to grinder</span>
                <span>{formatIndian(dhaniyaData.availableRawMaterialKg, 2)} KG remaining</span>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* 3. SECTION 2: GRINDING / PROCESSING STATUS TABLE */}
      <section className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center space-x-2">
              <span className="w-1.5 h-4 bg-slate-900 rounded-sm"></span>
              <span>2. Grinding & Processing Status</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Raw material issued, cleaning waste, grinding losses, net powder produced & available powder stock
            </p>
          </div>

          <div className="text-xs text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 font-semibold self-start sm:self-auto">
            Total Powder Produced: <strong className="text-emerald-800">{formatIndian(overall.totalPowderProducedKg, 2)} KG</strong>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 font-bold text-slate-700 border-b border-slate-200 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Product Name</th>
                <th className="py-3 px-4 text-right">Raw Issued for Processing</th>
                <th className="py-3 px-4 text-right">Net Cleaned Raw</th>
                <th className="py-3 px-4 text-right text-emerald-800">Powder Produced (Net)</th>
                <th className="py-3 px-4 text-right text-red-700">Cleaning Waste</th>
                <th className="py-3 px-4 text-right text-red-700">Grinding Loss</th>
                <th className="py-3 px-4 text-right">Yield %</th>
                <th className="py-3 px-4 text-right text-slate-900 font-extrabold bg-emerald-50/50">Available Powder Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {productsSummary.map(prod => (
                <tr key={prod.productName} className="hover:bg-slate-50/70 transition">
                  <td className="py-3 px-4 font-bold text-slate-900 text-sm">
                    {prod.productName}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-800 font-semibold">
                    {formatIndian(prod.totalRawIssuedForProcessingKg, 2)} KG
                  </td>
                  <td className="py-3 px-4 text-right text-slate-700">
                    {formatIndian(prod.netCleanedRawKg, 2)} KG
                  </td>
                  <td className="py-3 px-4 text-right font-black text-emerald-800">
                    {formatIndian(prod.powderProducedKg, 2)} KG
                  </td>
                  <td className="py-3 px-4 text-right text-red-700">
                    {formatIndian(prod.cleaningWasteKg, 2)} KG
                  </td>
                  <td className="py-3 px-4 text-right text-red-700">
                    {formatIndian(prod.grindingLossKg, 2)} KG
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-800">
                    {prod.yieldPercentage}%
                  </td>
                  <td className="py-3 px-4 text-right font-black text-emerald-900 bg-emerald-50/50">
                    {formatIndian(prod.availablePowderKg, 2)} KG
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50/80 font-black text-xs text-slate-900 border-t border-slate-200">
              <tr>
                <td className="py-3 px-4 uppercase">Total Factory</td>
                <td className="py-3 px-4 text-right">{formatIndian(overall.totalRawIssuedProcessingKg, 2)} KG</td>
                <td className="py-3 px-4 text-right text-slate-400">—</td>
                <td className="py-3 px-4 text-right text-emerald-800">{formatIndian(overall.totalPowderProducedKg, 2)} KG</td>
                <td className="py-3 px-4 text-right text-red-700">—</td>
                <td className="py-3 px-4 text-right text-red-700">—</td>
                <td className="py-3 px-4 text-right text-slate-400">—</td>
                <td className="py-3 px-4 text-right text-emerald-900 bg-emerald-100/50">
                  {formatIndian(overall.totalAvailablePowderKg, 2)} KG
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* 4. SECTION 3: FINISHED PRODUCT STOCK (PACKETS AS PRIMARY UNIT) */}
      <section className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center space-x-2">
              <span className="w-1.5 h-4 bg-emerald-600 rounded-sm"></span>
              <span>3. Finished Product Stock (Packets)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Retail ready packaging inventory shown strictly in whole <strong>packets</strong> (and total weight)
            </p>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            <div className="text-right">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Packets In Stock</span>
              <span className="text-base font-black text-emerald-800">
                {formatIndianInt(overall.totalFinishedPackets)} <span className="text-xs font-semibold">pkts</span>
              </span>
            </div>
            <div className="h-7 w-px bg-slate-200"></div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Weight</span>
              <span className="text-base font-black text-slate-900">
                {formatIndian(overall.totalFinishedStockKg, 2)} <span className="text-xs font-semibold">KG</span>
              </span>
            </div>
          </div>
        </div>

        {/* Product Pack-Size Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {productsSummary.map(prod => (
            <div key={prod.productName} className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-sm text-slate-900">{prod.productName}</h3>
                <span className="text-xs font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                  {formatIndianInt(prod.totalFinishedPackets)} pkts ({formatIndian(prod.totalFinishedStockKg, 2)} KG)
                </span>
              </div>

              {/* 6 Standard Pack Sizes Breakdown */}
              <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-3 gap-1.5 text-center">
                {prod.packSizeStock.map(item => (
                  <div key={item.packSizeGm} className="p-2 bg-white rounded-lg border border-slate-200/80 shadow-2xs">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase">
                      {item.packSizeGm} GM
                    </span>
                    <span className="block text-xs font-black text-slate-900 mt-0.5">
                      {formatIndianInt(item.remainingPackets)}
                    </span>
                    <span className="block text-[9px] text-slate-400 font-medium">
                      pkts ({formatIndian(item.remainingKg, 2)} kg)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5. SECTION 4: SALES DISPATCH & TODAY'S FACTORY ACTIVITY */}
      <section className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        
        {/* Metric Card 1: Today's Inward */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Today's Inward</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{formatIndian(overall.todayRawInwardKg, 2)}</span>
            <span className="text-xs font-bold text-slate-500">KG</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">Fresh raw material received</span>
        </div>

        {/* Metric Card 2: Today's Processing */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Today's Grinding</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-amber-700">{formatIndian(overall.todayProcessingKg, 2)}</span>
            <span className="text-xs font-bold text-amber-800">KG</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">Gross raw material processed</span>
        </div>

        {/* Metric Card 3: Today's Packaging */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Today's Packaged</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-blue-700">{formatIndian(overall.todayPackagingPowderKg, 2)}</span>
            <span className="text-xs font-bold text-blue-800">KG</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">Powder filled in packets</span>
        </div>

        {/* Metric Card 4: Today's Dispatched Sales */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Today's Sales Dispatch</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-800">{formatIndian(overall.todaySalesKg, 2)}</span>
            <span className="text-xs font-bold text-emerald-800">KG</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">Total sales: {formatIndian(overall.totalSoldKg, 2)} KG</span>
        </div>

      </section>

      {/* 6. SECTION 5: QUICK FACTORY MODULE NAVIGATION */}
      <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
            <Layers className="w-4 h-4 text-emerald-700" />
            <span>Factory Operational Workflows</span>
          </h2>
          <span className="text-xs text-slate-400">Tap to record entry</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          
          <button
            onClick={() => onNavigate('raw_material')}
            className="p-3.5 bg-slate-50 hover:bg-emerald-50/70 border border-slate-200 hover:border-emerald-300 rounded-xl text-left transition group active:scale-95"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold mb-2 group-hover:bg-emerald-700 group-hover:text-white transition">
              <PackagePlus className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold text-slate-900 leading-tight">Module 1</div>
            <div className="text-[11px] text-slate-500">Raw Inward</div>
          </button>

          <button
            onClick={() => onNavigate('processing')}
            className="p-3.5 bg-slate-50 hover:bg-amber-50/70 border border-slate-200 hover:border-amber-300 rounded-xl text-left transition group active:scale-95"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold mb-2 group-hover:bg-amber-700 group-hover:text-white transition">
              <Cog className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold text-slate-900 leading-tight">Module 2</div>
            <div className="text-[11px] text-slate-500">Processing & Grinding</div>
          </button>

          <button
            onClick={() => onNavigate('packaging')}
            className="p-3.5 bg-slate-50 hover:bg-blue-50/70 border border-slate-200 hover:border-blue-300 rounded-xl text-left transition group active:scale-95"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center font-bold mb-2 group-hover:bg-blue-700 group-hover:text-white transition">
              <Boxes className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold text-slate-900 leading-tight">Module 3</div>
            <div className="text-[11px] text-slate-500">Packaging (Packets)</div>
          </button>

          <button
            onClick={() => onNavigate('order_sale')}
            className="p-3.5 bg-slate-50 hover:bg-emerald-50/70 border border-slate-200 hover:border-emerald-300 rounded-xl text-left transition group active:scale-95"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold mb-2 group-hover:bg-emerald-700 group-hover:text-white transition">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold text-slate-900 leading-tight">Module 4</div>
            <div className="text-[11px] text-slate-500">Order / Sale Dispatch</div>
          </button>

        </div>
      </section>

      {/* 7. SECTION 6: RECENT FACTORY ACTIVITY FEED */}
      {data?.recentTransactions && data.recentTransactions.length > 0 && (
        <section className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center space-x-1.5">
              <History className="w-3.5 h-3.5 text-slate-500" />
              <span>Recent Transactions & Audit Trail</span>
            </h3>
            <button
              onClick={() => onNavigate('history')}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-900 flex items-center space-x-1"
            >
              <span>View Full History</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {data.recentTransactions.map((tx) => (
              <div key={tx.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/60 transition">
                <div className="flex items-center space-x-3">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
                    tx.module.includes('RAW') ? 'bg-amber-100 text-amber-900' :
                    tx.module.includes('PROCESSING') ? 'bg-orange-100 text-orange-900' :
                    tx.module.includes('PACKAGING') ? 'bg-blue-100 text-blue-900' :
                    'bg-emerald-100 text-emerald-900'
                  }`}>
                    {tx.module}
                  </span>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-900 text-xs">{tx.product}</span>
                      <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1 rounded">{tx.batch}</span>
                    </div>
                    <span className="text-[11px] text-slate-400">By {tx.staff} • {tx.date}</span>
                  </div>
                </div>

                <div className="text-right sm:self-auto self-end">
                  <span className="text-xs font-black text-slate-900">{tx.quantity}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
