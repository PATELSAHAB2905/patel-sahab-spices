import React, { useState } from 'react';
import { 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  KeyRound, 
  HelpCircle, 
  X, 
  CheckCircle2, 
  AlertTriangle,
  ArrowRight,
  PhoneCall,
  Building2,
  Sparkles
} from 'lucide-react';
import { authenticateEmployee, verifyAdminPin } from '../services/adminAuth';

export default function LoginPortal({ onEmployeeLogin, onAdminLogin }) {
  // Mode: 'employee' | 'admin'
  const [loginMode, setLoginMode] = useState('employee');

  // Employee Login State
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Admin PIN State
  const [adminPin, setAdminPin] = useState('');

  // UI state
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const handleEmployeeSubmit = async (e) => {
    e.preventDefault();
    if (!employeeId.trim()) {
      setErrorMsg('Please enter your Employee ID (e.g. PSS001).');
      return;
    }
    if (!password) {
      setErrorMsg('Please enter your password.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const emp = await authenticateEmployee(employeeId.trim(), password);
      onEmployeeLogin(emp);
    } catch (err) {
      setErrorMsg(err.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
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
      setErrorMsg(err.message || 'Admin verification error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 via-white to-slate-100 flex flex-col justify-between items-center p-4 sm:p-6 font-sans">
      
      {/* Top Brand Header */}
      <div className="w-full max-w-sm sm:max-w-md mx-auto pt-4 sm:pt-8 text-center">
        
        {/* Official Logo */}
        <div className="inline-block p-2 bg-white rounded-3xl shadow-lg border border-red-100 mb-3 transition transform hover:scale-102">
          <img 
            src="/logo.jpg" 
            alt="Patel Sahab Spices Logo" 
            className="w-28 sm:w-36 h-auto mx-auto object-contain rounded-2xl" 
          />
        </div>

        {/* Brand Titles */}
        <div className="space-y-0.5">
          <h1 className="text-xl sm:text-2xl font-black text-brand-900 uppercase tracking-wide">
            PATEL SAHAB SPICES
          </h1>
          <p className="text-[11px] sm:text-xs text-brand-800 font-bold uppercase tracking-widest">
            PRODUCTION & INVENTORY MANAGEMENT
          </p>
          <div className="inline-block bg-amber-50 border border-amber-200/80 px-2.5 py-0.5 rounded-full mt-1.5">
            <span className="text-[11px] font-semibold text-amber-900 tracking-wide">
              "सर्वे भवन्तु सुखिनः"
            </span>
          </div>
        </div>

      </div>

      {/* Main Login Card */}
      <div className="w-full max-w-sm sm:max-w-md my-6">
        
        {/* Error Notification */}
        {errorMsg && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-800 text-xs sm:text-sm p-3.5 rounded-2xl flex items-start space-x-2.5 shadow-sm animate-shake">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
            <div className="flex-1 font-semibold leading-relaxed">{errorMsg}</div>
            <button 
              onClick={() => setErrorMsg(null)}
              className="text-red-400 hover:text-red-700 p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="bg-white rounded-3xl p-5 sm:p-7 shadow-xl border border-slate-200/80 space-y-5">
          
          {/* Mode Switcher Tabs */}
          <div className="flex p-1 bg-slate-100 rounded-2xl border border-slate-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => { setLoginMode('employee'); setErrorMsg(null); }}
              className={`flex-1 py-2.5 rounded-xl transition flex items-center justify-center space-x-1.5 ${
                loginMode === 'employee'
                  ? 'bg-brand-800 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Employee Login</span>
            </button>
            <button
              type="button"
              onClick={() => { setLoginMode('admin'); setErrorMsg(null); }}
              className={`flex-1 py-2.5 rounded-xl transition flex items-center justify-center space-x-1.5 ${
                loginMode === 'admin'
                  ? 'bg-slate-900 text-gold-300 shadow-md'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Admin Center</span>
            </button>
          </div>

          {/* 1. EMPLOYEE LOGIN FORM */}
          {loginMode === 'employee' ? (
            <form onSubmit={handleEmployeeSubmit} className="space-y-4">
              
              {/* Employee ID */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Employee ID <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="w-5 h-5 text-brand-700" />
                  </div>
                  <input
                    type="text"
                    required
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck="false"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
                    placeholder="e.g. PSS001"
                    className="w-full pl-11 pr-3 py-3 text-base sm:text-sm font-bold font-mono text-slate-900 bg-slate-50 border border-slate-300 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-700 focus:border-brand-700 transition"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1 pl-1">
                  Format: PSS001, PSS002, PSS003, PSS004
                </p>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-5 h-5 text-brand-700" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-11 pr-11 py-3 text-base sm:text-sm font-mono text-slate-900 bg-slate-50 border border-slate-300 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-700 focus:border-brand-700 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-700 transition p-1"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-brand-800 to-brand-900 hover:from-brand-700 hover:to-brand-800 active:scale-98 text-white font-black text-sm uppercase tracking-wider rounded-2xl shadow-lg shadow-brand-900/20 transition flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Verifying Employee...</span>
                  </>
                ) : (
                  <>
                    <span>Login to Workstation</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {/* Forgot Password Link */}
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="text-xs text-brand-800 hover:text-brand-900 font-semibold underline underline-offset-4 decoration-brand-300 hover:decoration-brand-700 transition"
                >
                  Forgot Password / Contact Admin?
                </button>
              </div>
            </form>
          ) : (
            /* 2. ADMIN PIN UNLOCK FORM */
            <form onSubmit={handleAdminSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Business Owner / Admin PIN <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <KeyRound className="w-5 h-5 text-emerald-600" />
                  </div>
                  <input
                    type="password"
                    maxLength={6}
                    autoFocus
                    required
                    value={adminPin}
                    onChange={(e) => setAdminPin(e.target.value)}
                    placeholder="••••"
                    className="w-full pl-11 pr-3 py-3 text-lg font-mono font-bold tracking-widest text-center text-slate-900 bg-slate-50 border border-slate-300 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition"
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-500 mt-1 pl-1">
                  <span>Authorized Personnel Only</span>
                  <span className="font-semibold text-slate-400">Factory Admin Access</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 active:scale-98 text-gold-300 font-black text-sm uppercase tracking-wider rounded-2xl shadow-lg transition flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-gold-300 border-t-transparent rounded-full animate-spin"></div>
                    <span>Unlocking Admin Portal...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    <span>Unlock Business Dashboard</span>
                  </>
                )}
              </button>

              <p className="text-[11px] text-slate-500 text-center leading-relaxed pt-1">
                Full factory stock overview, 8-sheet Excel export, staff credential management and batch traceability.
              </p>
            </form>
          )}

        </div>

      </div>

      {/* Forgot Password / Contact Admin Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2 text-brand-800">
                <HelpCircle className="w-5 h-5" />
                <h3 className="text-base font-black uppercase">Password Assistance</h3>
              </div>
              <button 
                onClick={() => setShowForgotModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <p>
                To maintain production security, factory employee passwords can only be reset by the <strong>Authorized Business Owner / Plant Admin</strong>.
              </p>
              
              <div className="p-3.5 bg-brand-50 border border-brand-200 rounded-2xl space-y-2 text-brand-900">
                <div className="flex items-center space-x-2 font-bold text-xs">
                  <Building2 className="w-4 h-4 text-brand-700" />
                  <span>Patel Sahab Spices Factory Office</span>
                </div>
                <div className="text-[11px] text-slate-700">
                  <strong>Authorized Signatory:</strong> Sujeet Patidar
                </div>
                <div className="text-[11px] text-slate-700">
                  <strong>Location:</strong> Village Panwa, Tehsil Kasrawad, Khargone (M.P.)
                </div>
                <div className="flex items-center space-x-2 pt-1 font-bold text-[11px] text-brand-800">
                  <PhoneCall className="w-3.5 h-3.5 text-brand-700" />
                  <span>Contact Incharge at Factory Workstation</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 italic">
                * Please contact the Business Owner or Factory Incharge to obtain or reset your assigned workstation credentials.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowForgotModal(false)}
              className="w-full py-2.5 bg-slate-900 text-white font-bold rounded-xl text-xs uppercase tracking-wider hover:bg-slate-800 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Footer Branding */}
      <footer className="w-full max-w-sm sm:max-w-md text-center py-4 space-y-1">
        <p className="text-[11px] font-bold text-slate-700 uppercase tracking-widest">
          PATEL SAHAB ENTERPRISES LLP
        </p>
        <p className="text-[10px] text-slate-400">
          Factory Plant: Village Panwa, Tehsil Kasrawad, Dist. Khargone (M.P.)
        </p>
      </footer>

    </div>
  );
}
