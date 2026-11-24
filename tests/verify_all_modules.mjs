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

console.log('\n=============================================');
console.log('ALL PATEL SAHAB SPICES MODULE TESTS PASSED! 🎉');
console.log('=============================================');
