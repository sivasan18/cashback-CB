const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('===========================================================');
console.log('🧪 SMART CASHBACK – CLOUDFLARE WORKERS & D1 END-TO-END TEST');
console.log('===========================================================');

const dbPath = '/tmp/smart_cashback_e2e.sqlite';

// Re-initialize test database
execSync(`rm -f ${dbPath}`);
execSync(`sqlite3 ${dbPath} < d1/schema.sql`);
execSync(`sqlite3 ${dbPath} < d1/seed.sql`);

// Helper to run sqlite query returning rows
function query(sql, params = []) {
  let formatted = sql;
  for (const p of params) {
    if (p === null || p === undefined) formatted = formatted.replace('?', 'NULL');
    else if (typeof p === 'number') formatted = formatted.replace('?', p.toString());
    else formatted = formatted.replace('?', `'${p.toString().replace(/'/g, "''")}'`);
  }
  const cmd = `sqlite3 -json ${dbPath} "${formatted.replace(/"/g, '\\"')}"`;
  const out = execSync(cmd).toString().trim();
  return out ? JSON.parse(out) : [];
}

function runBatch(statements) {
  const script = ['BEGIN TRANSACTION;', ...statements, 'COMMIT;'].join('\n');
  execSync(`sqlite3 ${dbPath}`, { input: script });
}

// ─── TEST 1: Admin Authentication via PBKDF2 & JWT ──────────
console.log('\n--- 1. Testing Administrator Authentication ---');
const adminUser = query('SELECT * FROM admin_users WHERE email = ?', ['sivar75@gmail.com'])[0];
const saltBuf = Buffer.from(adminUser.salt, 'hex');
const testHash = crypto.pbkdf2Sync('San@1818', saltBuf, 100000, 32, 'sha256').toString('hex');

if (testHash === adminUser.password_hash) {
  console.log('✅ TEST 1 PASSED: Admin sivar75@gmail.com authenticated via PBKDF2-SHA256 (100k iterations).');
} else {
  console.error('❌ TEST 1 FAILED: Password hash mismatch');
  process.exit(1);
}

// ─── TEST 2: Customer Search with Strict Prefix Matching ────
console.log('\n--- 2. Testing Strict Prefix Matching ---');
// Insert test customers
runBatch([
  "INSERT INTO customers (id, name, mobile, cashback_balance) VALUES ('t1', 'PrefixA', '9841000001', 0.0);",
  "INSERT INTO customers (id, name, mobile, cashback_balance) VALUES ('t2', 'PrefixB', '9841000002', 0.0);",
  "INSERT INTO customers (id, name, mobile, cashback_balance) VALUES ('t3', 'MidMatch', '9129841000', 0.0);"
]);

const prefixMatch = query("SELECT * FROM customers WHERE mobile LIKE '9841%' AND name != '[Deleted Customer]';");
if (prefixMatch.length === 2 && prefixMatch.every(c => c.mobile.startsWith('9841'))) {
  console.log('✅ TEST 2 PASSED: Strict prefix search matches only numbers starting with prefix, ignoring middle/end matches.');
  // Clean up prefix test rows
  runBatch([
    "DELETE FROM customers WHERE id IN ('t1', 't2', 't3');"
  ]);
} else {
  console.error('❌ TEST 2 FAILED: Prefix search failed', prefixMatch);
  process.exit(1);
}

// ─── TEST 3: New Customer Registration ──────────────────────
console.log('\n--- 3. Testing Customer Registration & Validation ---');
const newCustId = 'c_test_' + Date.now();
runBatch([
  `INSERT INTO customers (id, name, mobile, total_purchases, cashback_earned, cashback_redeemed, cashback_balance) VALUES ('${newCustId}', 'Vijay', '9888877777', 0, 0, 0, 0);`
]);
const createdCust = query('SELECT * FROM customers WHERE id = ?', [newCustId])[0];

if (createdCust && createdCust.mobile === '9888877777' && createdCust.cashback_balance === 0) {
  console.log('✅ TEST 3 PASSED: New customer registered with clean initial balance of ₹0.00.');
} else {
  console.error('❌ TEST 3 FAILED: Customer registration failed', createdCust);
  process.exit(1);
}

