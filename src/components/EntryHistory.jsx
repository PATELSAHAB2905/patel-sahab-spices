import React, { useState, useEffect } from 'react';
import { 
  History, 
  Search, 
  Filter, 
  PackagePlus, 
  Cog, 
  Boxes, 
  ShoppingBag, 
  Calendar, 
  User, 
  CheckCircle2, 
  Clock,
  RotateCcw,
  Edit3,
  AlertTriangle,
  X,
  Check,
  AlertOctagon,
  Sparkles
} from 'lucide-react';
import { getDB } from '../services/db';
import { 
  validateRecordReversal, 
  reverseInventoryRecord, 
  validateRecordEdit, 
  editInventoryRecord 
} from '../services/inventoryEngine';

export default function EntryHistory({ onDataChanged }) {
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'RAW' | 'PROCESSING' | 'PACKAGING' | 'SALE' | 'SALES_RETURN'
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  
  const [allEntries, setAllEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState(null);

  // Reversal Modal State
  const [reversalTarget, setReversalTarget] = useState(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversalError, setReversalError] = useState(null);
  const [reversalLoading, setReversalLoading] = useState(false);

  // Edit Modal State
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editReason, setEditReason] = useState('');
  const [editError, setEditError] = useState(null);
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    loadAllEntries();
  }, []);

  const loadAllEntries = async () => {
    setLoading(true);
    try {
      const db = await getDB();
      const [raw, proc, pkg, sales, returns] = await Promise.all([
        db.getAll('raw_material'),
        db.getAll('processing'),
        db.getAll('packaging'),
        db.getAll('order_sale'),
        db.objectStoreNames.contains('sales_return') ? db.getAll('sales_return') : Promise.resolve([])
      ]);

      const taggedRaw = raw.map(r => ({ ...r, moduleStore: 'raw_material', moduleType: 'RAW', moduleLabel: 'Raw Material Inward' }));
      const taggedProc = proc.map(p => ({ ...p, moduleStore: 'processing', moduleType: 'PROCESSING', moduleLabel: 'Processing & Grinding' }));
      const taggedPkg = pkg.map(k => ({ ...k, moduleStore: 'packaging', moduleType: 'PACKAGING', moduleLabel: 'Packaging' }));
      const taggedSales = sales.map(s => ({ ...s, moduleStore: 'order_sale', moduleType: 'SALE', moduleLabel: 'Order / Sale' }));
      const taggedReturns = returns.map(r => ({ 
        ...r, 
        entry_id: r.return_id,
        moduleStore: 'sales_return', 
        moduleType: 'SALES_RETURN', 
        moduleLabel: 'Sales Return' 
      }));

      const combined = [...taggedRaw, ...taggedProc, ...taggedPkg, ...taggedSales, ...taggedReturns];
      combined.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));

      setAllEntries(combined);
    } catch (err) {
      console.error('Failed to load entry history:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenReverseModal = async (item) => {
    setReversalTarget(item);
    setReversalReason('');
    setReversalError(null);

    // Pre-validate reversal
    try {
      await validateRecordReversal(item.moduleStore, item.entry_id);
    } catch (err) {
      setReversalError(err.message);
    }
  };

  const handleConfirmReversal = async (e) => {
    e.preventDefault();
    if (!reversalTarget) return;
    if (!reversalReason.trim()) {
      setReversalError('Reversal reason is mandatory.');
      return;
    }

    setReversalLoading(true);
    setReversalError(null);

    try {
      await reverseInventoryRecord(
        reversalTarget.moduleStore,
        reversalTarget.entry_id,
        reversalReason.trim(),
        'Authorized Admin'
      );

      setActionMsg({ type: 'success', text: `Entry ${reversalTarget.entry_id} marked as REVERSED. Inventory recalculated.` });
      setReversalTarget(null);
      await loadAllEntries();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      setReversalError(err.message);
    } finally {
      setReversalLoading(false);
    }
  };

  const handleOpenEditModal = (item) => {
    setEditTarget(item);
    setEditReason('');
    setEditError(null);

    // Pre-populate fields
    if (item.moduleStore === 'raw_material') {
      setEditForm({
        quantity_kg: item.quantity_kg,
        supplier_name: item.supplier_name || '',
        invoice_number: item.invoice_number || '',
        remarks: item.remarks || ''
      });
    } else if (item.moduleStore === 'processing') {
      setEditForm({
        gross_raw_kg: item.gross_raw_kg,
        net_raw_kg: item.net_raw_kg,
        cleaning_waste_kg: item.cleaning_waste_kg,
        net_powder_kg: item.net_powder_kg,
        grinding_loss_kg: item.grinding_loss_kg,
        remarks: item.remarks || ''
      });
    } else if (item.moduleStore === 'packaging') {
      setEditForm({
        packet_quantity: item.packet_quantity,
        powder_used_kg: item.powder_used_kg,
        remarks: item.remarks || ''
      });
    } else if (item.moduleStore === 'order_sale') {
      setEditForm({
        kg_sold: item.kg_sold,
        packets_deducted: item.packets_deducted,
        remarks: item.remarks || ''
      });
    } else if (item.moduleStore === 'sales_return') {
      setEditForm({
        returned_packets: item.returned_packets,
        reusable_packets: item.reusable_packets,
        rejected_packets: item.rejected_packets,
        remarks: item.remarks || ''
      });
    }
  };

  const handleConfirmEdit = async (e) => {
    e.preventDefault();
    if (!editTarget) return;
    if (!editReason.trim()) {
      setEditError('An edit reason is mandatory.');
      return;
    }

    setEditLoading(true);
    setEditError(null);

    try {
      await editInventoryRecord(
        editTarget.moduleStore,
        editTarget.entry_id,
        editForm,
        editReason.trim(),
        'Authorized Admin'
      );

      setActionMsg({ type: 'success', text: `Entry ${editTarget.entry_id} updated successfully.` });
      setEditTarget(null);
      await loadAllEntries();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditLoading(false);
    }
  };

  const filtered = allEntries.filter(item => {
    if (activeTab !== 'ALL' && item.moduleType !== activeTab) return false;
    if (dateFilter && item.date !== dateFilter) return false;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchBatch = item.batch_id && item.batch_id.toLowerCase().includes(term);
      const matchProduct = (item.material_name || item.product_name || '').toLowerCase().includes(term);
      const matchEntry = item.entry_id && item.entry_id.toLowerCase().includes(term);
      const matchEmp = (item.employee_name || item.received_by || '').toLowerCase().includes(term);
      const matchOrder = item.order_id && item.order_id.toLowerCase().includes(term);
      return matchBatch || matchProduct || matchEntry || matchEmp || matchOrder;
    }

    return true;
  });

  return (
    <div className="space-y-6 pb-20 md:pb-6 animate-fadeIn">
      
      {/* Title */}
      <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-200 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-2xl bg-purple-900 text-white flex items-center justify-center shadow-sm">
            <History className="w-6 h-6 text-purple-200" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
              FACTORY ENTRY HISTORY & AUDIT TRAIL
            </h2>
            <p className="text-xs text-slate-500">
              Chronological log with Edit, Soft Reversal, and Safety Dependency Checks across all modules.
            </p>
          </div>
        </div>

        <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-xl self-start sm:self-auto">
          {filtered.length} Total Entries Found
        </span>
      </div>

      {/* Action Notification */}
      {actionMsg && (
        <div className={`p-4 rounded-2xl text-xs flex items-center justify-between animate-fadeIn ${
          actionMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          <div className="flex items-center space-x-2">
            {actionMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertOctagon className="w-4 h-4 text-red-600" />}
            <span className="font-bold">{actionMsg.text}</span>
          </div>
          <button onClick={() => setActionMsg(null)} className="font-black text-sm">×</button>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
        
        {/* Module Filter Tabs */}
        <div className="flex space-x-1.5 overflow-x-auto no-scrollbar pb-1">
          {[
            { id: 'ALL', label: 'All Modules' },
            { id: 'RAW', label: 'Raw Inward' },
            { id: 'PROCESSING', label: 'Processing' },
            { id: 'PACKAGING', label: 'Packaging' },
            { id: 'SALE', label: 'Orders / Sales' },
            { id: 'SALES_RETURN', label: 'Sales Returns' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-purple-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & Date Input */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 border-t border-slate-100">
          <div className="sm:col-span-2 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by Entry ID, Batch ID, Product, Employee, Order ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-purple-700"
            />
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full text-xs p-2 border border-slate-300 rounded-xl"
            />
            {dateFilter && (
              <button
                onClick={() => setDateFilter('')}
                className="text-xs text-purple-700 font-bold hover:underline shrink-0"
              >
                Clear
              </button>
            )}
          </div>
        </div>

      </div>

      {/* History Items Feed */}
      <div className="space-y-2.5">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-xs">Loading history log...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs bg-white rounded-2xl border border-slate-200">
            No entries match your search criteria.
          </div>
        ) : (
          filtered.map(item => {
            const isReversed = item.is_reversed || item.status === 'REVERSED';

            const getIcon = () => {
              if (item.moduleType === 'RAW') return <PackagePlus className="w-4 h-4 text-brand-700" />;
              if (item.moduleType === 'PROCESSING') return <Cog className="w-4 h-4 text-blue-700" />;
              if (item.moduleType === 'PACKAGING') return <Boxes className="w-4 h-4 text-purple-700" />;
              if (item.moduleType === 'SALES_RETURN') return <RotateCcw className="w-4 h-4 text-rose-700" />;
              return <ShoppingBag className="w-4 h-4 text-emerald-700" />;
            };

            const getQuantityBadge = () => {
              if (item.moduleType === 'RAW') {
                return <span className="font-black text-brand-900 text-sm">{item.quantity_kg} KG Inward</span>;
              }
              if (item.moduleType === 'PROCESSING') {
                return <span className="font-black text-blue-900 text-sm">{item.net_powder_kg} KG Powder (R{item.processing_round || 1})</span>;
              }
              if (item.moduleType === 'PACKAGING') {
                const pkgKg = item.powder_used_kg || item.quantity_kg || (item.packet_quantity && item.pack_size_gm ? ((item.packet_quantity * item.pack_size_gm) / 1000).toFixed(3) : item.packet_quantity);
                return <span className="font-black text-purple-900 text-sm">{pkgKg} KG ({item.packet_quantity || 0} pkts of {item.pack_size_gm}g)</span>;
              }
              if (item.moduleType === 'SALES_RETURN') {
                return <span className="font-black text-rose-900 text-sm">{item.returned_packets} pkts ({item.reusable_packets || 0} reus, {item.rejected_packets || 0} rej)</span>;
              }
              return <span className="font-black text-emerald-900 text-sm">{item.kg_sold} KG Sold ({item.pack_size_gm} GM)</span>;
            };

            return (
              <div 
                key={item.entry_id}
                className={`bg-white p-3.5 sm:p-4 rounded-2xl border transition shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isReversed ? 'border-red-200 bg-red-50/20 opacity-60' : 'border-slate-200 hover:border-purple-300'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div className="p-2 rounded-xl bg-slate-100 shrink-0 mt-0.5">
                    {getIcon()}
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-slate-900 text-xs">{item.moduleLabel}</span>
                      <span className="text-[10px] font-mono text-slate-400">({item.entry_id})</span>
                      {item.order_id && (
                        <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded">
                          {item.order_id}
                        </span>
                      )}
                      {isReversed && (
                        <span className="text-[9px] font-black uppercase text-red-700 bg-red-100 px-1.5 py-0.2 rounded">
                          VOID / REVERSED
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600">
                      <span className="font-mono font-bold text-brand-900 bg-brand-50 px-1.5 py-0.2 rounded border border-brand-200">
                        {item.batch_id}
                      </span>
                      <span className="font-bold text-slate-900">
                        {item.material_name || item.product_name}
                      </span>
                      <span className="text-slate-400">•</span>
                      <span>Staff: <strong className="text-slate-700">{item.employee_name || item.received_by || 'Staff'}</strong></span>
                    </div>

                    {item.reversal_reason && (
                      <p className="text-[11px] text-red-600 font-semibold italic">
                        Reversal Reason: "{item.reversal_reason}" ({item.reversed_by || 'Admin'})
                      </p>
                    )}

                    {item.last_edit_reason && (
                      <p className="text-[11px] text-amber-700 italic">
                        Last Edited: "{item.last_edit_reason}"
                      </p>
                    )}

                    {item.remarks && !item.reversal_reason && (
                      <p className="text-[11px] text-slate-500 italic">
                        "{item.remarks}"
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end sm:space-x-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  <div className="text-left sm:text-right">
                    {getQuantityBadge()}
                    <div className="text-[10px] text-slate-400 flex items-center gap-1 sm:justify-end">
                      <Clock className="w-3 h-3" />
                      <span>{item.date} {item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    </div>
                  </div>

                  {/* Actions: Edit & Reverse */}
                  {!isReversed && (
                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(item)}
                        className="p-1.5 text-slate-600 hover:text-brand-900 hover:bg-slate-100 rounded-lg transition"
                        title="Edit entry fields"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenReverseModal(item)}
                        className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition"
                        title="Reverse entry"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

              </div>
            );
          })
        )}
      </div>

      {/* REVERSAL MODAL */}
      {reversalTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center space-x-2.5 text-red-700 pb-3 border-b border-slate-100">
              <RotateCcw className="w-5 h-5 text-red-600" />
              <h3 className="text-base font-black uppercase">Reverse Inventory Record</h3>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Entry ID:</span>
                <span className="font-mono font-bold text-slate-900">{reversalTarget.entry_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Module:</span>
                <span className="font-bold text-slate-900">{reversalTarget.moduleLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Batch ID:</span>
                <span className="font-mono font-bold text-slate-900">{reversalTarget.batch_id}</span>
              </div>
            </div>

            {reversalError ? (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-900 flex items-start space-x-2">
                <AlertOctagon className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold">Safety Dependency Block:</strong>
                  {reversalError}
                </div>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p>
                  Reversing this entry will mark it as void and remove its quantity from available factory stock.
                </p>
              </div>
            )}

            <form onSubmit={handleConfirmReversal} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Reversal Reason <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="e.g. Weighing scale calibration error / Duplicate entry"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setReversalTarget(null)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reversalLoading || Boolean(reversalError)}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl text-xs uppercase shadow transition disabled:opacity-50"
                >
                  {reversalLoading ? 'Reversing...' : 'Confirm Reversal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center space-x-2.5 text-brand-900 pb-3 border-b border-slate-100">
              <Edit3 className="w-5 h-5 text-brand-700" />
              <h3 className="text-base font-black uppercase">Edit Record Fields</h3>
            </div>

            <div className="text-xs text-slate-600 space-y-0.5">
              <div>Entry ID: <strong className="font-mono text-slate-900">{editTarget.entry_id}</strong></div>
              <div>Module: <strong className="text-slate-900">{editTarget.moduleLabel}</strong> (Batch: {editTarget.batch_id})</div>
            </div>

            {editError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800">
                {editError}
              </div>
            )}

            <form onSubmit={handleConfirmEdit} className="space-y-3 text-xs">
              
              {/* Dynamic inputs based on module */}
              {editTarget.moduleStore === 'raw_material' && (
                <>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Inward Quantity (KG)</label>
                    <input
                      type="number"
                      step="0.001"
                      required
                      value={editForm.quantity_kg || ''}
                      onChange={(e) => setEditForm({ ...editForm, quantity_kg: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Supplier Name</label>
                    <input
                      type="text"
                      value={editForm.supplier_name || ''}
                      onChange={(e) => setEditForm({ ...editForm, supplier_name: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Invoice Number</label>
                    <input
                      type="text"
                      value={editForm.invoice_number || ''}
                      onChange={(e) => setEditForm({ ...editForm, invoice_number: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                    />
                  </div>
                </>
              )}

              {editTarget.moduleStore === 'processing' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Gross Raw (KG)</label>
                      <input
                        type="number"
                        step="0.001"
                        value={editForm.gross_raw_kg || ''}
                        onChange={(e) => setEditForm({ ...editForm, gross_raw_kg: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Net Powder (KG)</label>
                      <input
                        type="number"
                        step="0.001"
                        value={editForm.net_powder_kg || ''}
                        onChange={(e) => setEditForm({ ...editForm, net_powder_kg: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono"
                      />
                    </div>
                  </div>
                </>
              )}

              {editTarget.moduleStore === 'packaging' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Packets Produced</label>
                      <input
                        type="number"
                        value={editForm.packet_quantity || ''}
                        onChange={(e) => setEditForm({ ...editForm, packet_quantity: parseInt(e.target.value, 10) || 0 })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Powder Used (KG)</label>
                      <input
                        type="number"
                        step="0.001"
                        value={editForm.powder_used_kg || ''}
                        onChange={(e) => setEditForm({ ...editForm, powder_used_kg: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono"
                      />
                    </div>
                  </div>
                </>
              )}

              {editTarget.moduleStore === 'order_sale' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">KG Sold</label>
                      <input
                        type="number"
                        step="0.001"
                        value={editForm.kg_sold || ''}
                        onChange={(e) => setEditForm({ ...editForm, kg_sold: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Packets Deducted</label>
                      <input
                        type="number"
                        value={editForm.packets_deducted || ''}
                        onChange={(e) => setEditForm({ ...editForm, packets_deducted: parseInt(e.target.value, 10) || 0 })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono"
                      />
                    </div>
                  </div>
                </>
              )}

              {editTarget.moduleStore === 'sales_return' && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Returned</label>
                      <input
                        type="number"
                        value={editForm.returned_packets || ''}
                        onChange={(e) => setEditForm({ ...editForm, returned_packets: parseInt(e.target.value, 10) || 0 })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Reusable</label>
                      <input
                        type="number"
                        value={editForm.reusable_packets || ''}
                        onChange={(e) => setEditForm({ ...editForm, reusable_packets: parseInt(e.target.value, 10) || 0 })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Rejected</label>
                      <input
                        type="number"
                        value={editForm.rejected_packets || ''}
                        onChange={(e) => setEditForm({ ...editForm, rejected_packets: parseInt(e.target.value, 10) || 0 })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">Remarks</label>
                <input
                  type="text"
                  value={editForm.remarks || ''}
                  onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Reason for Edit <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="e.g. Typo in entered weight"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="flex space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="flex-1 py-2.5 bg-brand-900 hover:bg-brand-800 text-gold-300 font-black rounded-xl text-xs uppercase shadow transition"
                >
                  {editLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
