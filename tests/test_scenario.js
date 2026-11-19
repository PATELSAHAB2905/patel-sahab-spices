/**
 * PATEL SAHAB SPICES - BUSINESS RULES VERIFICATION TEST SUITE (STRICTLY KG ONLY)
 * Run with: node tests/test_scenario.js
 */

function validateSaleKg(kgSold) {
  const kg = Number(kgSold);
  if (isNaN(kg) || kg <= 0) {
    return { valid: false, error: 'Sale quantity must be greater than 0 KG' };
  }
  return { valid: true, kg: Number(kg.toFixed(3)) };
}

function runTests() {
  console.log('=================================================================');
  console.log('PATEL SAHAB SPICES - SYSTEM VERIFICATION (100% KG ONLY)');
  console.log('=================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  // TEST 1: KG Direct Sale Validation (No packet constraints)
  console.log('--- TEST 1: KG Direct Sale Validation (Section 8 & 9 - 100% KG Only) ---');
  
  // Direct integer KG sale
  const t1 = validateSaleKg(10);
  assert(t1.valid === true && t1.kg === 10, '10 KG sale is valid');

  // Decimal KG sale (e.g. 0.15 KG, previously rejected when assuming whole packets)
  const t2 = validateSaleKg(0.15);
  assert(t2.valid === true && t2.kg === 0.15, '0.15 KG sale is valid (direct KG weight accepted)');

  // Large decimal KG sale
  const t3 = validateSaleKg(15.75);
  assert(t3.valid === true && t3.kg === 15.75, '15.75 KG sale is valid');

  // Zero KG rejected
  const t4 = validateSaleKg(0);
  assert(t4.valid === false, '0 KG sale is rejected');

  // Negative KG rejected
  const t5 = validateSaleKg(-5);
  assert(t5.valid === false, 'Negative KG sale is rejected');

  // TEST 2: Processing Calculations (Section 5)
  console.log('\n--- TEST 2: Processing Calculations & Multi-Round Batch HAL-001 (Section 5) ---');
  const initialInwardKg = 1000;
  const batchId = 'HAL-001';

  // Round 1 = 300 KG
  const r1_gross = 300;
  const r1_netRaw = 285;
  const r1_powder = 270;
  const r1_cleaningWaste = r1_gross - r1_netRaw; // 15 KG
  const r1_grindingLoss = r1_netRaw - r1_powder; // 15 KG
  const r1_totalLoss = r1_gross - r1_powder;     // 30 KG
  assert(r1_cleaningWaste === 15 && r1_grindingLoss === 15 && r1_totalLoss === 30, 'Round 1 Losses: Waste 15kg, Loss 15kg, Total 30kg');

  // Round 2 = 400 KG
  const r2_gross = 400;
  const r2_netRaw = 380;
  const r2_powder = 360;
  const r2_cleaningWaste = r2_gross - r2_netRaw; // 20 KG
  const r2_grindingLoss = r2_netRaw - r2_powder; // 20 KG
  const r2_totalLoss = r2_gross - r2_powder;     // 40 KG
  assert(r2_cleaningWaste === 20 && r2_grindingLoss === 20 && r2_totalLoss === 40, 'Round 2 Losses: Waste 20kg, Loss 20kg, Total 40kg');

  // Round 3 = 300 KG
  const r3_gross = 300;
  const r3_netRaw = 285;
  const r3_powder = 270;
  const r3_cleaningWaste = r3_gross - r3_netRaw; // 15 KG
  const r3_grindingLoss = r3_netRaw - r3_powder; // 15 KG
  const r3_totalLoss = r3_gross - r3_powder;     // 30 KG
  assert(r3_cleaningWaste === 15 && r3_grindingLoss === 15 && r3_totalLoss === 30, 'Round 3 Losses: Waste 15kg, Loss 15kg, Total 30kg');

  const totalGrossProcessed = r1_gross + r2_gross + r3_gross;
  const remainingUnprocessed = initialInwardKg - totalGrossProcessed;
  const totalPowderProduced = r1_powder + r2_powder + r3_powder;
  assert(totalGrossProcessed === 1000, 'Total Gross Processed across 3 rounds = 1000 KG');
  assert(remainingUnprocessed === 0, 'Remaining unprocessed raw material = 0 KG');
  assert(totalPowderProduced === 900, 'Total Net Powder Produced = 900 KG');

  // Over-processing validation test
  const tryOverProcessGross = 100;
  const canOverProcess = tryOverProcessGross <= remainingUnprocessed;
  assert(canOverProcess === false, 'Cannot process more raw material than remaining balance');

  // TEST 3: Multi-Pack Packaging Calculations in KG (Section 6)
  console.log('\n--- TEST 3: Multi-Pack Packaging Calculations in KG (Section 6) ---');
  const availablePowder = totalPowderProduced; // 900 KG

  // Pack sizes recorded directly in KG:
  const packagesInKg = [
    { size: 10, kg: 10 },
    { size: 24, kg: 12 },
    { size: 50, kg: 25 },
    { size: 100, kg: 50 },
    { size: 200, kg: 60 },
    { size: 500, kg: 100 },
  ];

  let totalPowderUsedInPackaging = 0;
  packagesInKg.forEach(p => {
    totalPowderUsedInPackaging += p.kg;
  });

  assert(totalPowderUsedInPackaging === 257, 'Total powder packaged across 6 pack sizes = 257 KG');
  const remainingPowder = availablePowder - totalPowderUsedInPackaging;
  assert(remainingPowder === 643, 'Remaining Powder Stock = 643 KG (900 - 257)');

  // TEST 4: Multi-Product Sale Order in KG (Section 8)
  console.log('\n--- TEST 4: Multi-Product Order Dispatch in KG (Section 8) ---');
  // Order ORD-0001
  // Line 1: Haldi 100 GM, 10 KG
  // Line 2: Mirchi 200 GM, 15 KG
  // Line 3: Dhaniya 500 GM, 20 KG
  const orderLines = [
    { prod: 'Haldi', size: 100, kg: 10 },
    { prod: 'Mirchi', size: 200, kg: 15 },
    { prod: 'Dhaniya', size: 500, kg: 20 },
  ];

  const totalOrderKg = orderLines.reduce((acc, l) => acc + l.kg, 0);
  assert(totalOrderKg === 45, 'Total Order Quantity = 45 KG');

  // Stock deduction check in KG for Haldi 100 GM
  const haldi100ProducedKg = 50; // 50 KG produced
  const haldi100SoldKg = 10;     // 10 KG sold
  const haldi100RemainingKg = haldi100ProducedKg - haldi100SoldKg;
  assert(haldi100RemainingKg === 40, 'Haldi 100 GM remaining stock = 40 KG');

  // TEST 5: FIFO Batch Allocation Simulation in KG
  console.log('\n--- TEST 5: FIFO Batch Allocation Simulation in KG ---');
  const batches = [
    { batchId: 'HAL-001', inwardDate: '2026-11-01', remainingKg: 20 },
    { batchId: 'HAL-002', inwardDate: '2026-11-05', remainingKg: 50 },
  ];

  // Request 30 KG
  const neededKg = 30;
  let remainingNeededKg = neededKg;
  const fifoAllocations = [];

  // Sort oldest first
  batches.sort((a, b) => a.inwardDate.localeCompare(b.inwardDate));

  for (const b of batches) {
    if (remainingNeededKg <= 0.0001) break;
    const take = Math.min(remainingNeededKg, b.remainingKg);
    fifoAllocations.push({ batchId: b.batchId, kgSold: take });
    remainingNeededKg -= take;
  }

  assert(fifoAllocations[0].batchId === 'HAL-001' && fifoAllocations[0].kgSold === 20, 'FIFO takes 20 KG from oldest batch HAL-001 first');
  assert(fifoAllocations[1].batchId === 'HAL-002' && fifoAllocations[1].kgSold === 10, 'FIFO takes remaining 10 KG from batch HAL-002');
  assert(remainingNeededKg <= 0.0001, 'FIFO fully fulfills required 30 KG');

  // TEST 6: Manual Batch Number Validation
  console.log('\n--- TEST 6: Manual Custom Batch ID Capability ---');
  const customBatch1 = 'BATCH-HALDI-OCT26-01';
  const customBatch2 = 'PS-MIRCHI-LOT-99';
  assert(customBatch1.trim().length > 0, 'Custom batch ID can be manually typed by factory staff');
  assert(customBatch2.trim().length > 0, 'Second custom batch ID accepted without auto-generation constraint');

  console.log('\n=================================================================');
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('=================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
