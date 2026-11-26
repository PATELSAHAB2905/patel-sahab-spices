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
  Hash,
  Eye,
  Edit3,
  Trash2,
  X,
  RotateCcw,
  AlertTriangle
} from 'lucide-react';
import { getDB } from '../services/db';
import { 
  generateEntryId, 
  generateNextBatchId, 
  getTodayDateStr,
  editRawMaterialEntry,
  deleteRawMaterialEntry,
  validateRawMaterialDelete,
  validateRawMaterialEdit,
  isRecordActive
} from '../services/inventoryEngine';
import { queueSyncRecord } from '../services/syncService';
import SaveConfirmationModal from './SaveConfirmationModal';

export default function RawMaterialInward({ activeEmployee, onOpenEmployeeModal }) {
  const [products, setProducts] = useState([]);
  const [history, setHistory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [saveConfirmation, setSaveConfirmation] = useState(null);
  
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

  // 1. Details Modal State
  const [detailModalItem, setDetailModalItem] = useState(null);

  // 2. Edit Modal State
  const [editModalItem, setEditModalItem] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [editReason, setEditReason] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState(null);

  // 3. Delete / Reverse Modal State
  const [deleteModalItem, setDeleteModalItem] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [deleteDepCheck, setDeleteDepCheck] = useState(null);

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

      const today = getTodayDateStr();
      if (activeProds.length > 0) {
        const firstProd = activeProds[0];
        const nextBatch = await generateNextBatchId(firstProd.name, today);
        setFormData(prev => ({
          ...prev,
          entryId: generateEntryId('RM'),
          date: today,
          materialName: firstProd.name,
          productPrefix: firstProd.prefix,
          batchId: nextBatch
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          entryId: generateEntryId('RM'),
          date: today
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
    const nextBatch = await generateNextBatchId(selectedName, formData.date);

    setFormData(prev => ({
      ...prev,
      materialName: selectedName,
      productPrefix: prefix,
      batchId: nextBatch
    }));
  };

  const handleDateChange = async (newDate) => {
    const nextBatch = await generateNextBatchId(formData.materialName || formData.productPrefix, newDate);
    setFormData(prev => ({
      ...prev,
      date: newDate,
      batchId: nextBatch
    }));
  };

  const handleAutoGenerateBatch = async () => {
    const nextBatch = await generateNextBatchId(formData.materialName || formData.productPrefix, formData.date);
    setFormData(prev => ({ ...prev, batchId: nextBatch }));
  };

  // Permission check for editing and deleting
  const isAdmin = 
    activeEmployee?.role === 'Administrator' || 
    activeEmployee?.role === 'admin' || 
    activeEmployee?.employee_id === 'ADMIN';

  const canEditOrDelete = (item) => {
    if (item.is_reversed) return false;
    if (isAdmin) return true;
    const currentEmpName = (activeEmployee?.name || '').trim().toLowerCase();
    const currentEmpId = (activeEmployee?.employee_id || activeEmployee?.id || '').trim().toUpperCase();
    const itemEmpName = (item.employee_name || '').trim().toLowerCase();
    const itemEmpId = (item.employee_id || item.created_by_id || '').trim().toUpperCase();
    return (currentEmpId && itemEmpId && currentEmpId === itemEmpId) || (currentEmpName && itemEmpName && currentEmpName === itemEmpName);
  };

  // Open Edit Modal
  const handleOpenEditModal = (item) => {
    setEditModalItem(item);
    setEditFormData({
      date: item.date || item.timestamp?.slice(0, 10),
      batch_id: item.batch_id || '',
      material_name: item.material_name || '',
      supplier_name: item.supplier_name || '',
      invoice_number: item.invoice_number || '',
      quantity_kg: item.quantity_kg || '',
      remarks: item.remarks || ''
    });
    setEditReason('');
    setEditError(null);
  };

  // Save Edit
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editModalItem) return;
    if (!editReason.trim()) {
      setEditError('A reason for modifying this entry is mandatory.');
      return;
    }
    setEditLoading(true);
    setEditError(null);
    try {
      const currentUserName = activeEmployee?.name || 'Staff';
      const currentUserRole = activeEmployee?.role || (isAdmin ? 'admin' : 'staff');
      await editRawMaterialEntry(
        editModalItem.entry_id,
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
        currentUserRole
      );

      setSuccessMsg(`Raw Material entry "${editModalItem.entry_id}" updated successfully.`);
      setEditModalItem(null);
      await loadHistory();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditLoading(false);
    }
  };

  // Open Delete Modal
  const handleOpenDeleteModal = async (item) => {
    setDeleteModalItem(item);
    setDeleteReason('');
    setDeleteError(null);
    setDeleteDepCheck(null);

    try {
      const check = await validateRawMaterialDelete(item.entry_id);
      setDeleteDepCheck(check);
    } catch (err) {
      setDeleteError(err.message);
    }
  };

  // Confirm Delete
  const handleConfirmDelete = async (e) => {
    e.preventDefault();
    if (!deleteModalItem) return;
    if (!deleteReason.trim()) {
      setDeleteError('A reason for deletion / reversal is mandatory.');
      return;
    }
    setDeleteLoading(true);
    try {
      const currentUserName = activeEmployee?.name || 'Staff';
      const currentUserRole = activeEmployee?.role || (isAdmin ? 'admin' : 'staff');
      await deleteRawMaterialEntry(
        deleteModalItem.entry_id,
        deleteReason.trim(),
        currentUserName,
        currentUserRole
      );

      setSuccessMsg(`Raw Material entry "${deleteModalItem.entry_id}" deleted / reversed and excluded from stock.`);
      setDeleteModalItem(null);
      await loadHistory();
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleteLoading(false);
    }
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
        employee_id: activeEmployee.employee_id || activeEmployee.id || '',
        created_by_id: activeEmployee.employee_id || activeEmployee.id || '',
        timestamp: timestamp,
        remarks: formData.remarks.trim() || '',
        synced: false,
        is_reversed: false
      };

      // 1. Save to local IndexedDB
      await db.add('raw_material', record);

      // 2. Queue for Firebase synchronization
      await queueSyncRecord('RAW_MATERIAL', record);

      setSaveConfirmation({
        entryId: record.entry_id,
        date: record.date,
        productName: record.material_name,
        quantity: `${record.quantity_kg} KG`,
        batchId: record.batch_id,
        moduleName: 'Raw Material Inward'
      });

      setSuccessMsg(`Raw Material Received! Batch ${record.batch_id} (${record.quantity_kg} KG) saved successfully.`);

      // Reset form with new batch ID & entry ID
      const nextBatch = await generateNextBatchId(formData.materialName || formData.productPrefix, formData.date);
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
                  onChange={(e) => handleDateChange(e.target.value)}
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
                  placeholder="e.g. H1126A, M1126A, D1126A or Custom Batch"
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
                  inputMode="decimal"
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
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-8 text-center text-slate-400">
                    No raw material inward entries found. Create your first entry above.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((item) => (
                  <tr key={item.entry_id} className={`hover:bg-slate-50/80 transition-colors ${item.is_reversed ? 'opacity-50 bg-slate-50/50' : ''}`}>
                    <td className="py-2.5 px-3 font-medium text-slate-800 whitespace-nowrap">
                      {item.date}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className={`font-mono font-bold px-2 py-0.5 rounded border ${
                        item.is_reversed 
                          ? 'bg-slate-200 text-slate-500 border-slate-300 line-through' 
                          : 'text-brand-900 bg-brand-50 border-brand-200'
                      }`}>
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
                      {item.is_reversed ? (
                        <span className="inline-block text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                          Reversed
                        </span>
                      ) : item.synced ? (
                        <span className="inline-block text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                          Synced
                        </span>
                      ) : (
                        <span className="inline-block text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end space-x-1">
                        {/* View Details Button */}
                        <button
                          type="button"
                          onClick={() => setDetailModalItem(item)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {/* Edit Button */}
                        {!item.is_reversed && canEditOrDelete(item) && (
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(item)}
                            className="p-1.5 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition"
                            title="Edit Entry"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Delete / Reverse Button */}
                        {!item.is_reversed && canEditOrDelete(item) && (
                          <button
                            type="button"
                            onClick={() => handleOpenDeleteModal(item)}
                            className="p-1.5 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition"
                            title="Delete / Reverse Entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* Save Confirmation Modal */}
      <SaveConfirmationModal
        isOpen={Boolean(saveConfirmation)}
        onClose={() => setSaveConfirmation(null)}
        data={saveConfirmation}
      />

      {/* 1. VIEW DETAILS MODAL */}
      {detailModalItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-brand-900" />
                <h3 className="text-sm font-black text-slate-900 uppercase">
                  Raw Material Inward Details
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailModalItem(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-slate-400 font-semibold block text-[10px] uppercase">Entry ID</span>
                <span className="font-mono font-bold text-slate-900">{detailModalItem.entry_id}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-slate-400 font-semibold block text-[10px] uppercase">Batch Number</span>
                <span className="font-mono font-black text-brand-900">{detailModalItem.batch_id}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-slate-400 font-semibold block text-[10px] uppercase">Material</span>
                <span className="font-bold text-slate-900">{detailModalItem.material_name}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-slate-400 font-semibold block text-[10px] uppercase">Quantity Received</span>
                <span className="font-mono font-black text-emerald-800 text-sm">{detailModalItem.quantity_kg} KG</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-slate-400 font-semibold block text-[10px] uppercase">Date</span>
                <span className="font-semibold text-slate-900">{detailModalItem.date}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-slate-400 font-semibold block text-[10px] uppercase">Supplier Name</span>
                <span className="font-semibold text-slate-900 truncate block">{detailModalItem.supplier_name}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-slate-400 font-semibold block text-[10px] uppercase">Invoice / Challan</span>
                <span className="font-mono text-slate-900">{detailModalItem.invoice_number || 'N/A'}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-slate-400 font-semibold block text-[10px] uppercase">Recorded By</span>
                <span className="font-semibold text-slate-900">{detailModalItem.employee_name || 'Staff'}</span>
              </div>
            </div>

            {detailModalItem.remarks && (
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs">
                <span className="text-slate-400 font-semibold block text-[10px] uppercase mb-0.5">Remarks</span>
                <p className="text-slate-700">{detailModalItem.remarks}</p>
              </div>
            )}

            {detailModalItem.is_reversed && (
              <div className="bg-red-50 p-3 rounded-xl border border-red-200 text-xs text-red-900 space-y-1">
                <div className="font-black flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <span>Entry Reversed & Excluded from Inventory</span>
                </div>
                <p className="text-[11px] text-red-800">Reason: {detailModalItem.reversal_reason || 'Not specified'}</p>
                <p className="text-[10px] text-red-600">Reversed by: {detailModalItem.reversed_by} at {detailModalItem.reversed_at ? new Date(detailModalItem.reversed_at).toLocaleString() : ''}</p>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setDetailModalItem(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. EDIT RAW MATERIAL ENTRY MODAL */}
      {editModalItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Edit3 className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-black text-slate-900 uppercase">
                  Edit Raw Material Entry #{editModalItem.entry_id}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditModalItem(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editError && (
              <div className="p-3 bg-red-50 border border-red-300 text-red-900 rounded-xl text-xs font-semibold flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Batch Number *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.batch_id}
                    onChange={(e) => setEditFormData({ ...editFormData, batch_id: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold text-slate-900 uppercase"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Changing batch updates linked records</span>
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
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-black text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Inward Date *</label>
                  <input
                    type="date"
                    required
                    value={editFormData.date}
                    onChange={(e) => setEditFormData({ ...editFormData, date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Supplier Name *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.supplier_name}
                    onChange={(e) => setEditFormData({ ...editFormData, supplier_name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-900"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Invoice / Challan No</label>
                  <input
                    type="text"
                    value={editFormData.invoice_number}
                    onChange={(e) => setEditFormData({ ...editFormData, invoice_number: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-900"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Remarks</label>
                  <input
                    type="text"
                    value={editFormData.remarks}
                    onChange={(e) => setEditFormData({ ...editFormData, remarks: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-900"
                  />
                </div>

                <div className="col-span-2 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                  <label className="block text-[11px] font-bold text-amber-900 uppercase mb-1">
                    Reason for Modification <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    required
                    placeholder="e.g. Corrected purchase invoice quantity as per weighbridge slip..."
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditModalItem(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs flex items-center space-x-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{editLoading ? 'Saving...' : 'Save Corrections'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. DELETE / REVERSE RAW MATERIAL ENTRY MODAL */}
      {deleteModalItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2 text-red-600">
                <Trash2 className="w-5 h-5" />
                <h3 className="text-sm font-black text-slate-900 uppercase">
                  Delete / Reverse Entry #{deleteModalItem.entry_id}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDeleteModalItem(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between font-medium">
                <span className="text-slate-500">Batch Number:</span>
                <span className="font-mono font-bold text-slate-900">{deleteModalItem.batch_id}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-slate-500">Material:</span>
                <span className="font-bold text-slate-900">{deleteModalItem.material_name}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-slate-500">Quantity to Reverse:</span>
                <span className="font-mono font-black text-red-700">{deleteModalItem.quantity_kg} KG</span>
              </div>
            </div>

            {deleteError ? (
              <div className="p-3 bg-red-50 border border-red-300 text-red-900 rounded-xl text-xs space-y-1.5">
                <div className="font-black flex items-center space-x-1.5 text-red-800">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>Unsafe Deletion Blocked</span>
                </div>
                <p className="text-[11px] text-red-700 leading-relaxed">{deleteError}</p>
              </div>
            ) : (
              <form onSubmit={handleConfirmDelete} className="space-y-3 text-xs">
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px]">
                  <strong>Safety Notice:</strong> Transactions are soft-reversed rather than permanently deleted. The quantity will be deducted from active stock calculations and an audit log will be preserved.
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Reason for Deletion / Reversal <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    required
                    placeholder="e.g. Accidental duplicate entry, order cancelled by supplier..."
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setDeleteModalItem(null)}
                    className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={deleteLoading}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs flex items-center space-x-1.5"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{deleteLoading ? 'Reversing...' : 'Confirm Reversal'}</span>
                  </button>
                </div>
              </form>
            )}

            {deleteError && (
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteModalItem(null)}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
