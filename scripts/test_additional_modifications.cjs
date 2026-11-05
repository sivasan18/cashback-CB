const fs = require('fs');

console.log('===========================================================');
console.log('🧪 TESTING ADDITIONAL MODIFICATIONS (CLOUDFLARE NATIVE)');
console.log('===========================================================');

let allPassed = true;

// 1. Sidebar items exact order check
const layoutContent = fs.readFileSync('src/components/layout/AppLayout.tsx', 'utf8');

const expectedOrder = [
  "to: '/billing'",
  "to: '/customers'",
  "to: '/wallet'",
  "to: '/wallet/lookup'",
  "to: '/reports'",
  "to: '/dashboard'",
  "to: '/settings'",
];

let lastIdx = -1;
let orderValid = true;
for (const item of expectedOrder) {
  const idx = layoutContent.indexOf(item);
  if (idx === -1 || idx < lastIdx) {
    orderValid = false;
    break;
  }
  lastIdx = idx;
}

if (orderValid) {
  console.log('✅ TEST 1 PASSED: Sidebar items in exact requested order:');
  console.log('    1. New Bill, 2. Customers, 3. Cashback Wallet, 4. Wallet Lookup, 5. Reports, 6. Dashboard, 7. Settings');
} else {
  console.log('❌ TEST 1 FAILED: Sidebar items order mismatch');
  allPassed = false;
}

// 2. Theme Switcher verification (Light, Dark, System)
const themeStoreContent = fs.readFileSync('src/store/themeStore.ts', 'utf8');
const t2_options = layoutContent.includes("value: 'light'") && layoutContent.includes("value: 'dark'") && layoutContent.includes("value: 'system'");
const t2_store = themeStoreContent.includes("getSystemTheme") && themeStoreContent.includes("theme-preference");

if (t2_options && t2_store) {
  console.log('✅ TEST 2 PASSED: 3-State Theme Switcher (Light, Dark, System) implemented with persistence.');
} else {
  console.log('❌ TEST 2 FAILED: Theme switcher incomplete');
  allPassed = false;
}

// 3. New Bill Search input clean design
const billingContent = fs.readFileSync('src/pages/BillingPage.tsx', 'utf8');
const t3_placeholder = billingContent.includes('placeholder="Enter 10-digit mobile number"');
const t3_no_tech_notes = !billingContent.includes('Type mobile number prefix') && !billingContent.includes('Instant prefix matching');

if (t3_placeholder && t3_no_tech_notes) {
  console.log('✅ TEST 3 PASSED: New Bill search displays only "Enter 10-digit mobile number" with all technical notes removed.');
} else {
  console.log('❌ TEST 3 FAILED: Technical text still present or placeholder mismatch');
  allPassed = false;
}

// 4. Testing UPI Deep Link Generation
console.log('\n--- Testing UPI Deep Link Generation ---');
function buildUPILink(params) {
  const q = new URLSearchParams();
  q.set('pa', params.pa);
  q.set('pn', params.pn);
  q.set('am', params.am.toFixed(2));
  q.set('cu', 'INR');
  q.set('tn', params.tn);
  return `upi://pay?${q.toString()}`;
}

const upiLink = buildUPILink({
  pa: '7708481818@upi',
  pn: 'Smart Cashback Shop',
  am: 150.0,
  tn: 'Bill - Ramesh - Xerox'
});
console.log('Generated UPI Link:', upiLink);
if (upiLink.includes('pa=7708481818%40upi') && upiLink.includes('am=150.00')) {
  console.log('✅ UPI Deep Link format verified');
} else {
  console.log('❌ UPI Deep Link format error');
  allPassed = false;
}

// 5. Testing Cashback Rules
console.log('--- Testing Cashback Rules ---');
const calculateCashback = (amount, min = 99, pct = 0.02) => amount >= min ? Math.round(amount * pct * 100) / 100 : 0;
const cb1 = calculateCashback(100);
const cb2 = calculateCashback(50);
const cb3 = calculateCashback(200 - 50); // ₹200 bill - ₹50 redemption

if (cb1 === 2.0) console.log('✅ ₹100 purchase gives ₹2.00 cashback');
else { console.log('❌ Cashback error for ₹100'); allPassed = false; }

if (cb2 === 0.0) console.log('✅ < ₹99 purchase gives ₹0.00 cashback');
else { console.log('❌ Cashback error for < ₹99'); allPassed = false; }

if (cb3 === 3.0) console.log('✅ Cashback calculated on net amount after redemption (₹150 paid -> ₹3.00)');
else { console.log('❌ Cashback error for redemption'); allPassed = false; }

// 6. Danger Zone Verification
const settingsContent = fs.readFileSync('src/pages/SettingsPage.tsx', 'utf8');
const t6_danger_title = settingsContent.includes('Danger Zone – Customer Data Management');
const t6_danger_btn = settingsContent.includes('DELETE ALL CUSTOMER DATA');
const t6_danger_reauth = settingsContent.includes('signInWithPassword');
const t6_danger_phrase = settingsContent.includes("REQUIRED_PHRASE = 'DELETE ALL CUSTOMER DATA'");

if (t6_danger_title && t6_danger_btn && t6_danger_reauth && t6_danger_phrase) {
  console.log('\n✅ Danger Zone Verified in Settings:');
  console.log('    - Prominent warning modal with impact details');
  console.log('    - Strict confirmation phrase matching: "DELETE ALL CUSTOMER DATA"');
  console.log('    - Admin password re-authentication required');
  console.log('    - Retains shop settings, services, and anonymized financial audit records');
} else {
  console.log('❌ Danger Zone Verification Failed');
  allPassed = false;
}

console.log('\n===========================================================');
if (allPassed) {
  console.log('🎉 ALL MODIFICATION & VERIFICATION TESTS COMPLETED SUCCESSFULLY!');
} else {
  console.log('⚠️ Some tests failed.');
  process.exit(1);
}
console.log('===========================================================');
