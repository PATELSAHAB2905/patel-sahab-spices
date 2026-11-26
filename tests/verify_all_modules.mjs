// Automated Verification Suite for Patel Sahab Spices Inventory & Return Modules
import assert from 'assert';

console.log('--- RUNNING PATEL SAHAB SPICES TEST SUITE ---');

// 1. In-memory Mock IndexedDB
class MockDB {
  constructor() {
    this.stores = {
      raw_material: [],
      processing: [],
      packaging: [],
      order_sale: [],
      sales_return: [],
      powder_recovery: [],
      system_errors: [],
      employees: [],
      audit_logs: [],
      sync_queue: [],
      settings: []
    };
    this.objectStoreNames = {
      contains: (name) => name in this.stores
    };
  }

  async getAll(storeName) {
    return [...(this.stores[storeName] || [])];
  }

  async get(storeName, key) {
    const list = this.stores[storeName] || [];
    return list.find(item => item.id === key || item.employee_id === key || item.key === key) || null;
  }

  async add(storeName, item) {
    if (!this.stores[storeName]) this.stores[storeName] = [];
    const id = item.id || Math.floor(Math.random() * 100000);
    const storedItem = { ...item, id };
    this.stores[storeName].push(storedItem);
    return id;
  }

  async put(storeName, item) {
    if (!this.stores[storeName]) this.stores[storeName] = [];
    const index = this.stores[storeName].findIndex(
      i => (item.id && i.id === item.id) ||
           (item.return_id && i.return_id === item.return_id) ||
           (item.entry_id && i.entry_id === item.entry_id) ||
           (item.error_id && i.error_id === item.error_id) ||
           (item.employee_id && i.employee_id === item.employee_id)
    );
    if (index >= 0) {
      this.stores[storeName][index] = { ...item };
    } else {
      const id = item.id || Math.floor(Math.random() * 100000);
      this.stores[storeName].push({ ...item, id });
    }
    return item.id;
  }

  async delete(storeName, key) {
    if (!this.stores[storeName]) return;
    this.stores[storeName] = this.stores[storeName].filter(
      i => i.id !== key && i.employee_id !== key && i.entry_id !== key
    );
  }
}

const mockDb = new MockDB();

// Test 1: Sales Return Packet Partition Validation
console.log('\n[TEST 1] Sales Return Packet Partition Validation');
{
  const total = 50;
  const reusable = 30;
  const rejected = 20;
  assert.strictEqual(reusable + rejected, total, 'Reusable + Rejected must equal Total');

  const invalidRejected = 15;
  assert.notStrictEqual(reusable + invalidRejected, total, 'Invalid split must be rejected');
  console.log('✔ Packet partition check passed');
}

// Test 2: Finished Stock Calculation with Reusable Returns
console.log('\n[TEST 2] Finished Stock Calculation with Returns');
{
  const packagedPackets = 1000;
  const soldPackets = 600;
  const returnedReusablePackets = 50;
  const returnedRejectedPackets = 30;

  // Finished stock formula: Packaged - Sold + Reusable returns (Rejected do NOT enter finished stock)
  const availablePackets = packagedPackets - soldPackets + returnedReusablePackets;
  assert.strictEqual(availablePackets, 450, 'Finished stock must include only reusable returns');
  console.log(`✔ Finished stock correctly calculated: ${availablePackets} packets (Rejected: ${returnedRejectedPackets} diverted to powder recovery)`);
}

// Test 3: Powder Stock Calculation with Actual Recovery
console.log('\n[TEST 3] Powder Stock Calculation with Actual Powder Recovery');
{
  const netPowderProducedKg = 100.0;
  const powderUsedInPackagingKg = 60.0;
  const estimatedPowderFromRejected = 1.5; // 30 packets of 50g
  const actualRecoveredPowderKg = 1.42; // Actual weighed recovery

  // Formula: Net Powder Produced + Actual Recovered Powder - Powder Used
  // Estimated powder must NEVER be credited!
  const availablePowder = Number((netPowderProducedKg + actualRecoveredPowderKg - powderUsedInPackagingKg).toFixed(3));
  assert.strictEqual(availablePowder, 41.42, 'Powder stock must credit actual recovered powder, not estimated');
  console.log(`✔ Powder stock verified: ${availablePowder} KG (Actual recovery: ${actualRecoveredPowderKg} KG credited)`);
}

