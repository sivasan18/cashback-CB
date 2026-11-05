/**
 * Smart Cashback – Cloudflare Workers & Pages Functions API Server
 * Complete backend implementation with D1 (SQLite), R2 (Storage), and Web Crypto.
 */

export interface Env {
  DB: D1Database
  STORAGE?: R2Bucket
  JWT_SECRET?: string
  ENVIRONMENT?: string
  ADMIN_EMAIL?: string
}

// ─── Cryptographic Utilities (Standard Web Crypto API) ───────────────────────

export function getJwtSecret(env: Env): string {
  if (env.JWT_SECRET) return env.JWT_SECRET
  if (env.ENVIRONMENT !== 'production') {
    return 'dev-local-jwt-secret-do-not-use-in-production'
  }
  throw new Error('JWT_SECRET secret is not configured. Please run: npx wrangler secret put JWT_SECRET')
}

export async function hashPassword(password: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )
  const saltBytes = new Uint8Array(saltHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)))
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  )
  return Array.from(new Uint8Array(derived)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function generateSalt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function createJWT(payload: Record<string, any>, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const header = { alg: 'HS256', typ: 'JWT' }
  const b64Url = (str: string) => {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  const h64 = b64Url(JSON.stringify(header))
  const p64 = b64Url(JSON.stringify(payload))
  const data = enc.encode(`${h64}.${p64}`)

  const sig = await crypto.subtle.sign('HMAC', key, data)
  const sig64 = b64Url(String.fromCharCode(...new Uint8Array(sig)))
  return `${h64}.${p64}.${sig64}`
}

export async function verifyJWT(token: string, secret: string): Promise<any | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [h64, p64, s64] = parts
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )

    // Decode signature
    const sigStr = atob(s64.replace(/-/g, '+').replace(/_/g, '/'))
    const sigBytes = new Uint8Array(sigStr.length)
    for (let i = 0; i < sigStr.length; i++) sigBytes[i] = sigStr.charCodeAt(i)

    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(`${h64}.${p64}`))
    if (!valid) return null

    const payloadJson = atob(p64.replace(/-/g, '+').replace(/_/g, '/'))
    const payload = JSON.parse(payloadJson)

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null // Expired
    }
    return payload
  } catch {
    return null
  }
}

// ─── Rate Limiter (Edge in-memory) ──────────────────────────────────────────

const loginAttempts = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string, maxAttempts = 5, windowMs = 300000): boolean {
  const now = Date.now()
  const entry = loginAttempts.get(ip)
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= maxAttempts) {
    return false
  }
  entry.count++
  return true
}

// ─── Helpers: Responses & Auth ───────────────────────────────────────────────

export function json(data: any, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      ...headers
    }
  })
}

export function corsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info',
      'Access-Control-Max-Age': '86400'
    }
  })
}

export async function authenticateAdmin(request: Request, env: Env): Promise<{ id: string; email: string; role: string } | null> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null

  const token = authHeader.slice(7).trim()
  const secret = getJwtSecret(env)
  const payload = await verifyJWT(token, secret)
  if (!payload || payload.role !== 'admin') return null

  return { id: payload.sub, email: payload.email, role: payload.role }
}

// In-memory Customer Display State fallback for cross-device support
let globalDisplaySession: any = {
  sessionId: 'default',
  mode: 'welcome',
  customerName: '',
  customerMobile: '',
  shopName: 'Smart Cashback',
  billAmount: 0,
  cashbackRedeemed: 0,
  amountPayable: 0,
  cashbackEarned: 0,
  availableBalance: 0,
  newWalletBalance: 0,
  paymentMethod: null,
  paymentStatus: 'awaiting_payment',
  updatedAt: Date.now()
}

// ─── Main Request Handler ─────────────────────────────────────────────────────

