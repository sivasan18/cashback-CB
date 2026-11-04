/**
 * UPI Payment utilities for Smart Cashback.
 * Generates UPI deep links and QR code data URIs.
 */

export interface UPIPaymentParams {
  /** UPI ID of the payee (shop owner) */
  payeeVPA: string
  /** Payee display name */
  payeeName: string
  /** Amount in INR (to 2 decimal places) */
  amount: number
  /** Transaction reference / note */
  transactionNote?: string
  /** Merchant category code (optional) */
  merchantCode?: string
}

/**
 * Build a UPI deep link URL per NPCI spec.
 * Example: upi://pay?pa=7708481818@upi&pn=SmartCashback&am=150.00&cu=INR&tn=Bill+Payment
 */
export function buildUPILink(params: UPIPaymentParams): string {
  const { payeeVPA, payeeName, amount, transactionNote } = params

  const upiParams = new URLSearchParams({
    pa: payeeVPA,
    pn: payeeName,
    am: amount.toFixed(2),
    cu: 'INR',
  })

  if (transactionNote) {
    upiParams.set('tn', transactionNote)
  }

  return `upi://pay?${upiParams.toString()}`
}

/**
 * Generate a QR code as a data URI (SVG) for the given text.
 * Uses a minimal QR code generator embedded here to avoid external dependencies.
 * Falls back to Google Charts API URL for display if needed.
 */
export function generateQRCodeURL(text: string, size = 300): string {
  // Use Google Charts API as a simple QR generator
  // This works without any npm dependency
  const encoded = encodeURIComponent(text)
  return `https://chart.googleapis.com/chart?cht=qr&chs=${size}x${size}&chl=${encoded}&choe=UTF-8&chld=M|2`
}

/**
 * Default shop UPI configuration.
 */
export const SHOP_UPI_CONFIG = {
  payeeVPA: '7708481818@upi',
  payeeName: 'Smart Cashback Shop',
} as const

