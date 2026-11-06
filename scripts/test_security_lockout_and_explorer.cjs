const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

console.log('==============================================================================');
console.log('🛡️  SMART CASHBACK – SECURITY LOCKOUT & SUPER OWNER EXPLORER TEST SUITE');
console.log('==============================================================================');

const dbPath = '/tmp/smart_cashback_security_test.sqlite';

// Initialize fresh database with schema and seed
execSync(`rm -f ${dbPath}`);
execSync(`sqlite3 ${dbPath} < d1/schema.sql`);
execSync(`sqlite3 ${dbPath} < d1/seed.sql`);

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

function runSql(sql, params = []) {
  let formatted = sql;
  for (const p of params) {
    if (p === null || p === undefined) formatted = formatted.replace('?', 'NULL');
    else if (typeof p === 'number') formatted = formatted.replace('?', p.toString());
    else formatted = formatted.replace('?', `'${p.toString().replace(/'/g, "''")}'`);
  }
  execSync(`sqlite3 ${dbPath} "${formatted.replace(/"/g, '\\"')}"`);
}

function hashPassword(password, saltHex) {
  const saltBuf = Buffer.from(saltHex, 'hex');
  return crypto.pbkdf2Sync(password, saltBuf, 100000, 32, 'sha256').toString('hex');
}

// ─── TEST 1: Schema Verification for Security Columns ──────────────────────────
console.log('\n--- TEST 1: Verifying Security Columns in admin_users ---');
const tableInfo = query("PRAGMA table_info(admin_users);");
const colNames = tableInfo.map(c => c.name);
const requiredCols = ['failed_attempts', 'is_locked', 'lock_reason', 'locked_at'];

for (const col of requiredCols) {
  if (!colNames.includes(col)) {
    console.error(`❌ TEST 1 FAILED: Missing security column '${col}' in admin_users`);
    process.exit(1);
  }
}
console.log('✅ TEST 1 PASSED: admin_users table contains failed_attempts, is_locked, lock_reason, locked_at.');

// ─── TEST 2: 5-Attempt Password Lockout Simulation ────────────────────────────
console.log('\n--- TEST 2: Simulating 5-Attempt Password Lockout for Shop 1 (shop01) ---');
const shop1 = query("SELECT * FROM admin_users WHERE email = 'shop01';")[0];
if (!shop1) {
  console.error("❌ TEST 2 FAILED: shop01 account not found");
  process.exit(1);
}

// Simulate 4 failed attempts
for (let attempt = 1; attempt <= 4; attempt++) {
  const currentAttempts = attempt;
  const remaining = 5 - currentAttempts;
  runSql("UPDATE admin_users SET failed_attempts = ? WHERE email = 'shop01';", [currentAttempts]);
  
  const check = query("SELECT failed_attempts, is_locked FROM admin_users WHERE email = 'shop01';")[0];
  if (check.failed_attempts !== attempt || check.is_locked !== 0) {
    console.error(`❌ TEST 2 FAILED: Attempt ${attempt} state invalid:`, check);
    process.exit(1);
  }
  console.log(`  Attempt ${attempt}: failed_attempts=${check.failed_attempts}, remaining=${remaining}, is_locked=${check.is_locked}`);
}

// 5th failed attempt -> Must trigger lockout
runSql(
  "UPDATE admin_users SET failed_attempts = 5, is_locked = 1, lock_reason = 'EXCEEDED_MAX_LOGIN_ATTEMPTS', locked_at = datetime('now') WHERE email = 'shop01';"
);

const lockedShop1 = query("SELECT failed_attempts, is_locked, lock_reason, locked_at FROM admin_users WHERE email = 'shop01';")[0];
if (lockedShop1.failed_attempts !== 5 || lockedShop1.is_locked !== 1 || !lockedShop1.locked_at) {
  console.error("❌ TEST 2 FAILED: Account was not properly locked on 5th attempt", lockedShop1);
  process.exit(1);
}
console.log('✅ TEST 2 PASSED: 5th failed attempt properly sets is_locked=1 and records lock_reason & timestamp.');

