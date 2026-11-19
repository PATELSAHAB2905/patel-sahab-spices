import React, { useState, useEffect } from 'react';
import { 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  User, 
  ShieldCheck, 
  Lock, 
  ChevronDown,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { getSyncOverview, triggerSync, subscribeToSyncStatus } from '../services/syncService';

export default function Header({ 
  activeEmployee, 
  onOpenEmployeeModal, 
  isAdminAuthenticated, 
  onOpenAdminModal,
  onLogoutAdmin 
}) {
  const [syncState, setSyncState] = useState({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSyncing: false,
    pendingCount: 0,
    failedCount: 0,
    lastSyncTime: null,
    hasScriptUrl: false
  });
  const [syncFeedback, setSyncFeedback] = useState(null);

  const refreshSyncOverview = async () => {
    try {
      const overview = await getSyncOverview();
      setSyncState(prev => ({
        ...prev,
        ...overview,
        isOnline: navigator.onLine
      }));
    } catch (err) {
      console.error('Failed to get sync overview:', err);
    }
  };

  useEffect(() => {
    refreshSyncOverview();
    const unsubscribe = subscribeToSyncStatus((update) => {
      setSyncState(prev => ({ ...prev, ...update }));
      refreshSyncOverview();
    });

    const interval = setInterval(refreshSyncOverview, 8000);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const handleManualSync = async () => {
    setSyncFeedback(null);
    try {
      const res = await triggerSync();
      if (res?.success) {
        setSyncFeedback({ type: 'success', text: res.message });
      } else if (res?.warning) {
        setSyncFeedback({ type: 'warning', text: res.warning });
      } else if (res?.error) {
        setSyncFeedback({ type: 'error', text: res.error });
      }
    } catch (err) {
      setSyncFeedback({ type: 'error', text: err.message || 'Sync failed' });
    }
    await refreshSyncOverview();
    setTimeout(() => setSyncFeedback(null), 4000);
  };

  const formatLastSync = (timestamp) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <header className="bg-gradient-to-r from-brand-900 via-brand-800 to-brand-900 text-white shadow-lg sticky top-0 z-40">
      {/* Top Main Bar */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between">
        
        {/* Brand & Factory Title */}
        <div className="flex items-center space-x-2.5">
          <div className="w-10 h-10 rounded-xl bg-white/10 p-1 flex items-center justify-center border border-gold-400/40 shadow-inner">
            <img src="/icon.svg" alt="Patel Sahab Spices" className="w-8 h-8 object-contain" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-wider text-white uppercase leading-tight flex items-center gap-1.5">
              <span>PATEL SAHAB</span>
              <span className="text-gold-400 font-extrabold">SPICES</span>
            </h1>
            <p className="text-[10px] sm:text-xs text-gold-200/90 tracking-widest uppercase font-semibold">
              Production & Inventory Management
            </p>
          </div>
        </div>

        {/* Right Action Cluster */}
        <div className="flex items-center space-x-1.5 sm:space-x-3">
          
          {/* Online/Offline Status Pill */}
          <div 
            className={`flex items-center space-x-1 text-xs px-2 sm:px-2.5 py-1 rounded-full font-medium transition-colors ${
              syncState.isOnline 
                ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-600/50' 
                : 'bg-amber-950/70 text-amber-300 border border-amber-600/50 animate-pulse'
            }`}
            title={syncState.isOnline ? 'Online - Live syncing ready' : 'Offline - Entries stored safely in IndexedDB'}
          >
            {syncState.isOnline ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                <span className="hidden sm:inline font-semibold">ONLINE</span>
                <Wifi className="w-3.5 h-3.5 sm:hidden" />
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5" />
                <span className="font-semibold text-[11px] sm:text-xs">OFFLINE</span>
              </>
            )}
          </div>

          {/* Sync Button & Pending Indicator */}
          <button
            onClick={handleManualSync}
            disabled={syncState.isSyncing}
            className={`flex items-center space-x-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-all shadow-sm active:scale-95 ${
              syncState.pendingCount > 0
                ? 'bg-gold-500/20 text-gold-200 border-gold-400/60 hover:bg-gold-500/30'
                : 'bg-white/10 text-white/90 border-white/20 hover:bg-white/15'
            }`}
            title={`Last sync: ${formatLastSync(syncState.lastSyncTime)} | Pending uploads: ${syncState.pendingCount}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncState.isSyncing ? 'animate-spin text-gold-300' : ''}`} />
            <span className="hidden md:inline">Sync</span>
            {syncState.pendingCount > 0 && (
              <span className="bg-amber-500 text-slate-950 text-[10px] font-black px-1.5 py-0.2 rounded-full">
                {syncState.pendingCount}
              </span>
            )}
          </button>

          {/* Active Employee Selector Button */}
          <button
            onClick={onOpenEmployeeModal}
            className="flex items-center space-x-1.5 bg-brand-950/70 hover:bg-brand-950 text-white text-xs px-2.5 py-1.5 rounded-lg border border-brand-700/60 transition shadow-sm active:scale-95"
            title="Click to switch employee"
          >
            <User className="w-3.5 h-3.5 text-gold-400" />
            <span className="font-medium max-w-[85px] sm:max-w-[120px] truncate">
              {activeEmployee ? activeEmployee.name : 'Select Employee'}
            </span>
            <ChevronDown className="w-3 h-3 text-white/70" />
          </button>

          {/* Admin Lock / Unlock Button */}
          {isAdminAuthenticated ? (
            <button
              onClick={onLogoutAdmin}
              className="flex items-center space-x-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2.5 py-1.5 rounded-lg font-semibold transition active:scale-95"
              title="Admin Mode Active. Click to lock."
            >
              <ShieldCheck className="w-3.5 h-3.5 text-gold-300" />
              <span className="hidden sm:inline">Admin</span>
            </button>
          ) : (
            <button
              onClick={onOpenAdminModal}
              className="flex items-center space-x-1 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-xs px-2 py-1.5 rounded-lg font-medium transition active:scale-95"
              title="Click to unlock Admin access with PIN"
            >
              <Lock className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Admin</span>
            </button>
          )}

        </div>
      </div>

      {/* Sync Toast / Feedback Banner if triggered */}
      {syncFeedback && (
        <div className={`px-4 py-1.5 text-xs text-center font-semibold flex items-center justify-center space-x-2 transition-all ${
          syncFeedback.type === 'success' 
            ? 'bg-emerald-600 text-white' 
            : syncFeedback.type === 'warning' 
            ? 'bg-amber-600 text-white' 
            : 'bg-red-700 text-white'
        }`}>
          {syncFeedback.type === 'success' ? (
            <CheckCircle2 className="w-3.5 h-3.5" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5" />
          )}
          <span>{syncFeedback.text}</span>
        </div>
      )}
    </header>
  );
}
