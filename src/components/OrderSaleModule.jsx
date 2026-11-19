import React, { useState, useEffect } from 'react';
import { 
  ShoppingBag, 
  Search, 
  Calendar, 
  Scale, 
  Plus, 
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  Boxes, 
  Layers, 
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react';
import { getDB } from '../services/db';
import { 
  generateEntryId, 
  generateOrderId, 
  getTodayDateStr, 
  getFinishedStockSummary,
  validateSaleKg,
  calculateFifoAllocation
} from '../services/inventoryEngine';
import { queueSyncRecord } from '../services/syncService';
import SaveConfirmationModal from './SaveConfirmationModal';

const AVAILABLE_PACK_SIZES = [10, 24, 50, 100, 200, 500];

export default function OrderSaleModule({ activeEmployee, onOpenEmployeeModal }) {
  const [finishedStockSummary, setFinishedStockSummary] = useState(null);
  const [productsList, setProductsList] = useState([]);
  const [history, setHistory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedOrders, setExpandedOrders] = useState({});
  const [saveConfirmation, setSaveConfirmation] = useState(null);

  // Order Header Form
  const [orderDate, setOrderDate] = useState(getTodayDateStr());
  const [orderRemarks, setOrderRemarks] = useState('');

  // Order Line Items: Array of line objects (STRICTLY IN KG ONLY)
  const [lineItems, setLineItems] = useState([
    {
      id: 1,
      saleMethod: 'FIFO', // 'FIFO' (Product-wise) or 'BATCH' (Batch-wise)
      productName: '',
      batchId: '',
      packSizeGm: 100,
      kgSold: '',
      error: null,
      allocations: []
    }
  ]);

  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const db = await getDB();
      const allProds = await db.getAll('products');
      const activeProds = allProds.filter(p => p.active !== false);
      setProductsList(activeProds);

      const summary = await getFinishedStockSummary();
      setFinishedStockSummary(summary);

      if (activeProds.length > 0) {
        setLineItems([
          {
            id: Date.now(),
            saleMethod: 'FIFO',
            productName: activeProds[0].name,
            batchId: '',
            packSizeGm: 100,
            kgSold: '',
            error: null,
            allocations: []
          }
        ]);
      }

      await loadHistory();
    } catch (err) {
      console.error('Failed to init Order / Sale:', err);
    }
  };

  const loadHistory = async () => {
    try {
      const db = await getDB();
      const all = await db.getAll('order_sale');
      all.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));
      setHistory(all);
    } catch (err) {
      console.error('Failed to load order history:', err);
    }
  };

  // Add line item
  const handleAddLineItem = () => {
    const defaultProd = productsList[0]?.name || '';
    setLineItems(prev => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        saleMethod: 'FIFO',
        productName: defaultProd,
        batchId: '',
        packSizeGm: 100,
        kgSold: '',
        error: null,
        allocations: []
      }
    ]);
  };

  // Remove line item
  const handleRemoveLineItem = (id) => {
    if (lineItems.length === 1) {
      setErrorMsg('An order must have at least one product line item.');
      setTimeout(() => setErrorMsg(null), 3000);
      return;
    }
    setLineItems(prev => prev.filter(item => item.id !== id));
  };

  // Update line item
  const handleUpdateLine = async (id, field, value) => {
    const updated = lineItems.map(item => {
      if (item.id === id) {
        return { ...item, [field]: value };
      }
      return item;
    });

    setLineItems(updated);
    // Validate this specific line
    const currentItem = updated.find(i => i.id === id);
    if (currentItem && currentItem.kgSold && currentItem.productName) {
      await validateAndAllocateLine(currentItem, id);
    }
  };

  // Validate line and preview FIFO / Batch allocation (STRICTLY IN KG ONLY)
  const validateAndAllocateLine = async (line, id) => {
    const kg = parseFloat(line.kgSold);
    const size = parseInt(line.packSizeGm, 10);

    if (isNaN(kg) || kg <= 0) {
      setLineItems(prev => prev.map(item => item.id === id ? { ...item, error: null, allocations: [] } : item));
      return;
    }

    const validation = validateSaleKg(kg);
    if (!validation.valid) {
      setLineItems(prev => prev.map(item => item.id === id ? { ...item, error: validation.error, allocations: [] } : item));
      return;
    }

    if (line.saleMethod === 'FIFO') {
      try {
        const allocations = await calculateFifoAllocation(line.productName, size, kg);
        setLineItems(prev => prev.map(item => item.id === id ? { 
          ...item, 
          error: null, 
          allocations 
        } : item));
      } catch (err) {
        setLineItems(prev => prev.map(item => item.id === id ? { 
          ...item, 
          error: err.message, 
          allocations: [] 
        } : item));
      }
    } else {
      // Batch-wise sale
      if (!line.batchId) {
        setLineItems(prev => prev.map(item => item.id === id ? { 
          ...item, 
          error: 'Please select a batch for batch-wise sale', 
          allocations: [] 
        } : item));
        return;
      }

      // Check stock in selected batch in KG
      const stockItem = finishedStockSummary?.allItems?.find(
        i => i.batchId === line.batchId && i.packSizeGm === size
      );
      const availableKg = stockItem?.remainingKg || 0;

      if (availableKg < kg - 0.0001) {
        setLineItems(prev => prev.map(item => item.id === id ? { 
          ...item, 
          error: `Insufficient stock in Batch ${line.batchId} (${size} GM). Available: ${availableKg.toFixed(3)} KG, Required: ${kg.toFixed(3)} KG`, 
          allocations: [] 
        } : item));
      } else {
        const singleAllocation = [{
          batchId: line.batchId,
          productName: line.productName,
          packSizeGm: size,
          kgSold: kg,
          availableBeforeSale: availableKg,
          remainingAfterSale: Number((availableKg - kg).toFixed(3))
        }];
        setLineItems(prev => prev.map(item => item.id === id ? { 
          ...item, 
          error: null, 
          allocations: singleAllocation 
        } : item));
      }
    }
  };

  // Get available batches for a product and pack size (in KG)
  const getEligibleBatchesForLine = (productName, packSizeGm) => {
    if (!finishedStockSummary || !finishedStockSummary.allItems) return [];
    return finishedStockSummary.allItems.filter(
      item => item.productName.toLowerCase() === (productName || '').toLowerCase() &&
              item.packSizeGm === parseInt(packSizeGm, 10) &&
              item.remainingKg > 0.0001
    );
  };

  // Overall order totals in KG ONLY
  let totalOrderKg = 0;
  let hasAnyError = false;

  lineItems.forEach(line => {
    const kg = parseFloat(line.kgSold) || 0;
    totalOrderKg += kg;
    if (line.error || !line.kgSold || (line.saleMethod === 'BATCH' && !line.batchId)) {
      hasAnyError = true;
    }
  });

  totalOrderKg = Number(totalOrderKg.toFixed(3));

  // Handle Order Submit (STRICTLY IN KG ONLY)
  const handleOrderSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!activeEmployee) {
      setErrorMsg('Please select an active employee name before saving.');
      if (onOpenEmployeeModal) onOpenEmployeeModal();
      return;
    }

    if (lineItems.length === 0) {
      setErrorMsg('Please add at least one product line item.');
      return;
    }

    // Refresh stock check atomically
    const latestSummary = await getFinishedStockSummary();
    setFinishedStockSummary(latestSummary);

    // Validate all line items together in KG
    const orderId = generateOrderId();
    const timestamp = new Date().toISOString();
    const allRecordsToSave = [];

    // Temporary ledger in KG to simulate stock deductions across lines in same order
    const tempLedger = {};
    latestSummary.allItems.forEach(i => {
      tempLedger[`${i.batchId}__${i.packSizeGm}`] = Number(i.remainingKg) || 0;
    });

    try {
      for (let i = 0; i < lineItems.length; i++) {
        const line = lineItems[i];
        const lineNum = i + 1;
        const kg = parseFloat(line.kgSold);
        const size = parseInt(line.packSizeGm, 10);

        if (isNaN(kg) || kg <= 0) {
          throw new Error(`Line ${lineNum} (${line.productName}): Please enter a valid KG quantity.`);
        }

        const val = validateSaleKg(kg);
        if (!val.valid) {
          throw new Error(`Line ${lineNum} (${line.productName}): ${val.error}`);
        }

        if (line.saleMethod === 'BATCH') {
          if (!line.batchId) {
            throw new Error(`Line ${lineNum} (${line.productName}): Please select a Batch ID.`);
          }
          const ledgerKey = `${line.batchId}__${size}`;
          const availableInLedger = tempLedger[ledgerKey] || 0;
          if (availableInLedger < kg - 0.0001) {
            throw new Error(`Line ${lineNum}: Insufficient stock in Batch ${line.batchId} (${size} GM). Available: ${availableInLedger.toFixed(3)} KG, Required: ${kg.toFixed(3)} KG.`);
          }

          tempLedger[ledgerKey] = Number((availableInLedger - kg).toFixed(3));

          allRecordsToSave.push({
            entry_id: generateEntryId('SL'),
            order_id: orderId,
            date: orderDate,
            sale_method: 'Batch-wise',
            product_name: line.productName,
            batch_id: line.batchId,
            pack_size_gm: size,
            kg_sold: kg,
            employee_name: activeEmployee.name,
            timestamp: timestamp,
            remarks: orderRemarks.trim() || '',
            synced: false
          });

        } else {
          // FIFO Mode
          const db = await getDB();
          const rawList = await db.getAll('raw_material');
          const batchDateMap = {};
          rawList.forEach(r => { batchDateMap[r.batch_id] = r.date || r.timestamp; });

          const eligibleBatches = latestSummary.allItems
            .filter(item => 
              item.productName.toLowerCase() === line.productName.toLowerCase() &&
              item.packSizeGm === size &&
              (tempLedger[`${item.batchId}__${size}`] || 0) > 0.0001
            )
            .sort((a, b) => {
              const dateA = batchDateMap[a.batchId] || '';
              const dateB = batchDateMap[b.batchId] || '';
              if (dateA !== dateB) return dateA.localeCompare(dateB);
              return a.batchId.localeCompare(b.batchId);
            });

          const totalAvailInLedger = eligibleBatches.reduce((acc, b) => acc + (tempLedger[`${b.batchId}__${size}`] || 0), 0);

          if (totalAvailInLedger < kg - 0.0001) {
            throw new Error(
              `Line ${lineNum} (${line.productName} - ${size} GM): Insufficient FIFO stock. Required: ${kg} KG, Available: ${totalAvailInLedger.toFixed(3)} KG across batches.`
            );
          }

          let kgLeft = kg;
          for (const b of eligibleBatches) {
            if (kgLeft <= 0.0001) break;
            const ledgerKey = `${b.batchId}__${size}`;
            const availInBatch = tempLedger[ledgerKey] || 0;
            const take = Math.min(kgLeft, availInBatch);
            const roundedTake = Number(take.toFixed(3));

            tempLedger[ledgerKey] = Number((availInBatch - roundedTake).toFixed(3));
            kgLeft = Number((kgLeft - roundedTake).toFixed(3));

            allRecordsToSave.push({
              entry_id: generateEntryId('SL'),
              order_id: orderId,
              date: orderDate,
              sale_method: 'FIFO (Product-wise)',
              product_name: line.productName,
              batch_id: b.batchId,
              pack_size_gm: size,
              kg_sold: roundedTake,
              employee_name: activeEmployee.name,
              timestamp: timestamp,
              remarks: orderRemarks.trim() || '',
              synced: false
            });
          }
        }
      }

      // Atomically write all records
      setLoading(true);
      const db = await getDB();
      const tx = db.transaction('order_sale', 'readwrite');
      for (const rec of allRecordsToSave) {
        await tx.store.add(rec);
      }
      await tx.done;

      // Queue for Firebase Sync
      for (const rec of allRecordsToSave) {
        await queueSyncRecord('ORDER_SALE', rec);
      }

      setSaveConfirmation({
        entryId: orderId,
        date: orderDate,
        productName: lineItems.map(li => li.productName).filter(Boolean).join(', '),
        quantity: `${totalOrderKg} KG`,
        batchId: 'Multi-Batch (FIFO)',
        moduleName: 'Order / Sale Dispatch'
      });

      setSuccessMsg(
        `Order ${orderId} saved successfully! Dispatched ${totalOrderKg} KG across ${allRecordsToSave.length} allocation entries.`
      );

      // Reset form
      setOrderRemarks('');
      setLineItems([
        {
          id: Date.now(),
          saleMethod: 'FIFO',
          productName: productsList[0]?.name || '',
          batchId: '',
          packSizeGm: 100,
          kgSold: '',
          error: null,
          allocations: []
        }
      ]);

      // Refresh stock
      const updatedSummary = await getFinishedStockSummary();
      setFinishedStockSummary(updatedSummary);
      await loadHistory();

    } catch (err) {
      setErrorMsg(`Order Validation Failed: ${err.message}. Order was rejected and stock was NOT deducted.`);
    } finally {
      setLoading(false);
    }
  };

  // Group history by Order ID for clean display
  const ordersGrouped = history.reduce((acc, item) => {
    const oId = item.order_id || 'LEGACY';
    if (!acc[oId]) {
      acc[oId] = {
        orderId: oId,
        date: item.date,
        employeeName: item.employee_name,
        timestamp: item.timestamp,
        totalKg: 0,
        items: []
      };
    }
    acc[oId].totalKg += Number(item.kg_sold) || 0;
    acc[oId].items.push(item);
    return acc;
  }, {});

  const orderList = Object.values(ordersGrouped);
  const filteredOrders = orderList.filter(o => {
    return (
      o.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.items.some(i => i.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        i.batch_id.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  });

  const toggleExpandOrder = (oId) => {
    setExpandedOrders(prev => ({ ...prev, [oId]: !prev[oId] }));
  };

  return (
    <div className="space-y-6 pb-20 md:pb-6 animate-fadeIn">
      
      {/* Module Title Banner */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-700 text-white flex items-center justify-center shadow-sm">
            <ShoppingBag className="w-6 h-6 text-gold-300" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              MODULE 4: ORDER / SALE (STOCK DISPATCH)
            </h2>
            <p className="text-xs text-slate-500">
              Record inventory sales strictly in KG. Multi-product orders, real-time stock checks & FIFO allocation.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          <span className="text-slate-500">Active Staff:</span>
          <span className="font-bold text-emerald-950 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-300">
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

      {/* Multi-Product Order Form Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-800 to-teal-800 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShoppingBag className="w-4 h-4 text-gold-300" />
            <h3 className="font-bold text-sm tracking-wide">New Multi-Product Order Form (KG Only)</h3>
          </div>
          <span className="text-[11px] font-mono text-gold-200 bg-white/10 px-2 py-0.5 rounded">
            Strict KG Inventory Tracking • No Financials
          </span>
        </div>

        <form onSubmit={handleOrderSubmit} className="p-4 sm:p-6 space-y-5">
          
          {/* Order Header Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-4 border-b border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Sale Date
              </label>
              <input
                type="date"
                required
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Dispatched By (Staff)
              </label>
              <input
                type="text"
                readOnly
                value={activeEmployee?.name || 'Please select employee'}
                className="w-full bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-xl px-3 py-2.5 text-xs focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Order Notes / Customer Name (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Surat Supermarket, Truck #4"
                value={orderRemarks}
                onChange={(e) => setOrderRemarks(e.target.value)}
                className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>

          {/* Line Items List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Order Line Items ({lineItems.length})
              </h4>
              <button
                type="button"
                onClick={handleAddLineItem}
                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs rounded-lg flex items-center space-x-1.5 transition active:scale-95 shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>ADD PRODUCT</span>
              </button>
            </div>

            {lineItems.map((line, idx) => {
              const eligibleBatches = getEligibleBatchesForLine(line.productName, line.packSizeGm);

              return (
                <div
                  key={line.id}
                  className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-3 hover:border-emerald-300 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-emerald-900 bg-emerald-100/80 px-2 py-0.5 rounded">
                      Product #{idx + 1}
                    </span>
                    {lineItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLineItem(line.id)}
                        className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 text-xs flex items-center space-x-1 font-semibold"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    
                    {/* Product Name */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                        Product *
                      </label>
                      <select
                        required
                        value={line.productName}
                        onChange={(e) => handleUpdateLine(line.id, 'productName', e.target.value)}
                        className="w-full bg-white border border-slate-300 text-slate-900 font-bold rounded-lg px-2.5 py-2 text-xs focus:ring-1 focus:ring-emerald-600"
                      >
                        {productsList.map((p) => (
                          <option key={p.id} value={p.name}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Sale Method */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                        Sale Method *
                      </label>
                      <select
                        value={line.saleMethod}
                        onChange={(e) => handleUpdateLine(line.id, 'saleMethod', e.target.value)}
                        className="w-full bg-white border border-slate-300 text-slate-900 font-bold rounded-lg px-2.5 py-2 text-xs focus:ring-1 focus:ring-emerald-600"
                      >
                        <option value="FIFO">Method B: FIFO (Auto Oldest Batch)</option>
                        <option value="BATCH">Method A: Batch-Wise Manual</option>
                      </select>
                    </div>

                    {/* Batch ID (if Batch-wise) */}
                    {line.saleMethod === 'BATCH' ? (
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                          Select Batch *
                        </label>
                        <select
                          required
                          value={line.batchId}
                          onChange={(e) => handleUpdateLine(line.id, 'batchId', e.target.value)}
                          className="w-full bg-white border border-slate-300 text-slate-900 font-bold rounded-lg px-2.5 py-2 text-xs focus:ring-1 focus:ring-emerald-600"
                        >
                          <option value="">Select Batch...</option>
                          {eligibleBatches.map((b) => (
                            <option key={b.batchId} value={b.batchId}>
                              {b.batchId} ({b.remainingKg} KG avail)
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                          Batch Allocation
                        </label>
                        <div className="bg-slate-200/60 text-slate-700 font-semibold px-2.5 py-2 text-xs rounded-lg truncate">
                          FIFO Oldest First
                        </div>
                      </div>
                    )}

                    {/* Pack Size */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                        Pack Size *
                      </label>
                      <select
                        value={line.packSizeGm}
                        onChange={(e) => handleUpdateLine(line.id, 'packSizeGm', parseInt(e.target.value, 10))}
                        className="w-full bg-white border border-slate-300 text-slate-900 font-bold rounded-lg px-2.5 py-2 text-xs focus:ring-1 focus:ring-emerald-600"
                      >
                        {AVAILABLE_PACK_SIZES.map((size) => (
                          <option key={size} value={size}>
                            {size} GM
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* KG Sold Direct Input */}
                    <div>
                      <label className="block text-[11px] font-bold text-emerald-950 uppercase mb-1">
                        KG Sold (Direct Weight) *
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.001"
                          min="0.001"
                          inputMode="decimal"
                          required
                          placeholder="e.g. 10.5"
                          value={line.kgSold}
                          onChange={(e) => handleUpdateLine(line.id, 'kgSold', e.target.value)}
                          className="w-full bg-white border-2 border-emerald-400 text-emerald-950 font-black rounded-lg px-2.5 py-1.5 text-base sm:text-sm focus:ring-2 focus:ring-emerald-600"
                        />
                        <span className="absolute right-2.5 top-2 text-xs font-bold text-slate-400">
                          KG
                        </span>
                      </div>
                    </div>

                  </div>

                  {/* Allocation Preview in KG */}
                  {line.allocations && line.allocations.length > 0 && (
                    <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2">
                      <div className="text-[11px] text-slate-600 flex flex-wrap gap-1 items-center">
                        <span className="font-semibold text-emerald-800">Allocated Batches:</span>
                        {line.allocations.map((a, aIdx) => (
                          <span key={aIdx} className="bg-white border border-emerald-300 px-2 py-0.5 rounded font-mono font-bold text-emerald-900 shadow-xs">
                            {a.batchId}: {a.kgSold} KG (Bal: {a.remainingAfterSale} KG)
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Line Error */}
                  {line.error && (
                    <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-semibold flex items-center space-x-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{line.error}</span>
                    </div>
                  )}

                </div>
              );
            })}
          </div>

          {/* Add Product Line Button */}
          <button
            type="button"
            onClick={handleAddLineItem}
            className="w-full py-2.5 border-2 border-dashed border-emerald-400 hover:border-emerald-600 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-800 font-bold rounded-xl text-xs flex items-center justify-center space-x-2 transition"
          >
            <Plus className="w-4 h-4" />
            <span>+ ADD ANOTHER PRODUCT / PACK SIZE TO THIS ORDER</span>
          </button>

          {/* Order Summary & Submit Bar (STRICTLY IN KG ONLY) */}
          <div className="p-4 bg-emerald-900 text-white rounded-xl shadow-inner flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs text-gold-300 uppercase tracking-wider font-bold">
                Order Dispatch Summary
              </div>
              <div className="flex items-baseline space-x-4 mt-0.5">
                <div>
                  <span className="text-2xl font-black">{totalOrderKg}</span>
                  <span className="text-xs font-bold text-gold-300 ml-1">TOTAL KG</span>
                </div>
                <div className="text-slate-300 text-xs">
                  {lineItems.length} product line(s) ready for dispatch
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || totalOrderKg <= 0 || hasAnyError}
              className="px-6 py-3 bg-gold-500 hover:bg-gold-600 active:scale-95 text-slate-950 font-black rounded-xl shadow-md transition flex items-center justify-center space-x-2 text-sm disabled:opacity-50"
            >
              <ShoppingBag className="w-4 h-4 text-slate-950" />
              <span>{loading ? 'Validating & Saving...' : `Confirm & Save Order (${totalOrderKg} KG)`}</span>
            </button>
          </div>

        </form>
      </div>

      {/* Order Sale History Table with Expandable Line Items */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide">
              Sales & Dispatch History (KG Only)
            </h3>
            <p className="text-xs text-slate-500">
              Orders and batch-wise allocation records
            </p>
          </div>

          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search Order ID / Batch / Product..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-600"
            />
          </div>
        </div>

        <div className="divide-y divide-slate-200">
          {filteredOrders.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              No sales transactions recorded yet.
            </div>
          ) : (
            filteredOrders.map((order) => {
              const isExpanded = !!expandedOrders[order.orderId];
              return (
                <div key={order.orderId} className="hover:bg-slate-50/50 transition">
                  {/* Order Header Summary Row */}
                  <div 
                    onClick={() => toggleExpandOrder(order.orderId)}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-800 flex items-center justify-center font-bold text-xs">
                        {order.items.length}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-black text-sm text-slate-900">
                            {order.orderId}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            ({order.date})
                          </span>
                        </div>
                        <div className="text-xs text-slate-600">
                          Staff: <span className="font-medium text-slate-800">{order.employeeName}</span>
                          {order.items[0]?.remarks && (
                            <span className="ml-2 text-slate-400">"{order.items[0].remarks}"</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4 self-end sm:self-auto">
                      <div className="text-right">
                        <div className="text-sm font-black text-emerald-800">
                          {Number(order.totalKg).toFixed(3)} KG
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {order.items.length} item(s) dispatched
                        </div>
                      </div>
                      <div className="p-1 rounded-full bg-slate-100 text-slate-600">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Line Items Table */}
                  {isExpanded && (
                    <div className="bg-slate-50 p-3 border-t border-slate-200">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="text-slate-500 uppercase font-semibold text-[10px]">
                            <th className="py-1 px-2">Line Entry ID</th>
                            <th className="py-1 px-2">Product</th>
                            <th className="py-1 px-2">Allocated Batch</th>
                            <th className="py-1 px-2">Pack Size</th>
                            <th className="py-1 px-2 text-right">KG Sold</th>
                            <th className="py-1 px-2">Method</th>
                            <th className="py-1 px-2 text-center">Sync</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/60 font-medium">
                          {order.items.map((line) => (
                            <tr key={line.entry_id}>
                              <td className="py-1.5 px-2 font-mono text-[10px] text-slate-500">{line.entry_id}</td>
                              <td className="py-1.5 px-2 font-bold text-slate-900">{line.product_name}</td>
                              <td className="py-1.5 px-2 font-mono font-bold text-brand-900">{line.batch_id}</td>
                              <td className="py-1.5 px-2">{line.pack_size_gm} GM</td>
                              <td className="py-1.5 px-2 text-right font-black text-emerald-800">{Number(line.kg_sold).toFixed(3)} KG</td>
                              <td className="py-1.5 px-2 text-[10px] text-slate-500">{line.sale_method}</td>
                              <td className="py-1.5 px-2 text-center">
                                {line.synced ? (
                                  <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1 py-0.5 rounded">Synced</span>
                                ) : (
                                  <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1 py-0.5 rounded">Pending</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                </div>
              );
            })
          )}
        </div>

      </div>

      {/* Save Confirmation Modal */}
      <SaveConfirmationModal
        isOpen={Boolean(saveConfirmation)}
        onClose={() => setSaveConfirmation(null)}
        data={saveConfirmation}
      />

    </div>
  );
}