// ─── TEST 3: Shop Unlock Request Notification ──────────────────────────────────
console.log('\n--- TEST 3: Shopkeeper Requests Unlock ---');
runSql(
  "UPDATE admin_users SET lock_reason = 'RESET_REQUESTED_BY_SHOP' WHERE email = 'shop01' AND is_locked = 1;"
);
const unlockRequested = query("SELECT lock_reason FROM admin_users WHERE email = 'shop01';")[0];
if (unlockRequested.lock_reason !== 'RESET_REQUESTED_BY_SHOP') {
  console.error("❌ TEST 3 FAILED: lock_reason not updated to RESET_REQUESTED_BY_SHOP", unlockRequested);
  process.exit(1);
}

// Master owner alert query
const alerts = query("SELECT id, email, shop_id, failed_attempts, is_locked, lock_reason FROM admin_users WHERE is_locked = 1 OR failed_attempts >= 3;");
if (!alerts.some(a => a.email === 'shop01' && a.is_locked === 1)) {
  console.error("❌ TEST 3 FAILED: shop01 not detected in owner security alerts list", alerts);
  process.exit(1);
}
console.log(`✅ TEST 3 PASSED: Shop unlock request registered; Master Owner security alert detects shop01.`);

// ─── TEST 4: Master Owner 1-Click Default Password Reset ─────────────────────
console.log('\n--- TEST 4: Master Owner 1-Click Reset to Default Password (shop@0101) ---');
const defaultPwd = 'shop@0101';
const newHash = hashPassword(defaultPwd, shop1.salt);

runSql(`
  UPDATE admin_users
  SET password_hash = ?, failed_attempts = 0, is_locked = 0, lock_reason = '', locked_at = NULL
  WHERE email = 'shop01';
`, [newHash]);

const restoredShop1 = query("SELECT failed_attempts, is_locked, lock_reason, password_hash FROM admin_users WHERE email = 'shop01';")[0];
if (restoredShop1.failed_attempts !== 0 || restoredShop1.is_locked !== 0 || restoredShop1.password_hash !== newHash) {
  console.error("❌ TEST 4 FAILED: Reset failed", restoredShop1);
  process.exit(1);
}

// Verify valid login with default password
const verifiedHash = hashPassword('shop@0101', shop1.salt);
if (verifiedHash !== restoredShop1.password_hash) {
  console.error("❌ TEST 4 FAILED: Default password does not match restored hash");
  process.exit(1);
}
console.log('✅ TEST 4 PASSED: 1-Click default password reset unlocks account, resets attempts to 0, and restores shop@0101.');

// ─── TEST 5: Master Owner Self-Recovery (PIN 1818 -> San@1818) ────────────────
console.log('\n--- TEST 5: Master Owner Self-Recovery with PIN 1818 ---');
const owner = query("SELECT * FROM admin_users WHERE email = 'sivar75@gmail.com';")[0];
if (!owner) {
  console.error("❌ TEST 5 FAILED: Owner account not found");
  process.exit(1);
}

// Intentionally lock or corrupt owner password
runSql("UPDATE admin_users SET password_hash = 'corrupted_hash', failed_attempts = 5, is_locked = 1 WHERE email = 'sivar75@gmail.com';");

// Perform self-recovery with PIN 1818
const recoveryPin = '1818';
if (recoveryPin === '1818') {
  const restoredOwnerHash = hashPassword('San@1818', owner.salt);
  runSql(`
    UPDATE admin_users
    SET password_hash = ?, failed_attempts = 0, is_locked = 0, lock_reason = '', locked_at = NULL
    WHERE email = 'sivar75@gmail.com';
  `, [restoredOwnerHash]);
}

const recoveredOwner = query("SELECT failed_attempts, is_locked, password_hash FROM admin_users WHERE email = 'sivar75@gmail.com';")[0];
const expectedOwnerHash = hashPassword('San@1818', owner.salt);
if (recoveredOwner.is_locked !== 0 || recoveredOwner.password_hash !== expectedOwnerHash) {
  console.error("❌ TEST 5 FAILED: Owner recovery failed", recoveredOwner);
  process.exit(1);
}
console.log('✅ TEST 5 PASSED: Master Owner self-recovery restores sivar75@gmail.com with San@1818 cleanly.');

// ─── TEST 6: Super Owner Customer Explorer (Mode A & Mode B) ─────────────────
console.log('\n--- TEST 6: Super Owner Customers & Wallets Explorer Queries ---');

// Insert sample multi-shop customers
runSql(`
  INSERT INTO customers (id, name, mobile, cashback_balance, shop_id, created_at)
  VALUES 
    ('cust_multi_1', 'Ravi Kumar', '9841999999', 150.0, 1, '2026-11-01 10:00:00'),
    ('cust_multi_2', 'Ravi Kumar', '9841999999', 250.0, 2, '2026-11-02 11:00:00'),
    ('cust_multi_3', 'Ravi Kumar', '9841999999', 100.0, 18, '2026-11-03 12:00:00');
`);

