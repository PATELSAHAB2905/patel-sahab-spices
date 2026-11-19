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
  Clock 
} from 'lucide-react';
import { getDB } from '../services/db';

export default function EntryHistory() {
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'RAW' | 'PROCESSING' | 'PACKAGING' | 'SALE'
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  
  const [allEntries, setAllEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAllEntries();
  }, []);

  const loadAllEntries = async () => {
    setLoading(true);
    try {
      const db = await getDB();
      const [raw, proc, pkg, sales] = await Promise.all([
        db.getAll('raw_material'),
        db.getAll('processing'),
        db.getAll('packaging'),
        db.getAll('order_sale')
      ]);

      const taggedRaw = raw.map(r => ({ ...r, moduleType: 'RAW', moduleLabel: 'Raw Material Inward' }));
      const taggedProc = proc.map(p => ({ ...p, moduleType: 'PROCESSING', moduleLabel: 'Processing & Grinding' }));
      const taggedPkg = pkg.map(k => ({ ...k, moduleType: 'PACKAGING', moduleLabel: 'Packaging' }));
      const taggedSales = sales.map(s => ({ ...s, moduleType: 'SALE', moduleLabel: 'Order / Sale' }));

      const combined = [...taggedRaw, ...taggedProc, ...taggedPkg, ...taggedSales];
      combined.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));

      setAllEntries(combined);
    } catch (err) {
      console.error('Failed to load entry history:', err);
    } finally {
      setLoading(false);
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
      const matchEmp = item.employee_name && item.employee_name.toLowerCase().includes(term);
      const matchOrder = item.order_id && item.order_id.toLowerCase().includes(term);
      return matchBatch || matchProduct || matchEntry || matchEmp || matchOrder;
    }

    return true;
  });

  return (
    <div className="space-y-6 pb-20 md:pb-6 animate-fadeIn">
      
      {/* Title */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-11 h-11 rounded-xl bg-purple-700 text-white flex items-center justify-center shadow-sm">
            <History className="w-6 h-6 text-purple-200" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              FACTORY ENTRY HISTORY & AUDIT TRAIL
            </h2>
            <p className="text-xs text-slate-500">
              Chronological log of all transactions across all four factory modules
            </p>
          </div>
        </div>

        <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-xl self-start sm:self-auto">
          {filtered.length} Total Entries Found
        </span>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs space-y-3">
        
        {/* Module Filter Tabs */}
        <div className="flex space-x-1.5 overflow-x-auto no-scrollbar pb-1">
          {[
            { id: 'ALL', label: 'All Modules' },
            { id: 'RAW', label: 'Raw Inward' },
            { id: 'PROCESSING', label: 'Processing' },
            { id: 'PACKAGING', label: 'Packaging' },
            { id: 'SALE', label: 'Orders / Sales' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-purple-800 text-white shadow-xs'
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
              className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-700"
            />
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full text-xs p-2 border border-slate-300 rounded-lg"
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
          <div className="p-8 text-center text-slate-400 text-xs bg-white rounded-xl border border-slate-200">
            No entries match your search criteria.
          </div>
        ) : (
          filtered.map(item => {
            const getIcon = () => {
              if (item.moduleType === 'RAW') return <PackagePlus className="w-4 h-4 text-brand-700" />;
              if (item.moduleType === 'PROCESSING') return <Cog className="w-4 h-4 text-amber-700" />;
              if (item.moduleType === 'PACKAGING') return <Boxes className="w-4 h-4 text-gold-700" />;
              return <ShoppingBag className="w-4 h-4 text-emerald-700" />;
            };

            const getQuantityBadge = () => {
              if (item.moduleType === 'RAW') {
                return <span className="font-black text-brand-900 text-sm">{item.quantity_kg} KG Inward</span>;
              }
              if (item.moduleType === 'PROCESSING') {
                return <span className="font-black text-amber-900 text-sm">{item.net_powder_kg} KG Powder (R{item.processing_round})</span>;
              }
              if (item.moduleType === 'PACKAGING') {
                const pkgKg = item.powder_used_kg || item.quantity_kg || (item.packet_quantity && item.pack_size_gm ? ((item.packet_quantity * item.pack_size_gm) / 1000).toFixed(3) : item.packet_quantity);
                return <span className="font-black text-gold-900 text-sm">{pkgKg} KG Packaged ({item.pack_size_gm} GM)</span>;
              }
              return <span className="font-black text-emerald-900 text-sm">{item.kg_sold} KG Sold ({item.pack_size_gm} GM)</span>;
            };

            return (
              <div 
                key={item.entry_id}
                className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs hover:border-purple-300 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start space-x-3">
                  <div className="p-2 rounded-lg bg-slate-100 shrink-0 mt-0.5">
                    {getIcon()}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-slate-900 text-xs">{item.moduleLabel}</span>
                      <span className="text-[10px] font-mono text-slate-400">({item.entry_id})</span>
                      {item.order_id && (
                        <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded">
                          {item.order_id}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-2 text-xs text-slate-600 mt-1">
                      <span className="font-mono font-bold text-brand-900 bg-brand-50 px-1.5 py-0.2 rounded border border-brand-200">
                        {item.batch_id}
                      </span>
                      <span className="font-semibold text-slate-900">
                        {item.material_name || item.product_name}
                      </span>
                      <span className="text-slate-400">•</span>
                      <span>Staff: <strong className="text-slate-700">{item.employee_name}</strong></span>
                    </div>

                    {item.remarks && (
                      <p className="text-[11px] text-slate-500 italic mt-0.5">
                        "{item.remarks}"
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end sm:space-x-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  <div className="text-left sm:text-right">
                    {getQuantityBadge()}
                    <div className="text-[10px] text-slate-400 flex items-center gap-1 sm:justify-end">
                      <Clock className="w-3 h-3" />
                      <span>{item.date} {item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    </div>
                  </div>

                  <div>
                    {item.synced ? (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        Synced
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        Pending
                      </span>
                    )}
                  </div>
                </div>

              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
