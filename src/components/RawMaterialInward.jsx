import React, { useState, useEffect } from 'react';
import { 
  PackagePlus, 
  Search, 
  Calendar, 
  User, 
  Tag, 
  Truck, 
  FileText, 
  Scale, 
  CheckCircle2, 
  AlertCircle,
  Plus,
  RefreshCw,
  Hash
} from 'lucide-react';
import { getDB } from '../services/db';
import { 
  generateEntryId, 
  generateNextBatchId, 
  getTodayDateStr 
} from '../services/inventoryEngine';
import { queueSyncRecord } from '../services/syncService';

export default function RawMaterialInward({ activeEmployee, onOpenEmployeeModal }) {
  const [products, setProducts] = useState([]);
  const [history, setHistory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  
  // Form State
  const [formData, setFormData] = useState({
    entryId: '',
    date: getTodayDateStr(),
    materialName: '',
    productPrefix: '',
    batchId: '',
    supplierName: '',
    invoiceNumber: '',
    quantityKg: '',
    remarks: '',
  });

  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Initialize form and products
  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const db = await getDB();
      const allProducts = await db.getAll('products');
      const activeProds = allProducts.filter(p => p.active !== false);
      setProducts(activeProds);

      if (activeProds.length > 0) {
        const firstProd = activeProds[0];
        const nextBatch = await generateNextBatchId(firstProd.prefix);
        setFormData(prev => ({
          ...prev,
          entryId: generateEntryId('RM'),
          materialName: firstProd.name,
          productPrefix: firstProd.prefix,
          batchId: nextBatch
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          entryId: generateEntryId('RM'),
        }));
      }

      await loadHistory();
    } catch (err) {
      console.error('Failed to initialize Raw Material Inward:', err);
    }
  };

  const loadHistory = async () => {
    try {
      const db = await getDB();
      const all = await db.getAll('raw_material');
      // Sort newest first
      all.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));
      setHistory(all);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  };

  const handleProductChange = async (e) => {
    const selectedName = e.target.value;
    const prod = products.find(p => p.name === selectedName);
    const prefix = prod ? prod.prefix : 'BAT';
    const nextBatch = await generateNextBatchId(prefix);

    setFormData(prev => ({
      ...prev,
      materialName: selectedName,
      productPrefix: prefix,
      batchId: nextBatch
    }));
  };

  const handleAutoGenerateBatch = async () => {
    const nextBatch = await generateNextBatchId(formData.productPrefix || 'BAT');
    setFormData(prev => ({ ...prev, batchId: nextBatch }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!activeEmployee) {
      setErrorMsg('Please select an active employee name before recording entries.');
      if (onOpenEmployeeModal) onOpenEmployeeModal();
      return;
    }

    if (!formData.materialName) {
      setErrorMsg('Please select a material / product name.');
      return;
    }

    const cleanBatch = (formData.batchId || '').trim().toUpperCase();
    if (!cleanBatch) {
      setErrorMsg('Please enter or type a Batch Number.');
      return;
    }

    const qty = parseFloat(formData.quantityKg);
    if (isNaN(qty) || qty <= 0) {
      setErrorMsg('Quantity received must be a valid number greater than 0 KG.');
      return;
    }

    if (!formData.supplierName.trim()) {
      setErrorMsg('Supplier name is required.');
      return;
    }

    setLoading(true);
    try {
      const db = await getDB();
      const timestamp = new Date().toISOString();

      const record = {
        entry_id: formData.entryId,
        date: formData.date,
        batch_id: cleanBatch,
        material_name: formData.materialName,
        supplier_name: formData.supplierName.trim(),
        invoice_number: formData.invoiceNumber.trim() || 'N/A',
        quantity_kg: Number(qty.toFixed(3)),
        employee_name: activeEmployee.name,
        timestamp: timestamp,
        remarks: formData.remarks.trim() || '',
        synced: false
      };

      // 1. Save to local IndexedDB
      await db.add('raw_material', record);

      // 2. Queue for Google Sheets synchronization
      await queueSyncRecord('RAW_MATERIAL', record);

      setSuccessMsg(`Raw Material Received! Batch ${record.batch_id} (${record.quantity_kg} KG) saved successfully.`);

      // Reset form with new batch ID & entry ID
      const nextBatch = await generateNextBatchId(formData.productPrefix);
      setFormData(prev => ({
        ...prev,
        entryId: generateEntryId('RM'),
        batchId: nextBatch,
        quantityKg: '',
        supplierName: '',
        invoiceNumber: '',
        remarks: ''
      }));

      await loadHistory();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save raw material entry.');
    } finally {
      setLoading(false);
    }
  };

  // Filtered history
  const filteredHistory = history.filter(item => {
    const matchesSearch = 
      (item.batch_id && item.batch_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.material_name && item.material_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.supplier_name && item.supplier_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.invoice_number && item.invoice_number.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.entry_id && item.entry_id.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesDate = !dateFilter || item.date === dateFilter;
    return matchesSearch && matchesDate;
  });

  const totalInwardKg = filteredHistory.reduce((sum, item) => sum + (Number(item.quantity_kg) || 0), 0);

  return (
    <div className="space-y-6 pb-20 md:pb-6 animate-fadeIn">
      
      {/* Module Title Banner */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-11 h-11 rounded-xl bg-brand-800 text-white flex items-center justify-center shadow-sm">
            <PackagePlus className="w-6 h-6 text-gold-300" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              MODULE 1: RAW MATERIAL INWARD
            </h2>
            <p className="text-xs text-slate-500">
              Record raw spice deliveries at godown & assign permanent Batch IDs
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          <span className="text-slate-500">Active Staff:</span>
          <span className="font-bold text-brand-900 bg-brand-50 px-2.5 py-1 rounded-lg border border-brand-200">
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
        <div className="bg-gradient-to-r from-brand-900 to-brand-800 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Plus className="w-4 h-4 text-gold-400" />
            <h3 className="font-bold text-sm tracking-wide">New Raw Material Inward Form</h3>
          </div>
          <span className="text-[11px] font-mono text-gold-200 bg-white/10 px-2 py-0.5 rounded">
            Auto Batch Generated
          </span>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Entry ID */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Entry ID (Auto)
              </label>
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  value={formData.entryId}
                  className="w-full bg-slate-100 border border-slate-200 text-slate-600 rounded-xl px-3 py-2.5 text-xs font-mono font-bold select-all focus:outline-none"
                />
              </div>
            </div>

            {/* Entry Date */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Inward Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-700"
                />
              </div>
            </div>

            {/* Product / Material Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Material / Product Name *
              </label>
              <select
                required
                value={formData.materialName}
                onChange={handleProductChange}
                className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl px-3 py-2.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand-700"
              >
                {products.map((prod) => (
                  <option key={prod.id} value={prod.name}>
                    {prod.name} ({prod.prefix})
                  </option>
                ))}
              </select>
            </div>

            {/* Batch ID (Editable / Manual Type or Auto-Suggest) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-brand-900 uppercase">
                  Batch Number *
                </label>
                <button
                  type="button"
                  onClick={handleAutoGenerateBatch}
                  className="text-[10px] text-brand-800 bg-gold-100 hover:bg-gold-200 border border-gold-300 px-2 py-0.5 rounded font-bold transition shadow-2xs"
                  title="Click to generate default batch number"
                >
                  ⚡ Auto-Suggest
                </button>
              </div>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="e.g. HAL-001 or Custom Batch"
                  value={formData.batchId}
                  onChange={(e) => setFormData({ ...formData, batchId: e.target.value.toUpperCase() })}
                  className="w-full bg-white border-2 border-gold-400 text-brand-900 font-black rounded-xl px-3 py-2 text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-brand-700 shadow-xs uppercase"
                />
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Type batch manually or use auto-suggested
              </span>
            </div>

            {/* Supplier Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Supplier Name *
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Agro Traders"
                  value={formData.supplierName}
                  onChange={(e) => setFormData({ ...formData, supplierName: e.target.value })}
                  className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl px-3 py-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-700"
                />
              </div>
            </div>

            {/* Invoice / Reference Number */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Invoice / Challan No (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. INV-9821 or Challan #12"
                value={formData.invoiceNumber}
                onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl px-3 py-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-700"
              />
            </div>

            {/* Quantity Received (KG) */}
            <div>
              <label className="block text-xs font-bold text-brand-900 uppercase mb-1 flex items-center justify-between">
                <span>Quantity Received (KG) *</span>
                <span className="text-[10px] text-slate-500 font-normal">Decimal supported</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  required
                  placeholder="e.g. 1000"
                  value={formData.quantityKg}
                  onChange={(e) => setFormData({ ...formData, quantityKg: e.target.value })}
                  className="w-full bg-white border-2 border-brand-300 text-slate-900 font-black rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-700"
                />
                <span className="absolute right-3 top-3 text-xs font-bold text-slate-400">
                  KG
                </span>
              </div>
            </div>

            {/* Employee Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Employee Name (Automatic)
              </label>
              <input
                type="text"
                readOnly
                value={activeEmployee?.name || 'Please select employee'}
                className="w-full bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-xl px-3 py-2.5 text-xs focus:outline-none"
              />
            </div>

          </div>

          {/* Remarks */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Remarks / Godown Location (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Godown Hall A, Gunny bags checked, Moisture 8%"
              value={formData.remarks}
              onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
              className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-700"
            />
          </div>

          {/* Submit Action */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              * Batch ID is permanent and will track through Processing, Packaging and Sale.
            </p>

            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto px-6 py-3 bg-brand-800 hover:bg-brand-900 active:scale-95 text-white font-bold rounded-xl shadow-md transition flex items-center justify-center space-x-2 text-sm disabled:opacity-50"
            >
              <PackagePlus className="w-4 h-4 text-gold-300" />
              <span>{loading ? 'Recording Inward...' : 'Save Raw Material Inward'}</span>
            </button>
          </div>

        </form>
      </div>

      {/* Raw Material Inward History Table with Search and Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide">
              Raw Material Inward Records
            </h3>
            <p className="text-xs text-slate-500">
              Filtered Total: <span className="font-bold text-brand-900">{totalInwardKg.toLocaleString()} KG</span> ({filteredHistory.length} batches)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search Batch, Product, Supplier..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-700"
              />
            </div>

            {/* Date filter */}
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="py-1.5 px-2 text-xs border border-slate-300 rounded-lg focus:outline-none"
            />
            {dateFilter && (
              <button
                onClick={() => setDateFilter('')}
                className="text-xs text-brand-700 hover:underline"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 uppercase font-bold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Batch ID</th>
                <th className="py-2.5 px-3">Material</th>
                <th className="py-2.5 px-3 text-right">Quantity (KG)</th>
                <th className="py-2.5 px-3">Supplier</th>
                <th className="py-2.5 px-3">Invoice</th>
                <th className="py-2.5 px-3">Recorded By</th>
                <th className="py-2.5 px-3 text-center">Sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-8 text-center text-slate-400">
                    No raw material inward entries found. Create your first entry above.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((item) => (
                  <tr key={item.entry_id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-slate-800 whitespace-nowrap">
                      {item.date}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="font-mono font-bold text-brand-900 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                        {item.batch_id}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                      {item.material_name}
                    </td>
                    <td className="py-2.5 px-3 font-black text-right text-slate-900 whitespace-nowrap">
                      {Number(item.quantity_kg).toLocaleString()} KG
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 truncate max-w-[140px]">
                      {item.supplier_name}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                      {item.invoice_number || 'N/A'}
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