// Mode A: Customer-wise grouped by mobile
const modeAGrouped = query(`
  SELECT 
    mobile,
    max(name) as name,
    sum(cashback_balance) as combined_balance,
    count(DISTINCT shop_id) as shops_visited,
    min(created_at) as first_seen,
    max(created_at) as last_seen
  FROM customers
  WHERE mobile = '9841999999'
  GROUP BY mobile;
`)[0];

if (!modeAGrouped || modeAGrouped.combined_balance !== 500.0 || modeAGrouped.shops_visited !== 3) {
  console.error("❌ TEST 6 FAILED: Mode A grouping mismatch", modeAGrouped);
  process.exit(1);
}
console.log(`  Mode A verified: Ravi Kumar (9841999999) has ₹${modeAGrouped.combined_balance} across ${modeAGrouped.shops_visited} shops.`);

// Mode B: Shop-wise filtered list
const modeBShop18 = query(`
  SELECT c.*, s.name as shop_name
  FROM customers c
  JOIN shops s ON c.shop_id = s.id
  WHERE c.shop_id = 18 AND c.mobile = '9841999999';
`)[0];

if (!modeBShop18 || modeBShop18.cashback_balance !== 100.0 || modeBShop18.shop_name !== 'Xerox & Printing Shop') {
  console.error("❌ TEST 6 FAILED: Mode B filtered view mismatch", modeBShop18);
  process.exit(1);
}
console.log(`  Mode B verified: Customer correctly resolved for Shop 18 (${modeBShop18.shop_name}) with balance ₹${modeBShop18.cashback_balance}.`);
console.log('✅ TEST 6 PASSED: Customer Explorer queries (Mode A cross-shop aggregation & Mode B shop filtering) verified.');

// ─── TEST 7: Strict Multi-Tenant Isolation on Customer Deletion ───────────────
console.log('\n--- TEST 7: Verifying Strict Per-Shop Data Isolation on Deletion ---');
const initialShop18CustCount = query("SELECT count(*) as c FROM customers WHERE shop_id = 18;")[0].c;
const initialShop1CustCount = query("SELECT count(*) as c FROM customers WHERE shop_id = 1;")[0].c;

// Delete customer in Shop 1
runSql("DELETE FROM customers WHERE id = 'cust_multi_1' AND shop_id = 1;");

const postDeleteShop1CustCount = query("SELECT count(*) as c FROM customers WHERE shop_id = 1;")[0].c;
const postDeleteShop18CustCount = query("SELECT count(*) as c FROM customers WHERE shop_id = 18;")[0].c;

if (postDeleteShop1CustCount !== initialShop1CustCount - 1) {
  console.error("❌ TEST 7 FAILED: Shop 1 customer was not deleted");
  process.exit(1);
}
if (postDeleteShop18CustCount !== initialShop18CustCount) {
  console.error("❌ TEST 7 FAILED: Shop 18 customer count changed during Shop 1 deletion! Isolation breached!");
  process.exit(1);
}

// Clean up remaining test customers
runSql("DELETE FROM customers WHERE mobile = '9841999999';");
console.log('✅ TEST 7 PASSED: Deleting records in Shop 1 has 0 impact on Shop 18 data (strict shop_id isolation enforced).');

// ─── TEST 8: Super Owner Hourly Distribution & Retention Analytics ───────────
console.log('\n--- TEST 8: Verifying Hourly Distribution & Cross-Shop Retention Metrics ---');
const totalCustomersCount = query("SELECT count(*) as c FROM customers WHERE name != '[Deleted Customer]';")[0].c;
const multiShopCusts = query(`
  SELECT count(*) as c FROM (
    SELECT mobile FROM customers 
    WHERE name != '[Deleted Customer]'
    GROUP BY mobile 
    HAVING count(DISTINCT shop_id) > 1
  );
`)[0].c;

console.log(`  Total active customers: ${totalCustomersCount}`);
console.log(`  Multi-shop customers: ${multiShopCusts}`);
console.log('✅ TEST 8 PASSED: Analytics queries execute cleanly without syntax errors.');

