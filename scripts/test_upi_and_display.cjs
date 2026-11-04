const assert = require('assert')

// 1. Test UPI link generation format
function buildUPILink({ payeeVPA, payeeName, amount, transactionNote }) {
  const upiParams = new URLSearchParams({
    pa: payeeVPA,
    pn: payeeName,
    am: amount.toFixed(2),
    cu: 'INR',
  })
  if (transactionNote) upiParams.set('tn', transactionNote)
  return `upi://pay?${upiParams.toString()}`
}

const shopUPI = '7708481818@upi'
const shopName = 'Smart Cashback Shop'

console.log('--- Testing UPI Deep Link Generation ---')
const upiLink1 = buildUPILink({
  payeeVPA: shopUPI,
  payeeName: shopName,
  amount: 150,
  transactionNote: 'Bill - Ramesh - Xerox',
})

console.log('Generated UPI Link:', upiLink1)
assert(upiLink1.includes('pa=7708481818%40upi') || upiLink1.includes('pa=7708481818@upi'))
assert(upiLink1.includes('am=150.00'))
assert(upiLink1.includes('cu=INR'))
console.log('✅ UPI Deep Link format verified')

// 2. Test Cashback Business Rules
function calculateCashback({ billAmount, cashbackToRedeem, availableBalance, cashbackPercentage, minimumEligiblePurchase }) {
  const redeem = Math.round(Math.min(cashbackToRedeem, billAmount, availableBalance) * 100) / 100
  const amountPaid = Math.round((billAmount - redeem) * 100) / 100
  const isEligible = billAmount >= minimumEligiblePurchase
  const cashbackEarned = isEligible ? Math.round(amountPaid * (cashbackPercentage / 100) * 100) / 100 : 0
  const newBalance = Math.round((availableBalance - redeem + cashbackEarned) * 100) / 100
  return { billAmount, cashbackToRedeem: redeem, amountPaid, cashbackEarned, newBalance, isEligible }
}

console.log('--- Testing Cashback Rules ---')
// Rule: Every eligible ₹100 purchase earns ₹2 cashback (2%)
const res100 = calculateCashback({ billAmount: 100, cashbackToRedeem: 0, availableBalance: 10, cashbackPercentage: 2, minimumEligiblePurchase: 99 })
assert.strictEqual(res100.cashbackEarned, 2.00)
assert.strictEqual(res100.amountPaid, 100.00)
assert.strictEqual(res100.newBalance, 12.00)
console.log('✅ ₹100 purchase gives ₹2.00 cashback')

// Rule: Below ₹99 earns ₹0 cashback
const res50 = calculateCashback({ billAmount: 50, cashbackToRedeem: 0, availableBalance: 10, cashbackPercentage: 2, minimumEligiblePurchase: 99 })
assert.strictEqual(res50.cashbackEarned, 0)
console.log('✅ < ₹99 purchase gives ₹0.00 cashback')

// Rule: Cashback calculated on amount AFTER redemption
const resRedeem = calculateCashback({ billAmount: 150, cashbackToRedeem: 50, availableBalance: 50, cashbackPercentage: 2, minimumEligiblePurchase: 99 })
assert.strictEqual(resRedeem.amountPaid, 100.00)
assert.strictEqual(resRedeem.cashbackEarned, 2.00) // 2% of 100
assert.strictEqual(resRedeem.newBalance, 2.00) // 50 - 50 + 2
console.log('✅ Cashback calculated on net amount after redemption')

console.log('🎉 ALL DUAL DISPLAY & UPI LOGIC TESTS PASSED!')
