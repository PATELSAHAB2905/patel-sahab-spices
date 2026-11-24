import React, { useState, useEffect } from 'react';
import { 
  RotateCcw, 
  PackageCheck, 
  AlertOctagon, 
  Calendar, 
  Hash, 
  User, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  Filter, 
  ArrowRight, 
  Clock, 
  FileText, 
  CheckSquare, 
  Sparkles,
  Layers,
  ChevronDown
} from 'lucide-react';
import { getDB } from '../services/db';
import { 
  generateReturnId, 
  validateSalesReturn, 
  getTodayDateStr, 
  getFinishedStockSummary, 
  completePowderRecovery,
  isRecordActive
} from '../services/inventoryEngine';
import { queueRecordForSync } from '../services/syncService';
import { logSystemError } from '../services/errorLogger';

const STANDARD_PRODUCTS = ['Haldi', 'Mirchi', 'Dhaniya', 'Jeera', 'Garam Masala'];
const PACK_SIZES = [10, 24, 50, 100, 200, 500];
const RETURN_REASONS = [
  'Packaging Damaged / Torn',
  'Expired / Near Expiry',
  'Quality Concern / Moisture',
  'Customer / Market Return',
  'Excess Stock Returned',
  'Seal Leakage / Defective Pouch',
  'Other'
];

