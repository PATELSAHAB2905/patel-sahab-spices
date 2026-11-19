import React, { useState, useEffect } from 'react';
import { 
  Package, 
  Cog, 
  Boxes, 
  ShoppingBag, 
  AlertTriangle, 
  CheckCircle2, 
  TrendingUp, 
  RefreshCw, 
  Calendar, 
  Filter, 
  Sliders, 
  ShieldCheck, 
  Layers, 
  Scale, 
  ArrowUpRight,
  Flame,
  Clock
} from 'lucide-react';
import { getDB } from '../services/db';
import { fetchFirebaseDashboardData, formatIndian, formatIndianInt } from '../services/firebase';

/**
 * Get current date in Asia/Kolkata timezone (YYYY-MM-DD)
 */
function getKolkataDateStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/**
 * Get current month in Asia/Kolkata timezone (YYYY-MM)
 */
function getKolkataMonthStr() {
  const d = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  return d.slice(0, 7);
}

export default function AdminDashboard({ onNavigate }) {
  const [data, setData] = useState(null);
  const [rawRecords, setRawRecords] = useState({ raw: [], proc: [], pkg: [], sales: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Low stock limits (default 200kg Haldi, 100kg Mirchi, 100kg Dhaniya)
  const [lowStockLimits, setLowStockLimits] = useState({
    Haldi: 200,
    Mirchi: 100,
    Dhaniya: 100
  });
  const [showThresholdModal, setShowThresholdModal] = useState(false);
  const [editLimits, setEditLimits] = useState({ Haldi: 200, Mirchi: 100, Dhaniya: 100 });
  const [limitSavedMsg, setLimitSavedMsg] = useState(false);

  // Monthly summary month selector (YYYY-MM)
  const [selectedMonth, setSelectedMonth] = useState(getKolkataMonthStr());

  const todayStr = getKolkataDateStr();

  const loadData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    setErrorMsg(null);
    try {
      const db = await getDB();
      const [dashData, savedLimits, r, p, k, s] = await Promise.all([
        fetchFirebaseDashboardData(),
        db.get('settings', 'low_stock_limits'),
        db.getAll('raw_material'),
        db.getAll('processing'),
        db.getAll('packaging'),
        db.getAll('order_sale')
      ]);

      setData(dashData);
      setRawRecords({ raw: r, proc: p, pkg: k, sales: s });

      if (savedLimits?.value) {
        setLowStockLimits(savedLimits.value);
        setEditLimits(savedLimits.value);
      }
    } catch (err) {
      console.error('Failed to load Admin Dashboard:', err);
      setErrorMsg(err.message || 'Error loading dashboard data.');
    } finally {
      setLoading(false);
      if (isManual) {
        setTimeout(() => setRefreshing(false), 300);
      }
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(false), 10000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveLimits = async (e) => {
    e.preventDefault();
    try {
      const db = await getDB();
      const updated = {
        Haldi: Number(editLimits.Haldi) || 0,
        Mirchi: Number(editLimits.Mirchi) || 0,
        Dhaniya: Number(editLimits.Dhaniya) || 0
      };
      await db.put('settings', {
        key: 'low_stock_limits',
        value: updated,
        updatedAt: new Date().toISOString()
      });
      setLowStockLimits(updated);
      setShowThresholdModal(false);
      setLimitSavedMsg(true);
      setTimeout(() => setLimitSavedMsg(false), 3000);
    } catch (err) {
      alert('Failed to save limits: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="space-y-5 animate-pulse pb-16">
        <div className="bg-slate-200 h-28 rounded-2xl"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-200 h-36 rounded-2xl"></div>
          <div className="bg-slate-200 h-36 rounded-2xl"></div>
          <div className="bg-slate-200 h-36 rounded-2xl"></div>
        </div>
        <div className="bg-slate-200 h-64 rounded-2xl"></div>
      </div>
    );
  }

  if (errorMsg && !data) {
    return (
      <div className="bg-white rounded-2xl p-8 border border-red-200 text-center space-y-4 max-w-md mx-auto my-8 shadow-sm">
        <AlertTriangle className="w-10 h-10 text-red-600 mx-auto" />
        <h3 className="text-base font-bold text-slate-900">Database Connection Error</h3>
        <p className="text-xs text-slate-600">{errorMsg}</p>
        <button
          onClick={() => loadData(true)}
          className="px-4 py-2 bg-brand-900 text-white rounded-xl text-xs font-bold"
        >
          Retry Load
        </button>
      </div>
    );
  }

  // Helper to extract product metrics from productsSummary
  const getProduct = (prodName) => {
    return data?.productsSummary?.find(p => p.productName.toLowerCase() === prodName.toLowerCase()) || {
      productName: prodName,
      availableRawMaterialKg: 0,
      totalRawInwardKg: 0,
      totalRawIssuedForProcessingKg: 0,
      powderProducedKg: 0,
      powderUsedInPackagingKg: 0,
      availablePowderKg: 0,
      packSizeStock: [10, 24, 50, 100, 200, 500].map(s => ({ packSizeGm: s, remainingPackets: 0 })),
      totalFinishedPackets: 0,
      totalFinishedStockKg: 0,
      totalKgSold: 0
    };
  };

  const haldi = getProduct('Haldi');
  const mirchi = getProduct('Mirchi');
  const dhaniya = getProduct('Dhaniya');

  // Section 4: Grinding & Processing Calculations
  const procEntries = rawRecords.proc || [];
  const todayProcEntries = procEntries.filter(p => (p.date || p.timestamp?.slice(0, 10)) === todayStr);

  const todayGrindingInputKg = todayProcEntries.reduce((s, p) => s + (Number(p.gross_raw_kg) || 0), 0);
  const todayPowderOutputKg = todayProcEntries.reduce((s, p) => s + (Number(p.net_powder_kg) || 0), 0);
  const totalGrindingInputKg = procEntries.reduce((s, p) => s + (Number(p.gross_raw_kg) || 0), 0);
  const totalPowderProducedKg = procEntries.reduce((s, p) => s + (Number(p.net_powder_kg) || 0), 0);

  // Raw Under Processing calculation:
  // A batch has issued gross raw; completed runs have yielded powder + losses.
  // In addition, if a batch has been registered with inward but has unfinished processing rounds:
  const getRawUnderProcessing = (prodName) => {
    const prodProc = procEntries.filter(p => {
      const match = (p.material_name || '').toLowerCase().includes(prodName.toLowerCase());
      return match;
    });
    // Active batch processing difference
    const totalIssued = prodProc.reduce((s, p) => s + (Number(p.gross_raw_kg) || 0), 0);
    const totalFinished = prodProc.reduce((s, p) => s + (Number(p.net_powder_kg) + Number(p.total_loss_kg || 0)), 0);
    return Math.max(0, Number((totalIssued - totalFinished).toFixed(3)));
  };

  // Section 7: Sale Data - KG ONLY (Today & Monthly)
  const salesEntries = rawRecords.sales || [];
  const todaySales = salesEntries.filter(s => (s.date || s.timestamp?.slice(0, 10)) === todayStr);
  const todayTotalSaleKg = todaySales.reduce((s, sl) => s + (Number(sl.kg_sold) || 0), 0);
  const todayHaldiSaleKg = todaySales.filter(s => (s.product_name || '').toLowerCase().includes('haldi')).reduce((s, sl) => s + (Number(sl.kg_sold) || 0), 0);
  const todayMirchiSaleKg = todaySales.filter(s => (s.product_name || '').toLowerCase().includes('mirchi')).reduce((s, sl) => s + (Number(sl.kg_sold) || 0), 0);
  const todayDhaniyaSaleKg = todaySales.filter(s => (s.product_name || '').toLowerCase().includes('dhaniya')).reduce((s, sl) => s + (Number(sl.kg_sold) || 0), 0);
  const todayUniqueOrders = new Set(todaySales.map(s => s.order_id).filter(Boolean)).size;

  // Monthly Sales (current selected month)
  const currentMonthSales = salesEntries.filter(s => (s.date || s.timestamp?.slice(0, 10) || '').startsWith(selectedMonth));
  const monthTotalSaleKg = currentMonthSales.reduce((s, sl) => s + (Number(sl.kg_sold) || 0), 0);
  const monthHaldiSaleKg = currentMonthSales.filter(s => (s.product_name || '').toLowerCase().includes('haldi')).reduce((s, sl) => s + (Number(sl.kg_sold) || 0), 0);
  const monthMirchiSaleKg = currentMonthSales.filter(s => (s.product_name || '').toLowerCase().includes('mirchi')).reduce((s, sl) => s + (Number(sl.kg_sold) || 0), 0);
  const monthDhaniyaSaleKg = currentMonthSales.filter(s => (s.product_name || '').toLowerCase().includes('dhaniya')).reduce((s, sl) => s + (Number(sl.kg_sold) || 0), 0);

  // Section 8: Today's Factory Activity
  const rawEntries = rawRecords.raw || [];
  const pkgEntries = rawRecords.pkg || [];
  const todayRawEntries = rawEntries.filter(r => (r.date || r.timestamp?.slice(0, 10)) === todayStr);
  const todayPkgEntries = pkgEntries.filter(k => (k.date || k.timestamp?.slice(0, 10)) === todayStr);

  const todayRawInwardKg = todayRawEntries.reduce((s, r) => s + (Number(r.quantity_kg) || 0), 0);
  const todayPackagingPackets = todayPkgEntries.reduce((s, k) => {
    const pkts = k.packet_quantity != null ? Number(k.packet_quantity) : Math.round(((Number(k.powder_used_kg) || 0) * 1000) / Number(k.pack_size_gm));
    return s + pkts;
  }, 0);

  // Section 9: Low Stock Alerts
  const lowStockAlerts = [];
  [
    { name: 'Haldi', current: haldi.availableRawMaterialKg, limit: lowStockLimits.Haldi },
    { name: 'Mirchi', current: mirchi.availableRawMaterialKg, limit: lowStockLimits.Mirchi },
    { name: 'Dhaniya', current: dhaniya.availableRawMaterialKg, limit: lowStockLimits.Dhaniya }
  ].forEach(p => {
    if (p.current < p.limit) {
      lowStockAlerts.push(p);
    }
  });

  // Section 10: Monthly Production Summary
  const monthRawEntries = rawEntries.filter(r => (r.date || r.timestamp?.slice(0, 10) || '').startsWith(selectedMonth));
  const monthProcEntries = procEntries.filter(p => (p.date || p.timestamp?.slice(0, 10) || '').startsWith(selectedMonth));
  const monthPkgEntries = pkgEntries.filter(k => (k.date || k.timestamp?.slice(0, 10) || '').startsWith(selectedMonth));

  const monthTotalRawInwardKg = monthRawEntries.reduce((s, r) => s + (Number(r.quantity_kg) || 0), 0);
  const monthTotalGrindingInputKg = monthProcEntries.reduce((s, p) => s + (Number(p.gross_raw_kg) || 0), 0);
  const monthTotalPowderProducedKg = monthProcEntries.reduce((s, p) => s + (Number(p.net_powder_kg) || 0), 0);
  const monthTotalPackagingPackets = monthPkgEntries.reduce((s, k) => {
    const pkts = k.packet_quantity != null ? Number(k.packet_quantity) : Math.round(((Number(k.powder_used_kg) || 0) * 1000) / Number(k.pack_size_gm));
    return s + pkts;
  }, 0);

  // Standard Pack Sizes
  const PACK_SIZES = [10, 24, 50, 100, 200, 500];

  return (
    <div className="space-y-6 pb-20 animate-fadeIn text-slate-800">
      
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-brand-950 to-slate-900 rounded-3xl p-5 sm:p-6 text-white shadow-lg border border-slate-700/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white p-1 flex items-center justify-center shrink-0 shadow-lg border border-red-200">
            <img 
              src="/logo.jpg" 
              alt="Patel Sahab Spices" 
              className="w-full h-full object-contain rounded-xl" 
            />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-bold uppercase tracking-widest text-gold-400 bg-white/10 px-2.5 py-0.5 rounded-full border border-gold-400/30">
                PATEL SAHAB SPICES
              </span>
              <span className="text-[11px] font-semibold text-slate-400 hidden sm:inline">
                Plant: Village Panwa, Khargone (M.P.)
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-1">
              ADMIN DASHBOARD
            </h2>
            <p className="text-xs sm:text-sm text-slate-300">
              Production & Inventory Overview • <span className="text-gold-300 font-medium">"सर्वे भवन्तु सुखिनः"</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start md:self-auto">
          <button
            onClick={() => setShowThresholdModal(true)}
            className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 border border-white/20"
            title="Configure Low Stock Limits"
          >
            <Sliders className="w-3.5 h-3.5 text-gold-300" />
            <span>Min Stock Limits</span>
          </button>

          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="px-3.5 py-2 bg-brand-700 hover:bg-brand-600 active:scale-95 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-md"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-gold-300 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Updating...' : 'Live Refresh'}</span>
          </button>
        </div>
      </div>

      {limitSavedMsg && (
        <div className="bg-emerald-50 border border-emerald-300 p-3 rounded-xl text-xs font-bold text-emerald-900 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Minimum stock threshold limits updated successfully!</span>
        </div>
      )}

      {/* 9. LOW STOCK ALERTS (Section 9) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <AlertTriangle className={`w-4 h-4 ${lowStockAlerts.length > 0 ? 'text-red-600' : 'text-emerald-600'}`} />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Low Stock Alerts (Raw Material Thresholds)
            </h3>
          </div>
          <button
            onClick={() => setShowThresholdModal(true)}
            className="text-[11px] font-bold text-brand-700 hover:underline"
          >
            Edit Limits
          </button>
        </div>

        <div className="mt-3">
          {lowStockAlerts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {lowStockAlerts.map(alert => (
                <div 
                  key={alert.name} 
                  className="bg-red-50 border-2 border-red-300 rounded-xl p-3.5 text-red-900 flex items-start space-x-3"
                >
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide">
                      {alert.name} – Low Stock Alert!
                    </p>
                    <p className="text-xs font-semibold mt-0.5">
                      Current Available: <span className="font-bold text-red-700">{formatIndian(alert.current, 3)} KG</span>
                    </p>
                    <p className="text-[11px] text-red-600">
                      Minimum Required: {formatIndian(alert.limit, 0)} KG
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-emerald-900 flex items-center space-x-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <p className="text-xs font-bold">
                All Raw Material Stocks Are Above Minimum Level.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 3. RAW MATERIAL AVAILABLE (Section 3 - 3 Separate Cards) */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <Package className="w-4 h-4 text-amber-700" />
            <span>Raw Material Physically Available (Future Processing)</span>
          </h3>
          <span className="text-[11px] text-slate-500 font-medium">
            Formula: Total Inward − Total Issued for Processing
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* Haldi */}
          <div className="bg-white rounded-2xl border-2 border-amber-300 p-4 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full">
                HALDI
              </span>
              <span className="text-[10px] text-slate-500 font-semibold">Unprocessed Raw</span>
            </div>
            <p className="text-3xl font-black text-slate-900 mt-2 font-mono">
              {formatIndian(haldi.availableRawMaterialKg, 3)}
              <span className="text-xs font-bold text-slate-500 ml-1">KG</span>
            </p>
            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
              <span>Inward: {formatIndian(haldi.totalRawInwardKg, 2)} KG</span>
              <span>Issued: {formatIndian(haldi.totalRawIssuedForProcessingKg, 2)} KG</span>
            </div>
          </div>

          {/* Mirchi */}
          <div className="bg-white rounded-2xl border-2 border-red-300 p-4 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-red-800 bg-red-100 px-2.5 py-0.5 rounded-full">
                MIRCHI
              </span>
              <span className="text-[10px] text-slate-500 font-semibold">Unprocessed Raw</span>
            </div>
            <p className="text-3xl font-black text-slate-900 mt-2 font-mono">
              {formatIndian(mirchi.availableRawMaterialKg, 3)}
              <span className="text-xs font-bold text-slate-500 ml-1">KG</span>
            </p>
            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
              <span>Inward: {formatIndian(mirchi.totalRawInwardKg, 2)} KG</span>
              <span>Issued: {formatIndian(mirchi.totalRawIssuedForProcessingKg, 2)} KG</span>
            </div>
          </div>

          {/* Dhaniya */}
          <div className="bg-white rounded-2xl border-2 border-emerald-300 p-4 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                DHANIYA
              </span>
              <span className="text-[10px] text-slate-500 font-semibold">Unprocessed Raw</span>
            </div>
            <p className="text-3xl font-black text-slate-900 mt-2 font-mono">
              {formatIndian(dhaniya.availableRawMaterialKg, 3)}
              <span className="text-xs font-bold text-slate-500 ml-1">KG</span>
            </p>
            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
              <span>Inward: {formatIndian(dhaniya.totalRawInwardKg, 2)} KG</span>
              <span>Issued: {formatIndian(dhaniya.totalRawIssuedForProcessingKg, 2)} KG</span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. READY POWDER STOCK (Section 5 - 3 Separate Cards) */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <Scale className="w-4 h-4 text-blue-700" />
            <span>Ready Powder Stock (Available for Packaging)</span>
          </h3>
          <span className="text-[11px] text-slate-500 font-medium">
            Formula: Total Net Powder Produced − Total Powder Used in Packaging
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* Haldi Powder */}
          <div className="bg-white rounded-2xl border border-blue-200 p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-blue-800 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                HALDI POWDER
              </span>
              <span className="text-[10px] text-slate-500 font-semibold">Ready Powder</span>
            </div>
            <p className="text-3xl font-black text-slate-900 mt-2 font-mono">
              {formatIndian(haldi.availablePowderKg, 3)}
              <span className="text-xs font-bold text-slate-500 ml-1">KG</span>
            </p>
            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
              <span>Produced: {formatIndian(haldi.powderProducedKg, 2)} KG</span>
              <span>Packed: {formatIndian(haldi.powderUsedInPackagingKg, 2)} KG</span>
            </div>
          </div>

          {/* Mirchi Powder */}
          <div className="bg-white rounded-2xl border border-red-200 p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-red-800 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-200">
                MIRCHI POWDER
              </span>
              <span className="text-[10px] text-slate-500 font-semibold">Ready Powder</span>
            </div>
            <p className="text-3xl font-black text-slate-900 mt-2 font-mono">
              {formatIndian(mirchi.availablePowderKg, 3)}
              <span className="text-xs font-bold text-slate-500 ml-1">KG</span>
            </p>
            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
              <span>Produced: {formatIndian(mirchi.powderProducedKg, 2)} KG</span>
              <span>Packed: {formatIndian(mirchi.powderUsedInPackagingKg, 2)} KG</span>
            </div>
          </div>

          {/* Dhaniya Powder */}
          <div className="bg-white rounded-2xl border border-emerald-200 p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                DHANIYA POWDER
              </span>
              <span className="text-[10px] text-slate-500 font-semibold">Ready Powder</span>
            </div>
            <p className="text-3xl font-black text-slate-900 mt-2 font-mono">
              {formatIndian(dhaniya.availablePowderKg, 3)}
              <span className="text-xs font-bold text-slate-500 ml-1">KG</span>
            </p>
            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
              <span>Produced: {formatIndian(dhaniya.powderProducedKg, 2)} KG</span>
              <span>Packed: {formatIndian(dhaniya.powderUsedInPackagingKg, 2)} KG</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. GRINDING / PROCESSING STATUS (Section 4) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <Cog className="w-4 h-4 text-brand-800" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Grinding & Processing Status (Multi-Round Support)
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 font-semibold">
            Today: {todayGrindingInputKg} KG Input • {todayPowderOutputKg} KG Powder Made
          </span>
        </div>

        {/* 4 Summary Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase">Today's Grinding Input</p>
            <p className="text-base font-black text-slate-900 font-mono mt-0.5">{formatIndian(todayGrindingInputKg, 2)} KG</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase">Today's Powder Output</p>
            <p className="text-base font-black text-blue-700 font-mono mt-0.5">{formatIndian(todayPowderOutputKg, 2)} KG</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase">Total Grinding Input</p>
            <p className="text-base font-black text-slate-900 font-mono mt-0.5">{formatIndian(totalGrindingInputKg, 2)} KG</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase">Total Powder Produced</p>
            <p className="text-base font-black text-emerald-700 font-mono mt-0.5">{formatIndian(totalPowderProducedKg, 2)} KG</p>
          </div>
        </div>

        {/* Product-wise Processing Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3">Product</th>
                <th className="py-2.5 px-3 text-right">Raw Issued (Gross KG)</th>
                <th className="py-2.5 px-3 text-right">Raw Under Processing (KG)</th>
                <th className="py-2.5 px-3 text-right">Powder Produced (KG)</th>
                <th className="py-2.5 px-3 text-right">Grinding Loss (KG)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
              {[
                { name: 'Haldi', p: haldi },
                { name: 'Mirchi', p: mirchi },
                { name: 'Dhaniya', p: dhaniya }
              ].map(item => (
                <tr key={item.name} className="hover:bg-slate-50/80">
                  <td className="py-2.5 px-3 font-bold text-slate-900">{item.name}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-700">{formatIndian(item.p.totalRawIssuedForProcessingKg, 2)} KG</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-700">{formatIndian(getRawUnderProcessing(item.name), 2)} KG</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-700">{formatIndian(item.p.powderProducedKg, 2)} KG</td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-500">{formatIndian(item.p.totalLossKg, 2)} KG</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. FINISHED PACKET STOCK (Section 6 - Matrix Table) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <Boxes className="w-4 h-4 text-purple-700" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Finished Packet Stock Matrix (Packets Available = Produced − Sold)
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 font-semibold">
            All 6 Retail Pack Sizes
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-center text-xs">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3 text-left">Product</th>
                {PACK_SIZES.map(s => (
                  <th key={s} className="py-2.5 px-3">{s}g</th>
                ))}
                <th className="py-2.5 px-3 text-right">Total Packets</th>
                <th className="py-2.5 px-3 text-right">Total KG</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono font-semibold text-slate-700">
              {[
                { name: 'Haldi', p: haldi },
                { name: 'Mirchi', p: mirchi },
                { name: 'Dhaniya', p: dhaniya }
              ].map(item => {
                const stockMap = {};
                item.p.packSizeStock.forEach(s => { stockMap[s.packSizeGm] = s.remainingPackets; });
                return (
                  <tr key={item.name} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-3 text-left font-sans font-bold text-slate-900">{item.name}</td>
                    {PACK_SIZES.map(s => {
                      const count = stockMap[s] || 0;
                      return (
                        <td key={s} className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded font-bold ${count > 0 ? 'bg-purple-50 text-purple-900 border border-purple-200' : 'text-slate-400'}`}>
                            {formatIndianInt(count)}
                          </span>
                        </td>
                      );
                    })}
                    <td className="py-2.5 px-3 text-right font-bold text-brand-900">{formatIndianInt(item.p.totalFinishedPackets)}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-700">{formatIndian(item.p.totalFinishedStockKg, 2)} KG</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 7. SALE DATA – KG ONLY (Section 7) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <ShoppingBag className="w-4 h-4 text-emerald-700" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Factory Sales Data (Strictly in KG — No Rates or Financials)
            </h3>
          </div>
          <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            Physical Dispatches Only
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Today's Sale Card */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                Today's Sales ({todayStr})
              </span>
              <span className="text-[11px] font-bold bg-white text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                {todayUniqueOrders} Unique Orders
              </span>
            </div>

            <div className="bg-white rounded-xl p-3 border border-slate-200 text-center">
              <p className="text-[10px] font-bold text-slate-500 uppercase">Today's Total Sale</p>
              <p className="text-3xl font-black text-emerald-700 font-mono mt-0.5">
                {formatIndian(todayTotalSaleKg, 3)} <span className="text-xs text-slate-500 font-sans">KG</span>
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <p className="text-[10px] font-semibold text-slate-500">Haldi</p>
                <p className="font-mono font-bold text-slate-900 mt-0.5">{formatIndian(todayHaldiSaleKg, 2)} KG</p>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <p className="text-[10px] font-semibold text-slate-500">Mirchi</p>
                <p className="font-mono font-bold text-slate-900 mt-0.5">{formatIndian(todayMirchiSaleKg, 2)} KG</p>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <p className="text-[10px] font-semibold text-slate-500">Dhaniya</p>
                <p className="font-mono font-bold text-slate-900 mt-0.5">{formatIndian(todayDhaniyaSaleKg, 2)} KG</p>
              </div>
            </div>
          </div>

          {/* Monthly Sale Card */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                Monthly Sales ({selectedMonth})
              </span>
              <span className="text-[11px] font-bold bg-white text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                Selected Month
              </span>
            </div>

            <div className="bg-white rounded-xl p-3 border border-slate-200 text-center">
              <p className="text-[10px] font-bold text-slate-500 uppercase">This Month's Total Sale</p>
              <p className="text-3xl font-black text-blue-700 font-mono mt-0.5">
                {formatIndian(monthTotalSaleKg, 3)} <span className="text-xs text-slate-500 font-sans">KG</span>
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <p className="text-[10px] font-semibold text-slate-500">Haldi</p>
                <p className="font-mono font-bold text-slate-900 mt-0.5">{formatIndian(monthHaldiSaleKg, 2)} KG</p>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <p className="text-[10px] font-semibold text-slate-500">Mirchi</p>
                <p className="font-mono font-bold text-slate-900 mt-0.5">{formatIndian(monthMirchiSaleKg, 2)} KG</p>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <p className="text-[10px] font-semibold text-slate-500">Dhaniya</p>
                <p className="font-mono font-bold text-slate-900 mt-0.5">{formatIndian(monthDhaniyaSaleKg, 2)} KG</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 8. TODAY'S FACTORY ACTIVITY (Section 8 - 4 Summary Cards + Powder Output) */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-brand-800" />
            <span>Today's Factory Activity ({todayStr} • Asia/Kolkata)</span>
          </h3>
          <span className="text-[11px] text-slate-500 font-semibold">
            Today's Powder Output: {formatIndian(todayPowderOutputKg, 2)} KG
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          {/* 1. Raw Inward */}
          <div className="bg-white rounded-2xl border border-amber-200 p-4 shadow-xs">
            <p className="text-[11px] font-bold text-amber-700 uppercase">1. Raw Inward</p>
            <p className="text-2xl font-black text-slate-900 font-mono mt-1">
              {formatIndian(todayRawInwardKg, 2)}
              <span className="text-xs font-bold text-slate-500 ml-1">KG</span>
            </p>
            <p className="text-[10px] text-slate-500 mt-1">{todayRawEntries.length} Inward Deliveries</p>
          </div>

          {/* 2. Processing Input */}
          <div className="bg-white rounded-2xl border border-blue-200 p-4 shadow-xs">
            <p className="text-[11px] font-bold text-blue-700 uppercase">2. Grinding Input</p>
            <p className="text-2xl font-black text-slate-900 font-mono mt-1">
              {formatIndian(todayGrindingInputKg, 2)}
              <span className="text-xs font-bold text-slate-500 ml-1">KG</span>
            </p>
            <p className="text-[10px] text-slate-500 mt-1">Powder Output: {formatIndian(todayPowderOutputKg, 2)} KG</p>
          </div>

          {/* 3. Packaging Production */}
          <div className="bg-white rounded-2xl border border-purple-200 p-4 shadow-xs">
            <p className="text-[11px] font-bold text-purple-700 uppercase">3. Packaging Output</p>
            <p className="text-2xl font-black text-slate-900 font-mono mt-1">
              {formatIndianInt(todayPackagingPackets)}
              <span className="text-xs font-bold text-slate-500 ml-1">Pkts</span>
            </p>
            <p className="text-[10px] text-slate-500 mt-1">{todayPkgEntries.length} Packaging Runs</p>
          </div>

          {/* 4. Sales */}
          <div className="bg-white rounded-2xl border border-emerald-200 p-4 shadow-xs">
            <p className="text-[11px] font-bold text-emerald-700 uppercase">4. Factory Sales</p>
            <p className="text-2xl font-black text-slate-900 font-mono mt-1">
              {formatIndian(todayTotalSaleKg, 2)}
              <span className="text-xs font-bold text-slate-500 ml-1">KG</span>
            </p>
            <p className="text-[10px] text-slate-500 mt-1">{todayUniqueOrders} Unique Orders</p>
          </div>
        </div>
      </div>

      {/* 10. MONTHLY PRODUCTION SUMMARY (Section 10) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-brand-800" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Monthly Production Summary ({selectedMonth})
            </h3>
          </div>

          <div className="flex items-center space-x-2">
            <label className="text-xs font-bold text-slate-600">Select Month:</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand-900"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200 text-center">
            <p className="text-[10px] font-bold text-amber-800 uppercase">Raw Inward</p>
            <p className="text-lg font-black text-slate-900 font-mono mt-1">{formatIndian(monthTotalRawInwardKg, 2)} KG</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{monthRawEntries.length} entries</p>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <p className="text-[10px] font-bold text-slate-600 uppercase">Grinding Input</p>
            <p className="text-lg font-black text-slate-900 font-mono mt-1">{formatIndian(monthTotalGrindingInputKg, 2)} KG</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{monthProcEntries.length} runs</p>
          </div>

          <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-200 text-center">
            <p className="text-[10px] font-bold text-blue-800 uppercase">Powder Produced</p>
            <p className="text-lg font-black text-blue-900 font-mono mt-1">{formatIndian(monthTotalPowderProducedKg, 2)} KG</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Yield: {monthTotalGrindingInputKg > 0 ? ((monthTotalPowderProducedKg / monthTotalGrindingInputKg) * 100).toFixed(1) : 0}%</p>
          </div>

          <div className="p-3 rounded-xl bg-purple-50/60 border border-purple-200 text-center">
            <p className="text-[10px] font-bold text-purple-800 uppercase">Packets Packed</p>
            <p className="text-lg font-black text-purple-900 font-mono mt-1">{formatIndianInt(monthTotalPackagingPackets)}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{monthPkgEntries.length} batches</p>
          </div>

          <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200 text-center col-span-2 sm:col-span-1">
            <p className="text-[10px] font-bold text-emerald-800 uppercase">Total Sales</p>
            <p className="text-lg font-black text-emerald-900 font-mono mt-1">{formatIndian(monthTotalSaleKg, 2)} KG</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{new Set(currentMonthSales.map(s => s.order_id).filter(Boolean)).size} orders</p>
          </div>
        </div>
      </div>

      {/* Threshold Modal */}
      {showThresholdModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-900 uppercase">Configure Low Stock Limits</h4>
                <p className="text-xs text-slate-500">Alert triggers when raw stock falls below these KG limits</p>
              </div>
            </div>

            <form onSubmit={handleSaveLimits} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Haldi Minimum KG
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={editLimits.Haldi}
                  onChange={(e) => setEditLimits(prev => ({ ...prev, Haldi: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Mirchi Minimum KG
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={editLimits.Mirchi}
                  onChange={(e) => setEditLimits(prev => ({ ...prev, Mirchi: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Dhaniya Minimum KG
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={editLimits.Dhaniya}
                  onChange={(e) => setEditLimits(prev => ({ ...prev, Dhaniya: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowThresholdModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-brand-900 hover:bg-brand-800 text-white font-bold rounded-xl text-xs"
                >
                  Save Limits
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
