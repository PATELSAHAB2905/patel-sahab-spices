import { openDB } from 'idb';

const DB_NAME = 'PatelSahabSpicesDB';
const DB_VERSION = 2;

export async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      // 1. Raw Material Inward
      if (!db.objectStoreNames.contains('raw_material')) {
        const store = db.createObjectStore('raw_material', { keyPath: 'id', autoIncrement: true });
        store.createIndex('entry_id', 'entry_id', { unique: true });
        store.createIndex('batch_id', 'batch_id', { unique: false });
        store.createIndex('material_name', 'material_name', { unique: false });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('synced', 'synced', { unique: false });
      }

      // 2. Processing
      if (!db.objectStoreNames.contains('processing')) {
        const store = db.createObjectStore('processing', { keyPath: 'id', autoIncrement: true });
        store.createIndex('entry_id', 'entry_id', { unique: true });
        store.createIndex('batch_id', 'batch_id', { unique: false });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('synced', 'synced', { unique: false });
      }

      // 3. Packaging
      if (!db.objectStoreNames.contains('packaging')) {
        const store = db.createObjectStore('packaging', { keyPath: 'id', autoIncrement: true });
        store.createIndex('entry_id', 'entry_id', { unique: true });
        store.createIndex('transaction_id', 'transaction_id', { unique: false });
        store.createIndex('batch_id', 'batch_id', { unique: false });
        store.createIndex('product_name', 'product_name', { unique: false });
        store.createIndex('synced', 'synced', { unique: false });
      }

      // 4. Order / Sale
      if (!db.objectStoreNames.contains('order_sale')) {
        const store = db.createObjectStore('order_sale', { keyPath: 'id', autoIncrement: true });
        store.createIndex('entry_id', 'entry_id', { unique: true });
        store.createIndex('order_id', 'order_id', { unique: false });
        store.createIndex('batch_id', 'batch_id', { unique: false });
        store.createIndex('product_name', 'product_name', { unique: false });
        store.createIndex('synced', 'synced', { unique: false });
      }

      // 5. Sync Queue
      if (!db.objectStoreNames.contains('sync_queue')) {
        const store = db.createObjectStore('sync_queue', { keyPath: 'queue_id', autoIncrement: true });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('created_at', 'created_at', { unique: false });
      }

      // 6. Employees
      if (!db.objectStoreNames.contains('employees')) {
        const store = db.createObjectStore('employees', { keyPath: 'id' });
        store.createIndex('name', 'name', { unique: true });
      }

      // 7. Products
      if (!db.objectStoreNames.contains('products')) {
        const store = db.createObjectStore('products', { keyPath: 'id' });
        store.createIndex('name', 'name', { unique: true });
      }

      // 8. Audit Logs
      if (!db.objectStoreNames.contains('audit_logs')) {
        const store = db.createObjectStore('audit_logs', { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('module', 'module', { unique: false });
      }

      // 9. Settings
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }

      // 10. Sales Return / Old Stock Return
      if (!db.objectStoreNames.contains('sales_return')) {
        const store = db.createObjectStore('sales_return', { keyPath: 'id', autoIncrement: true });
        store.createIndex('return_id', 'return_id', { unique: true });
        store.createIndex('order_id', 'order_id', { unique: false });
        store.createIndex('batch_id', 'batch_id', { unique: false });
        store.createIndex('product_name', 'product_name', { unique: false });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('synced', 'synced', { unique: false });
      }

      // 11. Powder Recovery
      if (!db.objectStoreNames.contains('powder_recovery')) {
        const store = db.createObjectStore('powder_recovery', { keyPath: 'id', autoIncrement: true });
        store.createIndex('recovery_id', 'recovery_id', { unique: true });
        store.createIndex('return_id', 'return_id', { unique: false });
        store.createIndex('batch_id', 'batch_id', { unique: false });
        store.createIndex('product_name', 'product_name', { unique: false });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('synced', 'synced', { unique: false });
      }

      // 12. System Health & Error Logs
      if (!db.objectStoreNames.contains('system_errors')) {
        const store = db.createObjectStore('system_errors', { keyPath: 'id', autoIncrement: true });
        store.createIndex('error_id', 'error_id', { unique: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('module', 'module', { unique: false });
        store.createIndex('severity', 'severity', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
    },
  });
}

// Initial seed data helper
export async function seedInitialDataIfNeeded() {
  const db = await getDB();

  // Check employees
  const employeeCount = await db.count('employees');
  // Default password "123456" with PSS_EMP_SALT_2026
  const defaultPwHash = '42b3b8be488e1de91358c3d761c82cd9115732c5f636df7a6efcf41953bc2377';
  if (employeeCount === 0) {
    const defaultEmployees = [
      { 
        id: 'EMP-001', 
        employee_id: 'PSS001', 
        name: 'Ramesh Patel', 
        role: 'Production Supervisor', 
        department: 'Production', 
        designation: 'Production Supervisor', 
        mobile: '9826012345', 
        password_hash: defaultPwHash, 
        permitted_modules: ['raw_material', 'processing', 'packaging', 'order_sale'], 
        active: true, 
        createdAt: new Date().toISOString() 
      },
      { 
        id: 'EMP-002', 
        employee_id: 'PSS002', 
        name: 'Suresh Kumar', 
        role: 'Machine Operator', 
        department: 'Grinding', 
        designation: 'Machine Operator', 
        mobile: '9826012346', 
        password_hash: defaultPwHash, 
        permitted_modules: ['processing'], 
        active: true, 
        createdAt: new Date().toISOString() 
      },
      { 
        id: 'EMP-003', 
        employee_id: 'PSS003', 
        name: 'Dinesh Sharma', 
        role: 'Packaging Incharge', 
        department: 'Packaging', 
        designation: 'Packaging Incharge', 
        mobile: '9826012347', 
        password_hash: defaultPwHash, 
        permitted_modules: ['packaging'], 
        active: true, 
        createdAt: new Date().toISOString() 
      },
      { 
        id: 'EMP-004', 
        employee_id: 'PSS004', 
        name: 'Mukesh Verma', 
        role: 'Godown Incharge', 
        department: 'Warehouse', 
        designation: 'Godown Incharge', 
        mobile: '9826012348', 
        password_hash: defaultPwHash, 
        permitted_modules: ['raw_material', 'order_sale'], 
        active: true, 
        createdAt: new Date().toISOString() 
      }
    ];
    const tx = db.transaction('employees', 'readwrite');
    for (const emp of defaultEmployees) {
      await tx.store.put(emp);
    }
    await tx.done;
  }

  // Check products
  const productCount = await db.count('products');
  if (productCount === 0) {
    const defaultProducts = [
      { id: 'PROD-001', name: 'Haldi', prefix: 'HAL', category: 'Whole/Ground', active: true },
      { id: 'PROD-002', name: 'Mirchi', prefix: 'MIR', category: 'Whole/Ground', active: true },
      { id: 'PROD-003', name: 'Dhaniya', prefix: 'DHA', category: 'Whole/Ground', active: true },
      { id: 'PROD-004', name: 'Jeera', prefix: 'JEE', category: 'Whole/Ground', active: true },
      { id: 'PROD-005', name: 'Garam Masala', prefix: 'GAR', category: 'Blend', active: true }
    ];
    const tx = db.transaction('products', 'readwrite');
    for (const prod of defaultProducts) {
      await tx.store.put(prod);
    }
    await tx.done;
  }

  // Check default settings
  const adminPinSetting = await db.get('settings', 'admin_pin_hash');
  if (!adminPinSetting) {
    // Default PIN: "1234" (can be changed in Admin Settings)
    // SHA-256 for "1234" is 03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4
    await db.put('settings', {
      key: 'admin_pin_hash',
      value: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
      updatedAt: new Date().toISOString()
    });
  }

  const scriptUrlSetting = await db.get('settings', 'google_apps_script_url');
  if (!scriptUrlSetting) {
    await db.put('settings', {
      key: 'google_apps_script_url',
      value: '', // Configurable via Admin Settings
      updatedAt: new Date().toISOString()
    });
  }

  const lastSyncSetting = await db.get('settings', 'last_successful_sync');
  if (!lastSyncSetting) {
    await db.put('settings', {
      key: 'last_successful_sync',
      value: null,
      updatedAt: new Date().toISOString()
    });
  }
}