export default function SalesReturnModule({ currentEmployee, onComplete, userRole = 'employee' }) {
  const [activeTab, setActiveTab] = useState('new_return'); // 'new_return' | 'history' | 'pending_recovery'
  
  // Form State
  const [returnId, setReturnId] = useState('');
  const [returnDate, setReturnDate] = useState(getTodayDateStr());
  const [orderId, setOrderId] = useState('');
  const [productName, setProductName] = useState('Haldi');
  const [batchId, setBatchId] = useState('');
  const [packSizeGm, setPackSizeGm] = useState(100);
  const [returnedPackets, setReturnedPackets] = useState('');
  const [reusablePackets, setReusablePackets] = useState('');
  const [rejectedPackets, setRejectedPackets] = useState('');
  const [returnReason, setReturnReason] = useState(RETURN_REASONS[0]);
  const [remarks, setRemarks] = useState('');
  
  // Data lists
  const [availableBatches, setAvailableBatches] = useState([]);
  const [recentReturns, setRecentReturns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  
  // Powder Recovery Modal state
  const [recoveryTarget, setRecoveryTarget] = useState(null);
  const [actualRecoveredKg, setActualRecoveredKg] = useState('');
  const [recoveryNotes, setRecoveryNotes] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  // Search & Filter state for history
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilterProduct, setHistoryFilterProduct] = useState('ALL');

  useEffect(() => {
    initForm();
    loadInventoryAndReturns();
  }, []);

  const initForm = () => {
    setReturnId(generateReturnId());
    setReturnDate(getTodayDateStr());
    setOrderId('');
    setReturnedPackets('');
    setReusablePackets('');
    setRejectedPackets('');
    setRemarks('');
    setErrorMsg(null);
  };

  const loadInventoryAndReturns = async () => {
    try {
      const db = await getDB();
      // Load finished stock batches
      const finished = await getFinishedStockSummary();
      const batches = Array.from(new Set(finished.allItems.map(i => i.batchId))).filter(Boolean);
      setAvailableBatches(batches);
      if (batches.length > 0 && !batchId) {
        setBatchId(batches[0]);
      }

      // Load return entries
      if (db.objectStoreNames.contains('sales_return')) {
        const returns = await db.getAll('sales_return');
        setRecentReturns(returns.sort((a, b) => new Date(b.date || b.timestamp) - new Date(a.date || a.timestamp)));
      }
    } catch (err) {
      console.warn('Error loading return data:', err);
    }
  };

  // Auto calculate when returned packets change
  const handleReturnedPacketsChange = (val) => {
    setReturnedPackets(val);
    const num = parseInt(val, 10) || 0;
    // Default split: all rejected for safety unless specified
    setRejectedPackets(String(num));
    setReusablePackets('0');
  };

  const handleReusableChange = (val) => {
    setReusablePackets(val);
    const total = parseInt(returnedPackets, 10) || 0;
    const reus = parseInt(val, 10) || 0;
    const rej = Math.max(0, total - reus);
    setRejectedPackets(String(rej));
  };

  const handleRejectedChange = (val) => {
    setRejectedPackets(val);
    const total = parseInt(returnedPackets, 10) || 0;
    const rej = parseInt(val, 10) || 0;
    const reus = Math.max(0, total - rej);
    setReusablePackets(String(reus));
  };

  // Estimated powder recovery in KG
  const estimatedPowderKg = Number((((parseInt(rejectedPackets, 10) || 0) * Number(packSizeGm)) / 1000).toFixed(3));

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);

    const retPkts = parseInt(returnedPackets, 10) || 0;
    const reusPkts = parseInt(reusablePackets, 10) || 0;
    const rejPkts = parseInt(rejectedPackets, 10) || 0;

    if (retPkts <= 0) {
      setErrorMsg('Total returned packets must be greater than 0.');
      return;
    }

    if (reusPkts + rejPkts !== retPkts) {
      setErrorMsg(`Reusable packets (${reusPkts}) + Rejected packets (${rejPkts}) must equal Total (${retPkts}).`);
      return;
    }

    // Validate using engine
    try {
      setLoading(true);
      const validation = await validateSalesReturn({
        orderId: orderId.trim(),
        batchId: batchId.trim(),
        packSizeGm: Number(packSizeGm),
        returnedPackets: retPkts,
        reusablePackets: reusPkts,
        rejectedPackets: rejPkts
      });

      if (!validation.valid) {
        setErrorMsg(validation.error);
        setLoading(false);
        return;
      }

      setShowConfirmModal(true);
    } catch (err) {
      setErrorMsg(err.message || 'Validation error');
    } finally {
      setLoading(false);
    }
  };

  const confirmSaveReturn = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const db = await getDB();
      const retPkts = parseInt(returnedPackets, 10) || 0;
      const reusPkts = parseInt(reusablePackets, 10) || 0;
      const rejPkts = parseInt(rejectedPackets, 10) || 0;
      const sizeGm = Number(packSizeGm);
      const estPowderKg = Number(((rejPkts * sizeGm) / 1000).toFixed(3));

      const newReturnRecord = {
        return_id: returnId || generateReturnId(),
        date: returnDate,
        timestamp: new Date().toISOString(),
        order_id: orderId ? orderId.trim().toUpperCase() : null,
        is_unlinked_return: !orderId.trim(),
        product_name: productName,
        batch_id: batchId.trim().toUpperCase(),
        pack_size_gm: sizeGm,
        returned_packets: retPkts,
        reusable_packets: reusPkts,
        rejected_packets: rejPkts,
        estimated_powder_kg: estPowderKg,
        actual_recovered_powder_kg: 0,
        return_reason: returnReason,
        remarks: remarks ? remarks.trim() : '',
        received_by: currentEmployee?.name || 'Staff',
        employee_id: currentEmployee?.employee_id || currentEmployee?.id || 'STAFF',
        status: rejPkts > 0 ? 'PENDING_RECOVERY' : 'RESTOCKED',
        recovery_id: null,
        is_reversed: false,
        synced: false
      };

      // 1. Save locally to sales_return store
      const id = await db.add('sales_return', newReturnRecord);
      newReturnRecord.id = id;

      // 2. Queue for Firebase sync
      try {
        await queueRecordForSync('sales_return', newReturnRecord, 'CREATE');
      } catch (syncErr) {
        console.warn('Sync queue error:', syncErr);
      }

      // 3. Write to audit log
      try {
        await db.add('audit_logs', {
          timestamp: new Date().toISOString(),
          module: 'SALES_RETURN',
          action: 'CREATE_RETURN',
          performed_by: currentEmployee?.name || 'Staff',
          target_id: newReturnRecord.return_id,
          details: `Logged return ${newReturnRecord.return_id}: ${retPkts} pkts of ${productName} (Batch ${newReturnRecord.batch_id}, ${sizeGm}g). Reusable: ${reusPkts}, Rejected: ${rejPkts}`
        });
      } catch {}

      setShowConfirmModal(false);
      setSuccessMsg(`Return record ${newReturnRecord.return_id} saved successfully! ${reusPkts} reusable packets added back to finished stock.`);
      
      initForm();
      await loadInventoryAndReturns();

      if (onComplete) onComplete();
    } catch (err) {
      console.error('Failed to save return:', err);
      setErrorMsg(err.message || 'Failed to save return record.');
      await logSystemError({
        module: 'RETURN',
        description: `Failed to save return record: ${err.message}`,
        severity: 'HIGH',
        errorObj: err
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteRecovery = async (e) => {
    e.preventDefault();
    if (!recoveryTarget) return;

    const actualKg = parseFloat(actualRecoveredKg);
    if (isNaN(actualKg) || actualKg <= 0) {
      setErrorMsg('Please enter a valid actual recovered powder quantity greater than 0 KG.');
      return;
    }

    setRecoveryLoading(true);
    try {
      await completePowderRecovery({
        returnId: recoveryTarget.return_id,
        actualRecoveredPowderKg: actualKg,
        notes: recoveryNotes,
        adminName: currentEmployee?.name || 'Authorized Staff'
      });

      setSuccessMsg(`Powder recovery completed! ${actualKg.toFixed(3)} KG added to available powder stock for Batch ${recoveryTarget.batch_id}.`);
      setRecoveryTarget(null);
      setActualRecoveredKg('');
      setRecoveryNotes('');
      await loadInventoryAndReturns();
      if (onComplete) onComplete();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to complete powder recovery.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const pendingRecoveries = recentReturns.filter(r => isRecordActive(r) && r.status === 'PENDING_RECOVERY' && (r.rejected_packets || 0) > 0);

  const filteredHistory = recentReturns.filter(r => {
    if (historyFilterProduct !== 'ALL' && r.product_name !== historyFilterProduct) return false;
    if (historySearch) {
      const q = historySearch.toLowerCase();
      const matchId = (r.return_id || '').toLowerCase().includes(q);
      const matchBatch = (r.batch_id || '').toLowerCase().includes(q);
      const matchOrder = (r.order_id || '').toLowerCase().includes(q);
      const matchReason = (r.return_reason || '').toLowerCase().includes(q);
      return matchId || matchBatch || matchOrder || matchReason;
    }
    return true;
  });

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4 sm:space-y-6">

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-brand-900 via-brand-800 to-amber-900 rounded-3xl p-4 sm:p-6 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <div className="flex items-center space-x-2 text-gold-300 text-xs font-black uppercase tracking-widest mb-1">
              <RotateCcw className="w-4 h-4 text-gold-400" />
              <span>Factory Inventory Operations</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight">Sales Return / Old Stock Return</h1>
            <p className="text-xs text-brand-100 mt-0.5">
              Log returned packets, reclassify good condition vs rejected packets, and recover spice powder.
            </p>
          </div>

          {/* Quick tab switcher */}
          <div className="flex bg-black/30 p-1 rounded-2xl border border-white/10 text-xs font-bold w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('new_return')}
              className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-xl transition flex items-center justify-center space-x-1.5 ${
                activeTab === 'new_return' ? 'bg-gold-400 text-brand-950 font-black shadow' : 'text-white/80 hover:text-white'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>New Return</span>
            </button>
            <button
              onClick={() => setActiveTab('pending_recovery')}
              className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-xl transition flex items-center justify-center space-x-1.5 relative ${
                activeTab === 'pending_recovery' ? 'bg-gold-400 text-brand-950 font-black shadow' : 'text-white/80 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Powder Recovery</span>
              {pendingRecoveries.length > 0 && (
                <span className="ml-1 bg-red-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-black">
                  {pendingRecoveries.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-xl transition flex items-center justify-center space-x-1.5 ${
                activeTab === 'history' ? 'bg-gold-400 text-brand-950 font-black shadow' : 'text-white/80 hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>History</span>
            </button>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-800 text-xs flex items-start space-x-2.5 animate-fadeIn">
          <AlertOctagon className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong className="font-bold">Attention:</strong> {errorMsg}
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-700 font-black text-sm">×</button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-start space-x-2.5 animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong className="font-bold">Success:</strong> {successMsg}
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-700 font-black text-sm">×</button>
        </div>
      )}

      {/* TAB 1: NEW RETURN ENTRY FORM */}
      {activeTab === 'new_return' && (
        <div className="bg-white rounded-3xl p-4 sm:p-6 shadow-md border border-slate-200">
          <form onSubmit={handleFormSubmit} className="space-y-4 sm:space-y-5">
            
            {/* Auto Fields Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider flex items-center space-x-1">
                  <Hash className="w-3.5 h-3.5 text-slate-400" />
                  <span>Return ID</span>
                </label>
                <div className="font-mono font-bold text-slate-900 mt-0.5">{returnId || 'Generating...'}</div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider flex items-center space-x-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Return Date</span>
                </label>
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-semibold text-slate-800 mt-0.5"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider flex items-center space-x-1">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span>Received By</span>
                </label>
                <div className="font-bold text-slate-900 mt-0.5 truncate">
                  {currentEmployee?.name || 'Authorized Staff'}
                  <span className="text-[10px] font-mono text-slate-500 ml-1">({currentEmployee?.employee_id || 'ID'})</span>
                </div>
              </div>
            </div>

            {/* Product & Batch Select */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Product Name <span className="text-red-500">*</span>
                </label>
                <select
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-2xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {STANDARD_PRODUCTS.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Batch ID <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={batchId}
                    onChange={(e) => setBatchId(e.target.value.toUpperCase())}
                    placeholder="e.g. HAL-001"
                    list="batch-suggestions"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-2xl font-mono text-xs font-bold text-slate-800 uppercase focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <datalist id="batch-suggestions">
                    {availableBatches.map(b => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Pack Size <span className="text-red-500">*</span>
                </label>
                <select
                  value={packSizeGm}
                  onChange={(e) => setPackSizeGm(Number(e.target.value))}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-2xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {PACK_SIZES.map(s => (
                    <option key={s} value={s}>{s} GM</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Optional Order ID (Shop Name is NOT required) */}
            <div className="p-3.5 bg-brand-50/50 border border-brand-100 rounded-2xl space-y-1">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                Original Order ID <span className="text-slate-400 font-normal lowercase">(optional - if available)</span>
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value.toUpperCase())}
                  placeholder="e.g. ORD-20261118-1234 (Leave blank if unknown / old market stock)"
                  className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-800 uppercase focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Shop name is not required. Returns are tracked against company inventory & batch records.
              </p>
            </div>

            {/* Quantities & Packet Reclassification */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                  <PackageCheck className="w-4 h-4 text-emerald-600" />
                  <span>Packet Quantities & Quality Reclassification</span>
                </span>
                <span className="text-[11px] font-mono text-slate-500">Pack: {packSizeGm} GM</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 1. Total Returned Packets */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Total Returned Packets <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={returnedPackets}
                    onChange={(e) => handleReturnedPacketsChange(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2.5 bg-white border-2 border-slate-300 rounded-2xl text-center text-lg font-black font-mono text-slate-900 focus:outline-none focus:border-brand-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block text-center">Total physical count</span>
                </div>

                {/* 2. Reusable Packets */}
                <div>
                  <label className="block text-[11px] font-bold text-emerald-800 uppercase mb-1 flex items-center justify-between">
                    <span>Reusable Packets</span>
                    <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 rounded">Restock</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={reusablePackets}
                    onChange={(e) => handleReusableChange(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2.5 bg-white border-2 border-emerald-300 rounded-2xl text-center text-lg font-black font-mono text-emerald-900 focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-emerald-600 mt-0.5 block text-center">Good condition; back to finished stock</span>
                </div>

                {/* 3. Rejected Packets */}
                <div>
                  <label className="block text-[11px] font-bold text-red-800 uppercase mb-1 flex items-center justify-between">
                    <span>Rejected Packets</span>
                    <span className="text-[9px] bg-red-100 text-red-800 px-1.5 rounded">Powder Recovery</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={rejectedPackets}
                    onChange={(e) => handleRejectedChange(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2.5 bg-white border-2 border-red-300 rounded-2xl text-center text-lg font-black font-mono text-red-900 focus:outline-none focus:border-red-500"
                  />
                  <span className="text-[10px] text-red-600 mt-0.5 block text-center">Damaged/expired; sent for recovery</span>
                </div>
              </div>

              {/* Dynamic Powder Recovery Preview */}
              {estimatedPowderKg > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    <span>Estimated Powder from Rejected Packets:</span>
                  </div>
                  <div className="font-mono font-black text-amber-950">
                    {estimatedPowderKg.toFixed(3)} KG
                  </div>
                </div>
              )}
            </div>

            {/* Return Reason & Remarks */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Return Reason <span className="text-red-500">*</span>
                </label>
                <select
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-2xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {RETURN_REASONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Remarks / Quality Notes <span className="text-slate-400 font-normal lowercase">(optional)</span>
                </label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. Outer carton crushed during transit"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-2xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-brand-900 hover:bg-brand-800 active:scale-98 text-gold-300 font-black text-sm uppercase tracking-wider rounded-2xl shadow-lg transition flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-gold-300 border-t-transparent rounded-full animate-spin"></div>
                    <span>Validating Return...</span>
                  </>
                ) : (
                  <>
                    <CheckSquare className="w-5 h-5 text-gold-400" />
                    <span>Review & Save Return Entry</span>
                  </>
                )}
              </button>
            </div>

          </form>
        </div>
      )}

      {/* TAB 2: PENDING POWDER RECOVERY */}
      {activeTab === 'pending_recovery' && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-4 sm:p-6 shadow-md border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-900">Pending Powder Recovery Queue</h3>
                <p className="text-xs text-slate-500">
                  Physical crushing and extraction of spice powder from rejected/damaged packets.
                </p>
              </div>
              <span className="px-3 py-1 bg-amber-100 text-amber-900 font-black text-xs rounded-full">
                {pendingRecoveries.length} Pending
              </span>
            </div>

            {pendingRecoveries.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500/50" />
                <p className="text-xs font-semibold text-slate-600">All returned packets have completed powder recovery!</p>
                <p className="text-[11px] text-slate-400">New returns with rejected packets will automatically queue here.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 mt-3">
                {pendingRecoveries.map(item => (
                  <div key={item.return_id} className="py-3.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 hover:bg-slate-50 p-3 rounded-2xl transition">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-xs text-brand-900 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                          {item.return_id}
                        </span>
                        <span className="font-bold text-xs text-slate-800">{item.product_name}</span>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-mono">
                          Batch: {item.batch_id}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>Rejected: <strong>{item.rejected_packets} pkts</strong> ({item.pack_size_gm}g)</span>
                        <span>Est. Powder: <strong>{item.estimated_powder_kg} KG</strong></span>
                        <span className="text-slate-400">Date: {item.date}</span>
                        {item.return_reason && <span className="text-amber-700 italic">"{item.return_reason}"</span>}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setRecoveryTarget(item);
                        setActualRecoveredKg(String(item.estimated_powder_kg || ''));
                        setErrorMsg(null);
                      }}
                      className="px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-bold text-xs rounded-xl shadow transition flex items-center space-x-1.5 shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-gold-300" />
                      <span>Record Actual Recovery</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: RETURN HISTORY */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-3xl p-4 sm:p-6 shadow-md border border-slate-200 space-y-4">
          
          {/* Search & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row gap-2.5 justify-between">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search Return ID, Batch ID, Order ID, Reason..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="flex gap-2">
              <select
                value={historyFilterProduct}
                onChange={(e) => setHistoryFilterProduct(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
              >
                <option value="ALL">All Products</option>
                {STANDARD_PRODUCTS.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Table / Mobile Cards */}
          {filteredHistory.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No sales return entries match your search criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <th className="p-2.5">Return ID</th>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Product / Batch</th>
                    <th className="p-2.5 text-center">Returned</th>
                    <th className="p-2.5 text-center">Reusable</th>
                    <th className="p-2.5 text-center">Rejected</th>
                    <th className="p-2.5 text-right">Powder Recov (KG)</th>
                    <th className="p-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredHistory.map(r => {
                    const isReversed = r.is_reversed || r.status === 'REVERSED';
                    return (
                      <tr key={r.return_id} className={`hover:bg-slate-50/70 transition ${isReversed ? 'opacity-40 bg-red-50/20' : ''}`}>
                        <td className="p-2.5 font-mono font-bold text-brand-900">
                          {r.return_id}
                          {isReversed && (
                            <span className="block text-[9px] text-red-600 font-bold">REVERSED</span>
                          )}
                        </td>
                        <td className="p-2.5 text-slate-600 whitespace-nowrap">{r.date}</td>
                        <td className="p-2.5">
                          <div className="font-bold text-slate-900">{r.product_name}</div>
                          <div className="text-[10px] font-mono text-slate-500">
                            Batch: {r.batch_id} • {r.pack_size_gm}g
                          </div>
                        </td>
                        <td className="p-2.5 text-center font-mono font-bold text-slate-900">
                          {r.returned_packets}
                        </td>
                        <td className="p-2.5 text-center font-mono font-bold text-emerald-700">
                          {r.reusable_packets || 0}
                        </td>
                        <td className="p-2.5 text-center font-mono font-bold text-red-700">
                          {r.rejected_packets || 0}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold">
                          {r.actual_recovered_powder_kg > 0 ? (
                            <span className="text-emerald-700">{r.actual_recovered_powder_kg} KG</span>
                          ) : r.estimated_powder_kg > 0 ? (
                            <span className="text-amber-700 italic">~{r.estimated_powder_kg} KG (Est)</span>
                          ) : (
                            <span className="text-slate-400">0 KG</span>
                          )}
                        </td>
                        <td className="p-2.5 text-center whitespace-nowrap">
                          {r.status === 'RECOVERY_COMPLETED' ? (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">
                              Recovered
                            </span>
                          ) : r.status === 'PENDING_RECOVERY' ? (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-full">
                              Pending Rec.
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded-full">
                              {r.status || 'Completed'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center space-x-2.5 text-brand-900 pb-3 border-b border-slate-100">
              <CheckSquare className="w-5 h-5 text-emerald-600" />
              <h3 className="text-base font-black uppercase">Confirm Return Entry</h3>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Return ID:</span>
                <span className="font-mono font-bold text-slate-900">{returnId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Product & Batch:</span>
                <span className="font-bold text-slate-900">{productName} (Batch {batchId}, {packSizeGm} GM)</span>
              </div>
              {orderId && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Original Order:</span>
                  <span className="font-mono text-slate-900">{orderId}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-2 font-bold text-slate-900">
                <span>Total Returned:</span>
                <span className="font-mono text-base">{returnedPackets} Packets</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-semibold pl-2">
                <span>• Reusable Packets (Restock):</span>
                <span className="font-mono">+{reusablePackets} Packets</span>
              </div>
              <div className="flex justify-between text-red-700 font-semibold pl-2">
                <span>• Rejected Packets (Recovery):</span>
                <span className="font-mono">{rejectedPackets} Packets (~{estimatedPowderKg} KG)</span>
              </div>
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs uppercase"
              >
                Back & Edit
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={confirmSaveReturn}
                className="flex-1 py-2.5 bg-brand-900 hover:bg-brand-800 text-gold-300 font-black rounded-xl text-xs uppercase shadow transition"
              >
                {loading ? 'Saving...' : 'Confirm & Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POWDER RECOVERY RECORD MODAL */}
      {recoveryTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center space-x-2.5 text-amber-900 pb-3 border-b border-slate-100">
              <Sparkles className="w-5 h-5 text-amber-600" />
              <h3 className="text-base font-black uppercase">Record Powder Recovery</h3>
            </div>

            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs space-y-1 text-amber-950">
              <div className="font-bold">{recoveryTarget.product_name} • Batch {recoveryTarget.batch_id}</div>
              <div className="text-[11px] text-amber-800">
                Return ID: <span className="font-mono font-semibold">{recoveryTarget.return_id}</span>
              </div>
              <div className="text-[11px] text-amber-800">
                Rejected Packets: <strong>{recoveryTarget.rejected_packets} pkts</strong> ({recoveryTarget.pack_size_gm} GM)
              </div>
              <div className="text-[11px] text-amber-800">
                Estimated Powder: <strong>{recoveryTarget.estimated_powder_kg} KG</strong>
              </div>
            </div>

            <form onSubmit={handleCompleteRecovery} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Actual Powder Recovered (KG) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  required
                  autoFocus
                  value={actualRecoveredKg}
                  onChange={(e) => setActualRecoveredKg(e.target.value)}
                  placeholder="0.000"
                  className="w-full px-3 py-2.5 bg-white border-2 border-slate-300 rounded-2xl font-mono text-center text-xl font-black text-slate-900 focus:outline-none focus:border-amber-500"
                />
                <span className="text-[10px] text-slate-500 mt-1 block text-center">
                  * Enter the exact weighed powder quantity in KG. This amount will be added to available powder stock.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Recovery Notes / Staff Observation <span className="text-slate-400 font-normal lowercase">(optional)</span>
                </label>
                <input
                  type="text"
                  value={recoveryNotes}
                  onChange={(e) => setRecoveryNotes(e.target.value)}
                  placeholder="e.g. Sieved through 60 mesh, moisture normal"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800"
                />
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRecoveryTarget(null)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={recoveryLoading}
                  className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-xl text-xs uppercase shadow transition"
                >
                  {recoveryLoading ? 'Saving...' : 'Add Powder to Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