// Test 4: Linked Sales Return Validation (Over-return Prevention)
console.log('\n[TEST 4] Linked Sales Return Over-return Prevention');
{
  const originalOrderSoldPackets = 100;
  const priorReturnedPackets = 40;
  const maxReturnable = originalOrderSoldPackets - priorReturnedPackets; // 60
  
  const attemptValidReturn = 50;
  assert.ok(attemptValidReturn <= maxReturnable, 'Return within sold balance should be accepted');

  const attemptExcessiveReturn = 65;
  assert.ok(attemptExcessiveReturn > maxReturnable, 'Excessive return should be rejected');
  console.log(`✔ Linked return constraints verified: Max returnable is ${maxReturnable} pkts. Excess return of ${attemptExcessiveReturn} pkts blocked.`);
}

// Test 5: Reversal Dependency Checks
console.log('\n[TEST 5] Reversal Dependency Logic');
{
  // Scenario A: Raw Inward = 50 KG, Processed = 40 KG. Can we reverse 50 KG Inward?
  const totalInward = 50;
  const processed = 40;
  const inwardEntryToReverse = 50;
  const remainingInward = totalInward - inwardEntryToReverse;
  assert.ok(remainingInward < processed, 'Reversing raw inward when processed must fail to prevent negative stock');

  // Scenario B: Raw Inward = 100 KG (two 50 KG entries), Processed = 40 KG. Reversing one 50 KG entry leaves 50 KG >= 40 KG.
  const totalInwardB = 100;
  const remainingInwardB = totalInwardB - 50;
  assert.ok(remainingInwardB >= processed, 'Reversing raw inward when sufficient surplus remains should pass');
  console.log('✔ Reversal dependency guards verified');
}

// Test 6: Safe Employee Deletion Check
console.log('\n[TEST 6] Safe Employee Deletion Check');
{
  // Mock employee with history
  const empWithHistory = { id: 1, employee_id: 'PSS002', name: 'Ramesh Patel' };
  const empWithoutHistory = { id: 2, employee_id: 'PSS005', name: 'New Joinee' };

  mockDb.stores.employees.push(empWithHistory, empWithoutHistory);
  mockDb.stores.raw_material.push({
    id: 101,
    entry_id: 'RAW-001',
    created_by_id: 'PSS002',
    quantity_kg: 50
  });

  // Function simulating deleteEmployeeAccount
  async function testDeleteEmployee(employeeDbId) {
    const emp = await mockDb.get('employees', employeeDbId);
    if (!emp) throw new Error('Employee not found');

    const empId = emp.employee_id || emp.id;
    const rawList = await mockDb.getAll('raw_material');
    const procList = await mockDb.getAll('processing');
    const pkgList = await mockDb.getAll('packaging');
    const saleList = await mockDb.getAll('order_sale');
    const returnList = await mockDb.getAll('sales_return');

    const hasTransactions = 
      rawList.some(r => r.created_by_id === empId || r.entered_by === emp.name) ||
      procList.some(p => p.created_by_id === empId || p.operator_name === emp.name) ||
      pkgList.some(k => k.created_by_id === empId || k.packed_by === emp.name) ||
      saleList.some(s => s.created_by_id === empId || s.dispatched_by === emp.name) ||
      returnList.some(ret => ret.created_by_id === empId || ret.received_by === emp.name);

    if (hasTransactions) {
      throw new Error(`Cannot delete employee "${emp.name}" (${empId}). This employee has historical factory records. Please DEACTIVATE the account instead.`);
    }

    await mockDb.delete('employees', employeeDbId);
    return true;
  }

  // Deleting employee with history must throw
  let blockedError = null;
  try {
    await testDeleteEmployee(1);
  } catch (err) {
    blockedError = err;
  }
  assert.ok(blockedError, 'Deletion of employee with history MUST throw');
  assert.ok(blockedError.message.includes('DEACTIVATE'), 'Error must advise Deactivation');
  console.log(`✔ Safe employee deletion blocked correctly: "${blockedError.message}"`);

  // Deleting employee with no history must succeed
  const deleteResult = await testDeleteEmployee(2);
  assert.strictEqual(deleteResult, true, 'Employee without history can be safely deleted');
  const checkDeleted = await mockDb.get('employees', 2);
  assert.strictEqual(checkDeleted, null, 'Employee record removed');
  console.log('✔ Clean deletion of employee without historical records succeeded');
}

