import React, { useState, useEffect } from 'react';
import LoginPortal from './components/LoginPortal';
import EmployeePortal from './components/EmployeePortal';
import AdminPortal from './components/AdminPortal';
import { seedInitialDataIfNeeded, getDB } from './services/db';
import { ensureEmployeesMigrated } from './services/adminAuth';

export default function App() {
  const [authRole, setAuthRole] = useState(null); // 'admin' | 'employee' | null
  const [activeEmployee, setActiveEmployee] = useState(null);
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    initApp();
  }, []);

  const initApp = async () => {
    try {
      await seedInitialDataIfNeeded();
      const allEmps = await ensureEmployeesMigrated();
      setDbReady(true);

      const savedRole = localStorage.getItem('pss_auth_role');
      const savedEmpId = localStorage.getItem('pss_active_employee_id');

      let currentEmp = null;
      if (savedEmpId && allEmps.length > 0) {
        currentEmp = allEmps.find(e => 
          (e.employee_id === savedEmpId || e.id === savedEmpId) && e.active !== false
        );
      }

      if (savedRole === 'admin') {
        setAuthRole('admin');
      } else if (savedRole === 'employee' && currentEmp) {
        setActiveEmployee(currentEmp);
        setAuthRole('employee');
      } else {
        setAuthRole(null);
        setActiveEmployee(null);
      }
    } catch (err) {
      console.error('Initialization error:', err);
      setDbReady(true);
    }
  };

  const handleEmployeeLogin = (emp) => {
    setActiveEmployee(emp);
    localStorage.setItem('pss_active_employee_id', emp.employee_id || emp.id);
    localStorage.setItem('pss_auth_role', 'employee');
    setAuthRole('employee');
  };

  const handleAdminLogin = () => {
    localStorage.setItem('pss_auth_role', 'admin');
    setAuthRole('admin');
  };

  const handleLogout = () => {
    localStorage.removeItem('pss_auth_role');
    localStorage.removeItem('pss_active_employee_id');
    setActiveEmployee(null);
    setAuthRole(null);
  };

  if (!dbReady) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center text-white space-y-3">
          <div className="w-12 h-12 border-4 border-gold-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <h2 className="text-base font-bold tracking-wider">PATEL SAHAB SPICES</h2>
          <p className="text-xs text-slate-400">Initializing Local Factory Database & Storage...</p>
        </div>
      </div>
    );
  }

  // 1. Employee Portal
  if (authRole === 'employee') {
    return (
      <EmployeePortal
        activeEmployee={activeEmployee}
        onLogout={handleLogout}
      />
    );
  }

  // 2. Admin Portal
  if (authRole === 'admin') {
    return (
      <AdminPortal
        activeEmployee={{ name: 'Business Owner (Admin)', role: 'Administrator' }}
        onLogout={handleLogout}
      />
    );
  }

  // 3. Login / Portal Selector Screen
  return (
    <LoginPortal
      onEmployeeLogin={handleEmployeeLogin}
      onAdminLogin={handleAdminLogin}
    />
  );
}
