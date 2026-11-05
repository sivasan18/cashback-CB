const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

async function backupSupabase() {
  console.log('📦 Starting Supabase data backup...');
  const envContent = fs.readFileSync('.env', 'utf8');
  const env = Object.fromEntries(
    envContent
      .split('\n')
      .filter(l => l.includes('='))
      .map(l => {
        const idx = l.indexOf('=');
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
      })
  );

  const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'sivar75@gmail.com',
    password: 'San@1818'
  });

  if (authErr) {
    console.error('❌ Supabase Auth Failed:', authErr.message);
    process.exit(1);
  }

  console.log('✅ Authenticated as:', auth.user.email);

  const [
    { data: customers, error: cErr },
    { data: transactions, error: tErr },
    { data: ledger, error: lErr },
    { data: settings, error: sErr },
    { data: categories, error: catErr }
  ] = await Promise.all([
    supabase.from('customers').select('*').order('created_at', { ascending: false }),
    supabase.from('transactions').select('*').order('created_at', { ascending: false }),
    supabase.from('cashback_ledger').select('*').order('created_at', { ascending: false }),
    supabase.from('shop_settings').select('*'),
    supabase.from('service_categories').select('*')
  ]);

  if (cErr || tErr || lErr || sErr || catErr) {
    console.error('❌ Error fetching table data:', { cErr, tErr, lErr, sErr, catErr });
    process.exit(1);
  }

  const backupData = {
    timestamp: new Date().toISOString(),
    supabaseUrl: env.VITE_SUPABASE_URL,
    counts: {
      customers: customers?.length || 0,
      transactions: transactions?.length || 0,
      cashback_ledger: ledger?.length || 0,
      shop_settings: settings?.length || 0,
      service_categories: categories?.length || 0,
    },
    customers: customers || [],
    transactions: transactions || [],
    cashback_ledger: ledger || [],
    shop_settings: settings || [],
    service_categories: categories || []
  };

  const backupDir = path.join(process.cwd(), 'supabase', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupFilePath = path.join(backupDir, `backup_${Date.now()}.json`);
  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf8');

  console.log('✅ Backup successfully created at:', backupFilePath);
  console.log(`📊 Statistics:
  - Customers: ${backupData.counts.customers}
  - Transactions: ${backupData.counts.transactions}
  - Ledger Entries: ${backupData.counts.cashback_ledger}
  - Shop Settings: ${backupData.counts.shop_settings}
  - Service Categories: ${backupData.counts.service_categories}
  `);
}

backupSupabase().catch(err => {
  console.error('❌ Backup execution failed:', err);
  process.exit(1);
});