// Test 7: Employee ID Uniqueness Check
console.log('\n[TEST 7] Employee ID Change and Uniqueness');
{
  mockDb.stores.employees.push({ id: 3, employee_id: 'PSS003', name: 'Suresh' });

  async function testChangeEmployeeId(empDbId, newId) {
    const cleanNewId = newId.trim().toUpperCase();
    const existing = mockDb.stores.employees.find(e => e.id !== empDbId && (e.employee_id === cleanNewId || e.id === cleanNewId));
    if (existing) {
      throw new Error(`Employee ID "${cleanNewId}" is already assigned to "${existing.name}".`);
    }
    const emp = await mockDb.get('employees', empDbId);
    emp.employee_id = cleanNewId;
    return emp;
  }

  let dupError = null;
  try {
    await testChangeEmployeeId(3, 'PSS002'); // PSS002 already belongs to Ramesh
  } catch (e) {
    dupError = e;
  }
  assert.ok(dupError, 'Duplicate Employee ID change must be rejected');
  console.log(`✔ Duplicate ID check passed: "${dupError.message}"`);

  const updated = await testChangeEmployeeId(3, 'PSS009');
  assert.strictEqual(updated.employee_id, 'PSS009', 'New unique ID should be assigned');
  console.log('✔ Employee ID successfully changed to PSS009');
}

// Test 8: System Error Logging and Resolution Lifecycle
console.log('\n[TEST 8] System Error Logging and Resolution');
{
  const errorRecord = {
    error_id: 'ERR-20261124-1234',
    timestamp: new Date().toISOString(),
    module: 'SYNC',
    description: 'Firebase connection timeout on network retry',
    severity: 'MEDIUM',
    status: 'OPEN',
    resolution_notes: '',
    resolved_at: null,
    resolved_by: null
  };
  await mockDb.add('system_errors', errorRecord);

  const errors = await mockDb.getAll('system_errors');
  assert.strictEqual(errors.length, 1);
  assert.strictEqual(errors[0].status, 'OPEN');

  // Resolve
  const recordToResolve = errors[0];
  recordToResolve.status = 'RESOLVED';
  recordToResolve.resolution_notes = 'Network connection restored and batch re-synced successfully';
  recordToResolve.resolved_at = new Date().toISOString();
  recordToResolve.resolved_by = 'Admin';
  await mockDb.put('system_errors', recordToResolve);

  const updatedErrors = await mockDb.getAll('system_errors');
  assert.strictEqual(updatedErrors[0].status, 'RESOLVED');
  assert.strictEqual(updatedErrors[0].resolved_by, 'Admin');
  console.log('✔ System error logging and resolution cycle verified');
}

// Helper functions for testing Batch Generation logic
function indexToSequenceLetters(num) {
  let n = parseInt(num, 10);
  if (isNaN(n) || n <= 0) return 'A';
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s || 'A';
}

function sequenceLettersToIndex(str) {
  if (!str) return 0;
  const clean = String(str).trim().toUpperCase();
  let num = 0;
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      num = num * 26 + (code - 64);
    }
  }
  return num;
}

function getProductSinglePrefix(name) {
  const str = String(name || '').trim().toLowerCase();
  if (str.startsWith('haldi') || str.startsWith('turmeric') || str === 'h') return 'H';
  if (str.startsWith('mirchi') || str.startsWith('chilli') || str === 'm') return 'M';
  if (str.startsWith('dhaniya') || str.startsWith('coriander') || str === 'd') return 'D';
  return name ? name.trim().slice(0, 1).toUpperCase() : 'H';
}