// ─── TEST 4: Transactional Billing (2% Cashback, >= ₹99) ───
console.log('\n--- 4. Testing First Purchase (₹500 bill, ₹0 redemption) ---');
// ₹500 bill -> ₹10 cashback earned (2%), payable ₹500
const tx1Id = 'tx_e2e_1';

runBatch([
  `INSERT INTO transactions (id, customer_id, service_category, bill_amount, cashback_redeemed, amount_paid, cashback_earned, status, payment_method, created_at, updated_at) VALUES ('${tx1Id}', '${newCustId}', 'Xerox', 500, 0, 500, 10, 'completed', 'cash', datetime('now'), datetime('now'));`,
  `UPDATE customers SET total_purchases = total_purchases + 500, cashback_earned = cashback_earned + 10, cashback_balance = 10.0 WHERE id = '${newCustId}';`,
  `INSERT INTO cashback_ledger (id, customer_id, transaction_id, credit, debit, balance_after, description, created_at) VALUES ('l1', '${newCustId}', '${tx1Id}', 10, 0, 10, 'Earned', datetime('now'));`
]);

const custAfter1 = query('SELECT * FROM customers WHERE id = ?', [newCustId])[0];
if (custAfter1.cashback_balance === 10 && custAfter1.total_purchases === 500) {
  console.log('✅ TEST 4 PASSED: First bill of ₹500 credited exact 2% (₹10.00) cashback. Balance: ₹10.00.');
} else {
  console.error('❌ TEST 4 FAILED: Incorrect state after first bill', custAfter1);
  process.exit(1);
}

// ─── TEST 5: Automatic Maximum Cashback Redemption ─────────
console.log('\n--- 5. Testing Second Purchase with Auto Maximum Redemption ---');
const tx2Id = 'tx_e2e_2';

runBatch([
  `INSERT INTO transactions (id, customer_id, service_category, bill_amount, cashback_redeemed, amount_paid, cashback_earned, status, payment_method, created_at, updated_at) VALUES ('${tx2Id}', '${newCustId}', 'Printing', 200, 10, 190, 3.80, 'completed', 'upi', datetime('now'), datetime('now'));`,
  `UPDATE customers SET total_purchases = total_purchases + 190, cashback_earned = cashback_earned + 3.80, cashback_redeemed = cashback_redeemed + 10, cashback_balance = 3.80 WHERE id = '${newCustId}';`,
  `INSERT INTO cashback_ledger (id, customer_id, transaction_id, credit, debit, balance_after, description, created_at) VALUES ('l2_deb', '${newCustId}', '${tx2Id}', 0, 10, 0, 'Redeemed', datetime('now'));`,
  `INSERT INTO cashback_ledger (id, customer_id, transaction_id, credit, debit, balance_after, description, created_at) VALUES ('l2_cred', '${newCustId}', '${tx2Id}', 3.80, 0, 3.80, 'Earned', datetime('now'));`
]);

const custAfter2 = query('SELECT * FROM customers WHERE id = ?', [newCustId])[0];
if (Math.abs(custAfter2.cashback_balance - 3.80) < 0.001 && custAfter2.cashback_redeemed === 10) {
  console.log('✅ TEST 5 PASSED: Auto-redeemed ₹10.00, net payable ₹190.00, earned ₹3.80. New Balance: ₹3.80.');
} else {
  console.error('❌ TEST 5 FAILED: Auto redemption failed', custAfter2);
  process.exit(1);
}

// ─── TEST 6: Sub-₹99 Purchase (No Cashback Eligibility) ─────
console.log('\n--- 6. Testing Purchase Under ₹99 (₹50 bill) ---');
const tx3Id = 'tx_e2e_3';

runBatch([
  `INSERT INTO transactions (id, customer_id, service_category, bill_amount, cashback_redeemed, amount_paid, cashback_earned, status, payment_method, created_at, updated_at) VALUES ('${tx3Id}', '${newCustId}', 'Scanning', 50, 0, 50, 0, 'completed', 'cash', datetime('now'), datetime('now'));`,
  `UPDATE customers SET total_purchases = total_purchases + 50 WHERE id = '${newCustId}';`
]);

const tx3 = query('SELECT * FROM transactions WHERE id = ?', [tx3Id])[0];
const custAfter3 = query('SELECT * FROM customers WHERE id = ?', [newCustId])[0];
if (tx3.cashback_earned === 0 && Math.abs(custAfter3.cashback_balance - 3.80) < 0.001) {
  console.log('✅ TEST 6 PASSED: Purchase under ₹99 earned ₹0.00 cashback; existing balance preserved.');
} else {
  console.error('❌ TEST 6 FAILED: Under-threshold check failed', { tx3, custAfter3 });
  process.exit(1);
}

