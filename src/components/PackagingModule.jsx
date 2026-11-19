import React, { useState, useEffect } from 'react';
import { 
  Boxes, 
  Search, 
  Calendar, 
  Scale, 
  Plus, 
  AlertCircle, 
  CheckCircle2, 
  Layers, 
  Info,
  ArrowRight
} from 'lucide-react';
import { getDB } from '../services/db';
import { 
  generateEntryId, 
  generatePackagingTxId, 
  getTodayDateStr, 
  getPowderStockSummary 
} from '../services/inventoryEngine';
import { queueSyncRecord } from '../services/syncService';

const AVAILABLE_PACK_SIZES = [10, 24, 50, 100, 200, 500];

export default function PackagingModule({ activeEmployee, onOpenEmployeeModal }) {
  const [availableBatches, setAvailableBatches] = useState([]);
  const [selectedBatchData, setSelectedBatchData] = useState(null);
  const [history, setHistory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Form State
  const [date, setDate] = useState(getTodayDateStr());
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [productName, setProductName] = useState('');
  const [remarks, setRemarks] = useState('');

  // Finished quantities strictly in KG for each pack size: { 10: '', 24: '', 50: '', ... }
  const [packKg, setPackKg] = useState(
    AVAILABLE_PACK_SIZES.reduce((acc, size) => ({ ...acc, [size]: '' }), {})
  );

  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const summary = await getPowderStockSummary();
      setAvailableBatches(summary.availableBatches);

      if (summary.availableBatches.length > 0) {
        selectBatch(summary.availableBatches[0].batchId, summary.availableBatches);
      }

      await loadHistory();
    } catch (err) {
      console.error('Failed to init packaging:', err);
    }
  };

  const loadHistory = async () => {
    try {
      const db = await getDB();
      const all = await db.getAll('packaging');
      all.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));
      setHistory(all);
    } catch (err) {
      console.error('Failed to load packaging history:', err);
    }
  };

  const selectBatch = (bId, batchList = availableBatches) => {
    const batch = batchList.find(b => b.batchId === bId);
    if (!batch) return;

    setSelectedBatchId(batch.batchId);
    setProductName(batch.productName);
    setSelectedBatchData(batch);
  };

  const handleBatchChange = (e) => {
    selectBatch(e.target.value);
  };

  const handlePackKgChange = (size, val) => {
    setPackKg(prev => ({
      ...prev,
      [size]: val
    }));
  };

  // Calculations strictly in KG
  const availablePowderKg = selectedBatchData?.remainingPowderKg || 0;

  let totalPowderUsedKg = 0;
  AVAILABLE_PACK_SIZES.forEach(size => {
    const val = parseFloat(packKg[size]) || 0;
    totalPowderUsedKg += val;
  });

  totalPowderUsedKg = Number(totalPowderUsedKg.toFixed(3));
  const remainingPowderKg = Math.max(0, Number((availablePowderKg - totalPowderUsedKg).toFixed(3)));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!activeEmployee) {
      setErrorMsg('Please select an active employee name before saving.');
      if (onOpenEmployeeModal) onOpenEmployeeModal();
      return;
    }

    if (!selectedBatchId) {
      setErrorMsg('Please select a batch with available powder stock.');
      return;
    }

    if (totalPowderUsedKg <= 0) {
      setErrorMsg('Please enter packaging quantity in KG for at least one pack size.');
      return;
    }

    if (totalPowderUsedKg > availablePowderKg + 0.0001) {
      setErrorMsg(
        `Total Powder Used (${totalPowderUsedKg} KG) exceeds available powder stock (${availablePowderKg} KG) for Batch ${selectedBatchId}.`
      );
      return;
    }

    setLoading(true);
    try {
      const db = await getDB();
      const transactionId = generatePackagingTxId();
      const timestamp = new Date().toISOString();

      // Create separate row for each pack size where KG > 0
      const recordsToInsert = [];
      const packSizesEntered = [];

      for (const size of AVAILABLE_PACK_SIZES) {
        const kgVal = parseFloat(packKg[size]) || 0;
        if (kgVal > 0) {
          const entryId = generateEntryId('PKG');

          const record = {
            entry_id: entryId,
            transaction_id: transactionId,
            date: date,
            batch_id: selectedBatchId,
            product_name: productName,
            pack_size_gm: size,
            powder_used_kg: Number(kgVal.toFixed(3)),
            employee_name: activeEmployee.name,
            timestamp: timestamp,
            remarks: remarks.trim() || '',
            synced: false
          };

          recordsToInsert.push(record);
          packSizesEntered.push(`${kgVal} KG (${size}g)`);
        }
      }

      // Save all rows to IndexedDB and Queue for Sync
      const tx = db.transaction('packaging', 'readwrite');
      for (const rec of recordsToInsert) {
        await tx.store.add(rec);
      }
      await tx.done;

      for (const rec of recordsToInsert) {
        await queueSyncRecord('PACKAGING', rec);
      }

      setSuccessMsg(
        `Packaging completed for Batch ${selectedBatchId}! Produced: ${packSizesEntered.join(', ')} (${totalPowderUsedKg} KG total).`
      );

      // Reset quantities
      setPackKg(AVAILABLE_PACK_SIZES.reduce((acc, size) => ({ ...acc, [size]: '' }), {}));
      setRemarks('');

      // Refresh powder summary
      const summary = await getPowderStockSummary();
      setAvailableBatches(summary.availableBatches);

      if (summary.availableBatches.some(b => b.batchId === selectedBatchId)) {
        selectBatch(selectedBatchId, summary.availableBatches);
      } else if (summary.availableBatches.length > 0) {
        selectBatch(summary.availableBatches[0].batchId, summary.availableBatches);
      } else {
        setSelectedBatchData(null);
        setSelectedBatchId('');
        setProductName('');
      }

      await loadHistory();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save packaging transaction.');
    } finally {
      setLoading(false);
    }
  };

  const filteredHistory = history.filter(item => {
    return (
      (item.batch_id && item.batch_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.product_name && item.product_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.transaction_id && item.transaction_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.entry_id && item.entry_id.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  });

  return (
    <div className="space-y-6 pb-20 md:pb-6 animate-fadeIn">
      
      {/* Module Title Banner */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-11 h-11 rounded-xl bg-gold-600 text-white flex items-center justify-center shadow-sm">
            <Boxes className="w-6 h-6 text-gold-100" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              MODULE 3: PACKAGING (FINISHED GOODS IN KG)
            </h2>
            <p className="text-xs text-slate-500">
              Convert powder into finished stock (10g - 500g). Tracked strictly in KG.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          <span className="text-slate-500">Active Staff:</span>
          <span className="font-bold text-gold-950 bg-gold-50 px-2.5 py-1 rounded-lg border border-gold-300">
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
        <div className="bg-gradient-to-r from-gold-700 via-gold-600 to-amber-700 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Boxes className="w-4 h-4 text-white" />
            <h3 className="font-bold text-sm tracking-wide">Packaging Transaction Form (KG Only)</h3>
          </div>
          <span className="text-[11px] font-mono text-gold-100 bg-black/20 px-2 py-0.5 rounded">
            Unit: KG Only
          </span>
        </div>

        {availableBatches.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <AlertCircle className="w-8 h-8 text-gold-600 mx-auto" />
            <h4 className="font-bold text-slate-800">No Powder Available for Packaging</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              All produced powder has been packaged, or no raw material has been grinded yet. Process powder in Module 2 first.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5">
            
            {/* Batch Selection Banner */}
            <div className="bg-gold-50/70 border border-gold-300 rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex-1">
                <label className="block text-xs font-bold text-gold-950 uppercase mb-1">
                  Select Batch (Available Powder) *
                </label>
                <select
                  required
                  value={selectedBatchId}
                  onChange={handleBatchChange}
                  className="w-full bg-white border border-gold-400 text-slate-900 font-bold rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-600"
                >
                  {availableBatches.map((b) => (
                    <option key={b.batchId} value={b.batchId}>
                      {b.batchId} — {b.productName} ({b.remainingPowderKg} KG Powder Available)
                    </option>
                  ))}
                </select>
              </div>

              {selectedBatchData && (
                <div className="flex items-center space-x-4 bg-white px-3.5 py-2 rounded-lg border border-gold-300 text-xs shrink-0 shadow-xs">
                  <div>
                    <span className="text-slate-500 block">Total Powder Produced</span>
                    <span className="font-bold text-slate-800">{selectedBatchData.netPowderProducedKg} KG</span>
                  </div>
                  <div className="h-6 w-px bg-slate-200"></div>
                  <div>
                    <span className="text-slate-500 block">Used in Packaging</span>
                    <span className="font-bold text-slate-800">{selectedBatchData.powderUsedInPkgKg} KG</span>
                  </div>
                  <div className="h-6 w-px bg-slate-200"></div>
                  <div>
                    <span className="text-gold-950 font-bold block">Available Powder</span>
                    <span className="font-black text-gold-700 text-sm">{selectedBatchData.remainingPowderKg} KG</span>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              
              {/* Packaging Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Packaging Date
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-gold-600"
                />
              </div>

              {/* Product Name (Automatic) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Product Name (Locked from Batch)
                </label>
                <input
                  type="text"
                  readOnly
                  value={productName}
                  className="w-full bg-slate-100 border border-slate-200 text-slate-900 font-bold rounded-xl px-3 py-2.5 text-xs focus:outline-none"
                />
              </div>

              {/* Employee Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Packaging Incharge (Staff)
                </label>
                <input
                  type="text"
                  readOnly
                  value={activeEmployee?.name || 'Please select'}
                  className="w-full bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-xl px-3 py-2.5 text-xs focus:outline-none"
                />
              </div>

            </div>

            {/* Finished Pack Sizes (Entered in KG) */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Finished Goods Production (Enter Quantity in KG)
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Enter the total weight in KG packaged for each pack size
                  </p>
                </div>
                <span className="text-xs font-bold text-slate-700">
                  Unit: KG (Kilograms Only)
                </span>
              </div>

              {/* Pack Sizes Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {AVAILABLE_PACK_SIZES.map((size) => {
                  const kgVal = packKg[size];
                  return (
                    <div 
                      key={size}
                      className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs hover:border-gold-400 transition"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-black text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                          {size} GM Size
                        </span>
                        <span className="text-[10px] text-brand-800 font-bold">KG</span>
                      </div>

                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          placeholder="0.000"
                          value={kgVal}
                          onChange={(e) => handlePackKgChange(size, e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 text-slate-900 font-black rounded-lg px-2.5 py-1.5 text-base text-center focus:outline-none focus:ring-2 focus:ring-gold-500"
                        />
                        <span className="absolute right-2 top-2 text-[10px] font-bold text-slate-400">KG</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Real-Time Powder Balance Bar */}
              <div className="bg-white rounded-xl p-3.5 border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold uppercase block">
                    Available Powder Before
                  </span>
                  <span className="text-base font-bold text-slate-800">
                    {availablePowderKg} KG
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-gold-700 font-semibold uppercase block">
                    Total Finished Stock Produced
                  </span>
                  <span className="text-base font-black text-gold-700">
                    {totalPowderUsedKg} KG
                  </span>
                </div>

                <div className={`rounded-lg p-1.5 ${
                  totalPowderUsedKg > availablePowderKg ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'
                }`}>
                  <span className="text-[10px] font-bold uppercase block">
                    Remaining Powder Stock
                  </span>
                  <span className="text-base font-black">
                    {remainingPowderKg} KG
                  </span>
                </div>
              </div>

            </div>

            {/* Remarks */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Remarks / Storage Details (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Master cartons sealed, Lot #2, Godown shelf B"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-gold-600"
              />
            </div>

            {/* Submit Button */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100">
              <p className="text-xs text-slate-500">
                * Finished product stock will increase in KG; powder stock will deduct in KG.
              </p>

              <button
                type="submit"
                disabled={loading || totalPowderUsedKg <= 0 || totalPowderUsedKg > availablePowderKg}
                className="w-full sm:w-auto px-6 py-3 bg-gold-600 hover:bg-gold-700 active:scale-95 text-white font-bold rounded-xl shadow-md transition flex items-center justify-center space-x-2 text-sm disabled:opacity-50"
              >
                <Boxes className="w-4 h-4 text-white" />
                <span>{loading ? 'Recording Packaging...' : `Save Packaging (${totalPowderUsedKg} KG)`}</span>
              </button>
            </div>

          </form>
        )}
      </div>

      {/* Packaging History Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide">
              Packaging Production Records
            </h3>
            <p className="text-xs text-slate-500">
              Finished goods inventory tracked in KG
            </p>
          </div>

          <div className="relative w-full sm:w-48">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search Batch / Product / Tx..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gold-600"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 uppercase font-bold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Tx ID</th>
                <th className="py-2.5 px-3">Batch ID</th>
                <th className="py-2.5 px-3">Product</th>
                <th className="py-2.5 px-3 text-center">Pack Size</th>
                <th className="py-2.5 px-3 text-right">Finished Stock (KG)</th>
                <th className="py-2.5 px-3">Staff</th>
                <th className="py-2.5 px-3 text-center">Sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-8 text-center text-slate-400">
                    No packaging entries recorded yet.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((item) => (
                  <tr key={item.entry_id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-slate-800 whitespace-nowrap">
                      {item.date}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 font-mono text-[10px] whitespace-nowrap">
                      {item.transaction_id || item.entry_id}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="font-mono font-bold text-gold-900 bg-gold-50 px-2 py-0.5 rounded border border-gold-300">
                        {item.batch_id}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                      {item.product_name}
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-800 whitespace-nowrap">
                      {item.pack_size_gm} GM
                    </td>
                    <td className="py-2.5 px-3 text-right font-black text-brand-900 whitespace-nowrap">
                      {Number(item.powder_used_kg || item.quantity_kg || 0).toFixed(3)} KG
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
