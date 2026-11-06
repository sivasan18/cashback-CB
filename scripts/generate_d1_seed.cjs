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

const SHOPS_DEF = [
  { id: 1,  name: 'Fruit Shop',                      slug: 'fruit-shop',                      login: 'shop01', pwd: 'shop@0101', icon: 'Apple',          cats: ['Fresh Fruits', 'Fruit Salad', 'Fresh Juices', 'Cut Fruits'] },
  { id: 2,  name: 'Biryani Shop',                    slug: 'biryani-shop',                    login: 'shop02', pwd: 'shop@0202', icon: 'UtensilsCrossed',cats: ['Chicken Biryani', 'Mutton Biryani', 'Egg/Veg Biryani', 'Starters', 'Combo'] },
  { id: 3,  name: 'Grill Shop',                      slug: 'grill-shop',                      login: 'shop03', pwd: 'shop@0303', icon: 'Flame',          cats: ['Grilled Chicken', 'Shawarma', 'BBQ', 'Tandoori', 'Kuboos/Sides'] },
  { id: 4,  name: 'Pizza Shop',                      slug: 'pizza-shop',                      login: 'shop04', pwd: 'shop@0404', icon: 'Pizza',          cats: ['Veg Pizza', 'Non-Veg Pizza', 'Garlic Bread', 'Pasta', 'Beverages'] },
  { id: 5,  name: 'Momos Shop',                      slug: 'momos-shop',                      login: 'shop05', pwd: 'shop@0505', icon: 'Soup',           cats: ['Steamed Momos', 'Fried Momos', 'Tandoori Momos', 'Rolls'] },
  { id: 6,  name: 'Panipuri Shop',                   slug: 'panipuri-shop',                   login: 'shop06', pwd: 'shop@0606', icon: 'Utensils',       cats: ['Panipuri', 'Bhelpuri', 'Dahi Puri', 'Masala Puri', 'Pav Bhaji', 'Chaat'] },
  { id: 7,  name: 'Ice Cream Shop',                  slug: 'ice-cream-shop',                  login: 'shop07', pwd: 'shop@0707', icon: 'IceCream',       cats: ['Scoops', 'Cones', 'Sundaes', 'Family Packs', 'Toppings'] },
  { id: 8,  name: 'Snacks Items Shop',               slug: 'snacks-items-shop',               login: 'shop08', pwd: 'shop@0808', icon: 'Cookie',         cats: ['Fried Snacks', 'Bajji/Bonda', 'Puffs', 'Sandwich', 'Fries'] },
  { id: 9,  name: 'Ice Creams & Falooda Shop',       slug: 'ice-creams-falooda-shop',         login: 'shop09', pwd: 'shop@0909', icon: 'GlassWater',     cats: ['Royal Falooda', 'Kulfi', 'Milkshakes', 'Thickshakes', 'Ice Cream Sodas'] },
  { id: 10, name: 'Chai, Tea, Samosas & Bakery Shop',slug: 'chai-tea-samosas-bakery-shop',    login: 'shop10', pwd: 'shop@1010', icon: 'Coffee',         cats: ['Masala Chai', 'Filter Coffee', 'Samosa', 'Puffs', 'Cakes & Biscuits'] },
  { id: 11, name: 'Game Items Shop',                 slug: 'game-items-shop',                 login: 'shop11', pwd: 'shop@1111', icon: 'Gamepad2',       cats: ['VR Games', 'Arcade Tokens', 'Kids Rides', 'Board/Indoor Games'] },
  { id: 12, name: 'Ice Bay',                         slug: 'ice-bay',                         login: 'shop12', pwd: 'shop@1212', icon: 'Snowflake',      cats: ['Popsicles', 'Ice Gola', 'Slushies', 'Cold Desserts', 'Sundaes'] },
  { id: 13, name: 'Idli & Dosa Shop',                slug: 'idli-dosa-shop',                  login: 'shop13', pwd: 'shop@1313', icon: 'Disc',           cats: ['Idli', 'Variety Dosa', 'Vada', 'Pongal', 'Mini Tiffin'] },
  { id: 14, name: 'Biryani Shop 2',                  slug: 'biryani-shop-2',                  login: 'shop14', pwd: 'shop@1414', icon: 'CookingPot',     cats: ['Seeraga Samba Biryani', 'Bucket Biryani', 'Kebab', 'Gravy', 'Breads'] },
  { id: 15, name: 'Miscellaneous Shop 1',            slug: 'miscellaneous-shop-1',            login: 'shop15', pwd: 'shop@1515', icon: 'Sparkles',       cats: ['General Item 1', 'General Item 2', 'Special Service'] },
  { id: 16, name: 'Miscellaneous Shop 2',            slug: 'miscellaneous-shop-2',            login: 'shop16', pwd: 'shop@1616', icon: 'ShoppingBag',    cats: ['General Item 1', 'General Item 2', 'Special Service'] },
  { id: 17, name: 'Miscellaneous Shop 3',            slug: 'miscellaneous-shop-3',            login: 'shop17', pwd: 'shop@1717', icon: 'Tag',            cats: ['General Item 1', 'General Item 2', 'Special Service'] },
  { id: 18, name: 'Xerox & Printing Shop',           slug: 'xerox-printing-shop',             login: 'shop18', pwd: 'shop@1818', icon: 'Printer',        cats: ['Xerox', 'B&W Printout', 'Color Printout', 'Lamination', 'Spiral Binding', 'Scanning', 'Project Report'] },
];

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
  sqlStatements.push(`-- Smart Cashback – D1 Data Seed (18 Shops Multi-Tenant Food Court)`);
  sqlStatements.push(`-- Generated At: ${new Date().toISOString()}`);
  sqlStatements.push('-- ============================================================');
  sqlStatements.push('');
  sqlStatements.push('PRAGMA foreign_keys = OFF;');
  sqlStatements.push('BEGIN TRANSACTION;');
  sqlStatements.push('');

  // 0. Shops
  sqlStatements.push('-- 0. 18 Food Court Shops');
  for (const s of SHOPS_DEF) {
    sqlStatements.push(`INSERT OR REPLACE INTO shops (id, name, slug, login_id, icon, is_active) VALUES (${s.id}, ${escapeSql(s.name)}, ${escapeSql(s.slug)}, ${escapeSql(s.login)}, ${escapeSql(s.icon)}, 1);`);
  }
  sqlStatements.push('');

  // 1. Admin Users
  const adminSalt = '6dc68d727c91a7c87408ec6480b57aac';
  const saltBuf = Buffer.from(adminSalt, 'hex');
  const ownerHash = crypto.pbkdf2Sync('San@1818', saltBuf, 100000, 32, 'sha256').toString('hex');

  sqlStatements.push('-- 1. Food Court Accounts');
  // Master Owner
  sqlStatements.push(`INSERT OR REPLACE INTO admin_users (id, shop_id, email, password_hash, salt, role, failed_attempts, is_locked, lock_reason, locked_at, created_at, updated_at) VALUES ('usr_owner_01', NULL, 'sivar75@gmail.com', '${ownerHash}', '${adminSalt}', 'super_admin', 0, 0, '', NULL, datetime('now'), datetime('now'));`);

  // 18 Shop accounts
  for (const s of SHOPS_DEF) {
    const pwdHash = crypto.pbkdf2Sync(s.pwd, saltBuf, 100000, 32, 'sha256').toString('hex');
    sqlStatements.push(`INSERT OR REPLACE INTO admin_users (id, shop_id, email, password_hash, salt, role, failed_attempts, is_locked, lock_reason, locked_at, created_at, updated_at) VALUES ('usr_shop_${s.login.slice(-2)}', ${s.id}, '${s.login}', '${pwdHash}', '${adminSalt}', 'admin', 0, 0, '', NULL, datetime('now'), datetime('now'));`);
  }
  sqlStatements.push('');

  // 2. Shop Settings for all 18 shops
  sqlStatements.push('-- 2. Shop Settings (Per-Shop Isolation)');
  for (const s of SHOPS_DEF) {
    if (s.id === 18 && data.shop_settings && data.shop_settings[0]) {
      const orig = data.shop_settings[0];
      sqlStatements.push(`INSERT OR REPLACE INTO shop_settings (id, shop_id, shop_name, shop_address, contact_number, cashback_percentage, minimum_eligible_purchase, currency, date_format, time_format, merchant_upi_id, merchant_display_name, qr_payment_method, payment_expiry_seconds, display_timeout_seconds, enable_customer_display, updated_at) VALUES (${escapeSql(orig.id)}, 18, ${escapeSql(orig.shop_name || s.name)}, ${escapeSql(orig.shop_address || '')}, ${escapeSql(orig.contact_number || '')}, ${orig.cashback_percentage || 2.0}, ${orig.minimum_eligible_purchase || 99.0}, ${escapeSql(orig.currency || 'INR')}, ${escapeSql(orig.date_format || 'DD/MM/YYYY')}, ${escapeSql(orig.time_format || '12h')}, ${escapeSql(orig.merchant_upi_id || '7708481818@upi')}, ${escapeSql(orig.merchant_display_name || s.name)}, ${escapeSql(orig.qr_payment_method || 'standard_upi')}, ${orig.payment_expiry_seconds || 300}, ${orig.display_timeout_seconds || 5}, 1, ${escapeSql(orig.updated_at || new Date().toISOString())});`);
    } else {
      const setId = `set_shop_${s.login.slice(-2)}`;
      sqlStatements.push(`INSERT OR REPLACE INTO shop_settings (id, shop_id, shop_name, shop_address, contact_number, cashback_percentage, minimum_eligible_purchase, currency, date_format, time_format, merchant_upi_id, merchant_display_name, qr_payment_method, payment_expiry_seconds, display_timeout_seconds, enable_customer_display, updated_at) VALUES ('${setId}', ${s.id}, ${escapeSql(s.name)}, '', '', 2.0, 99.0, 'INR', 'DD/MM/YYYY', '12h', '7708481818@upi', ${escapeSql(s.name)}, 'standard_upi', 300, 5, 1, datetime('now'));`);
    }
  }
  sqlStatements.push('');

  // 3. Service Categories
  sqlStatements.push('-- 3. Service Categories (Per-Shop Isolation)');
  for (const s of SHOPS_DEF) {
    if (s.id === 18 && data.service_categories && data.service_categories.length > 0) {
      for (const cat of data.service_categories) {
        sqlStatements.push(`INSERT OR REPLACE INTO service_categories (id, shop_id, name, is_active, sort_order, created_at) VALUES (${escapeSql(cat.id)}, 18, ${escapeSql(cat.name)}, ${cat.is_active ? 1 : 0}, ${cat.sort_order || 0}, ${escapeSql(cat.created_at || new Date().toISOString())});`);
      }
    } else {
      s.cats.forEach((catName, idx) => {
        const catId = `cat_s${s.login.slice(-2)}_${idx + 1}`;
        sqlStatements.push(`INSERT OR REPLACE INTO service_categories (id, shop_id, name, is_active, sort_order, created_at) VALUES ('${catId}', ${s.id}, ${escapeSql(catName)}, 1, ${idx + 1}, datetime('now'));`);
      });
    }
  }
  sqlStatements.push('');

  // 4. Customers (Shop 18 for existing archive data)
  sqlStatements.push('-- 4. Customers (Shop 18 Data)');
  for (const c of data.customers) {
    sqlStatements.push(`INSERT OR REPLACE INTO customers (id, shop_id, name, mobile, total_purchases, cashback_earned, cashback_redeemed, cashback_balance, added_by, created_at, updated_at) VALUES (${escapeSql(c.id)}, 18, ${escapeSql(c.name)}, ${escapeSql(c.mobile)}, ${c.total_purchases || 0}, ${c.cashback_earned || 0}, ${c.cashback_redeemed || 0}, ${c.cashback_balance || 0}, 'Shop', ${escapeSql(c.created_at)}, ${escapeSql(c.updated_at)});`);
  }
  sqlStatements.push('');

  // 4b. Sample Food Court Customers for Other Shops (Ensures Mode B & Cross-Shop Explorer are rich)
  const sampleTenantCustomers = [
    { id: 'cust_s01_01', shop_id: 1, name: 'Ramesh Kumar', mobile: '9711011111', total: 450, earned: 9.00, redeemed: 0, balance: 9.00, cat: 'Fresh Juices' },
    { id: 'cust_s02_01', shop_id: 2, name: 'Suresh Babu', mobile: '9711022222', total: 850, earned: 17.00, redeemed: 0, balance: 17.00, cat: 'Chicken Biryani' },
    { id: 'cust_s04_01', shop_id: 4, name: 'Anitha M', mobile: '9711044444', total: 620, earned: 12.40, redeemed: 0, balance: 12.40, cat: 'Veg Pizza' },
    { id: 'cust_s06_01', shop_id: 6, name: 'Karthik Raja', mobile: '9711066666', total: 240, earned: 4.80, redeemed: 0, balance: 4.80, cat: 'Panipuri' },
    { id: 'cust_s10_01', shop_id: 10, name: 'Priya S', mobile: '9711100000', total: 180, earned: 3.60, redeemed: 0, balance: 3.60, cat: 'Masala Chai' },
    // Cross-shop customer visiting both Fruit Shop (1) and Biryani Shop (2)
    { id: 'cust_cross_01', shop_id: 1, name: 'Karthik S', mobile: '9711888888', total: 200, earned: 4.00, redeemed: 0, balance: 4.00, cat: 'Fresh Fruits' },
    { id: 'cust_cross_02', shop_id: 2, name: 'Karthik S', mobile: '9711888888', total: 500, earned: 10.00, redeemed: 0, balance: 10.00, cat: 'Egg/Veg Biryani' },
  ];

  sqlStatements.push('-- 4b. Food Court Tenant Customers (Shops 1..17)');
  for (const c of sampleTenantCustomers) {
    sqlStatements.push(`INSERT OR REPLACE INTO customers (id, shop_id, name, mobile, total_purchases, cashback_earned, cashback_redeemed, cashback_balance, added_by, created_at, updated_at) VALUES ('${c.id}', ${c.shop_id}, ${escapeSql(c.name)}, '${c.mobile}', ${c.total}, ${c.earned}, ${c.redeemed}, ${c.balance}, 'Shop', datetime('now', '-2 days'), datetime('now', '-1 hours'));`);
  }
  sqlStatements.push('');

  // 5. Transactions (Shop 18 Data)
  sqlStatements.push('-- 5. Transactions (Shop 18 Data)');
  for (const tx of data.transactions) {
    sqlStatements.push(`INSERT OR REPLACE INTO transactions (id, shop_id, customer_id, service_category, bill_amount, cashback_redeemed, amount_paid, cashback_earned, status, notes, payment_method, idempotency_key, created_at, updated_at) VALUES (${escapeSql(tx.id)}, 18, ${escapeSql(tx.customer_id)}, ${escapeSql(tx.service_category)}, ${tx.bill_amount}, ${tx.cashback_redeemed || 0}, ${tx.amount_paid}, ${tx.cashback_earned || 0}, ${escapeSql(tx.status || 'completed')}, ${escapeSql(tx.notes)}, ${escapeSql(tx.payment_method || 'cash')}, ${escapeSql(tx.idempotency_key)}, ${escapeSql(tx.created_at)}, ${escapeSql(tx.updated_at)});`);
  }
  sqlStatements.push('');

  sqlStatements.push('-- 5b. Food Court Tenant Transactions (Shops 1..17)');
  for (const c of sampleTenantCustomers) {
    const txId = `tx_${c.id}`;
    sqlStatements.push(`INSERT OR REPLACE INTO transactions (id, shop_id, customer_id, service_category, bill_amount, cashback_redeemed, amount_paid, cashback_earned, status, notes, payment_method, created_at, updated_at) VALUES ('${txId}', ${c.shop_id}, '${c.id}', ${escapeSql(c.cat)}, ${c.total}, 0, ${c.total}, ${c.earned}, 'completed', 'Food Court Order', 'cash', datetime('now', '-2 days'), datetime('now', '-1 hours'));`);
  }
  sqlStatements.push('');

  // 6. Cashback Ledger (Shop 18 Data)
  sqlStatements.push('-- 6. Cashback Ledger (Shop 18 Data)');
  for (const l of data.cashback_ledger) {
    sqlStatements.push(`INSERT OR REPLACE INTO cashback_ledger (id, shop_id, customer_id, transaction_id, credit, debit, balance_after, description, created_at) VALUES (${escapeSql(l.id)}, 18, ${escapeSql(l.customer_id)}, ${escapeSql(l.transaction_id)}, ${l.credit || 0}, ${l.debit || 0}, ${l.balance_after}, ${escapeSql(l.description)}, ${escapeSql(l.created_at)});`);
  }
  sqlStatements.push('');

  sqlStatements.push('-- 6b. Food Court Tenant Cashback Ledger (Shops 1..17)');
  for (const c of sampleTenantCustomers) {
    const txId = `tx_${c.id}`;
    const ledId = `led_${c.id}`;
    sqlStatements.push(`INSERT OR REPLACE INTO cashback_ledger (id, shop_id, customer_id, transaction_id, credit, debit, balance_after, description, created_at) VALUES ('${ledId}', ${c.shop_id}, '${c.id}', '${txId}', ${c.earned}, 0, ${c.balance}, 'Cashback earned from Food Court Order', datetime('now', '-2 days'));`);
  }
  sqlStatements.push('');

  sqlStatements.push('COMMIT;');
  sqlStatements.push('PRAGMA foreign_keys = ON;');
  sqlStatements.push('');

  const outPath = path.join(__dirname, '..', 'd1', 'seed.sql');
  fs.writeFileSync(outPath, sqlStatements.join('\n'), 'utf8');

  console.log(`✅ Multi-tenant D1 Seed file created at: ${outPath}`);
  console.log(`📊 Record Counts:
  - Shops: 18
  - Admin/Shop Accounts: 19 (1 Owner + 18 Shops)
  - Shop Settings: 18
  - Service Categories: ${18 * 4 + data.service_categories.length}
  - Shop 18 Customers: ${data.customers.length}
  - Shop 18 Transactions: ${data.transactions.length}
  - Shop 18 Cashback Ledger: ${data.cashback_ledger.length}`);
}

generateSeed().catch(err => {
  console.error('❌ Failed to generate D1 seed:', err);
  process.exit(1);
});