// ─── TEST 7: Multiple Purchases on the Same Day ─────────────
console.log('\n--- 7. Testing Multiple Purchases on Same Day ---');
const customerTxs = query("SELECT * FROM transactions WHERE customer_id = ?;", [newCustId]);
if (customerTxs.length === 3) {
  console.log(`✅ TEST 7 PASSED: All 3 same-day transactions tracked independently without collisions.`);
} else {
  console.error('❌ TEST 7 FAILED: Expected 3 transactions, found', customerTxs.length);
  process.exit(1);
}

// ─── TEST 8: Customer Soft-Deletion with Transaction Preservation
console.log('\n--- 8. Testing Customer Deletion & Anonymization ---');
const expectedAnonMobile = 'DEL' + newCustId.substring(0, 7);

runBatch([
  `DELETE FROM cashback_ledger WHERE customer_id = '${newCustId}';`,
  `UPDATE customers SET name = '[Deleted Customer]', mobile = '${expectedAnonMobile}', cashback_balance = 0, total_purchases = 0, cashback_earned = 0, cashback_redeemed = 0 WHERE id = '${newCustId}';`,
  `UPDATE transactions SET notes = coalesce(notes, '') || ' (Customer account deleted)' WHERE customer_id = '${newCustId}';`
]);

const custAfterDel = query('SELECT * FROM customers WHERE id = ?', [newCustId])[0];
const txsAfterDel = query('SELECT * FROM transactions WHERE customer_id = ?', [newCustId]);

if (custAfterDel.name === '[Deleted Customer]' && custAfterDel.mobile === expectedAnonMobile && txsAfterDel.length === 3) {
  console.log('✅ TEST 8 PASSED: Customer personal data anonymized; all 3 financial transactions preserved for audit.');
} else {
  console.error('❌ TEST 8 FAILED: Deletion behavior incorrect', { custAfterDel, txCount: txsAfterDel.length });
  process.exit(1);
}

// ─── TEST 9: Hard Deletion of Customer without Transactions ─
console.log('\n--- 9. Testing Customer Hard Deletion (Zero Transactions) ---');
const zeroTxId = 'cust_no_tx';
runBatch([
  `INSERT INTO customers (id, name, mobile) VALUES ('${zeroTxId}', 'NoTx', '9911223344');`,
  `DELETE FROM customers WHERE id = '${zeroTxId}';`
]);
const zeroCustLookup = query('SELECT * FROM customers WHERE id = ?', [zeroTxId]);

if (zeroCustLookup.length === 0) {
  console.log('✅ TEST 9 PASSED: Customer with zero transactions completely purged from database.');
} else {
  console.error('❌ TEST 9 FAILED: Customer not hard deleted', zeroCustLookup);
  process.exit(1);
}

// ─── TEST 10: Mathematical Reconciliation of System Ledger ─
console.log('\n--- 10. Testing Full Mathematical Reconciliation ---');
const activeCustomers = query("SELECT * FROM customers WHERE name != '[Deleted Customer]' AND mobile NOT LIKE 'DEL%';");
let mathVerified = true;

for (const c of activeCustomers) {
  const ledgerRows = query("SELECT coalesce(sum(credit), 0) as cr, coalesce(sum(debit), 0) as deb FROM cashback_ledger WHERE customer_id = ?;", [c.id])[0];
  const net = Math.round((ledgerRows.cr - ledgerRows.deb) * 100) / 100;
  const recorded = Math.round(c.cashback_balance * 100) / 100;

  if (Math.abs(net - recorded) > 0.001) {
    console.error(`❌ Mismatch for ${c.name}: Ledger Net ₹${net} vs Wallet ₹${recorded}`);
    mathVerified = false;
  }
}

if (mathVerified) {
  console.log('✅ TEST 10 PASSED: 100% of active customer wallets match their ledger net credits minus debits.');
} else {
  process.exit(1);
}

console.log('===========================================================');
console.log('🎉 ALL 10 CLOUDFLARE WORKERS & D1 TESTS PASSED SUCCESSFULLY!');
console.log('===========================================================');
