import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  Download, 
  Filter, 
  Search, 
  Calendar, 
  Layers, 
  RefreshCw, 
  CheckCircle2,
  ChevronRight,
  Boxes,
  Package,
  TrendingUp,
  Tag
} from 'lucide-react';
import { getDB } from '../services/db';
import { 
  getRawMaterialStockSummary, 
  getPowderStockSummary, 
  getFinishedStockSummary, 
  getBatchLifecycleReport 
} from '../services/inventoryEngine';

const REPORT_TYPES = [
  { id: 'batch_lifecycle', name: '13. Complete Batch Lifecycle Report (Traceability)', category: 'Lifecycle' },
  { id: 'raw_inward', name: '1. Raw Material Inward Report', category: 'Raw Material' },
  { id: 'raw_remaining', name: '2. Raw Material Remaining Stock', category: 'Raw Material' },
  { id: 'processing_history', name: '3. Processing History', category: 'Processing' },
  { id: 'processing_round', name: '4. Processing Round Report', category: 'Processing' },
  { id: 'powder_production', name: '5. Powder Production Report', category: 'Powder' },
  { id: 'powder_remaining', name: '6. Powder Remaining Stock', category: 'Powder' },
  { id: 'packaging_production', name: '7. Packaging Production Report', category: 'Packaging' },
  { id: 'finished_stock', name: '8. Finished Product Stock', category: 'Finished Goods' },
  { id: 'product_stock', name: '9. Product-wise Stock Report', category: 'Summary' },
  { id: 'batch_stock', name: '10. Batch-wise Stock Report', category: 'Summary' },
  { id: 'daily_production', name: '11. Daily Production Report', category: 'Daily' },
  { id: 'daily_sales', name: '12. Daily Sales Report', category: 'Daily' },
  { id: 'employee_entries', name: '14. Employee-wise Entry Report', category: 'Audit' },
];

