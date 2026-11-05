/**
 * Notification module – stub for future SMS gateway integration.
 * All methods are no-ops in the initial version.
 * Replace the `send` function implementation with a real SMS provider later.
 */

import type { NotificationEvent, NotificationPayload } from '@/types'

const SMS_TEMPLATES: Record<NotificationEvent, (data: NotificationPayload['data'] & { name: string }) => string> = {
  cashback_earned: ({ name, earned, balance }) =>
    `Dear ${name}, you have earned ₹${earned} cashback on your purchase. Your available Smart Cashback balance is ₹${balance}. Thank you for visiting our shop!`,

  cashback_redeemed: ({ name, redeemed, balance }) =>
    `Dear ${name}, ₹${redeemed} cashback was redeemed from your Smart Cashback wallet. Remaining balance: ₹${balance}. Thank you!`,

  balance_inquiry: ({ name, balance }) =>
    `Dear ${name}, your Smart Cashback balance is ₹${balance}. Visit us again to earn more rewards!`,

  monthly_summary: ({ name, earned, redeemed, balance }) =>
    `Dear ${name}, your monthly Smart Cashback summary – Earned: ₹${earned}, Used: ₹${redeemed}, Balance: ₹${balance}. Thank you for your loyalty!`,

  promotional: ({ name, message }) =>
    `Dear ${name}, ${message} – Smart Cashback`,
}

/**
 * Send a notification. Currently a no-op stub.
 * To activate SMS, replace this function body with a real API call.
 * IMPORTANT: SMS provider credentials must be stored server-side only.
 */
export async function sendNotification(payload: NotificationPayload): Promise<void> {
  // TODO: Replace with actual SMS gateway call via Cloudflare Worker
  // Example: await fetch('/api/notifications/send-sms', { method: 'POST', body: JSON.stringify(payload) })

  const template = SMS_TEMPLATES[payload.event]
  if (!template) return

  const message = template({
    name: payload.customerName,
    ...payload.data,
  } as Parameters<typeof template>[0])

  // Log for development visibility
  if (import.meta.env.DEV) {
    console.info('[NotificationStub] SMS would be sent:', {
      to: payload.mobile,
      message,
    })
  }
}

export { SMS_TEMPLATES }
