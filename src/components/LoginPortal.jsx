import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  User, 
  KeyRound, 
  Lock, 
  ArrowRight, 
  CheckCircle2, 
  AlertTriangle,
  Factory
} from 'lucide-react';
import { getDB } from '../services/db';
import { verifyAdminPin } from '../services/adminAuth';

export default function LoginPortal({ onEmployeeLogin, onAdminLogin }) {
  const [employees, setEmployees] = useState([]);
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    try {
      const db = await getDB();
      const list = await db.getAll('employees');
      const activeList = list.filter(e => e.active !== false);
      setEmployees(activeList);
      if (activeList.length > 0) {
        setSelectedEmpId(activeList[0].id);
      }
    } catch (err) {
      console.error('Failed to load employee list:', err);
    }
  };

  const handleEmployeeSubmit = (e) => {
    e.preventDefault();
    const emp = employees.find(e => e.id === selectedEmpId);
    if (!emp) {
      setErrorMsg('Please select an active employee.');
      return;
    }
    setErrorMsg(null);
    onEmployeeLogin(emp);
  };

  const handleAdminSubmit = async (e) => {
    e.preventDefault();
    if (!adminPin || adminPin.trim().length < 4) {
      setErrorMsg('Please enter a 4-digit Admin PIN.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const isValid = await verifyAdminPin(adminPin.trim());
      if (isValid) {
        onAdminLogin();
      } else {
        setErrorMsg('Incorrect Admin PIN. Default PIN is 1234.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Verification error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 sm:p-6 font-sans">
      
      {/* Brand Header */}
      <div className="max-w-md w-full text-center space-y-3 mb-6">
        <div className="w-16 h-16 rounded-2xl bg-white/10 p-2 mx-auto flex items-center justify-center border-2 border-gold-400/50 shadow-xl">
          <img src="/icon.svg" alt="Patel Sahab Spices" className="w-12 h-12 object-contain" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-wider">
            PATEL SAHAB <span className="text-gold-400">SPICES</span>
          </h1>
          <p className="text-xs text-slate-400 tracking-widest uppercase font-semibold mt-0.5">
            Production & Inventory Management System
          </p>
          <p className="text-[11px] text-gold-300/80 mt-1">
            Plant: Village Panwa, Tehsil Kasrawad, Khargone (M.P.)
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="max-w-md w-full mb-4 bg-red-950/80 border border-red-500 text-red-200 text-xs p-3 rounded-xl flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Two Portal Cards */}
      <div className="max-w-md w-full space-y-4">
        
        {/* 1. EMPLOYEE WORKSTATION LOGIN */}
        <div className="bg-slate-800/90 rounded-2xl p-5 border border-slate-700 shadow-xl space-y-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-brand-900/60 text-gold-300 flex items-center justify-center border border-gold-400/30">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-wide">
                1. Factory Employee Panel
              </h2>
              <p className="text-[11px] text-slate-400">
                Simple daily operations: Raw Inward, Grinding, Packaging & Sales
              </p>
            </div>
          </div>

          <form onSubmit={handleEmployeeSubmit} className="space-y-3 pt-1">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                Select Your Name:
              </label>
              <select
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 text-white font-bold rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-gold-400"
              >
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.role})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-brand-800 hover:bg-brand-700 text-white font-black rounded-xl text-xs uppercase tracking-wider transition flex items-center justify-center space-x-2 shadow-md active:scale-98"
            >
              <span>Enter Employee Workstation</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* 2. ADMIN CONTROL CENTER LOGIN */}
        <div className="bg-slate-800/90 rounded-2xl p-5 border border-slate-700 shadow-xl space-y-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-950/60 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-wide">
                2. Business Owner / Admin Panel
              </h2>
              <p className="text-[11px] text-slate-400">
                Live dashboard, stock oversight, staff permissions & 8-sheet Excel export
              </p>
            </div>
          </div>

          <form onSubmit={handleAdminSubmit} className="space-y-3 pt-1">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                Enter Admin PIN:
              </label>
              <input
                type="password"
                maxLength={6}
                placeholder="••••"
                value={adminPin}
                onChange={(e) => setAdminPin(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 text-white font-mono font-bold text-center tracking-widest rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <span className="text-[10px] text-slate-500 block text-right mt-0.5">
                Default PIN: 1234
              </span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-black rounded-xl text-xs uppercase tracking-wider transition flex items-center justify-center space-x-2 shadow-md active:scale-98"
            >
              <KeyRound className="w-4 h-4" />
              <span>{loading ? 'Verifying...' : 'Unlock Admin Portal'}</span>
            </button>
          </form>
        </div>

      </div>

      <footer className="mt-8 text-center text-[10px] text-slate-500 font-semibold tracking-wider uppercase">
        PATEL SAHAB ENTERPRISES LLP • STRICTLY PRODUCTION & INVENTORY MANAGEMENT
      </footer>

    </div>
  );
}
