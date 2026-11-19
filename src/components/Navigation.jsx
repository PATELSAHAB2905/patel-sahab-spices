import React from 'react';
import { 
  Home, 
  PackagePlus, 
  Cog, 
  Boxes, 
  ShoppingBag, 
  FileSpreadsheet, 
  History, 
  ShieldCheck 
} from 'lucide-react';

export default function Navigation({ activeTab, onSelectTab }) {
  const tabs = [
    { id: 'dashboard', label: 'Home', icon: Home, shortLabel: 'Home' },
    { id: 'raw_material', label: 'Raw Material', icon: PackagePlus, shortLabel: 'Raw Inward' },
    { id: 'processing', label: 'Processing', icon: Cog, shortLabel: 'Processing' },
    { id: 'packaging', label: 'Packaging', icon: Boxes, shortLabel: 'Packaging' },
    { id: 'order_sale', label: 'Order / Sale', icon: ShoppingBag, shortLabel: 'Sale' },
    { id: 'reports_export', label: 'Reports & Export', icon: FileSpreadsheet, shortLabel: 'Export', isExport: true },
    { id: 'reports', label: 'Stock Reports', icon: History, shortLabel: 'Reports' },
    { id: 'history', label: 'Entry History', icon: History, shortLabel: 'History' },
    { id: 'admin', label: 'Admin Panel', icon: ShieldCheck, shortLabel: 'Admin' },
  ];

  return (
    <>
      {/* Desktop / Tablet Sub-navigation Bar */}
      <nav className="hidden md:block bg-white border-b border-slate-200 shadow-sm sticky top-[57px] z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex space-x-1 py-1.5 overflow-x-auto no-scrollbar">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id || (tab.id === 'reports_export' && activeTab === 'admin');
              return (
                <button
                  key={tab.id}
                  onClick={() => onSelectTab(tab.id)}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition whitespace-nowrap ${
                    isActive
                      ? tab.isExport
                        ? 'bg-emerald-700 text-white shadow-sm ring-1 ring-emerald-900'
                        : 'bg-brand-800 text-white shadow-sm ring-1 ring-brand-900'
                      : tab.isExport
                        ? 'text-emerald-800 bg-emerald-50 hover:bg-emerald-100 font-bold border border-emerald-300'
                        : 'text-slate-700 hover:text-brand-900 hover:bg-brand-50/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-gold-300' : tab.isExport ? 'text-emerald-700' : 'text-slate-500'}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 py-1 px-1 z-40 shadow-2xl safe-area-bottom">
        <div className="grid grid-cols-7 gap-0.5 items-center">
          {tabs.filter(t => t.id !== 'history' && t.id !== 'reports').map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id || (tab.id === 'reports_export' && activeTab === 'admin');
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`flex flex-col items-center justify-center py-1 px-0.5 rounded-lg transition-all active:scale-95 ${
                  isActive
                    ? tab.isExport ? 'text-emerald-800 font-bold bg-emerald-50' : 'text-brand-800 font-bold bg-brand-50'
                    : tab.isExport ? 'text-emerald-700 font-bold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <div className={`p-1 rounded-md ${isActive ? (tab.isExport ? 'bg-emerald-700 text-white' : 'bg-brand-800 text-white') : tab.isExport ? 'bg-emerald-100 text-emerald-800' : ''}`}>
                  <Icon className={`w-4 h-4 ${isActive ? 'text-gold-300' : ''}`} />
                </div>
                <span className="text-[10px] leading-tight mt-0.5 truncate max-w-full">
                  {tab.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
