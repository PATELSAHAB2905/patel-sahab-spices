import React, { useState, useEffect } from 'react';
import { 
  Cog, 
  Search, 
  Calendar, 
  Scale, 
  Layers, 
  AlertCircle, 
  CheckCircle2, 
  Plus, 
  ArrowRight,
  TrendingDown,
  Info
} from 'lucide-react';
import { getDB } from '../services/db';
import { 
  generateEntryId, 
  getTodayDateStr, 
  getRawMaterialStockSummary, 
  getNextProcessingRound 
} from '../services/inventoryEngine';
import { queueSyncRecord } from '../services/syncService';

export default function ProcessingModule({ activeEmployee, onOpenEmployeeModal }) {
  const [availableBatches, setAvailableBatches] = useState([]);
  const [selectedBatchData, setSelectedBatchData] = useState(null);
  const [history, setHistory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBatchFilter, setSelectedBatchFilter] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    entryId: '',
    date: getTodayDateStr(),
    batchId: '',
    materialName: '',
    roundNumber: 1,
    grossRawKg: '',
    netRawKg: '',
    cleaningWasteKg: 0,
    netPowderKg: '',
    grindingLossKg: 0,
    totalLossKg: 0,
    remarks: '',
  });

  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const summary = await getRawMaterialStockSummary();
      setAvailableBatches(summary.availableBatches);

      if (summary.availableBatches.length > 0) {
        await selectBatch(summary.availableBatches[0].batchId, summary.availableBatches);
      } else {
        setFormData(prev => ({
          ...prev,
          entryId: generateEntryId('PRC'),
          batchId: '',
          materialName: '',
          roundNumber: 1
        }));
      }

      await loadHistory();
    } catch (err) {
      console.error('Failed to init processing:', err);
    }
  };

  const loadHistory = async () => {
    try {
      const db = await getDB();
      const all = await db.getAll('processing');
      all.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));
      setHistory(all);
    } catch (err) {
      console.error('Failed to load processing history:', err);
    }
  };

  const selectBatch = async (batchId, batchList = availableBatches) => {
    const batch = batchList.find(b => b.batchId === batchId);
    if (!batch) return;

    setSelectedBatchData(batch);
    const nextRound = await getNextProcessingRound(batchId);

    setFormData(prev => ({
      ...prev,
      entryId: generateEntryId('PRC'),
      batchId: batch.batchId,
      materialName: batch.materialName,
      roundNumber: nextRound,
      grossRawKg: '',
      netRawKg: '',
      cleaningWasteKg: 0,
      netPowderKg: '',
      grindingLossKg: 0,
      totalLossKg: 0,
    }));
  };

  const handleBatchChange = async (e) => {
    const bId = e.target.value;
    await selectBatch(bId);
  };

  // Recalculate losses when inputs change
  const handleInputChange = (field, value) => {
    const updated = { ...formData, [field]: value };

    const gross = parseFloat(updated.grossRawKg) || 0;
    const netRaw = parseFloat(updated.netRawKg) || 0;
    const powder = parseFloat(updated.netPowderKg) || 0;

    // Cleaning Waste = Gross Raw - Net Raw
    const cleaningWaste = Math.max(0, Number((gross - netRaw).toFixed(3)));

    // Grinding Loss = Net Raw - Net Powder
    const grindingLoss = Math.max(0, Number((netRaw - powder).toFixed(3)));

    // Total Loss = Gross Raw - Net Powder
    const totalLoss = Math.max(0, Number((gross - powder).toFixed(3)));

    updated.cleaningWasteKg = cleaningWaste;
    updated.grindingLossKg = grindingLoss;
    updated.totalLossKg = totalLoss;

    setFormData(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!activeEmployee) {
      setErrorMsg('Please select an active employee name before saving.');
      if (onOpenEmployeeModal) onOpenEmployeeModal();
      return;
    }

    if (!formData.batchId) {
      setErrorMsg('Please select a valid Batch ID with available unprocessed raw material.');
      return;
    }

    const gross = parseFloat(formData.grossRawKg);
    const netRaw = parseFloat(formData.netRawKg);
    const powder = parseFloat(formData.netPowderKg);

    if (isNaN(gross) || gross <= 0) {
      setErrorMsg('Gross raw material sent must be greater than 0 KG.');
      return;
    }

    if (selectedBatchData && gross > selectedBatchData.remainingUnprocessedKg + 0.0001) {
      setErrorMsg(
        `Gross Raw Sent (${gross} KG) cannot exceed available unprocessed raw material (${selectedBatchData.remainingUnprocessedKg} KG) for Batch ${formData.batchId}.`
      );
      return;
    }

    if (isNaN(netRaw) || netRaw < 0) {
      setErrorMsg('Cleaning output / Net Raw cannot be negative.');
      return;
    }

    if (netRaw > gross) {
      setErrorMsg(`Net Raw Material (${netRaw} KG) cannot exceed Gross Raw Material Sent (${gross} KG).`);
      return;
    }

    if (isNaN(powder) || powder < 0) {
      setErrorMsg('Net Powder Produced cannot be negative.');
      return;
    }

    if (powder > netRaw) {
      setErrorMsg(`Net Powder Produced (${powder} KG) cannot exceed Cleaned Net Raw Material (${netRaw} KG).`);
      return;
    }

    setLoading(true);
    try {
      const db = await getDB();
      const timestamp = new Date().toISOString();

      const record = {
        entry_id: formData.entryId,
        date: formData.date,
        batch_id: formData.batchId,
        material_name: formData.materialName,
        processing_round: Number(formData.roundNumber),
        gross_raw_kg: Number(gross.toFixed(3)),
        net_raw_kg: Number(netRaw.toFixed(3)),
        cleaning_waste_kg: Number(formData.cleaningWasteKg.toFixed(3)),
        net_powder_kg: Number(powder.toFixed(3)),
        grinding_loss_kg: Number(formData.grindingLossKg.toFixed(3)),
        total_loss_kg: Number(formData.totalLossKg.toFixed(3)),
        employee_name: activeEmployee.name,
        timestamp: timestamp,
        remarks: formData.remarks.trim() || '',
        synced: false
      };

      // 1. Save to local IndexedDB
      await db.add('processing', record);

      // 2. Queue for Google Sheets synchronization
      await queueSyncRecord('PROCESSING', record);

      setSuccessMsg(
        `Processing Round ${record.processing_round} saved for Batch ${record.batch_id}! Produced ${record.net_powder_kg} KG powder with ${record.total_loss_kg} KG total loss.`
      );

      // Refresh stock and batches
      const summary = await getRawMaterialStockSummary();
      setAvailableBatches(summary.availableBatches);

      if (summary.availableBatches.some(b => b.batchId === formData.batchId)) {
        await selectBatch(formData.batchId, summary.availableBatches);
      } else if (summary.availableBatches.length > 0) {
        await selectBatch(summary.availableBatches[0].batchId, summary.availableBatches);
      } else {
        setSelectedBatchData(null);
        setFormData(prev => ({
          ...prev,
          entryId: generateEntryId('PRC'),
          batchId: '',
          materialName: '',
          roundNumber: 1,
          grossRawKg: '',
          netRawKg: '',
          netPowderKg: '',
          remarks: ''
        }));
      }

      await loadHistory();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save processing record.');
    } finally {
      setLoading(false);
    }
  };

  const filteredHistory = history.filter(item => {
    const matchesSearch = 
      (item.batch_id && item.batch_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.material_name && item.material_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.entry_id && item.entry_id.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesBatch = !selectedBatchFilter || item.batch_id === selectedBatchFilter;
    return matchesSearch && matchesBatch;
  });

  return (
    <div className="space-y-6 pb-20 md:pb-6 animate-fadeIn">
      
      {/* Module Title Banner */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-11 h-11 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-sm">
            <Cog className="w-6 h-6 text-gold-200" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              MODULE 2: PROCESSING / CLEANING / GRINDING
            </h2>
            <p className="text-xs text-slate-500">
              Record cleaning, grinding & powder output. Multi-round processing maintains same Batch ID.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          <span className="text-slate-500">Active Staff:</span>
          <span className="font-bold text-amber-900 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
            {activeEmployee ? activeEmployee.name : 'None Selected'}
          </span>
        </div>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs sm:text-sm font-semibold flex items-center space-x-2.5 shadow-xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 bg-red-50 border border-red-300 text-red-900 rounded-xl text-xs sm:text-sm font-semibold flex items-center space-x-2.5 shadow-xs">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Entry Form Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-amber-700 to-amber-800 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Cog className="w-4 h-4 text-gold-300" />
            <h3 className="font-bold text-sm tracking-wide">Processing Round Form</h3>
          </div>
          <span className="text-[11px] font-mono text-gold-200 bg-white/10 px-2 py-0.5 rounded">
            Same Batch • Multi-Round Linked
          </span>
        </div>

        {availableBatches.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
            <h4 className="font-bold text-slate-800">No Unprocessed Raw Material Available</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              All received raw material has already been processed, or no raw material has been entered yet. Please enter raw material in Module 1 first.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5">
            
            {/* Batch Selection & Live Stock Indicator */}
            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex-1">
                <label className="block text-xs font-bold text-amber-900 uppercase mb-1">
                  Select Raw Material Batch *
                </label>
                <select
                  required
                  value={formData.batchId}
                  onChange={handleBatchChange}
                  className="w-full bg-white border border-amber-300 text-slate-900 font-bold rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-600"
                >
                  {availableBatches.map((b) => (
                    <option key={b.batchId} value={b.batchId}>
                      {b.batchId} — {b.materialName} ({b.remainingUnprocessedKg} KG Remaining Unprocessed)
                    </option>
                  ))}
                </select>
              </div>

              {selectedBatchData && (
                <div className="flex items-center space-x-4 bg-white px-3 py-2 rounded-lg border border-amber-200 text-xs shrink-0">
                  <div>
                    <span className="text-slate-500 block">Total Inward</span>
                    <span className="font-bold text-slate-800">{selectedBatchData.inwardKg} KG</span>
                  </div>
                  <div className="h-6 w-px bg-slate-200"></div>
                  <div>
                    <span className="text-slate-500 block">Processed So Far</span>
                    <span className="font-bold text-slate-800">{selectedBatchData.grossProcessedKg} KG</span>
                  </div>
                  <div className="h-6 w-px bg-slate-200"></div>
                  <div>
                    <span className="text-amber-800 font-bold block">Available Unprocessed</span>
                    <span className="font-black text-amber-700 text-sm">{selectedBatchData.remainingUnprocessedKg} KG</span>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Entry ID */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Entry ID (Auto)
                </label>
                <input
                  type="text"
                  readOnly
                  value={formData.entryId}
                  className="w-full bg-slate-100 border border-slate-200 text-slate-600 rounded-xl px-3 py-2.5 text-xs font-mono font-bold select-all focus:outline-none"
                />
              </div>

              {/* Processing Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Processing Date
                </label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-600"
                />
              </div>

              {/* Product Name (Automatic from Batch) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Product Name (Locked to Batch)
                </label>
                <input
                  type="text"
                  readOnly
                  value={formData.materialName}
                  className="w-full bg-slate-100 border border-slate-200 text-slate-900 font-bold rounded-xl px-3 py-2.5 text-xs focus:outline-none"
                />
              </div>

              {/* Processing Round Number (Automatic) */}
              <div>
                <label className="block text-xs font-bold text-amber-900 uppercase mb-1 flex items-center justify-between">
                  <span>Processing Round #</span>
                  <span className="text-[10px] text-amber-700 font-extrabold uppercase">Sequential</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    readOnly
                    value={`Round ${formData.roundNumber}`}
                    className="w-full bg-amber-50/60 border-2 border-amber-300 text-amber-900 font-black rounded-xl px-3 py-2.5 text-xs focus:outline-none"
                  />
                </div>
              </div>

            </div>

            {/* Production Numbers & Live Auto Calculations */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Processing Quantities & Losses (KG)
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                
                {/* Gross Raw Sent */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 uppercase mb-1">
                    Gross Raw Sent (KG) *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      required
                      placeholder={`Max ${selectedBatchData?.remainingUnprocessedKg || 0}`}
                      value={formData.grossRawKg}
                      onChange={(e) => handleInputChange('grossRawKg', e.target.value)}
                      className="w-full bg-white border-2 border-slate-300 text-slate-900 font-black rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-600"
                    />
                    <span className="absolute right-3 top-3 text-xs font-bold text-slate-400">KG</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Available: {selectedBatchData?.remainingUnprocessedKg || 0} KG
                  </span>
                </div>

                {/* Net Cleaned Raw */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 uppercase mb-1">
                    Cleaning Output / Net Raw (KG) *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      required
                      placeholder="Cleaned seed/root output"
                      value={formData.netRawKg}
                      onChange={(e) => handleInputChange('netRawKg', e.target.value)}
                      className="w-full bg-white border-2 border-slate-300 text-slate-900 font-black rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-600"
                    />
                    <span className="absolute right-3 top-3 text-xs font-bold text-slate-400">KG</span>
                  </div>
                  <span className="text-[10px] text-amber-700 font-semibold mt-1 block">
                    Cleaning Waste: {formData.cleaningWasteKg} KG
                  </span>
                </div>

                {/* Net Powder Produced */}
                <div>
                  <label className="block text-xs font-bold text-brand-900 uppercase mb-1">
                    Net Powder Produced (KG) *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      required
                      placeholder="Final grinded powder"
                      value={formData.netPowderKg}
                      onChange={(e) => handleInputChange('netPowderKg', e.target.value)}
                      className="w-full bg-white border-2 border-emerald-400 text-emerald-950 font-black rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                    <span className="absolute right-3 top-3 text-xs font-bold text-slate-400">KG</span>
                  </div>
                  <span className="text-[10px] text-amber-700 font-semibold mt-1 block">
                    Grinding Loss: {formData.grindingLossKg} KG
                  </span>
                </div>

              </div>

              {/* Automatic Losses Summary Banner */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 text-center text-xs">
                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-slate-500 block text-[10px] uppercase">Cleaning Waste</span>
                  <span className="font-bold text-slate-800 text-sm">{formData.cleaningWasteKg} KG</span>
                </div>
                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-slate-500 block text-[10px] uppercase">Grinding Loss</span>
                  <span className="font-bold text-slate-800 text-sm">{formData.grindingLossKg} KG</span>
                </div>
                <div className="p-2 bg-red-50 rounded-lg border border-red-200">
                  <span className="text-red-700 block text-[10px] font-bold uppercase">Total Loss</span>
                  <span className="font-black text-red-700 text-sm">{formData.totalLossKg} KG</span>
                </div>
              </div>

            </div>

            {/* Remarks */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Remarks / Machine Details (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Pulverizer Machine #2, Mesh size 60, Normal operating temp"
                value={formData.remarks}
                onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-600"
              />
            </div>

            {/* Submit Action */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100">
              <p className="text-xs text-slate-500">
                * Same Batch ID ({formData.batchId || 'N/A'}) will be kept permanently.
              </p>

              <button
                type="submit"
                disabled={loading}
                className="w-full sm:w-auto px-6 py-3 bg-amber-700 hover:bg-amber-800 active:scale-95 text-white font-bold rounded-xl shadow-md transition flex items-center justify-center space-x-2 text-sm disabled:opacity-50"
              >
                <Cog className="w-4 h-4 text-gold-300" />
                <span>{loading ? 'Recording Processing...' : 'Save Processing Round'}</span>
              </button>
            </div>

          </form>
        )}
      </div>

      {/* Processing History Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide">
              Processing & Grinding History
            </h3>
            <p className="text-xs text-slate-500">
              Batch-wise rounds and powder outputs
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Search */}
            <div className="relative flex-1 sm:w-48">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search Batch / Product..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-600"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 uppercase font-bold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Batch ID</th>
                <th className="py-2.5 px-3">Material</th>
                <th className="py-2.5 px-3 text-center">Round</th>
                <th className="py-2.5 px-3 text-right">Gross Sent</th>
                <th className="py-2.5 px-3 text-right">Net Cleaned</th>
                <th className="py-2.5 px-3 text-right text-emerald-800">Powder Produced</th>
                <th className="py-2.5 px-3 text-right text-red-700">Total Loss</th>
                <th className="py-2.5 px-3">Operator</th>
                <th className="py-2.5 px-3 text-center">Sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan="10" className="py-8 text-center text-slate-400">
                    No processing records found.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((item) => (
                  <tr key={item.entry_id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-slate-800 whitespace-nowrap">
                      {item.date}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="font-mono font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        {item.batch_id}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                      {item.material_name}
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-700 whitespace-nowrap">
                      Round {item.processing_round}
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-slate-800 whitespace-nowrap">
                      {Number(item.gross_raw_kg).toLocaleString()} KG
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-slate-800 whitespace-nowrap">
                      {Number(item.net_raw_kg).toLocaleString()} KG
                    </td>
                    <td className="py-2.5 px-3 text-right font-black text-emerald-800 whitespace-nowrap">
                      {Number(item.net_powder_kg).toLocaleString()} KG
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-red-700 whitespace-nowrap">
                      {Number(item.total_loss_kg).toLocaleString()} KG
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                      {item.employee_name}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      {item.synced ? (
                        <span className="inline-block text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                          Synced
                        </span>
                      ) : (
                        <span className="inline-block text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                          Pending
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

      </div>

    </div>
  );
}