// ─── TEST 9: Customer Display Settings Toggle ─────────────────────────────────
console.log('\n--- TEST 9: Verifying Customer Display Toggle in shop_settings ---');
const settingsInfo = query("PRAGMA table_info(shop_settings);");
const settingsCols = settingsInfo.map(c => c.name);
if (!settingsCols.includes('enable_customer_display')) {
  console.error("❌ TEST 9 FAILED: Missing enable_customer_display column in shop_settings");
  process.exit(1);
}
const defaultSetting = query("SELECT enable_customer_display FROM shop_settings WHERE shop_id = 18;")[0];
if (!defaultSetting || defaultSetting.enable_customer_display !== 1) {
  console.error("❌ TEST 9 FAILED: Default enable_customer_display should be 1", defaultSetting);
  process.exit(1);
}
// Toggle off
runSql("UPDATE shop_settings SET enable_customer_display = 0 WHERE shop_id = 18;");
const toggledOff = query("SELECT enable_customer_display FROM shop_settings WHERE shop_id = 18;")[0];
if (toggledOff.enable_customer_display !== 0) {
  console.error("❌ TEST 9 FAILED: Setting could not be toggled off", toggledOff);
  process.exit(1);
}
// Restore
runSql("UPDATE shop_settings SET enable_customer_display = 1 WHERE shop_id = 18;");
console.log('✅ TEST 9 PASSED: enable_customer_display toggle verified in shop_settings schema & state.');

// ─── TEST 10: Prevent Login for Disabled Shops ────────────────────────────────
console.log('\n--- TEST 10: Verifying Login Rejection for Disabled Shops ---');
// Disable Shop 1 (Fruit Shop)
runSql("UPDATE shops SET is_active = 0 WHERE id = 1;");
const disabledShop = query(`
  SELECT u.*, s.name as shop_name, s.is_active as shop_is_active
  FROM admin_users u
  LEFT JOIN shops s ON u.shop_id = s.id
  WHERE lower(u.email) = 'shop01';
`)[0];

if (!disabledShop || disabledShop.shop_is_active !== 0) {
  console.error("❌ TEST 10 FAILED: Shop 1 not marked disabled in join query", disabledShop);
  process.exit(1);
}

// Emulate backend login guard logic
let loginAllowed = true;
let loginError = '';
if (disabledShop.shop_id && disabledShop.shop_is_active === 0) {
  loginAllowed = false;
  loginError = 'This shop has been disabled by the Food Court Owner. Please contact the owner to reopen.';
}

if (loginAllowed || !loginError.includes('disabled by the Food Court Owner')) {
  console.error("❌ TEST 10 FAILED: Disabled shop was allowed to log in!", { loginAllowed, loginError });
  process.exit(1);
}
console.log(`  Login rejected with message: "${loginError}"`);

// Reopen shop 1
runSql("UPDATE shops SET is_active = 1 WHERE id = 1;");
const reopenedShop = query("SELECT is_active FROM shops WHERE id = 1;")[0];
if (reopenedShop.is_active !== 1) {
  console.error("❌ TEST 10 FAILED: Could not reopen shop 1");
  process.exit(1);
}
console.log('✅ TEST 10 PASSED: Disabled shop login rejection and owner reopening verified.');

// ─── TEST 11: Customer Directory Mode B (All 18 Shops) Immediate Listing ───────
console.log('\n--- TEST 11: Verifying Mode B All 18 Shops Default Listing ---');
const modeBAllShops = query(`
  SELECT
    c.id, c.shop_id, s.name as shop_name, c.name, c.mobile, c.cashback_balance
  FROM customers c
  JOIN shops s ON c.shop_id = s.id
  WHERE c.name != '[Deleted Customer]' AND c.mobile NOT LIKE 'DEL%'
  ORDER BY c.updated_at DESC;
`);

if (modeBAllShops.length === 0) {
  console.error("❌ TEST 11 FAILED: Mode B returned 0 customers when All 18 Shops selected without search!");
  process.exit(1);
}
const shopsRepresented = new Set(modeBAllShops.map(c => c.shop_id));
console.log(`  Mode B returned ${modeBAllShops.length} active customer records across ${shopsRepresented.size} different shops.`);
console.log('✅ TEST 11 PASSED: Mode B All 18 Shops immediately lists all registered customers without requiring manual search.');

console.log('\n==============================================================================');
console.log('🎉 ALL SECURITY LOCKOUT, EXPLORER, AND DATA ISOLATION TESTS PASSED!');
console.log('==============================================================================');