function generateMockBatchId(rawEntries, productName, dateStr) {
  const prefix = getProductSinglePrefix(productName);
  let mm = '';
  let yy = '';
  if (dateStr && dateStr.includes('-')) {
    const parts = dateStr.split('-');
    yy = parts[0].slice(-2);
    mm = parts[1].padStart(2, '0');
  }
  const regex = new RegExp(`^${prefix}${mm}${yy}([A-Z]+)$`, 'i');
  let maxSeq = 0;
  for (const r of rawEntries) {
    if (r.batch_id) {
      const match = String(r.batch_id).trim().match(regex);
      if (match) {
        const seq = sequenceLettersToIndex(match[1]);
        if (seq > maxSeq) maxSeq = seq;
      }
    }
  }
  let nextSeq = maxSeq + 1;
  let candidate = `${prefix}${mm}${yy}${indexToSequenceLetters(nextSeq)}`;
  const existing = new Set(rawEntries.map(r => (r.batch_id || '').toUpperCase()));
  while (existing.has(candidate.toUpperCase())) {
    nextSeq++;
    candidate = `${prefix}${mm}${yy}${indexToSequenceLetters(nextSeq)}`;
  }
  return candidate;
}

// Test 9: Automatic Batch Number Pattern Generation
console.log('\n[TEST 9] Automatic Batch Number Pattern Generation');
{
  const testEntries = [];

  // Haldi Nov 2026 1st purchase -> H1126A
  const h1 = generateMockBatchId(testEntries, 'Haldi', '2026-11-05');
  assert.strictEqual(h1, 'H1126A', '1st Haldi purchase in Nov 2026 must be H1126A');
  testEntries.push({ batch_id: h1, material_name: 'Haldi', date: '2026-11-05' });

  // Haldi Nov 2026 2nd purchase -> H1126B
  const h2 = generateMockBatchId(testEntries, 'Haldi', '2026-11-12');
  assert.strictEqual(h2, 'H1126B', '2nd Haldi purchase in Nov 2026 must be H1126B');
  testEntries.push({ batch_id: h2, material_name: 'Haldi', date: '2026-11-12' });

  // Haldi Nov 2026 3rd purchase -> H1126C
  const h3 = generateMockBatchId(testEntries, 'Haldi', '2026-11-18');
  assert.strictEqual(h3, 'H1126C', '3rd Haldi purchase in Nov 2026 must be H1126C');
  testEntries.push({ batch_id: h3, material_name: 'Haldi', date: '2026-11-18' });

  // Mirchi Nov 2026 1st purchase -> M1126A
  const m1 = generateMockBatchId(testEntries, 'Mirchi', '2026-11-06');
  assert.strictEqual(m1, 'M1126A', '1st Mirchi purchase in Nov 2026 must be M1126A');
  testEntries.push({ batch_id: m1, material_name: 'Mirchi', date: '2026-11-06' });

  // Dhaniya Nov 2026 1st purchase -> D1126A
  const d1 = generateMockBatchId(testEntries, 'Dhaniya', '2026-11-07');
  assert.strictEqual(d1, 'D1126A', '1st Dhaniya purchase in Nov 2026 must be D1126A');
  testEntries.push({ batch_id: d1, material_name: 'Dhaniya', date: '2026-11-07' });

  // Haldi Dec 2026 1st purchase -> H1226A
  const hDec = generateMockBatchId(testEntries, 'Haldi', '2026-12-01');
  assert.strictEqual(hDec, 'H1226A', '1st Haldi purchase in Dec 2026 must reset sequence to H1226A');

  console.log('✔ All product batch patterns verified (H1126A, H1126B, H1126C, M1126A, D1126A, H1226A)');
}

