const assert = require('assert');

// Polyfill window & localStorage for Node testing
const storage = {};
global.window = {
  dispatchEvent: (event) => {
    if (global.__storageHandler && event.type === 'storage') {
      global.__storageHandler(event);
    }
  }
};

global.localStorage = {
  getItem: (key) => storage[key] || null,
  setItem: (key, val) => { storage[key] = val; },
  removeItem: (key) => { delete storage[key]; },
  clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
};

// Polyfill StorageEvent
global.StorageEvent = class StorageEvent {
  constructor(type, init) {
    this.type = type;
    this.key = init.key;
    this.newValue = init.newValue;
  }
};

// Mock BroadcastChannel
class MockBroadcastChannel {
  constructor(name) {
    this.name = name;
    this.listeners = [];
    MockBroadcastChannel.instances.push(this);
  }
  addEventListener(event, listener) {
    if (event === 'message') this.listeners.push(listener);
  }
  removeEventListener(event, listener) {
    this.listeners = this.listeners.filter(l => l !== listener);
  }
  postMessage(data) {
    MockBroadcastChannel.instances.forEach(inst => {
      if (inst !== this) {
        inst.listeners.forEach(l => l({ data }));
      }
    });
  }
}
MockBroadcastChannel.instances = [];
global.BroadcastChannel = MockBroadcastChannel;

console.log('==============================================================================');
console.log('🧪 TESTING CUSTOMER DISPLAY RESET ON BACK / CANCEL (TESTS 1 - 7)');
console.log('==============================================================================\n');

// Import store
const { useDisplayStore, EMPTY_SESSION } = require('../src/store/displayStore.ts');

