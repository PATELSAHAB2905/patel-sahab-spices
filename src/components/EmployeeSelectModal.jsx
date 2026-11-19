import React, { useState, useEffect } from 'react';
import { UserCheck, Users, X, Check } from 'lucide-react';
import { getDB } from '../services/db';

export default function EmployeeSelectModal({ isOpen, onClose, onSelectEmployee, currentEmployee }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadEmployees();
    }
  }, [isOpen]);

  const loadEmployees = async () => {
    try {
      setLoading(true);
      const db = await getDB();
      const all = await db.getAll('employees');
      // Only active employees
      setEmployees(all.filter(e => e.active !== false));
    } catch (err) {
      console.error('Error loading employees:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-brand-900 to-brand-800 text-white p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-white/10 rounded-xl text-gold-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">Select Employee Name</h3>
              <p className="text-xs text-gold-200/90">Entries will be tagged with your name</p>
            </div>
          </div>
          {currentEmployee && (
            <button 
              onClick={onClose}
              className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2">
          {loading ? (
            <div className="text-center py-8 text-slate-500 text-sm">Loading staff members...</div>
          ) : employees.length === 0 ? (
            <div className="text-center py-6 text-slate-500 text-sm">
              No active employees configured. Add staff in Admin Settings.
            </div>
          ) : (
            employees.map((emp) => {
              const isSelected = currentEmployee?.id === emp.id;
              return (
                <button
                  key={emp.id}
                  onClick={() => {
                    onSelectEmployee(emp);
                    onClose();
                  }}
                  className={`w-full text-left p-3.5 rounded-xl border-2 flex items-center justify-between transition-all active:scale-[0.98] ${
                    isSelected
                      ? 'border-brand-700 bg-brand-50/80 shadow-sm'
                      : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${
                      isSelected ? 'bg-brand-800 text-white' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {emp.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{emp.name}</div>
                      <div className="text-xs text-slate-500">{emp.role || 'Staff Member'}</div>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="w-6 h-6 rounded-full bg-brand-700 text-white flex items-center justify-center">
                      <Check className="w-4 h-4" />
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-center">
          <p className="text-xs text-slate-500">
            Note: Employee names can be added or edited from Admin Settings.
          </p>
        </div>

      </div>
    </div>
  );
}