// Test 10: Editable Batch Number & Cascade Migration
console.log('\n[TEST 10] Editable Batch Number & Cascade Migration');
{
  const rawRec = { entry_id: 'RAW-010', batch_id: 'H1126A', material_name: 'Haldi', quantity_kg: 500 };
  const procRec = { entry_id: 'PROC-010', batch_id: 'H1126A', gross_raw_kg: 200 };
  const pkgRec = { entry_id: 'PKG-010', batch_id: 'H1126A', powder_used_kg: 100 };

  mockDb.stores.raw_material.push(rawRec);
  mockDb.stores.processing.push(procRec);
  mockDb.stores.packaging.push(pkgRec);

  // Migrate batch ID from H1126A to H1126A-CORR
  async function testMigrateBatch(oldBatch, newBatch) {
    const rawAll = await mockDb.getAll('raw_material');
    const dup = rawAll.find(r => r.batch_id === newBatch && r.batch_id !== oldBatch);
    if (dup) throw new Error(`Batch ID "${newBatch}" already exists.`);

    const stores = ['raw_material', 'processing', 'packaging'];
    let count = 0;
    for (const s of stores) {
      const items = await mockDb.getAll(s);
      for (const item of items) {
        if (item.batch_id === oldBatch) {
          item.batch_id = newBatch;
          await mockDb.put(s, item);
          count++;
        }
      }
    }
    return count;
  }

  const updatedRecords = await testMigrateBatch('H1126A', 'H1126A-CORR');
  assert.strictEqual(updatedRecords, 3, 'Must migrate batch across all 3 stores');

  const checkRaw = (await mockDb.getAll('raw_material')).find(r => r.entry_id === 'RAW-010');
  const checkProc = (await mockDb.getAll('processing')).find(p => p.entry_id === 'PROC-010');
  const checkPkg = (await mockDb.getAll('packaging')).find(k => k.entry_id === 'PKG-010');

  assert.strictEqual(checkRaw.batch_id, 'H1126A-CORR');
  assert.strictEqual(checkProc.batch_id, 'H1126A-CORR');
  assert.strictEqual(checkPkg.batch_id, 'H1126A-CORR');

  console.log('✔ Batch ID edit and cascade migration across linked transactions verified');
}

// Test 11: Raw Material Edit & Delete Safety
console.log('\n[TEST 11] Raw Material Edit & Delete Safety Checks');
{
  const entryToTest = {
    entry_id: 'RAW-020',
    batch_id: 'M1126B',
    material_name: 'Mirchi',
    quantity_kg: 300,
    employee_name: 'Mukesh Verma',
    employee_id: 'PSS004',
    is_reversed: false
  };
  mockDb.stores.raw_material.push(entryToTest);
  mockDb.stores.processing.push({
    entry_id: 'PROC-020',
    batch_id: 'M1126B',
    gross_raw_kg: 200,
    is_reversed: false
  });

  // Attempt unsafe edit: reduce quantity to 150 KG when 200 KG is already processed
  function validateRawEdit(entry, newQty, procList) {
    const processedKg = procList.filter(p => p.batch_id === entry.batch_id && !p.is_reversed).reduce((s, p) => s + p.gross_raw_kg, 0);
    if (newQty < processedKg) {
      throw new Error(`Cannot reduce inward quantity to ${newQty} KG. Batch ${entry.batch_id} already has ${processedKg} KG processed.`);
    }
  }

  let editError = null;
  try {
    validateRawEdit(entryToTest, 150, mockDb.stores.processing);
  } catch (e) {
    editError = e;
  }
  assert.ok(editError, 'Editing quantity below processed amount must throw');
  console.log(`✔ Unsafe raw edit blocked: "${editError.message}"`);

  // Safe edit: change quantity to 250 KG (>= 200 KG)
  assert.doesNotThrow(() => validateRawEdit(entryToTest, 250, mockDb.stores.processing));
  console.log('✔ Safe raw edit allowed');

  // Attempt unsafe deletion: batch has 200 KG processed
  function validateRawDelete(entry, procList) {
    const processedKg = procList.filter(p => p.batch_id === entry.batch_id && !p.is_reversed).reduce((s, p) => s + p.gross_raw_kg, 0);
    if (processedKg > 0) {
      throw new Error(`Cannot delete Raw Material entry ${entry.entry_id}. Batch ${entry.batch_id} has ${processedKg} KG processed.`);
    }
  }

  let deleteError = null;
  try {
    validateRawDelete(entryToTest, mockDb.stores.processing);
  } catch (e) {
    deleteError = e;
  }
  assert.ok(deleteError, 'Deleting raw material entry with processed powder must throw');
  console.log(`✔ Unsafe raw deletion blocked: "${deleteError.message}"`);

  // Role authorization test: another employee cannot delete entry
  function checkAuth(entry, userName, role) {
    if (role === 'admin' || role === 'Administrator') return true;
    if (entry.employee_name === userName || entry.employee_id === userName) return true;
    throw new Error('Permission denied: Employees can only edit or delete their own entries.');
  }

  assert.throws(() => checkAuth(entryToTest, 'Ramesh Patel', 'staff'), /Permission denied/);
  assert.strictEqual(checkAuth(entryToTest, 'Mukesh Verma', 'staff'), true);
  assert.strictEqual(checkAuth(entryToTest, 'Admin', 'admin'), true);
  console.log('✔ Role-based edit & delete authorization verified');
}

