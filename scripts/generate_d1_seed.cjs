const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function escapeSql(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return val.toString();
  if (typeof val === 'boolean') return val ? '1' : '0';
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  return `'${val.toString().replace(/'/g, "''")}'`;
}

async function generateSeed() {
  const backupDir = path.join(__dirname, '..', 'backups', 'supabase_archive');
  const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json')).sort().reverse();
  if (files.length === 0) {
    throw new Error('No backup files found in backups/supabase_archive');
  }

  const latestBackupFile = path.join(backupDir, files[0]);
  console.log('📂 Reading latest backup file:', latestBackupFile);
  const data = JSON.parse(fs.readFileSync(latestBackupFile, 'utf8'));

  const sqlStatements = [];
  sqlStatements.push('-- ============================================================');
  sqlStatements.push(`-- Smart Cashback – D1 Data Seed Generated from ${path.basename(latestBackupFile)}`);
  sqlStatements.push(`-- Generated At: ${new Date().toISOString()}`);
  sqlStatements.push('-- ============================================================');
  sqlStatements.push('');
  sqlStatements.push('PRAGMA foreign_keys = OFF;');
  sqlStatements.push('BEGIN TRANSACTION;');
  sqlStatements.push('');

  // 1. Admin User
  const adminSalt = '6dc68d727c91a7c87408ec6480b57aac';
  const saltBuf = Buffer.from(adminSalt, 'hex');
  const adminHash = crypto.pbkdf2Sync('San@1818', saltBuf, 100000, 32, 'sha256').toString('hex');
  const adminId = 'a1000000-0000-0000-0000-000000000001';

  sqlStatements.push('-- 1. Administrator Account');
  sqlStatements.push(`INSERT OR REPLACE INTO admin_users (id, email, password_hash, salt, role, created_at, updated_at) VALUES (${escapeSql(adminId)}, 'sivar75@gmail.com', '${adminHash}', '${adminSalt}', 'admin', datetime('now'), datetime('now'));`);
  sqlStatements.push('');

  // 2. Shop Settings
  sqlStatements.push('-- 2. Shop Settings');
  for (const s of data.shop_settings) {
    sqlStatements.push(`INSERT OR REPLACE INTO shop_settings (id, shop_name, shop_address, contact_number, cashback_percentage, minimum_eligible_purchase, currency, date_format, time_format, merchant_upi_id, merchant_display_name, qr_payment_method, payment_expiry_seconds, display_timeout_seconds, updated_at) VALUES (${escapeSql(s.id)}, ${escapeSql(s.shop_name)}, ${escapeSql(s.shop_address || '')}, ${escapeSql(s.contact_number || '')}, ${s.cashback_percentage || 2.0}, ${s.minimum_eligible_purchase || 99.0}, ${escapeSql(s.currency || 'INR')}, ${escapeSql(s.date_format || 'DD/MM/YYYY')}, ${escapeSql(s.time_format || '12h')}, ${escapeSql(s.merchant_upi_id || '7708481818@upi')}, ${escapeSql(s.merchant_display_name || 'Smart Cashback')}, ${escapeSql(s.qr_payment_method || 'standard_upi')}, ${s.payment_expiry_seconds || 300}, ${s.display_timeout_seconds || 5}, ${escapeSql(s.updated_at)});`);
  }
  sqlStatements.push('');

  // 3. Service Categories
  sqlStatements.push('-- 3. Service Categories');
  for (const cat of data.service_categories) {
    sqlStatements.push(`INSERT OR REPLACE INTO service_categories (id, name, is_active, sort_order, created_at) VALUES (${escapeSql(cat.id)}, ${escapeSql(cat.name)}, ${cat.is_active ? 1 : 0}, ${cat.sort_order || 0}, ${escapeSql(cat.created_at)});`);
  }
  sqlStatements.push('');

  // 4. Customers
  sqlStatements.push('-- 4. Customers');
  for (const c of data.customers) {
    sqlStatements.push(`INSERT OR REPLACE INTO customers (id, name, mobile, total_purchases, cashback_earned, cashback_redeemed, cashback_balance, created_at, updated_at) VALUES (${escapeSql(c.id)}, ${escapeSql(c.name)}, ${escapeSql(c.mobile)}, ${c.total_purchases || 0}, ${c.cashback_earned || 0}, ${c.cashback_redeemed || 0}, ${c.cashback_balance || 0}, ${escapeSql(c.created_at)}, ${escapeSql(c.updated_at)});`);
  }
  sqlStatements.push('');

  // 5. Transactions
  sqlStatements.push('-- 5. Transactions');
  for (const tx of data.transactions) {
    sqlStatements.push(`INSERT OR REPLACE INTO transactions (id, customer_id, service_category, bill_amount, cashback_redeemed, amount_paid, cashback_earned, status, notes, payment_method, idempotency_key, created_at, updated_at) VALUES (${escapeSql(tx.id)}, ${escapeSql(tx.customer_id)}, ${escapeSql(tx.service_category)}, ${tx.bill_amount}, ${tx.cashback_redeemed || 0}, ${tx.amount_paid}, ${tx.cashback_earned || 0}, ${escapeSql(tx.status || 'completed')}, ${escapeSql(tx.notes)}, ${escapeSql(tx.payment_method || 'cash')}, ${escapeSql(tx.idempotency_key)}, ${escapeSql(tx.created_at)}, ${escapeSql(tx.updated_at)});`);
  }
  sqlStatements.push('');

  // 6. Cashback Ledger
  sqlStatements.push('-- 6. Cashback Ledger');
  for (const l of data.cashback_ledger) {
    sqlStatements.push(`INSERT OR REPLACE INTO cashback_ledger (id, customer_id, transaction_id, credit, debit, balance_after, description, created_at) VALUES (${escapeSql(l.id)}, ${escapeSql(l.customer_id)}, ${escapeSql(l.transaction_id)}, ${l.credit || 0}, ${l.debit || 0}, ${l.balance_after}, ${escapeSql(l.description)}, ${escapeSql(l.created_at)});`);
  }
  sqlStatements.push('');

  sqlStatements.push('COMMIT;');
  sqlStatements.push('PRAGMA foreign_keys = ON;');
  sqlStatements.push('');

  const outPath = path.join(__dirname, '..', 'd1', 'seed.sql');
  fs.writeFileSync(outPath, sqlStatements.join('\n'), 'utf8');

  console.log(`✅ D1 Seed file created at: ${outPath}`);
  console.log(`📊 Converted Record Counts:
  - Admin Users: 1
  - Shop Settings: ${data.shop_settings.length}
  - Service Categories: ${data.service_categories.length}
  - Customers: ${data.customers.length}
  - Transactions: ${data.transactions.length}
  - Cashback Ledger: ${data.cashback_ledger.length}`);
}

generateSeed().catch(err => {
  console.error('❌ Failed to generate D1 seed:', err);
  process.exit(1);
});