export async function handleApiRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const pathname = url.pathname.replace(/^\/api/, '')
  const method = request.method.toUpperCase()

  if (method === 'OPTIONS') {
    return corsResponse()
  }

  try {
    // ─── AUTHENTICATION ROUTES ────────────────────────────────────────────────
    if (pathname === '/auth/login' && method === 'POST') {
      const clientIp = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || 'unknown'
      if (!checkRateLimit(clientIp)) {
        return json({ error: 'Too many login attempts. Please wait 5 minutes before trying again.' }, 429)
      }

      const body = await request.json().catch(() => ({})) as any
      const { email, password } = body

      if (!email || !password) {
        return json({ error: 'Email and password are required' }, 400)
      }

      // Check admin_users in D1
      const user = await env.DB.prepare('SELECT * FROM admin_users WHERE email = ?').bind(email.toLowerCase().trim()).first() as any

      if (!user) {
        return json({ error: 'Invalid login credentials' }, 401)
      }

      const inputHash = await hashPassword(password, user.salt)
      if (inputHash !== user.password_hash) {
        return json({ error: 'Invalid login credentials' }, 401)
      }

      const secret = getJwtSecret(env)
      const exp = Math.floor(Date.now() / 1000) + (7 * 24 * 3600) // 7 days
      const token = await createJWT(
        { sub: user.id, email: user.email, role: user.role, exp },
        secret
      )

      return json({
        token,
        user: { id: user.id, email: user.email, role: user.role }
      })
    }

    if (pathname === '/auth/session' && method === 'GET') {
      const admin = await authenticateAdmin(request, env)
      if (!admin) {
        return json({ session: null, user: null })
      }
      return json({
        session: { access_token: request.headers.get('Authorization')?.replace('Bearer ', '') },
        user: admin
      })
    }

    if (pathname === '/auth/logout' && method === 'POST') {
      return json({ success: true })
    }

    if (pathname === '/auth/change-password' && method === 'POST') {
      const admin = await authenticateAdmin(request, env)
      if (!admin) return json({ error: 'Unauthorized' }, 401)

      const body = await request.json().catch(() => ({})) as any
      const { newPassword } = body
      if (!newPassword || newPassword.length < 6) {
        return json({ error: 'Password must be at least 6 characters' }, 400)
      }

      const salt = generateSalt()
      const hash = await hashPassword(newPassword, salt)
      await env.DB.prepare(
        'UPDATE admin_users SET password_hash = ?, salt = ?, updated_at = datetime("now") WHERE id = ?'
      ).bind(hash, salt, admin.id).run()

      return json({ success: true, message: 'Password updated successfully' })
    }

    // ─── SHOP SETTINGS ────────────────────────────────────────────────────────
    if (pathname === '/settings' && method === 'GET') {
      const settings = await env.DB.prepare('SELECT * FROM shop_settings LIMIT 1').first()
      return json({ data: settings })
    }

    if (pathname === '/settings' && method === 'PUT') {
      const admin = await authenticateAdmin(request, env)
      if (!admin) return json({ error: 'Unauthorized' }, 401)

      const body = await request.json().catch(() => ({})) as any
      const existing = await env.DB.prepare('SELECT * FROM shop_settings LIMIT 1').first() as any

      if (existing) {
        await env.DB.prepare(`
          UPDATE shop_settings SET
            shop_name = ?,
            shop_address = ?,
            contact_number = ?,
            cashback_percentage = ?,
            minimum_eligible_purchase = ?,
            currency = ?,
            date_format = ?,
            time_format = ?,
            merchant_upi_id = ?,
            merchant_display_name = ?,
            qr_payment_method = ?,
            payment_expiry_seconds = ?,
            display_timeout_seconds = ?,
            updated_at = datetime("now")
          WHERE id = ?
        `).bind(
          body.shop_name ?? existing.shop_name,
          body.shop_address ?? existing.shop_address,
          body.contact_number ?? existing.contact_number,
          body.cashback_percentage ?? existing.cashback_percentage,
          body.minimum_eligible_purchase ?? existing.minimum_eligible_purchase,
          body.currency ?? existing.currency,
          body.date_format ?? existing.date_format,
          body.time_format ?? existing.time_format,
          body.merchant_upi_id ?? existing.merchant_upi_id,
          body.merchant_display_name ?? existing.merchant_display_name,
          body.qr_payment_method ?? existing.qr_payment_method,
          body.payment_expiry_seconds ?? existing.payment_expiry_seconds,
          body.display_timeout_seconds ?? existing.display_timeout_seconds,
          existing.id
        ).run()
      } else {
        const id = crypto.randomUUID()
        await env.DB.prepare(`
          INSERT INTO shop_settings (
            id, shop_name, shop_address, contact_number,
            cashback_percentage, minimum_eligible_purchase, currency,
            date_format, time_format, merchant_upi_id, merchant_display_name,
            qr_payment_method, payment_expiry_seconds, display_timeout_seconds
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          id,
          body.shop_name || 'Smart Cashback Shop',
          body.shop_address || '',
          body.contact_number || '',
          body.cashback_percentage || 2.00,
          body.minimum_eligible_purchase || 99.00,
          body.currency || 'INR',
          body.date_format || 'DD/MM/YYYY',
          body.time_format || '12h',
          body.merchant_upi_id || '7708481818@upi',
          body.merchant_display_name || 'Smart Cashback',
          body.qr_payment_method || 'standard_upi',
          body.payment_expiry_seconds || 300,
          body.display_timeout_seconds || 5
        ).run()
      }

      const updated = await env.DB.prepare('SELECT * FROM shop_settings LIMIT 1').first()
      return json({ data: updated })
    }

    // ─── SERVICE CATEGORIES ───────────────────────────────────────────────────
    if (pathname === '/categories' && method === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT * FROM service_categories ORDER BY sort_order ASC, name ASC'
      ).all()
      return json({ data: results })
    }

    if (pathname === '/categories' && method === 'POST') {
      const admin = await authenticateAdmin(request, env)
      if (!admin) return json({ error: 'Unauthorized' }, 401)

      const body = await request.json().catch(() => ({})) as any
      if (!body.name || !body.name.trim()) return json({ error: 'Category name required' }, 400)

      const id = crypto.randomUUID()
      await env.DB.prepare(
        'INSERT INTO service_categories (id, name, is_active, sort_order) VALUES (?, ?, ?, ?)'
      ).bind(id, body.name.trim(), body.is_active ?? 1, body.sort_order ?? 0).run()

      const created = await env.DB.prepare('SELECT * FROM service_categories WHERE id = ?').bind(id).first()
      return json({ data: created }, 201)
    }

    if (pathname.match(/^\/categories\/([^/]+)$/) && method === 'PUT') {
      const admin = await authenticateAdmin(request, env)
      if (!admin) return json({ error: 'Unauthorized' }, 401)

      const id = pathname.split('/')[2]
      const body = await request.json().catch(() => ({})) as any

      await env.DB.prepare(`
        UPDATE service_categories SET
          name = COALESCE(?, name),
          is_active = COALESCE(?, is_active),
          sort_order = COALESCE(?, sort_order)
        WHERE id = ?
      `).bind(body.name, body.is_active !== undefined ? (body.is_active ? 1 : 0) : null, body.sort_order, id).run()

      const updated = await env.DB.prepare('SELECT * FROM service_categories WHERE id = ?').bind(id).first()
      return json({ data: updated })
    }

    if (pathname.match(/^\/categories\/([^/]+)$/) && method === 'DELETE') {
      const admin = await authenticateAdmin(request, env)
      if (!admin) return json({ error: 'Unauthorized' }, 401)

      const id = pathname.split('/')[2]
      await env.DB.prepare('DELETE FROM service_categories WHERE id = ?').bind(id).run()
      return json({ success: true })
    }

    // ─── CUSTOMERS ────────────────────────────────────────────────────────────
    if (pathname === '/customers' && method === 'GET') {
      const prefix = url.searchParams.get('prefix')
      const search = url.searchParams.get('search')
      const mobile = url.searchParams.get('mobile')
      const limit = parseInt(url.searchParams.get('limit') || '50', 10)
      const offset = parseInt(url.searchParams.get('offset') || '0', 10)
      const includeDeleted = url.searchParams.get('include_deleted') === 'true'

      let query = 'SELECT * FROM customers WHERE 1=1'
      const params: any[] = []

      if (!includeDeleted) {
        query += " AND name != '[Deleted Customer]' AND mobile NOT LIKE 'DEL%'"
      }

      if (prefix) {
        // Strict prefix matching only
        query += ' AND mobile LIKE ?'
        params.push(`${prefix}%`)
      } else if (mobile) {
        query += ' AND mobile = ?'
        params.push(mobile)
      } else if (search) {
        query += ' AND (name LIKE ? OR mobile LIKE ?)'
        params.push(`%${search}%`, `${search}%`)
      }

      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
      params.push(limit, offset)

      const { results } = await env.DB.prepare(query).bind(...params).all()
      return json({ data: results })
    }

    if (pathname.match(/^\/customers\/([^/]+)$/) && method === 'GET') {
      const id = pathname.split('/')[2]
      const customer = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(id).first()
      if (!customer) return json({ error: 'Customer not found' }, 404)
      return json({ data: customer })
    }

    if (pathname === '/customers' && method === 'POST') {
      const body = await request.json().catch(() => ({})) as any
      const { name, mobile } = body

      if (!name || !name.trim()) return json({ error: 'Customer name is required' }, 400)
      if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) {
        return json({ error: 'A valid 10-digit mobile number starting with 6-9 is required' }, 400)
      }

      // Check duplicate
      const existing = await env.DB.prepare('SELECT id FROM customers WHERE mobile = ?').bind(mobile).first()
      if (existing) {
        return json({ error: 'A customer with this mobile number already exists' }, 409)
      }

      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      await env.DB.prepare(`
        INSERT INTO customers (
          id, name, mobile, total_purchases, cashback_earned, cashback_redeemed, cashback_balance, created_at, updated_at
        ) VALUES (?, ?, ?, 0.0, 0.0, 0.0, 0.0, ?, ?)
      `).bind(id, name.trim(), mobile.trim(), now, now).run()

      const created = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(id).first()
      return json({ data: created }, 201)
    }

    if (pathname.match(/^\/customers\/([^/]+)$/) && method === 'PUT') {
      const id = pathname.split('/')[2]
      const body = await request.json().catch(() => ({})) as any
      const { name, mobile } = body

      if (mobile && !/^[6-9]\d{9}$/.test(mobile) && !mobile.startsWith('DEL')) {
        return json({ error: 'Invalid mobile number format' }, 400)
      }

      const existing = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(id).first() as any
      if (!existing) return json({ error: 'Customer not found' }, 404)

      if (mobile && mobile !== existing.mobile) {
        const dup = await env.DB.prepare('SELECT id FROM customers WHERE mobile = ? AND id != ?').bind(mobile, id).first()
        if (dup) return json({ error: 'Mobile number already used by another customer' }, 409)
      }

      const now = new Date().toISOString()
      await env.DB.prepare(`
        UPDATE customers SET
          name = COALESCE(?, name),
          mobile = COALESCE(?, mobile),
          updated_at = ?
        WHERE id = ?
      `).bind(name ? name.trim() : null, mobile ? mobile.trim() : null, now, id).run()

      const updated = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(id).first()
      return json({ data: updated })
    }

    if (pathname.match(/^\/customers\/([^/]+)$/) && method === 'DELETE') {
      const admin = await authenticateAdmin(request, env)
      if (!admin) return json({ error: 'Unauthorized' }, 401)

      const id = pathname.split('/')[2]
      const customer = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(id).first() as any
      if (!customer) return json({ error: 'Customer not found' }, 404)

      const txCountRow = await env.DB.prepare('SELECT count(*) as count FROM transactions WHERE customer_id = ?').bind(id).first() as any
      const txCount = txCountRow?.count || 0

      const now = new Date().toISOString()
      const auditId = crypto.randomUUID()

      if (txCount === 0) {
        // Completely remove customer if no purchases exist
        await env.DB.batch([
          env.DB.prepare('DELETE FROM cashback_ledger WHERE customer_id = ?').bind(id),
          env.DB.prepare('DELETE FROM customers WHERE id = ?').bind(id),
          env.DB.prepare(`
            INSERT INTO admin_audit_logs (id, action, performed_by, details, created_at)
            VALUES (?, 'DELETE_CUSTOMER', ?, ?, ?)
          `).bind(
            auditId,
            admin.email,
            JSON.stringify({ customer_id: id, transactions_retained: 0, completely_removed: true }),
            now
          )
        ])
        return json({ success: true, customer_id: id, transactions_retained: 0, completely_removed: true })
      } else {
        // Customer has financial transactions: anonymize personal data
        const anonMobile = 'DEL' + id.substring(0, 7)
        await env.DB.batch([
          env.DB.prepare('DELETE FROM cashback_ledger WHERE customer_id = ?').bind(id),
          env.DB.prepare(`
            UPDATE customers SET
              name = '[Deleted Customer]',
              mobile = ?,
              cashback_balance = 0.0,
              total_purchases = 0.0,
              cashback_earned = 0.0,
              cashback_redeemed = 0.0,
              updated_at = ?
            WHERE id = ?
          `).bind(anonMobile, now, id),
          env.DB.prepare(`
            UPDATE transactions SET
              notes = coalesce(notes, '') || ' (Customer account deleted)',
              updated_at = ?
            WHERE customer_id = ?
          `).bind(now, id),
          env.DB.prepare(`
            INSERT INTO admin_audit_logs (id, action, performed_by, details, created_at)
            VALUES (?, 'DELETE_CUSTOMER', ?, ?, ?)
          `).bind(
            auditId,
            admin.email,
            JSON.stringify({ customer_id: id, transactions_retained: txCount, completely_removed: false }),
            now
          )
        ])
        return json({ success: true, customer_id: id, transactions_retained: txCount, completely_removed: false })
      }
    }

    if (pathname === '/customers/delete-all' && method === 'POST') {
      const admin = await authenticateAdmin(request, env)
      if (!admin) return json({ error: 'Unauthorized' }, 401)

      const now = new Date().toISOString()
      const auditId = crypto.randomUUID()

      // Fetch all customer IDs and transaction customer IDs
      const { results: allCustomers } = await env.DB.prepare('SELECT id FROM customers').all() as any
      const { results: txCustomers } = await env.DB.prepare('SELECT DISTINCT customer_id FROM transactions').all() as any
      const txCustSet = new Set((txCustomers || []).map((t: any) => t.customer_id))

      const statements: D1PreparedStatement[] = [
        env.DB.prepare('DELETE FROM cashback_ledger')
      ]

      let hardDeleted = 0
      let anonymized = 0

      for (const cust of (allCustomers || [])) {
        if (!txCustSet.has(cust.id)) {
          statements.push(env.DB.prepare('DELETE FROM customers WHERE id = ?').bind(cust.id))
          hardDeleted++
        } else {
          const anonMobile = 'DEL' + cust.id.substring(0, 7)
          statements.push(env.DB.prepare(`
            UPDATE customers SET
              name = '[Deleted Customer]',
              mobile = ?,
              cashback_balance = 0.0,
              total_purchases = 0.0,
              cashback_earned = 0.0,
              cashback_redeemed = 0.0,
              updated_at = ?
            WHERE id = ?
          `).bind(anonMobile, now, cust.id))
          anonymized++
        }
      }

      statements.push(env.DB.prepare(`
        INSERT INTO admin_audit_logs (id, action, performed_by, details, created_at)
        VALUES (?, 'DELETE_ALL_CUSTOMERS', ?, ?, ?)
      `).bind(
        auditId,
        admin.email,
        JSON.stringify({ hard_deleted: hardDeleted, anonymized }),
        now
      ))

      await env.DB.batch(statements)
      return json({ success: true, hard_deleted: hardDeleted, anonymized })
    }

    // ─── BILLING: SERVER-SIDE TRANSACTIONAL PROCESS ───────────────────────────
    if (pathname === '/billing/process' && method === 'POST') {
      const body = await request.json().catch(() => ({})) as any
      const {
        customer_id,
        service_category,
        bill_amount,
        cashback_redeemed,
        amount_paid,
        notes,
        payment_method,
        payment_verified,
        idempotency_key
      } = body

      // UPI Payment Verification Safety Check
      // Never credit cashback or complete payment unless merchant/provider has verified receipt
      if (payment_method === 'upi' && !payment_verified && !notes?.includes('Payment: UPI (Verified)')) {
        return json({
          error: 'UPI payment receipt must be verified by the merchant before completing the transaction.'
        }, 400)
      }

      // 1. Idempotency check: if transaction with this key exists, return it
      if (idempotency_key) {
        const existingTx = await env.DB.prepare('SELECT * FROM transactions WHERE idempotency_key = ?').bind(idempotency_key).first()
        if (existingTx) {
          const updatedCustomer = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(customer_id).first()
          return json({ success: true, transaction: existingTx, customer: updatedCustomer, idempotent: true })
        }
      }

      // 2. Fetch customer
      const customer = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(customer_id).first() as any
      if (!customer) return json({ error: 'Customer not found' }, 404)

      // 3. Fetch shop settings
      const settings = await env.DB.prepare('SELECT * FROM shop_settings LIMIT 1').first() as any
      const minPurchase = settings?.minimum_eligible_purchase ?? 99.00
      const cbPercentage = settings?.cashback_percentage ?? 2.00

      const billAmt = Number(bill_amount)
      const cbRedeemed = Number(cashback_redeemed || 0)
      const amtPaid = Number(amount_paid)

      // 4. Server-side validations
      if (billAmt <= 0) return json({ error: 'Bill amount must be greater than zero' }, 400)
      if (cbRedeemed < 0) return json({ error: 'Redemption amount cannot be negative' }, 400)
      if (cbRedeemed > customer.cashback_balance + 0.0001) {
        return json({ error: `Redemption exceeds wallet balance. Available: ₹${customer.cashback_balance}` }, 400)
      }
      if (cbRedeemed > billAmt) return json({ error: 'Redemption cannot exceed bill amount' }, 400)

      // 5. Server-side authoritative cashback calculation
      let calcCashback = 0.0
      if (billAmt >= minPurchase) {
        calcCashback = Math.round(amtPaid * cbPercentage) / 100
      }

      const newBalance = Math.round((customer.cashback_balance - cbRedeemed + calcCashback) * 100) / 100
      const txId = crypto.randomUUID()
      const now = new Date().toISOString()
      const finalIdempotencyKey = idempotency_key || `tx_${Date.now()}_${txId}`

      const batchStatements: D1PreparedStatement[] = []

      // Insert transaction
      batchStatements.push(env.DB.prepare(`
        INSERT INTO transactions (
          id, customer_id, service_category, bill_amount,
          cashback_redeemed, amount_paid, cashback_earned,
          status, notes, payment_method, idempotency_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?)
      `).bind(
        txId, customer_id, service_category, billAmt,
        cbRedeemed, amtPaid, calcCashback,
        notes || null, payment_method || 'cash', finalIdempotencyKey, now, now
      ))

      // Update customer aggregates
      batchStatements.push(env.DB.prepare(`
        UPDATE customers SET
          total_purchases = round(total_purchases + ?, 2),
          cashback_earned = round(cashback_earned + ?, 2),
          cashback_redeemed = round(cashback_redeemed + ?, 2),
          cashback_balance = ?,
          updated_at = ?
        WHERE id = ?
      `).bind(amtPaid, calcCashback, cbRedeemed, newBalance, now, customer_id))

      // Insert ledger debit if redeemed
      if (cbRedeemed > 0) {
        const debitId = crypto.randomUUID()
        const balAfterDebit = Math.round((customer.cashback_balance - cbRedeemed) * 100) / 100
        batchStatements.push(env.DB.prepare(`
          INSERT INTO cashback_ledger (
            id, customer_id, transaction_id, credit, debit, balance_after, description, created_at
          ) VALUES (?, ?, ?, 0.0, ?, ?, ?, ?)
        `).bind(
          debitId, customer_id, txId, cbRedeemed, balAfterDebit,
          `Cashback redeemed on ${service_category}`, now
        ))
      }

      // Insert ledger credit if earned
      if (calcCashback > 0) {
        const creditId = crypto.randomUUID()
        batchStatements.push(env.DB.prepare(`
          INSERT INTO cashback_ledger (
            id, customer_id, transaction_id, credit, debit, balance_after, description, created_at
          ) VALUES (?, ?, ?, ?, 0.0, ?, ?, ?)
        `).bind(
          creditId, customer_id, txId, calcCashback, newBalance,
          `Cashback earned on ${service_category} (₹${amtPaid} paid)`, now
        ))
      }

      // Execute batch transaction atomically
      await env.DB.batch(batchStatements)

      const updatedCustomer = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(customer_id).first()
      const createdTx = await env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(txId).first()

      return json({
        success: true,
        transaction: createdTx,
        customer: updatedCustomer
      })
    }

    // ─── TRANSACTION CANCELLATION & REVERSAL ───────────────────────────────────
    if (pathname.match(/^\/transactions\/([^/]+)\/cancel$/) && method === 'POST') {
      const admin = await authenticateAdmin(request, env)
      if (!admin) return json({ error: 'Unauthorized' }, 401)

      const txId = pathname.split('/')[2]
      const tx = await env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(txId).first() as any
      if (!tx) return json({ error: 'Transaction not found' }, 404)
      if (tx.status !== 'completed') return json({ error: 'Only completed transactions can be cancelled' }, 400)

      const customer = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(tx.customer_id).first() as any
      if (!customer) return json({ error: 'Associated customer not found' }, 404)

      const newBal = Math.round((customer.cashback_balance - tx.cashback_earned + tx.cashback_redeemed) * 100) / 100
      if (newBal < 0) {
        return json({ error: 'Cancellation would result in negative wallet balance' }, 400)
      }

      const now = new Date().toISOString()
      const reversalLedgerId = crypto.randomUUID()

      await env.DB.batch([
        env.DB.prepare('UPDATE transactions SET status = "cancelled", updated_at = ? WHERE id = ?').bind(now, txId),
        env.DB.prepare(`
          UPDATE customers SET
            total_purchases = round(total_purchases - ?, 2),
            cashback_earned = round(cashback_earned - ?, 2),
            cashback_redeemed = round(cashback_redeemed - ?, 2),
            cashback_balance = ?,
            updated_at = ?
          WHERE id = ?
        `).bind(tx.amount_paid, tx.cashback_earned, tx.cashback_redeemed, newBal, now, tx.customer_id),
        env.DB.prepare(`
          INSERT INTO cashback_ledger (
            id, customer_id, transaction_id, credit, debit, balance_after, description, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          reversalLedgerId, tx.customer_id, txId,
          tx.cashback_redeemed, tx.cashback_earned, newBal,
          `Reversal for cancelled transaction #${txId}`, now
        )
      ])

      const updatedCustomer = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(tx.customer_id).first()
      return json({ success: true, customer: updatedCustomer })
    }

    // ─── TRANSACTIONS & LEDGER ────────────────────────────────────────────────
    if (pathname === '/transactions' && method === 'GET') {
      const customerId = url.searchParams.get('customer_id')
      const status = url.searchParams.get('status')
      const startDate = url.searchParams.get('start_date')
      const endDate = url.searchParams.get('end_date')
      const limit = parseInt(url.searchParams.get('limit') || '100', 10)
      const offset = parseInt(url.searchParams.get('offset') || '0', 10)

      let query = `
        SELECT t.*, c.name as customer_name, c.mobile as customer_mobile
        FROM transactions t
        LEFT JOIN customers c ON t.customer_id = c.id
        WHERE 1=1
      `
      const params: any[] = []

      if (customerId) {
        query += ' AND t.customer_id = ?'
        params.push(customerId)
      }
      if (status) {
        query += ' AND t.status = ?'
        params.push(status)
      }
      if (startDate) {
        query += ' AND t.created_at >= ?'
        params.push(startDate)
      }
      if (endDate) {
        query += ' AND t.created_at <= ?'
        params.push(endDate)
      }

      query += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?'
      params.push(limit, offset)

      const { results } = await env.DB.prepare(query).bind(...params).all()
      return json({ data: results })
    }

    if (pathname === '/ledger' && method === 'GET') {
      const customerId = url.searchParams.get('customer_id')
      if (!customerId) return json({ error: 'customer_id is required' }, 400)

      const { results } = await env.DB.prepare(
        'SELECT * FROM cashback_ledger WHERE customer_id = ? ORDER BY created_at DESC'
      ).bind(customerId).all()
      return json({ data: results })
    }

    // ─── DASHBOARD STATS & REPORTS ────────────────────────────────────────────
    if (pathname === '/dashboard/stats' && method === 'GET') {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayStartStr = todayStart.toISOString()

      // Today's completed transactions
      const todayRow = await env.DB.prepare(`
        SELECT
          coalesce(sum(amount_paid), 0) as today_sales,
          coalesce(sum(cashback_earned), 0) as today_cashback,
          count(*) as today_tx_count
        FROM transactions
        WHERE status = 'completed' AND created_at >= ?
      `).bind(todayStartStr).first() as any

      // Month's sales
      const monthStart = new Date()
      monthStart.setDate(1)
      monthStart.setHours(0, 0, 0, 0)
      const monthStartStr = monthStart.toISOString()

      const monthRow = await env.DB.prepare(`
        SELECT coalesce(sum(amount_paid), 0) as month_sales
        FROM transactions
        WHERE status = 'completed' AND created_at >= ?
      `).bind(monthStartStr).first() as any

      // Total active customers
      const custRow = await env.DB.prepare(`
        SELECT count(*) as total_customers, coalesce(sum(cashback_balance), 0) as total_wallet_balance
        FROM customers
        WHERE name != '[Deleted Customer]' AND mobile NOT LIKE 'DEL%'
      `).first() as any

      // All-time totals
      const allTimeRow = await env.DB.prepare(`
        SELECT
          coalesce(sum(amount_paid), 0) as total_sales,
          coalesce(sum(cashback_earned), 0) as total_cashback_earned,
          coalesce(sum(cashback_redeemed), 0) as total_cashback_redeemed,
          count(*) as total_transactions
        FROM transactions
        WHERE status = 'completed'
      `).first() as any

      // Recent 10 transactions
      const { results: recentTransactions } = await env.DB.prepare(`
        SELECT t.*, c.name as customer_name, c.mobile as customer_mobile
        FROM transactions t
        LEFT JOIN customers c ON t.customer_id = c.id
        ORDER BY t.created_at DESC LIMIT 10
      `).all()

      return json({
        data: {
          today_sales: todayRow?.today_sales || 0,
          today_cashback: todayRow?.today_cashback || 0,
          today_tx_count: todayRow?.today_tx_count || 0,
          month_sales: monthRow?.month_sales || 0,
          total_customers: custRow?.total_customers || 0,
          total_wallet_balance: custRow?.total_wallet_balance || 0,
          total_sales: allTimeRow?.total_sales || 0,
          total_cashback_earned: allTimeRow?.total_cashback_earned || 0,
          total_cashback_redeemed: allTimeRow?.total_cashback_redeemed || 0,
          total_transactions: allTimeRow?.total_transactions || 0,
          recent_transactions: recentTransactions || []
        }
      })
    }

    // ─── DUAL SCREEN CUSTOMER DISPLAY STATE (SERVER SYNC) ─────────────────────
    if (pathname === '/display/session' && method === 'GET') {
      return json({ data: globalDisplaySession })
    }

    if (pathname === '/display/session' && method === 'POST') {
      const body = await request.json().catch(() => ({})) as any
      globalDisplaySession = {
        ...globalDisplaySession,
        ...body,
        updatedAt: Date.now()
      }
      return json({ data: globalDisplaySession })
    }

    if (pathname === '/display/reset' && method === 'POST') {
      globalDisplaySession = {
        sessionId: 'sess_' + Date.now(),
        mode: 'welcome',
        customerName: '',
        customerMobile: '',
        shopName: 'Smart Cashback',
        billAmount: 0,
        cashbackRedeemed: 0,
        amountPayable: 0,
        cashbackEarned: 0,
        availableBalance: 0,
        newWalletBalance: 0,
        paymentMethod: null,
        paymentStatus: 'awaiting_payment',
        updatedAt: Date.now()
      }
      return json({ success: true, data: globalDisplaySession })
    }

    // ─── R2 STORAGE: DATABASE EXPORT & BACKUPS ────────────────────────────────
    if (pathname === '/storage/backup' && method === 'POST') {
      const admin = await authenticateAdmin(request, env)
      if (!admin) return json({ error: 'Unauthorized' }, 401)

      const [
        { results: customers },
        { results: transactions },
        { results: ledger },
        { results: settings },
        { results: categories }
      ] = await Promise.all([
        env.DB.prepare('SELECT * FROM customers').all(),
        env.DB.prepare('SELECT * FROM transactions').all(),
        env.DB.prepare('SELECT * FROM cashback_ledger').all(),
        env.DB.prepare('SELECT * FROM shop_settings').all(),
        env.DB.prepare('SELECT * FROM service_categories').all()
      ])

      const backupData = {
        timestamp: new Date().toISOString(),
        engine: 'Cloudflare D1',
        counts: {
          customers: customers.length,
          transactions: transactions.length,
          cashback_ledger: ledger.length,
          shop_settings: settings.length,
          service_categories: categories.length
        },
        customers,
        transactions,
        cashback_ledger: ledger,
        shop_settings: settings,
        service_categories: categories
      }

      const backupJson = JSON.stringify(backupData, null, 2)
      const filename = `backups/backup_${Date.now()}.json`

      // If R2 is bound, store to Cloudflare R2
      if (env.STORAGE) {
        await env.STORAGE.put(filename, backupJson, {
          httpMetadata: { contentType: 'application/json' },
          customMetadata: { generatedBy: admin.email }
        })
      }

      return json({
        success: true,
        filename,
        counts: backupData.counts,
        r2_stored: !!env.STORAGE
      })
    }

    return json({ error: `Not found: ${method} ${pathname}` }, 404)
  } catch (err: any) {
    console.error('API Error:', err)
    return json({ error: err.message || 'Internal server error' }, 500)
  }
}
