import React, { useState } from 'react';
import { ShieldAlert, X, KeyRound, AlertCircle } from 'lucide-react';
import { verifyAdminPin } from '../services/adminAuth';

export default function AdminPinModal({ isOpen, onClose, onSuccess }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleDigit = (digit) => {
    if (pin.length < 8) {
      setPin(prev => prev + digit);
      setError('');
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const handleClear = () => {
    setPin('');
    setError('');
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!pin) {
      setError('Please enter Admin PIN');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const isValid = await verifyAdminPin(pin);
      if (isValid) {
        setPin('');
        onSuccess();
        onClose();
      } else {
        setError('Incorrect PIN. Default is 1234.');
      }
    } catch (err) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-brand-900 to-brand-800 text-white p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-white/10 rounded-xl text-gold-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">Admin Authorization</h3>
              <p className="text-xs text-gold-200">Enter Admin PIN to continue</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* PIN Display Dots / Input */}
            <div className="text-center">
              <div className="flex justify-center space-x-2.5 my-2">
                {[0, 1, 2, 3].map((idx) => (
                  <div
                    key={idx}
                    className={`w-4 h-4 rounded-full border-2 transition-all ${
                      pin.length > idx
                        ? 'bg-brand-800 border-brand-900 scale-110 shadow-sm'
                        : 'border-slate-300 bg-slate-100'
                    }`}
                  />
                ))}
              </div>
              <input
                type="password"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError('');
                }}
                maxLength={8}
                placeholder="Or type PIN here"
                className="w-full text-center text-sm py-2 px-3 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-700"
              />
            </div>

            {error && (
              <div className="flex items-center space-x-1.5 p-2 bg-red-50 text-red-700 rounded-lg text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Touch Keypad */}
            <div className="grid grid-cols-3 gap-2 pt-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleDigit(String(num))}
                  className="py-3 text-lg font-bold rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 transition shadow-xs"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={handleClear}
                className="py-3 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
              >
                CLEAR
              </button>
              <button
                type="button"
                onClick={() => handleDigit('0')}
                className="py-3 text-lg font-bold rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 transition"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="py-3 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
              >
                DEL
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-brand-800 hover:bg-brand-900 active:scale-[0.98] text-white font-bold rounded-xl shadow-md transition flex items-center justify-center space-x-2 text-sm disabled:opacity-50"
            >
              <KeyRound className="w-4 h-4 text-gold-300" />
              <span>{loading ? 'Verifying...' : 'Unlock Admin Panel'}</span>
            </button>

            <p className="text-[11px] text-center text-slate-400">
              Default system PIN: <span className="font-mono font-bold text-slate-600">1234</span>
            </p>
          </form>
        </div>

      </div>
    </div>
  );
}