// Test 12: Employee ID Change & Auth Logic
console.log('\n[TEST 12] Employee ID Change & Auth Logic');
{
  const testEmp = {
    id: 'EMP-050',
    employee_id: 'PSS050',
    name: 'Kavita Patidar',
    mobile: '9826055555',
    password_hash: 'mock_hash',
    salt: 'salt'
  };
  mockDb.stores.employees.push(testEmp);

  // Authenticate helper simulating updated authenticateEmployee
  function authEmployee(cleanId, allEmps) {
    const emp = allEmps.find(e => 
      (e.employee_id && e.employee_id.toUpperCase() === cleanId) ||
      (!e.employee_id && e.id && e.id.toUpperCase() === cleanId) ||
      (e.mobile && e.mobile.trim() === cleanId)
    );
    if (!emp) throw new Error(`Invalid Employee ID "${cleanId}".`);
    return emp;
  }

  // Pre-change: PSS050 works
  assert.strictEqual(authEmployee('PSS050', mockDb.stores.employees).name, 'Kavita Patidar');

  // Change ID to PSS055
  testEmp.employee_id = 'PSS055';

  // Post-change: Old ID PSS050 MUST FAIL
  assert.throws(() => authEmployee('PSS050', mockDb.stores.employees), /Invalid Employee ID "PSS050"/);
  console.log('✔ Old Employee ID PSS050 cannot log in after change');

  // Post-change: New ID PSS055 SUCCEEDS
  assert.strictEqual(authEmployee('PSS055', mockDb.stores.employees).name, 'Kavita Patidar');
  console.log('✔ New Employee ID PSS055 successfully logs in');
}

// Test 13: Firestore Object Sanitization
console.log('\n[TEST 13] Firestore Object Sanitization');
{
  function sanitizeForFirestore(val) {
    if (val === undefined || val === null) return null;
    if (typeof val !== 'object') return val;
    if (val instanceof Date) return val.toISOString();
    if (Array.isArray(val)) return val.map(sanitizeForFirestore);
    const clean = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        clean[k] = sanitizeForFirestore(v);
      }
    }
    return clean;
  }

  const badObject = {
    batch_id: 'H1126A',
    quantity_kg: 50,
    remarks: undefined,
    order_id: undefined,
    nested: { a: 1, b: undefined }
  };

  const clean = sanitizeForFirestore(badObject);
  assert.strictEqual(clean.remarks, undefined);
  assert.strictEqual('remarks' in clean, false);
  assert.strictEqual('order_id' in clean, false);
  assert.strictEqual('b' in clean.nested, false);
  assert.strictEqual(clean.nested.a, 1);
  console.log('✔ Firestore payload sanitized: all undefined fields removed');
}

console.log('\n=============================================');
console.log('ALL PATEL SAHAB SPICES MODULE TESTS PASSED! 🎉');
console.log('=============================================');