async function runTests() {
  const store = useDisplayStore.getState();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: Enter customer details and generate a UPI QR code. Click Back.
  // Expected: Customer display immediately returns to Welcome.
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 1: Enter customer details and generate UPI QR, then click Back ---');
  const sess1 = store.startNewSession();
  store.broadcast({
    sessionId: sess1,
    mode: 'waiting-payment',
    customerName: 'Geetha',
    customerMobile: '9994312345',
    billAmount: 500,
    amountPayable: 490,
    paymentMethod: 'upi',
    paymentStatus: 'awaiting_payment',
    upiLink: 'upi://pay?pa=7708481818@upi&am=490.00'
  });

  let current = useDisplayStore.getState().session;
  assert.strictEqual(current.customerName, 'Geetha');
  assert.strictEqual(current.mode, 'waiting-payment');
  assert.ok(current.upiLink !== null);

  // Administrator clicks BACK
  store.resetDisplay(sess1, 'back');

  current = useDisplayStore.getState().session;
  assert.strictEqual(current.mode, 'welcome', 'Mode should be welcome');
  assert.strictEqual(current.customerName, '', 'Customer name should be cleared');
  assert.strictEqual(current.upiLink, null, 'UPI QR link should be cleared');
  assert.strictEqual(current.billAmount, 0, 'Bill amount should be 0');
  console.log('✅ TEST 1 PASSED: Customer display immediately returned to Welcome upon clicking Back.\n');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: Generate a QR code but do not pay. Click Cancel.
  // Expected: QR code and previous customer information disappear.
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 2: Generate QR code but do not pay. Click Cancel ---');
  const sess2 = store.startNewSession();
  store.broadcast({
    sessionId: sess2,
    mode: 'waiting-payment',
    customerName: 'Kumar',
    customerMobile: '9884012345',
    billAmount: 300,
    amountPayable: 300,
    paymentMethod: 'upi',
    paymentStatus: 'awaiting_payment',
    upiLink: 'upi://pay?pa=7708481818@upi&am=300.00'
  });

  current = useDisplayStore.getState().session;
  assert.strictEqual(current.customerName, 'Kumar');
  assert.ok(current.upiLink);

  // Administrator clicks CANCEL
  store.cancelPayment(sess2);

  current = useDisplayStore.getState().session;
  assert.strictEqual(current.mode, 'welcome');
  assert.strictEqual(current.customerName, '');
  assert.strictEqual(current.upiLink, null);
  assert.strictEqual(current.amountPayable, 0);
  console.log('✅ TEST 2 PASSED: QR code and customer info disappeared, display reset to Welcome.\n');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: Enter incorrect customer information and click Reset Form.
  // Expected: Customer display returns to Welcome.
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 3: Enter incorrect customer information and click Reset Form ---');
  const sess3 = store.startNewSession();
  store.broadcast({
    sessionId: sess3,
    mode: 'customer-selected',
    customerName: 'Wrong Name',
    customerMobile: '9111111111',
    billAmount: 100,
  });

  current = useDisplayStore.getState().session;
  assert.strictEqual(current.customerName, 'Wrong Name');

  // Admin clicks Reset Form
  store.resetDisplay(sess3, 'reset');

  current = useDisplayStore.getState().session;
  assert.strictEqual(current.mode, 'welcome');
  assert.strictEqual(current.customerName, '');
  assert.strictEqual(current.customerMobile, '');
  console.log('✅ TEST 3 PASSED: Display cleanly returned to Welcome upon clicking Reset Form.\n');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: Start a second customer\'s billing session after cancelling the first.
  // Expected: Only the second customer\'s information appears.
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 4: Start second customer billing session after cancelling first ---');
  // First customer cancelled
  const cust1_sess = store.startNewSession();
  store.broadcast({
    sessionId: cust1_sess,
    mode: 'waiting-payment',
    customerName: 'Customer One',
    customerMobile: '9000000001',
    billAmount: 250,
  });
  store.cancelPayment(cust1_sess);

  // Second customer begins
  const cust2_sess = store.startNewSession();
  store.broadcast({
    sessionId: cust2_sess,
    mode: 'customer-selected',
    customerName: 'Ramesh',
    customerMobile: '9840555666',
    billAmount: 150,
    amountPayable: 150,
  });

  current = useDisplayStore.getState().session;
  assert.strictEqual(current.sessionId, cust2_sess);
  assert.strictEqual(current.customerName, 'Ramesh');
  assert.strictEqual(current.customerMobile, '9840555666');
  assert.notStrictEqual(current.customerName, 'Customer One');
  console.log('✅ TEST 4 PASSED: Only second customer info appears; first customer info absent.\n');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5: Complete a successful payment.
  // Expected: Existing successful payment behaviour remains unchanged.
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 5: Complete a successful payment ---');
  store.broadcast({
    sessionId: cust2_sess,
    mode: 'payment-success',
    paymentStatus: 'payment_successful',
    customerName: 'Ramesh',
    amountPayable: 150,
    cashbackEarned: 3,
    newWalletBalance: 3,
    transactionId: 'TXN_TEST_12345'
  });

  current = useDisplayStore.getState().session;
  assert.strictEqual(current.mode, 'payment-success');
  assert.strictEqual(current.paymentStatus, 'payment_successful');
  assert.strictEqual(current.transactionId, 'TXN_TEST_12345');
  console.log('✅ TEST 5 PASSED: Successful payment preserves success status and tx ID.\n');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 6: Refresh or reconnect the customer display after cancellation.
  // Expected: Previous cancelled payment information must not reappear.
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 6: Refresh or reconnect customer display after cancellation ---');
  // Cancel current session
  store.cancelPayment(cust2_sess);

  // Simulate window reload / new display connection reading from storage
  const storedJson = storage['smart_cashback_display_state'];
  const loaded = JSON.parse(storedJson);
  assert.strictEqual(loaded.mode, 'welcome');
  assert.strictEqual(loaded.customerName, '');
  assert.strictEqual(loaded.upiLink, null);
  console.log('✅ TEST 6 PASSED: Stored state is clean Welcome; cancelled info never reappears on reload.\n');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 7: Cancel an old payment session after a new session has started.
  // Expected: The old cancellation event must not reset the new customer\'s display.
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 7: Cancel old session after new session has started ---');
  // Start new session for Priya
  const oldSessionId = 'OLD_STALE_SESSION_999';
  const newSessionId = store.startNewSession();
  store.broadcast({
    sessionId: newSessionId,
    mode: 'waiting-payment',
    customerName: 'Priya',
    customerMobile: '9944112233',
    billAmount: 800,
    amountPayable: 800,
    upiLink: 'upi://pay?pa=7708481818@upi&am=800.00'
  });

  current = useDisplayStore.getState().session;
  assert.strictEqual(current.sessionId, newSessionId);
  assert.strictEqual(current.customerName, 'Priya');

  // Stale cancel event arrives for OLD session
  store.resetDisplay(oldSessionId, 'stale_cancel');

  // Priya's session must still be intact and NOT reset!
  current = useDisplayStore.getState().session;
  assert.strictEqual(current.sessionId, newSessionId, 'Session ID should still be Priya');
  assert.strictEqual(current.customerName, 'Priya', 'Priya info should be preserved');
  assert.strictEqual(current.mode, 'waiting-payment', 'Display mode should remain waiting-payment');
  console.log('✅ TEST 7 PASSED: Old cancellation event for old session did NOT reset new customer display.\n');

  console.log('==============================================================================');
  console.log('🎉 ALL 7 TEST CASES PASSED CLEANLY WITH 100% ACCURACY!');
  console.log('==============================================================================');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

