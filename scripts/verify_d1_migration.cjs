const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function runVerification() {
  console.log('===========================================================');
  console.log('🔍 D1 DATABASE MIGRATION VERIFICATION & RECONCILIATION');
  console.log('===========================================================');

  const backupDir = path.join(__dirname, '..', 'backups', 'supabase_archive');
  const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json')).sort().reverse();
  const latestBackup = JSON.parse(fs.readFileSync(path.join(backupDir, files[0]), 'utf8'));

  const dbPath = '/tmp/smart_cashback_test.sqlite';

  // 1. Verify table counts
  const tables = ['customers', 'transactions', 'cashback_ledger', 'shop_settings', 'service_categories'];
  let countsMatch = true;

  for (const table of tables) {
    const rawCount = execSync(`sqlite3 ${dbPath} "SELECT count(*) FROM ${table};"`).toString().trim();
    const d1Count = parseInt(rawCount, 10);
    const sourceCount = latestBackup[table].length;

    if (d1Count === sourceCount) {
      console.log(`✅ ${table}: Source=${sourceCount} | D1=${d1Count} (MATCH)`);
    } else {
      console.error(`❌ ${table}: Source=${sourceCount} | D1=${d1Count} (MISMATCH!)`);
      countsMatch = false;
    }
  }

  // 2. Foreign Key Integrity Check
  const fkCheck = execSync(`sqlite3 ${dbPath} "PRAGMA foreign_key_check;"`).toString().trim();
  if (fkCheck.length === 0) {
    console.log('✅ Foreign Key Integrity: All foreign keys valid with zero orphaned rows.');
  } else {
    console.error('❌ Foreign Key Integrity Violations:', fkCheck);
    process.exit(1);
  }

  // 3. Customer Balance Reconciliation
  console.log('\n--- Customer Financial Reconciliation ---');
  let financialMatch = true;

  for (const srcCust of latestBackup.customers) {
    const rawD1 = execSync(
      `sqlite3 -json ${dbPath} "SELECT * FROM customers WHERE id = '${srcCust.id}';"`
    ).toString().trim();

    if (!rawD1 || rawD1 === '[]') {
      console.error(`❌ Customer missing in D1: ${srcCust.id} (${srcCust.name})`);
      financialMatch = false;
      continue;
    }

    const d1Cust = JSON.parse(rawD1)[0];

    const balanceDiff = Math.abs(Number(srcCust.cashback_balance) - Number(d1Cust.cashback_balance));
    const earnedDiff = Math.abs(Number(srcCust.cashback_earned) - Number(d1Cust.cashback_earned));
    const redeemedDiff = Math.abs(Number(srcCust.cashback_redeemed) - Number(d1Cust.cashback_redeemed));
    const purchasesDiff = Math.abs(Number(srcCust.total_purchases) - Number(d1Cust.total_purchases));

    if (balanceDiff < 0.001 && earnedDiff < 0.001 && redeemedDiff < 0.001 && purchasesDiff < 0.001) {
      console.log(`✅ Customer ${d1Cust.name} (${d1Cust.mobile}): Balance ₹${d1Cust.cashback_balance} matches exactly.`);
    } else {
      console.error(`❌ Balance discrepancy for ${srcCust.name}:`, { srcCust, d1Cust });
      financialMatch = false;
    }
  }

  // 4. Ledger Mathematical Consistency Check for Active Customers:
  // For each active customer: Wallet Balance must equal sum(credits) - sum(debits)
  console.log('\n--- Ledger Mathematical Consistency (Active Customers) ---');
  const activeCustomers = JSON.parse(
    execSync(`sqlite3 -json ${dbPath} "SELECT * FROM customers WHERE name NOT LIKE '[Deleted Customer]' AND mobile NOT LIKE 'DEL%';"`).toString()
  );

  for (const c of activeCustomers) {
    const ledgerAgg = JSON.parse(
      execSync(`sqlite3 -json ${dbPath} "SELECT COALESCE(SUM(credit), 0) as tot_cred, COALESCE(SUM(debit), 0) as tot_deb FROM cashback_ledger WHERE customer_id = '${c.id}';"`).toString()
    )[0];

    const computedBalance = Math.round((ledgerAgg.tot_cred - ledgerAgg.tot_deb) * 100) / 100;
    const recordedBalance = Math.round(c.cashback_balance * 100) / 100;

    if (Math.abs(computedBalance - recordedBalance) < 0.001) {
      console.log(`✅ Customer ${c.name}: Ledger Net (₹${computedBalance}) == Wallet Balance (₹${recordedBalance})`);
    } else {
      console.error(`❌ Ledger mismatch for ${c.name}: Ledger Net ₹${computedBalance} vs Wallet ₹${recordedBalance}`);
      financialMatch = false;
    }
  }

  console.log('===========================================================');
  if (countsMatch && financialMatch) {
    console.log('🎉 INDEPENDENT DATA VERIFICATION: 100% RECONCILED & AUDITED!');
  } else {
    console.error('⚠️ Verification failed.');
    process.exit(1);
  }
  console.log('===========================================================');
}

runVerification();