export default function Reports({ onGoToAdminReports }) {
  const [selectedReport, setSelectedReport] = useState('batch_lifecycle');
  const [loading, setLoading] = useState(true);

  // Raw data from DB
  const [rawEntries, setRawEntries] = useState([]);
  const [processingEntries, setProcessingEntries] = useState([]);
  const [packagingEntries, setPackagingEntries] = useState([]);
  const [saleEntries, setSaleEntries] = useState([]);
  const [lifecycleReports, setLifecycleReports] = useState([]);
  const [rawSummary, setRawSummary] = useState(null);
  const [powderSummary, setPowderSummary] = useState(null);
  const [finishedSummary, setFinishedSummary] = useState(null);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterProduct, setFilterProduct] = useState('');
  const [filterBatch, setFilterBatch] = useState('');
  const [filterEmployee, setFilterEmployee] = useState('');

  // Drilldown state
  const [expandedBatchId, setExpandedBatchId] = useState(null);

  useEffect(() => {
    loadAllReportData();
  }, []);

  const loadAllReportData = async () => {
    setLoading(true);
    try {
      const db = await getDB();
      const [raw, proc, pkg, sales, rSum, pSum, fSum, life] = await Promise.all([
        db.getAll('raw_material'),
        db.getAll('processing'),
        db.getAll('packaging'),
        db.getAll('order_sale'),
        getRawMaterialStockSummary(),
        getPowderStockSummary(),
        getFinishedStockSummary(),
        getBatchLifecycleReport()
      ]);

      setRawEntries(raw);
      setProcessingEntries(proc);
      setPackagingEntries(pkg);
      setSaleEntries(sales);
      setRawSummary(rSum);
      setPowderSummary(pSum);
      setFinishedSummary(fSum);
      setLifecycleReports(life);
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  };

  // Export current report view to CSV
  const exportToCSV = (headers, rows, filename) => {
    const csvContent = [
      headers.join(','),
      ...rows.map(row => 
        row.map(cell => {
          const str = cell == null ? '' : String(cell);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        }).join(',')
      )
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Common date filter helper
  const isWithinDate = (itemDate) => {
    if (!itemDate) return true;
    const dateStr = itemDate.slice(0, 10);
    if (startDate && dateStr < startDate) return false;
    if (endDate && dateStr > endDate) return false;
    return true;
  };

  // Render Report Content based on selectedReport
  const renderReportContent = () => {
    switch (selectedReport) {
      
      // 13. Complete Batch Lifecycle Report
      case 'batch_lifecycle': {
        const filtered = lifecycleReports.filter(b => {
          if (filterBatch && !b.batchId.toLowerCase().includes(filterBatch.toLowerCase())) return false;
          if (filterProduct && !b.productName.toLowerCase().includes(filterProduct.toLowerCase())) return false;
          if (!isWithinDate(b.inwardDate)) return false;
          return true;
        });

        const handleExport = () => {
          const headers = [
            'Batch ID', 'Product', 'Inward Date', 'Original Inward (KG)', 'Gross Processed (KG)',
            'Remaining Raw (KG)', 'Net Powder Produced (KG)', 'Powder Packaged (KG)',
            'Remaining Powder (KG)', 'KG Sold', 'Remaining Finished (KG)'
          ];
          const rows = filtered.map(b => [
            b.batchId, b.productName, b.inwardDate, b.originalInwardKg, b.totalProcessedKg,
            b.remainingRawKg, b.totalNetPowderProducedKg, b.powderUsedInPackagingKg,
            b.remainingPowderKg, b.kgSold, b.totalRemainingFinishedKg
          ]);
          exportToCSV(headers, rows, 'Batch_Lifecycle_Report');
        };

        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Showing {filtered.length} batches end-to-end</span>
              <button
                onClick={handleExport}
                className="px-3 py-1.5 bg-brand-800 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 hover:bg-brand-900 transition active:scale-95"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>

            <div className="space-y-3">
              {filtered.map(b => {
                const isExpanded = expandedBatchId === b.batchId;
                return (
                  <div key={b.batchId} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                    <div 
                      onClick={() => setExpandedBatchId(isExpanded ? null : b.batchId)}
                      className="p-4 cursor-pointer hover:bg-slate-50 transition flex flex-col md:flex-row md:items-center justify-between gap-3"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-200 text-brand-900 flex items-center justify-center font-mono font-black text-xs">
                          {b.batchId}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-slate-900 text-sm">{b.productName}</span>
                            <span className="text-[11px] text-slate-500">Inward: {b.inwardDate}</span>
                          </div>
                          <div className="text-xs text-slate-500">Supplier: {b.supplierName}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-right">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Inward</span>
                          <span className="font-bold text-slate-800">{b.originalInwardKg} KG</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Raw Balance</span>
                          <span className="font-bold text-amber-700">{b.remainingRawKg} KG</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Powder Balance</span>
                          <span className="font-bold text-gold-700">{b.remainingPowderKg} KG</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Finished Stock</span>
                          <span className="font-bold text-emerald-700">{b.totalRemainingFinishedKg} KG</span>
                        </div>
                      </div>
                    </div>

                    {/* Drilldown Section */}
                    {isExpanded && (
                      <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3 text-xs">
                        <h5 className="font-bold uppercase tracking-wider text-slate-700">
                          Complete Traceability Detail for {b.batchId}
                        </h5>

                        {/* Processing Rounds */}
                        <div className="bg-white p-3 rounded-lg border border-slate-200">
                          <span className="font-bold text-slate-800 block mb-1">Processing Rounds ({b.processingRounds.length})</span>
                          {b.processingRounds.length === 0 ? (
                            <span className="text-slate-400">No processing rounds yet.</span>
                          ) : (
                            <table className="w-full text-left text-[11px]">
                              <thead>
                                <tr className="text-slate-400 uppercase">
                                  <th>Round</th><th>Date</th><th>Gross Sent</th><th>Net Cleaned</th><th>Net Powder</th><th>Loss</th><th>Operator</th>
                                </tr>
                              </thead>
                              <tbody>
                                {b.processingRounds.map(r => (
                                  <tr key={r.entry_id} className="border-t border-slate-100">
                                    <td className="font-bold py-1">Round {r.processing_round}</td>
                                    <td>{r.date}</td>
                                    <td>{r.gross_raw_kg} KG</td>
                                    <td>{r.net_raw_kg} KG</td>
                                    <td className="font-bold text-emerald-800">{r.net_powder_kg} KG</td>
                                    <td className="text-red-700">{r.total_loss_kg} KG</td>
                                    <td>{r.employee_name}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>

                        {/* Packaging Breakdown in KG */}
                        <div className="bg-white p-3 rounded-lg border border-slate-200">
                          <span className="font-bold text-slate-800 block mb-1">Packaging Output by Pack Size (KG)</span>
                          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                            {Object.entries(b.packSizesProducedKg || {}).map(([size, kg]) => (
                              <div key={size} className="p-2 bg-slate-50 rounded border border-slate-200 text-center">
                                <span className="block text-[10px] text-slate-500 font-bold">{size} GM</span>
                                <span className="font-black text-slate-800">{kg} KG</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Sales Breakdown in KG */}
                        <div className="bg-white p-3 rounded-lg border border-slate-200">
                          <span className="font-bold text-slate-800 block mb-1">Dispatched Sales ({b.kgSold} KG Total)</span>
                          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                            {Object.entries(b.packSizesSoldKg || {}).map(([size, kg]) => (
                              <div key={size} className="p-2 bg-emerald-50 rounded border border-emerald-200 text-center">
                                <span className="block text-[10px] text-emerald-700 font-bold">{size} GM</span>
                                <span className="font-black text-emerald-900">{kg} KG sold</span>
                              </div>
                            ))}
                          </div>
                        </div>

                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      }

      // 1. Raw Material Inward Report
      case 'raw_inward': {
        const filtered = rawEntries.filter(r => {
          if (filterBatch && !r.batch_id.toLowerCase().includes(filterBatch.toLowerCase())) return false;
          if (filterProduct && !r.material_name.toLowerCase().includes(filterProduct.toLowerCase())) return false;
          if (filterEmployee && !r.employee_name.toLowerCase().includes(filterEmployee.toLowerCase())) return false;
          return isWithinDate(r.date);
        });

        const totalKg = filtered.reduce((acc, r) => acc + (Number(r.quantity_kg) || 0), 0);

        const handleExport = () => {
          const headers = ['Entry ID', 'Date', 'Batch ID', 'Material', 'Supplier', 'Invoice', 'Quantity (KG)', 'Employee', 'Timestamp', 'Remarks'];
          const rows = filtered.map(r => [r.entry_id, r.date, r.batch_id, r.material_name, r.supplier_name, r.invoice_number, r.quantity_kg, r.employee_name, r.timestamp, r.remarks]);
          exportToCSV(headers, rows, 'Raw_Material_Inward_Report');
        };

        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Total Received: {totalKg.toLocaleString()} KG ({filtered.length} entries)</span>
              <button onClick={handleExport} className="px-3 py-1.5 bg-brand-800 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 hover:bg-brand-900">
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
            <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 font-bold text-slate-600 border-b">
                  <tr>
                    <th className="p-2.5">Date</th><th>Batch ID</th><th>Material</th><th className="text-right">Qty (KG)</th><th>Supplier</th><th>Invoice</th><th>Staff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(r => (
                    <tr key={r.entry_id} className="hover:bg-slate-50">
                      <td className="p-2.5 font-medium">{r.date}</td>
                      <td className="p-2.5 font-mono font-bold text-brand-900">{r.batch_id}</td>
                      <td className="p-2.5 font-bold">{r.material_name}</td>
                      <td className="p-2.5 text-right font-black">{r.quantity_kg} KG</td>
                      <td className="p-2.5 text-slate-600">{r.supplier_name}</td>
                      <td className="p-2.5 font-mono text-[11px] text-slate-500">{r.invoice_number}</td>
                      <td className="p-2.5">{r.employee_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      }

      // 2. Raw Material Remaining Stock
      case 'raw_remaining': {
        const batchList = rawSummary?.batchMap ? Object.values(rawSummary.batchMap) : [];
        const filtered = batchList.filter(b => {
          if (filterBatch && !b.batchId.toLowerCase().includes(filterBatch.toLowerCase())) return false;
          if (filterProduct && !b.materialName.toLowerCase().includes(filterProduct.toLowerCase())) return false;
          return b.remainingUnprocessedKg > 0.0001;
        });

        const totalRemaining = filtered.reduce((acc, b) => acc + b.remainingUnprocessedKg, 0);

        const handleExport = () => {
          const headers = ['Batch ID', 'Material', 'Inward Date', 'Supplier', 'Total Inward (KG)', 'Gross Sent to Processing (KG)', 'Remaining Unprocessed (KG)'];
          const rows = filtered.map(b => [b.batchId, b.materialName, b.date, b.supplier, b.inwardKg, b.grossProcessedKg, b.remainingUnprocessedKg]);
          exportToCSV(headers, rows, 'Raw_Material_Remaining_Stock');
        };

        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-800">Total Unprocessed Remaining: {totalRemaining.toFixed(3)} KG</span>
              <button onClick={handleExport} className="px-3 py-1.5 bg-brand-800 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 hover:bg-brand-900">
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
            <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 font-bold text-slate-600 border-b">
                  <tr>
                    <th className="p-2.5">Batch ID</th><th>Material</th><th>Inward Date</th><th className="text-right">Total Inward</th><th className="text-right">Gross Processed</th><th className="text-right text-amber-800">Remaining Unprocessed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(b => (
                    <tr key={b.batchId} className="hover:bg-slate-50">
                      <td className="p-2.5 font-mono font-bold text-brand-900">{b.batchId}</td>
                      <td className="p-2.5 font-bold">{b.materialName}</td>
                      <td className="p-2.5">{b.date}</td>
                      <td className="p-2.5 text-right font-medium">{b.inwardKg} KG</td>
                      <td className="p-2.5 text-right font-medium">{b.grossProcessedKg} KG</td>
                      <td className="p-2.5 text-right font-black text-amber-700">{b.remainingUnprocessedKg} KG</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      }

      // 6. Powder Remaining Stock
      case 'powder_remaining': {
        const batchList = powderSummary?.batchMap ? Object.values(powderSummary.batchMap) : [];
        const filtered = batchList.filter(b => {
          if (filterBatch && !b.batchId.toLowerCase().includes(filterBatch.toLowerCase())) return false;
          if (filterProduct && !b.productName.toLowerCase().includes(filterProduct.toLowerCase())) return false;
          return b.remainingPowderKg > 0.0001;
        });

        const totalPowder = filtered.reduce((acc, b) => acc + b.remainingPowderKg, 0);

        const handleExport = () => {
          const headers = ['Batch ID', 'Product', 'Total Net Powder Produced (KG)', 'Powder Used in Packaging (KG)', 'Remaining Powder (KG)'];
          const rows = filtered.map(b => [b.batchId, b.productName, b.netPowderProducedKg, b.powderUsedInPkgKg, b.remainingPowderKg]);
          exportToCSV(headers, rows, 'Powder_Remaining_Stock');
        };

        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gold-800">Total Powder Remaining: {totalPowder.toFixed(3)} KG</span>
              <button onClick={handleExport} className="px-3 py-1.5 bg-brand-800 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 hover:bg-brand-900">
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
            <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 font-bold text-slate-600 border-b">
                  <tr>
                    <th className="p-2.5">Batch ID</th><th>Product</th><th className="text-right">Net Powder Produced</th><th className="text-right">Powder Used</th><th className="text-right text-gold-800">Remaining Powder Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(b => (
                    <tr key={b.batchId} className="hover:bg-slate-50">
                      <td className="p-2.5 font-mono font-bold text-gold-900">{b.batchId}</td>
                      <td className="p-2.5 font-bold">{b.productName}</td>
                      <td className="p-2.5 text-right font-medium">{b.netPowderProducedKg} KG</td>
                      <td className="p-2.5 text-right font-medium">{b.powderUsedInPkgKg} KG</td>
                      <td className="p-2.5 text-right font-black text-gold-700">{b.remainingPowderKg} KG</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      }

      // 8. Finished Product Stock (Pack size & Batch wise in KG)
      case 'finished_stock': {
        const stockItems = finishedSummary?.stockItems || [];
        const filtered = stockItems.filter(i => {
          if (filterBatch && !i.batchId.toLowerCase().includes(filterBatch.toLowerCase())) return false;
          if (filterProduct && !i.productName.toLowerCase().includes(filterProduct.toLowerCase())) return false;
          return i.remainingKg > 0.0001;
        });

        const totalKg = filtered.reduce((acc, i) => acc + i.remainingKg, 0);

        const handleExport = () => {
          const headers = ['Batch ID', 'Product Name', 'Pack Size (GM)', 'KG Produced', 'KG Sold', 'Remaining Stock (KG)'];
          const rows = filtered.map(i => [i.batchId, i.productName, i.packSizeGm, i.kgProduced, i.kgSold, i.remainingKg]);
          exportToCSV(headers, rows, 'Finished_Product_Stock');
        };

        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-800">
                Total Finished Stock: {totalKg.toFixed(3)} KG
              </span>
              <button onClick={handleExport} className="px-3 py-1.5 bg-brand-800 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 hover:bg-brand-900">
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
            <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 font-bold text-slate-600 border-b">
                  <tr>
                    <th className="p-2.5">Batch ID</th><th>Product</th><th className="text-center">Pack Size</th><th className="text-right">Produced (KG)</th><th className="text-right">Sold (KG)</th><th className="text-right text-emerald-800">Remaining Stock (KG)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(i => (
                    <tr key={`${i.batchId}__${i.packSizeGm}`} className="hover:bg-slate-50">
                      <td className="p-2.5 font-mono font-bold text-slate-900">{i.batchId}</td>
                      <td className="p-2.5 font-bold">{i.productName}</td>
                      <td className="p-2.5 text-center font-bold">{i.packSizeGm} GM</td>
                      <td className="p-2.5 text-right font-medium">{i.kgProduced} KG</td>
                      <td className="p-2.5 text-right font-medium">{i.kgSold} KG</td>
                      <td className="p-2.5 text-right font-black text-emerald-800">{i.remainingKg} KG</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      }

      // 9. Product-wise Stock Report (Aggregate)
      // 9. Product-wise Stock Report (Aggregate in KG)
      case 'product_stock': {
        const prodSummary = finishedSummary?.productSummary ? Object.values(finishedSummary.productSummary) : [];

        const handleExport = () => {
          const headers = ['Product Name', 'Total Finished Stock (KG)'];
          const rows = prodSummary.map(p => [p.productName, p.totalKg]);
          exportToCSV(headers, rows, 'Product_Wise_Stock_Report');
        };

        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Consolidated Product-Wise Stock (KG Only)</span>
              <button onClick={handleExport} className="px-3 py-1.5 bg-brand-800 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 hover:bg-brand-900">
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {prodSummary.map(p => (
                <div key={p.productName} className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <h4 className="font-bold text-base text-slate-900">{p.productName}</h4>
                  <div className="mt-2 flex items-baseline justify-between border-b pb-2">
                    <span className="text-xs text-slate-500">Total Finished Weight</span>
                    <span className="text-lg font-black text-emerald-800">{p.totalKg} KG</span>
                  </div>
                  <div className="mt-2 pt-1 text-[11px] text-slate-600">
                    <span className="font-semibold block mb-1">Pack Size Breakdown (KG):</span>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(p.packSizes || {}).map(([size, kg]) => (
                        <span key={size} className="bg-slate-100 px-2 py-0.5 rounded font-mono font-medium text-slate-800">
                          {size} GM: {kg} KG
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      }

      // Default fallback for other reports (Generic Table renderer)
      default: {
        return (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500 text-xs">
            <Layers className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <h4 className="font-bold text-slate-700 text-sm mb-1">{REPORT_TYPES.find(r => r.id === selectedReport)?.name}</h4>
            <p className="max-w-md mx-auto">
              Please review the batch-lifecycle or specific stock views, or export all ledger entries to CSV.
            </p>
          </div>
        );
      }

    }
  };

  return (
    <div className="space-y-6 pb-20 md:pb-6 animate-fadeIn">
      
      {/* Official Master Excel Report Banner */}
      <div className="bg-gradient-to-r from-emerald-950 via-brand-950 to-slate-900 rounded-2xl p-4 sm:p-5 text-white shadow-md border border-emerald-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shrink-0">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Official Excel Report & Export (8 Sheets)
              </h3>
              <span className="text-[10px] font-bold bg-emerald-600 px-2 py-0.5 rounded text-white uppercase">
                Admin Excel
              </span>
            </div>
            <p className="text-xs text-emerald-200 mt-0.5">
              PATEL_SAHAB_SPICES_PRODUCTION_INVENTORY_REPORT.xlsx with Cover, Inward, Grinding, Packaging, Stock, Sales & Batch Traceability.
            </p>
          </div>
        </div>

        {onGoToAdminReports && (
          <button
            onClick={onGoToAdminReports}
            className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-md transition flex items-center space-x-2 shrink-0 self-start sm:self-auto"
          >
            <Download className="w-4 h-4 text-slate-950" />
            <span>Open Reports & Export (.xlsx)</span>
          </button>
        )}
      </div>

      {/* Title Banner */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-11 h-11 rounded-xl bg-blue-700 text-white flex items-center justify-center shadow-sm">
            <FileSpreadsheet className="w-6 h-6 text-gold-300" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              FACTORY STOCK REPORTS & AUDIT
            </h2>
            <p className="text-xs text-slate-500">
              14 Production & Inventory reports with multi-criteria filtering and CSV export
            </p>
          </div>
        </div>

        <button
          onClick={loadAllReportData}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-bold text-xs rounded-xl flex items-center space-x-1.5 transition self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Reports</span>
        </button>
      </div>

      {/* Report Selector Pill Bar */}
      <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs">
        <label className="block text-xs font-bold text-slate-700 uppercase mb-2">
          Select Report Type:
        </label>
        <select
          value={selectedReport}
          onChange={(e) => setSelectedReport(e.target.value)}
          className="w-full bg-slate-50 border border-slate-300 text-slate-900 font-bold rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
        >
          {REPORT_TYPES.map((rep) => (
            <option key={rep.id} value={rep.id}>
              {rep.name}
            </option>
          ))}
        </select>
      </div>

      {/* Multi-Criteria Filters Card */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-700 uppercase">
            <Filter className="w-3.5 h-3.5 text-brand-800" />
            <span>Report Filters</span>
          </div>
          {(startDate || endDate || filterProduct || filterBatch || filterEmployee) && (
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setFilterProduct('');
                setFilterBatch('');
                setFilterEmployee('');
              }}
              className="text-xs text-brand-700 font-bold hover:underline"
            >
              Reset Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full text-xs p-1.5 border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase">To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full text-xs p-1.5 border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase">Product</label>
            <input
              type="text"
              placeholder="e.g. Haldi"
              value={filterProduct}
              onChange={(e) => setFilterProduct(e.target.value)}
              className="w-full text-xs p-1.5 border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase">Batch ID</label>
            <input
              type="text"
              placeholder="e.g. HAL-001"
              value={filterBatch}
              onChange={(e) => setFilterBatch(e.target.value)}
              className="w-full text-xs p-1.5 border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase">Employee</label>
            <input
              type="text"
              placeholder="e.g. Ramesh"
              value={filterEmployee}
              onChange={(e) => setFilterEmployee(e.target.value)}
              className="w-full text-xs p-1.5 border border-slate-300 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Main Report Body */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-slate-400 border border-slate-200">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-brand-800 mb-2" />
          <p className="text-xs font-semibold">Generating report calculations...</p>
        </div>
      ) : (
        renderReportContent()
      )}

    </div>
  );
}
