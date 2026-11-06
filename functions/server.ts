/**
 * Smart Cashback – Cloudflare Workers & Pages Functions API Server
 * Multi-Tenant 18-Shop Food Court Architecture with Hidden Master Owner Portal
 * Complete backend implementation with D1 (SQLite), R2 (Storage), and Web Crypto.
 */

export interface Env {
  DB: D1Database
  STORAGE?: R2Bucket
  JWT_SECRET?: string
  ENVIRONMENT?: string
  ADMIN_EMAIL?: string
}

export interface AuthUser {
  id: string
  email: string
  role: string
  shop_id: number | null
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

function checkRateLimit(ip: string, maxAttempts = 10, windowMs = 300000): boolean {
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, x-shop-id',
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, x-shop-id',
      'Access-Control-Max-Age': '86400'
    }
  })
}

export async function authenticateAdmin(request: Request, env: Env): Promise<AuthUser | null> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null

  const token = authHeader.slice(7).trim()
  const secret = getJwtSecret(env)
  const payload = await verifyJWT(token, secret)
  if (!payload || !['admin', 'super_admin'].includes(payload.role)) return null

  return {
    id: payload.sub,
    email: payload.email,
    role: payload.role,
    shop_id: payload.shop_id !== undefined ? payload.shop_id : (payload.role === 'super_admin' ? null : 18)
  }
}

function resolveActiveShopId(request: Request, admin: AuthUser | null): number {
  const url = new URL(request.url)
  const paramShop = url.searchParams.get('shop_id') || request.headers.get('x-shop-id')
  if (paramShop && !isNaN(parseInt(paramShop, 10))) {
    const parsed = parseInt(paramShop, 10)
    // If user is a tenant admin, they are strictly locked to their own shop
    if (admin && admin.role === 'admin' && admin.shop_id) {
      return admin.shop_id
    }
    return parsed
  }
  if (admin && admin.shop_id) {
    return admin.shop_id
  }
  return 18 // Default to Xerox & Printing Shop for backwards compatibility
}

// In-memory Customer Display State mapped per shop
const shopDisplaySessions = new Map<number, any>()

function getDisplaySession(shopId: number, defaultShopName = 'Smart Cashback') {
  if (!shopDisplaySessions.has(shopId)) {
    shopDisplaySessions.set(shopId, {
      sessionId: `sess_shop_${shopId}_${Date.now()}`,
      shopId,
      mode: 'welcome',
      customerName: '',
      customerMobile: '',
      shopName: defaultShopName,
      billAmount: 0,
      cashbackRedeemed: 0,
      amountPayable: 0,
      cashbackEarned: 0,
      availableBalance: 0,
      newWalletBalance: 0,
      paymentMethod: null,
      paymentStatus: 'awaiting_payment',
      updatedAt: Date.now()
    })
  }
  return shopDisplaySessions.get(shopId)!
}

// ─── Main Request Handler ─────────────────────────────────────────────────────

export async function handleApiRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const pathname = url.pathname.replace(/^\/api/, '')
  const method = request.method.toUpperCase()

  if (method === 'OPTIONS') {
    return corsResponse()
  }

  if (!env.DB && !pathname.startsWith('/display')) {
    return json({
      error: 'D1 database binding "DB" is not attached to this Cloudflare Worker/Pages Function. In Cloudflare Pages Settings -> Functions -> D1 Database Bindings, ensure the binding variable name is "DB".'
    }, 503)
  }

  try {
    // ─── AUTHENTICATION ROUTES ────────────────────────────────────────────────
    if (pathname === '/auth/login' && method === 'POST') {
      const clientIp = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || 'unknown'
      if (!checkRateLimit(clientIp)) {
        return json({ error: 'Too many login attempts. Please wait 5 minutes before trying again.' }, 429)
      }

      const body = await request.json().catch(() => ({})) as any
      let { email, password } = body

      if (!email || !password) {
        return json({ error: 'Login identifier and password are required' }, 400)
      }

      const rawIdentifier = email.trim().toLowerCase()
      let cleanIdentifier = rawIdentifier

      // Normalize shop identifiers: shop1 -> shop01, shop1@01 -> shop01, shop01 -> shop01
      const shopNumMatch = rawIdentifier.match(/^shop0*([1-9]|1[0-8])(?:@.*)?$/)
      if (shopNumMatch) {
        const num = parseInt(shopNumMatch[1], 10)
        cleanIdentifier = `shop${num.toString().padStart(2, '0')}`
      }

      // Query admin_users in D1
      const user = await env.DB.prepare(`
        SELECT u.*, s.name as shop_name, s.is_active as shop_is_active
        FROM admin_users u
        LEFT JOIN shops s ON u.shop_id = s.id
        WHERE lower(u.email) = ? OR lower(u.email) = ?
      `).bind(cleanIdentifier, rawIdentifier).first() as any

      if (!user) {
        return json({ error: 'Invalid login credentials' }, 401)
      }

      // Check if shop has been disabled by Master Admin
      if (user.shop_id && user.shop_is_active === 0) {
        return json({
          error: 'This shop has been disabled by the Master Admin. Please contact the Master Admin to reopen.',
          shop_disabled: true,
          shop_id: user.shop_id,
          login_id: user.email
        }, 403)
      }

      // Check if account is locked due to 5 failed attempts
      if (user.is_locked === 1) {
        return json({
          error: 'Account locked after 5 wrong password attempts. Please contact the Master Admin to reset your password to the default password.',
          is_locked: true,
          shop_id: user.shop_id,
          login_id: user.email,
          lock_reason: user.lock_reason
        }, 423)
      }

      const inputHash = await hashPassword(password, user.salt)
      let isPasswordValid = inputHash === user.password_hash

      // Friendly fallback: support universal shop password 'Shop@1818' or 'shop@XXYY' for tenant accounts
      if (!isPasswordValid && user.role === 'admin' && user.shop_id) {
        const shopNumPad = user.shop_id.toString().padStart(2, '0')
        const expectedPattern = `shop@${shopNumPad}${shopNumPad}`
        if (password === 'Shop@1818' || password.toLowerCase() === expectedPattern || password === 'shop1818') {
          isPasswordValid = true
        }
      }

      // Handle wrong password with 5-attempt lockout policy
      if (!isPasswordValid) {
        const newFailed = (user.failed_attempts || 0) + 1
        if (newFailed >= 5) {
          await env.DB.prepare(`
            UPDATE admin_users SET
              failed_attempts = ?,
              is_locked = 1,
              lock_reason = 'EXCESSIVE_FAILED_ATTEMPTS',
              locked_at = datetime("now"),
              updated_at = datetime("now")
            WHERE id = ?
          `).bind(newFailed, user.id).run()

          return json({
            error: 'Account locked after 5 wrong password attempts. Please contact the Master Admin to reset your password to the default password.',
            is_locked: true,
            remaining_attempts: 0,
            shop_id: user.shop_id,
            login_id: user.email
          }, 423)
        } else {
          await env.DB.prepare(`
            UPDATE admin_users SET
              failed_attempts = ?,
              updated_at = datetime("now")
            WHERE id = ?
          `).bind(newFailed, user.id).run()

          const remaining = 5 - newFailed
          return json({
            error: `Invalid password. ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} remaining before lockout.`,
            is_locked: false,
            remaining_attempts: remaining,
            shop_id: user.shop_id,
            login_id: user.email
          }, 401)
        }
      }

      // Successful password check: clear any past failed attempts or locks
      if (user.failed_attempts > 0 || user.is_locked === 1) {
        await env.DB.prepare(`
          UPDATE admin_users SET
            failed_attempts = 0,
            is_locked = 0,
            lock_reason = '',
            locked_at = NULL,
            updated_at = datetime("now")
          WHERE id = ?
        `).bind(user.id).run()
      }

      const secret = getJwtSecret(env)
      const exp = Math.floor(Date.now() / 1000) + (7 * 24 * 3600) // 7 days
      const token = await createJWT(
        { sub: user.id, email: user.email, role: user.role, shop_id: user.shop_id, exp },
        secret
      )

      return json({
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          shop_id: user.shop_id,
          shop_name: user.shop_name || (user.role === 'super_admin' ? 'Master Food Court' : 'Smart Cashback Shop')
        }
      })
    }

    // ─── REQUEST SHOP UNLOCK / RESET ALERT (Shopkeeper -> Owner) ─────────────
    if (pathname === '/auth/request-unlock' && method === 'POST') {
      const body = await request.json().catch(() => ({})) as any
      const { shop_id, login_id } = body
      if (!shop_id && !login_id) {
        return json({ error: 'Shop ID or Login ID is required' }, 400)
      }

      let user: any = null
      if (shop_id) {
        user = await env.DB.prepare('SELECT id, shop_id, email FROM admin_users WHERE shop_id = ?').bind(parseInt(shop_id, 10)).first()
      } else {
        user = await env.DB.prepare('SELECT id, shop_id, email FROM admin_users WHERE lower(email) = ?').bind(login_id.toLowerCase().trim()).first()
      }

      if (!user) {
        return json({ error: 'Shop account not found' }, 404)
      }

      await env.DB.prepare(`
        UPDATE admin_users SET
          is_locked = 1,
          lock_reason = 'RESET_REQUESTED_BY_SHOP',
          locked_at = coalesce(locked_at, datetime("now")),
          updated_at = datetime("now")
        WHERE id = ?
      `).bind(user.id).run()

      return json({
        success: true,
        message: 'Password reset request has been logged. The Master Admin has been notified.'
      })
    }

    // ─── OWNER SELF-RECOVERY (PIN = 1818) ─────────────────────────────────────
    if (pathname === '/auth/owner-recovery' && method === 'POST') {
      const body = await request.json().catch(() => ({})) as any
      const { email, recovery_pin } = body

      if (!email || !recovery_pin) {
        return json({ error: 'Owner email and recovery PIN are required' }, 400)
      }

      if (email.trim().toLowerCase() !== 'sivar75@gmail.com' || recovery_pin.toString().trim() !== '1818') {
        return json({ error: 'Invalid recovery PIN or owner email.' }, 403)
      }

      const adminSalt = '6dc68d727c91a7c87408ec6480b57aac'
      const defaultOwnerHash = await hashPassword('San@1818', adminSalt)

      await env.DB.prepare(`
        UPDATE admin_users SET
          password_hash = ?,
          salt = ?,
          failed_attempts = 0,
          is_locked = 0,
          lock_reason = '',
          locked_at = NULL,
          updated_at = datetime("now")
        WHERE lower(email) = 'sivar75@gmail.com'
      `).bind(defaultOwnerHash, adminSalt).run()

      return json({
        success: true,
        message: 'Owner password has been restored to default (San@1818).'
      })
    }

    if (pathname === '/auth/session' && method === 'GET') {
      const admin = await authenticateAdmin(request, env)
      if (!admin) {
        return json({ session: null, user: null })
      }
      let shopName = 'Smart Cashback Shop'
      if (admin.shop_id) {
        const s = await env.DB.prepare('SELECT name FROM shops WHERE id = ?').bind(admin.shop_id).first() as any
        if (s?.name) shopName = s.name
      } else if (admin.role === 'super_admin') {
        shopName = 'Master Food Court'
      }

      return json({
        session: { access_token: request.headers.get('Authorization')?.replace('Bearer ', '') },
        user: { ...admin, shop_name: shopName }
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

    // ─── SHOPS PUBLIC & LIST ENDPOINTS ────────────────────────────────────────
    if (pathname === '/shops' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT id, name, slug, login_id, icon, is_active FROM shops ORDER BY id ASC').all()
      return json({ data: results || [] })
    }

    // ─── GLOBAL NAME LOOKUP BY MOBILE ─────────────────────────────────────────
    if (pathname === '/customers/lookup-name' && method === 'GET') {
      const mobile = url.searchParams.get('mobile')?.trim()
      if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) {
        return json({ found: false, name: null })
      }

      // Look across all shops to find any existing registration for this mobile
      const match = await env.DB.prepare(`
        SELECT name FROM customers
        WHERE mobile = ? AND name != '[Deleted Customer]' AND mobile NOT LIKE 'DEL%'
        ORDER BY updated_at DESC LIMIT 1
      `).bind(mobile).first() as any

      if (match?.name) {
        return json({ found: true, name: match.name })
      }
      return json({ found: false, name: null })
    }

    // ─── MULTI-SHOP PUBLIC WALLET LOOKUP ──────────────────────────────────────
    if (pathname === '/wallet/multi-lookup' && method === 'GET') {
      const mobile = url.searchParams.get('mobile')?.trim()
      if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) {
        return json({ error: 'Please enter a valid 10-digit mobile number' }, 400)
      }

      const { results } = await env.DB.prepare(`
        SELECT
          c.shop_id,
          s.name as shop_name,
          s.icon as shop_icon,
          c.name as customer_name,
          c.cashback_balance,
          c.total_purchases,
          c.cashback_earned,
          c.cashback_redeemed,
          c.updated_at
        FROM customers c
        JOIN shops s ON c.shop_id = s.id
        WHERE c.mobile = ? AND c.name != '[Deleted Customer]' AND c.mobile NOT LIKE 'DEL%'
        ORDER BY c.cashback_balance DESC, s.id ASC
      `).bind(mobile).all() as any

      const wallets = results || []
      const totalBalance = wallets.reduce((sum: number, w: any) => sum + (w.cashback_balance || 0), 0)
      const customerName = wallets[0]?.customer_name || null

      return json({
        data: {
          mobile,
          customer_name: customerName,
          total_balance: Math.round(totalBalance * 100) / 100,
          total_shops: wallets.length,
          wallets
        }
      })
    }

    // ─── HIDDEN MASTER OWNER PORTAL APIS (super_admin ONLY) ───────────────────
    if (pathname.startsWith('/owner/')) {
      const admin = await authenticateAdmin(request, env)
      if (!admin || admin.role !== 'super_admin') {
        return json({ error: 'Forbidden: Secret Master Owner access required' }, 403)
      }

      if (pathname === '/owner/overview' && method === 'GET') {
        const todayStartStr = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
        const monthStartStr = new Date(new Date().setDate(1)).toISOString()

        // 1. Aggregated totals across all 18 shops
        const totalsRow = await env.DB.prepare(`
          SELECT
            coalesce(sum(amount_paid), 0) as total_food_court_sales,
            coalesce(sum(cashback_earned), 0) as total_cashback_issued,
            coalesce(sum(cashback_redeemed), 0) as total_cashback_redeemed,
            count(*) as total_transactions
          FROM transactions
          WHERE status = 'completed'
        `).first() as any

        const todayRow = await env.DB.prepare(`
          SELECT
            coalesce(sum(amount_paid), 0) as today_food_court_sales,
            coalesce(sum(cashback_earned), 0) as today_cashback_issued,
            count(*) as today_transactions
          FROM transactions
          WHERE status = 'completed' AND created_at >= ?
        `).bind(todayStartStr).first() as any

        const custRow = await env.DB.prepare(`
          SELECT
            count(DISTINCT mobile) as unique_customers,
            count(*) as total_active_wallets,
            coalesce(sum(cashback_balance), 0) as total_wallet_liability
          FROM customers
          WHERE name != '[Deleted Customer]' AND mobile NOT LIKE 'DEL%'
        `).first() as any

        // 2. Per-Shop Summary (1 to 18)
        const { results: shopsSummary } = await env.DB.prepare(`
          SELECT
            s.id,
            s.name,
            s.slug,
            s.login_id,
            s.icon,
            s.is_active,
            coalesce(t_all.total_sales, 0) as total_sales,
            coalesce(t_all.total_transactions, 0) as total_transactions,
            coalesce(t_all.cashback_issued, 0) as cashback_issued,
            coalesce(t_all.cashback_redeemed, 0) as cashback_redeemed,
            coalesce(t_today.today_sales, 0) as today_sales,
            coalesce(c_all.customer_count, 0) as customer_count,
            coalesce(c_all.wallet_balance, 0) as wallet_balance
          FROM shops s
          LEFT JOIN (
            SELECT
              shop_id,
              sum(amount_paid) as total_sales,
              count(*) as total_transactions,
              sum(cashback_earned) as cashback_issued,
              sum(cashback_redeemed) as cashback_redeemed
            FROM transactions
            WHERE status = 'completed'
            GROUP BY shop_id
          ) t_all ON s.id = t_all.shop_id
          LEFT JOIN (
            SELECT
              shop_id,
              sum(amount_paid) as today_sales
            FROM transactions
            WHERE status = 'completed' AND created_at >= ?
            GROUP BY shop_id
          ) t_today ON s.id = t_today.shop_id
          LEFT JOIN (
            SELECT
              shop_id,
              count(*) as customer_count,
              sum(cashback_balance) as wallet_balance
            FROM customers
            WHERE name != '[Deleted Customer]' AND mobile NOT LIKE 'DEL%'
            GROUP BY shop_id
          ) c_all ON s.id = c_all.shop_id
          ORDER BY s.id ASC
        `).bind(todayStartStr).all() as any

        // 3. Category Breakdown across all shops
        const { results: categoryBreakdown } = await env.DB.prepare(`
          SELECT
            service_category as category,
            count(*) as transaction_count,
            sum(amount_paid) as total_sales,
            sum(cashback_earned) as cashback_earned
          FROM transactions
          WHERE status = 'completed'
          GROUP BY service_category
          ORDER BY total_sales DESC LIMIT 20
        `).all() as any

        // 4. Security Alerts & Password Lockout Center
        const { results: securityAlerts } = await env.DB.prepare(`
          SELECT
            u.id,
            u.shop_id,
            s.name as shop_name,
            u.email as login_id,
            u.failed_attempts,
            u.is_locked,
            u.lock_reason,
            u.locked_at
          FROM admin_users u
          JOIN shops s ON u.shop_id = s.id
          WHERE u.is_locked = 1 OR u.failed_attempts >= 3 OR u.lock_reason LIKE '%REQUESTED%'
          ORDER BY u.is_locked DESC, u.failed_attempts DESC
        `).all() as any

        // 5. Peak Hours Distribution (Hourly Transactions 0-23)
        const { results: hourlyDistribution } = await env.DB.prepare(`
          SELECT
            cast(strftime('%H', created_at) as integer) as hour,
            count(*) as tx_count,
            round(sum(amount_paid), 2) as total_sales
          FROM transactions
          WHERE status = 'completed'
          GROUP BY hour
          ORDER BY hour ASC
        `).all() as any

        // 6. Cross-Shop Customer Retention Metrics
        const { results: crossVisitStats } = await env.DB.prepare(`
          SELECT
            mobile,
            count(DISTINCT shop_id) as shops_count
          FROM customers
          WHERE name != '[Deleted Customer]' AND mobile NOT LIKE 'DEL%'
          GROUP BY mobile
        `).all() as any

        let singleShopCust = 0
        let multiShopCust = 0
        let threePlusShopCust = 0
        ;(crossVisitStats || []).forEach((c: any) => {
          if (c.shops_count === 1) singleShopCust++
          else if (c.shops_count === 2) multiShopCust++
          else if (c.shops_count >= 3) {
            multiShopCust++
            threePlusShopCust++
          }
        })

        const totalUniqueCust = (crossVisitStats || []).length
        const crossVisitRate = totalUniqueCust > 0 ? Math.round((multiShopCust / totalUniqueCust) * 100) : 0

        return json({
          data: {
            totals: {
              total_sales: totalsRow?.total_food_court_sales || 0,
              total_transactions: totalsRow?.total_transactions || 0,
              total_cashback_issued: totalsRow?.total_cashback_issued || 0,
              total_cashback_redeemed: totalsRow?.total_cashback_redeemed || 0,
              today_sales: todayRow?.today_food_court_sales || 0,
              today_transactions: todayRow?.today_transactions || 0,
              unique_customers: custRow?.unique_customers || 0,
              total_wallets: custRow?.total_active_wallets || 0,
              total_wallet_liability: custRow?.total_wallet_liability || 0
            },
            shops: shopsSummary || [],
            categoryBreakdown: categoryBreakdown || [],
            securityAlerts: securityAlerts || [],
            hourlyDistribution: hourlyDistribution || [],
            retention: {
              total_customers: totalUniqueCust,
              single_shop_customers: singleShopCust,
              multi_shop_customers: multiShopCust,
              three_plus_shop_customers: threePlusShopCust,
              cross_visit_rate: crossVisitRate
            }
          }
        })
      }

      // ─── 1-CLICK DEFAULT PASSWORD RESTORE FOR ANY SHOP ──────────────────────
      if (pathname.match(/^\/owner\/shops\/(\d+)\/reset-default-password$/) && method === 'POST') {
        const targetShopId = parseInt(pathname.split('/')[3], 10)
        const shopNumPad = targetShopId.toString().padStart(2, '0')
        const defaultPassword = `shop@${shopNumPad}${shopNumPad}`
        const adminSalt = '6dc68d727c91a7c87408ec6480b57aac'
        const defaultHash = await hashPassword(defaultPassword, adminSalt)

        await env.DB.prepare(`
          UPDATE admin_users SET
            password_hash = ?,
            salt = ?,
            failed_attempts = 0,
            is_locked = 0,
            lock_reason = '',
            locked_at = NULL,
            updated_at = datetime("now")
          WHERE shop_id = ?
        `).bind(defaultHash, adminSalt, targetShopId).run()

        const s = await env.DB.prepare('SELECT name FROM shops WHERE id = ?').bind(targetShopId).first() as any

        return json({
          success: true,
          message: `Password for Shop ${shopNumPad} (${s?.name || 'Shop'}) has been reset to default (${defaultPassword}). Account unlocked.`,
          default_password: defaultPassword
        })
      }

      // ─── CUSTOMER DIRECTORY & SHOP-WISE EXPLORER ───────────────────────────
      if (pathname === '/owner/customers' && method === 'GET') {
        const search = url.searchParams.get('search')?.trim().toLowerCase()
        const shopFilter = url.searchParams.get('shop_id')
        const mode = url.searchParams.get('mode') || (shopFilter ? 'shop' : 'customer')

        if (mode === 'customer') {
          // Mode A: Grouped by Mobile across all 18 shops
          let baseQuery = `
            SELECT
              mobile,
              max(name) as name,
              round(sum(cashback_balance), 2) as total_combined_balance,
              round(sum(cashback_earned), 2) as total_combined_earned,
              round(sum(cashback_redeemed), 2) as total_combined_redeemed,
              round(sum(total_purchases), 2) as total_combined_purchases,
              count(DISTINCT coalesce(shop_id, 18)) as total_shops_visited,
              max(updated_at) as most_recent_activity,
              max(coalesce(added_by, 'Shop')) as added_by
            FROM customers
            WHERE name != '[Deleted Customer]' AND mobile NOT LIKE 'DEL%'
          `
          const params: any[] = []

          if (search) {
            baseQuery += ' AND (lower(name) LIKE ? OR mobile LIKE ?)'
            params.push(`%${search}%`, `${search}%`)
          }

          baseQuery += ' GROUP BY mobile ORDER BY total_combined_balance DESC, most_recent_activity DESC LIMIT 100'

          const { results: customerGroups } = await env.DB.prepare(baseQuery).bind(...params).all() as any
          const customerList = customerGroups || []

          // Fetch per-shop details for each customer
          const enriched = await Promise.all(
            customerList.map(async (c: any) => {
              const { results: visitedShops } = await env.DB.prepare(`
                SELECT
                  coalesce(c.shop_id, 18) as shop_id,
                  coalesce(s.name, 'Shop 18 - Xerox & Printing Shop') as shop_name,
                  coalesce(s.icon, '🖨️') as shop_icon,
                  coalesce(c.added_by, 'Shop') as added_by,
                  c.cashback_balance,
                  c.cashback_earned,
                  c.cashback_redeemed,
                  c.total_purchases,
                  c.updated_at as last_purchase_date,
                  (
                    SELECT service_category
                    FROM transactions
                    WHERE customer_id = c.id AND shop_id = coalesce(c.shop_id, 18)
                    ORDER BY created_at DESC LIMIT 1
                  ) as recent_category
                FROM customers c
                LEFT JOIN shops s ON coalesce(c.shop_id, 18) = s.id
                WHERE c.mobile = ?
                ORDER BY s.id ASC
              `).bind(c.mobile).all() as any

              return {
                ...c,
                shops: visitedShops || []
              }
            })
          )

          return json({
            data: enriched,
            total: enriched.length,
            mode: 'customer'
          })
        } else {
          // Mode B: Shop-Wise View (Filter by shop 1..18 or all)
          let query = `
            SELECT
              c.id,
              coalesce(c.shop_id, 18) as shop_id,
              coalesce(s.name, 'Shop 18 - Xerox & Printing Shop') as shop_name,
              coalesce(s.icon, '🖨️') as shop_icon,
              coalesce(c.added_by, 'Shop') as added_by,
              c.name,
              c.mobile,
              c.cashback_balance,
              c.total_purchases,
              c.cashback_earned,
              c.cashback_redeemed,
              c.created_at,
              c.updated_at as last_purchase_date,
              (
                SELECT service_category
                FROM transactions
                WHERE customer_id = c.id AND shop_id = coalesce(c.shop_id, 18)
                ORDER BY created_at DESC LIMIT 1
              ) as recent_category
            FROM customers c
            LEFT JOIN shops s ON coalesce(c.shop_id, 18) = s.id
            WHERE c.name != '[Deleted Customer]' AND c.mobile NOT LIKE 'DEL%'
          `
          const params: any[] = []

          if (shopFilter && !isNaN(parseInt(shopFilter, 10))) {
            query += ' AND coalesce(c.shop_id, 18) = ?'
            params.push(parseInt(shopFilter, 10))
          }

          if (search) {
            query += ' AND (lower(c.name) LIKE ? OR c.mobile LIKE ?)'
            params.push(`%${search}%`, `${search}%`)
          }

          query += ' ORDER BY c.updated_at DESC LIMIT 200'

          const { results: shopCustomers } = await env.DB.prepare(query).bind(...params).all() as any

          return json({
            data: shopCustomers || [],
            total: (shopCustomers || []).length,
            mode: 'shop'
          })
        }
      }

      if (pathname === '/owner/customers' && method === 'POST') {
        const body = await request.json().catch(() => ({})) as any
        const { name, mobile, shop_id, initial_balance } = body

        if (!name || typeof name !== 'string' || !name.trim()) {
          return error('Customer name is required', 400)
        }
        const cleanMobile = (mobile || '').trim().replace(/\D/g, '')
        if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
          return error('A valid 10-digit mobile number starting with 6-9 is required', 400)
        }

        const targetShopId = shop_id && !isNaN(parseInt(shop_id, 10)) ? parseInt(shop_id, 10) : 18
        const balance = initial_balance && !isNaN(parseFloat(initial_balance)) ? Math.max(0, parseFloat(initial_balance)) : 0.0

        // Check if customer already exists for targetShopId
        const existing = await env.DB.prepare(
          'SELECT id, cashback_balance, cashback_earned FROM customers WHERE mobile = ? AND coalesce(shop_id, 18) = ?'
        ).bind(cleanMobile, targetShopId).first() as any

        const now = new Date().toISOString()
        let customerId: string

        if (existing) {
          customerId = existing.id
          if (balance > 0) {
            const newBal = Math.round((existing.cashback_balance + balance) * 100) / 100
            const newEarned = Math.round((existing.cashback_earned + balance) * 100) / 100
            const ledgerId = crypto.randomUUID()

            await env.DB.batch([
              env.DB.prepare(`
                UPDATE customers
                SET cashback_balance = ?,
                    cashback_earned = ?,
                    updated_at = ?
                WHERE id = ?
              `).bind(newBal, newEarned, now, customerId),
              env.DB.prepare(`
                INSERT INTO cashback_ledger (id, shop_id, customer_id, credit, debit, balance_after, description, created_at)
                VALUES (?, ?, ?, ?, 0.0, ?, 'Initial cashback credited by Master Admin', ?)
              `).bind(ledgerId, targetShopId, customerId, balance, newBal, now)
            ])
          }
        } else {
          customerId = crypto.randomUUID()
          const statements = [
            env.DB.prepare(`
              INSERT INTO customers (
                id, shop_id, name, mobile, total_purchases, cashback_earned, cashback_redeemed, cashback_balance, added_by, created_at, updated_at
              ) VALUES (?, ?, ?, ?, 0.0, ?, 0.0, ?, 'Master Admin', ?, ?)
            `).bind(customerId, targetShopId, name.trim(), cleanMobile, balance, balance, now, now)
          ]

          if (balance > 0) {
            const ledgerId = crypto.randomUUID()
            statements.push(
              env.DB.prepare(`
                INSERT INTO cashback_ledger (id, shop_id, customer_id, credit, debit, balance_after, description, created_at)
                VALUES (?, ?, ?, ?, 0.0, ?, 'Initial cashback credited by Master Admin', ?)
              `).bind(ledgerId, targetShopId, customerId, balance, balance, now)
            )
          }

          await env.DB.batch(statements)
        }

        // Add admin audit log
        const auditId = crypto.randomUUID()
        await env.DB.prepare(`
          INSERT INTO admin_audit_logs (id, shop_id, action, performed_by, details, created_at)
          VALUES (?, ?, 'CUSTOMER_ADDED_BY_MASTER_ADMIN', 'Master Admin', ?, ?)
        `).bind(
          auditId,
          targetShopId,
          JSON.stringify({
            customer_id: customerId,
            name: name.trim(),
            mobile: cleanMobile,
            shop_id: targetShopId,
            initial_balance: balance,
            added_by: 'Master Admin'
          }),
          now
        ).run()

        const created = await env.DB.prepare(`
          SELECT c.*, coalesce(s.name, 'Shop ' || coalesce(c.shop_id, 18)) as shop_name, coalesce(s.icon, '🏪') as shop_icon
          FROM customers c
          LEFT JOIN shops s ON coalesce(c.shop_id, 18) = s.id
          WHERE c.id = ?
        `).bind(customerId).first()

        return json({
          success: true,
          message: 'Customer added successfully by Master Admin',
          data: created
        }, 201)
      }

      if (pathname === '/owner/shops' && method === 'GET') {
        const { results: allShops } = await env.DB.prepare('SELECT * FROM shops ORDER BY id ASC').all()
        return json({ data: allShops || [] })
      }

      if (pathname.match(/^\/owner\/shops\/(\d+)$/) && method === 'PUT') {
        const targetShopId = parseInt(pathname.split('/')[3], 10)
        const body = await request.json().catch(() => ({})) as any
        const { name, is_active, new_password } = body

        if (name) {
          await env.DB.prepare('UPDATE shops SET name = ?, updated_at = datetime("now") WHERE id = ?').bind(name.trim(), targetShopId).run()
          await env.DB.prepare('UPDATE shop_settings SET shop_name = ?, merchant_display_name = ? WHERE shop_id = ?').bind(name.trim(), name.trim(), targetShopId).run()
        }

        if (is_active !== undefined) {
          await env.DB.prepare('UPDATE shops SET is_active = ?, updated_at = datetime("now") WHERE id = ?').bind(is_active ? 1 : 0, targetShopId).run()
        }

        if (new_password && new_password.length >= 6) {
          const salt = generateSalt()
          const hash = await hashPassword(newPassword, salt)
          await env.DB.prepare('UPDATE admin_users SET password_hash = ?, salt = ?, updated_at = datetime("now") WHERE shop_id = ?').bind(hash, salt, targetShopId).run()
        }

        const updated = await env.DB.prepare('SELECT * FROM shops WHERE id = ?').bind(targetShopId).first()
        return json({ success: true, data: updated })
      }
    }

    // ─── SHOP SETTINGS (TENANT ISOLATED) ──────────────────────────────────────
    if (pathname === '/settings' && method === 'GET') {
      const admin = await authenticateAdmin(request, env)
      const shopId = resolveActiveShopId(request, admin)

      let settings = await env.DB.prepare('SELECT * FROM shop_settings WHERE shop_id = ?').bind(shopId).first() as any
      if (!settings) {
        settings = await env.DB.prepare('SELECT * FROM shop_settings LIMIT 1').first()
      }
      return json({ data: settings })
    }

    if (pathname === '/settings' && method === 'PUT') {
      const admin = await authenticateAdmin(request, env)
      if (!admin) return json({ error: 'Unauthorized' }, 401)
      const shopId = resolveActiveShopId(request, admin)

      const body = await request.json().catch(() => ({})) as any
      const existing = await env.DB.prepare('SELECT * FROM shop_settings WHERE shop_id = ?').bind(shopId).first() as any

      if (existing) {
        const enableDisplay = body.enable_customer_display !== undefined
          ? (body.enable_customer_display ? 1 : 0)
          : (existing.enable_customer_display ?? 1)

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
            enable_customer_display = ?,
            updated_at = datetime("now")
          WHERE shop_id = ?
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
          enableDisplay,
          shopId
        ).run()
      } else {
        const id = crypto.randomUUID()
        const enableDisplay = body.enable_customer_display !== undefined
          ? (body.enable_customer_display ? 1 : 0)
          : 1

        await env.DB.prepare(`
          INSERT INTO shop_settings (
            id, shop_id, shop_name, shop_address, contact_number,
            cashback_percentage, minimum_eligible_purchase, currency,
            date_format, time_format, merchant_upi_id, merchant_display_name,
            qr_payment_method, payment_expiry_seconds, display_timeout_seconds,
            enable_customer_display
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          id,
          shopId,
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
          body.display_timeout_seconds || 5,
          enableDisplay
        ).run()
      }

      const updated = await env.DB.prepare('SELECT * FROM shop_settings WHERE shop_id = ?').bind(shopId).first()
      return json({ data: updated })
    }

    // ─── SERVICE CATEGORIES (TENANT ISOLATED) ─────────────────────────────────
    if (pathname === '/categories' && method === 'GET') {
      const admin = await authenticateAdmin(request, env)
      const shopId = resolveActiveShopId(request, admin)

      const { results } = await env.DB.prepare(
        'SELECT * FROM service_categories WHERE shop_id = ? ORDER BY sort_order ASC, name ASC'
      ).bind(shopId).all()
      return json({ data: results || [] })
    }

    if (pathname === '/categories' && method === 'POST') {
      const admin = await authenticateAdmin(request, env)
      if (!admin) return json({ error: 'Unauthorized' }, 401)
      const shopId = resolveActiveShopId(request, admin)

      const body = await request.json().catch(() => ({})) as any
      const { name, is_active, sort_order } = body

      if (!name || !name.trim()) {
        return json({ error: 'Category name is required' }, 400)
      }

      // Check duplicate within this shop
      const dup = await env.DB.prepare('SELECT id FROM service_categories WHERE shop_id = ? AND lower(name) = ?')
        .bind(shopId, name.trim().toLowerCase()).first()
      if (dup) {
        return json({ error: 'A category with this name already exists in this shop' }, 409)
      }

      const id = crypto.randomUUID()
      await env.DB.prepare(
        'INSERT INTO service_categories (id, shop_id, name, is_active, sort_order) VALUES (?, ?, ?, ?, ?)'
      ).bind(id, shopId, name.trim(), is_active !== false ? 1 : 0, sort_order || 0).run()

      const created = await env.DB.prepare('SELECT * FROM service_categories WHERE id = ?').bind(id).first()
      return json({ data: created }, 201)
    }

    if (pathname.match(/^\/categories\/([^/]+)$/) && method === 'PUT') {
      const admin = await authenticateAdmin(request, env)
      if (!admin) return json({ error: 'Unauthorized' }, 401)
      const shopId = resolveActiveShopId(request, admin)

      const id = pathname.split('/')[2]
      const body = await request.json().catch(() => ({})) as any
      const existing = await env.DB.prepare('SELECT * FROM service_categories WHERE id = ? AND shop_id = ?').bind(id, shopId).first() as any

      if (!existing) return json({ error: 'Category not found' }, 404)

      await env.DB.prepare(`
        UPDATE service_categories SET
          name = ?,
          is_active = ?,
          sort_order = ?
        WHERE id = ? AND shop_id = ?
      `).bind(
        body.name !== undefined ? body.name.trim() : existing.name,
        body.is_active !== undefined ? (body.is_active ? 1 : 0) : existing.is_active,
        body.sort_order !== undefined ? body.sort_order : existing.sort_order,
        id,
        shopId
      ).run()

      const updated = await env.DB.prepare('SELECT * FROM service_categories WHERE id = ?').bind(id).first()
      return json({ data: updated })
    }

    if (pathname.match(/^\/categories\/([^/]+)$/) && method === 'DELETE') {
      const admin = await authenticateAdmin(request, env)
      if (!admin) return json({ error: 'Unauthorized' }, 401)
      const shopId = resolveActiveShopId(request, admin)

      const id = pathname.split('/')[2]
      await env.DB.prepare('DELETE FROM service_categories WHERE id = ? AND shop_id = ?').bind(id, shopId).run()
      return json({ success: true })
    }

    // ─── CUSTOMERS (TENANT ISOLATED) ──────────────────────────────────────────
    if (pathname === '/customers' && method === 'GET') {
      const admin = await authenticateAdmin(request, env)
      const shopId = resolveActiveShopId(request, admin)

      const prefix = url.searchParams.get('prefix')
      const search = url.searchParams.get('search')
      const mobile = url.searchParams.get('mobile')
      const limit = parseInt(url.searchParams.get('limit') || '50', 10)
      const offset = parseInt(url.searchParams.get('offset') || '0', 10)
      const includeDeleted = url.searchParams.get('include_deleted') === 'true'

      let query = 'SELECT * FROM customers WHERE shop_id = ?'
      const params: any[] = [shopId]

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
      return json({ data: results || [] })
    }

    if (pathname.match(/^\/customers\/([^/]+)$/) && method === 'GET') {
      const admin = await authenticateAdmin(request, env)
      const shopId = resolveActiveShopId(request, admin)
      const id = pathname.split('/')[2]

      const customer = await env.DB.prepare('SELECT * FROM customers WHERE id = ? AND shop_id = ?').bind(id, shopId).first()
      if (!customer) {
        // Fallback for direct lookup by id
        const anyCust = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(id).first()
        if (!anyCust) return json({ error: 'Customer not found' }, 404)
        return json({ data: anyCust })
      }
      return json({ data: customer })
    }

    if (pathname === '/customers' && method === 'POST') {
      const admin = await authenticateAdmin(request, env)
      const shopId = resolveActiveShopId(request, admin)

      const body = await request.json().catch(() => ({})) as any
      const { name, mobile } = body

      if (!name || !name.trim()) return json({ error: 'Customer name is required' }, 400)
      if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) {
        return json({ error: 'A valid 10-digit mobile number starting with 6-9 is required' }, 400)
      }

      // Check duplicate within THIS shop
      const existing = await env.DB.prepare('SELECT id FROM customers WHERE shop_id = ? AND mobile = ?').bind(shopId, mobile).first()
      if (existing) {
        return json({ error: 'A customer with this mobile number already exists in this shop' }, 409)
      }

      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      await env.DB.prepare(`
        INSERT INTO customers (
          id, shop_id, name, mobile, total_purchases, cashback_earned, cashback_redeemed, cashback_balance, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 0.0, 0.0, 0.0, 0.0, ?, ?)
      `).bind(id, shopId, name.trim(), mobile.trim(), now, now).run()

      const created = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(id).first()
      return json({ data: created }, 201)
    }

    if (pathname.match(/^\/customers\/([^/]+)$/) && method === 'PUT') {
      const admin = await authenticateAdmin(request, env)
      const shopId = resolveActiveShopId(request, admin)

      const id = pathname.split('/')[2]
      const body = await request.json().catch(() => ({})) as any
      const { name, mobile } = body

      if (mobile && !/^[6-9]\d{9}$/.test(mobile) && !mobile.startsWith('DEL')) {
        return json({ error: 'Invalid mobile number format' }, 400)
      }

      const existing = await env.DB.prepare('SELECT * FROM customers WHERE id = ? AND shop_id = ?').bind(id, shopId).first() as any
      if (!existing) return json({ error: 'Customer not found' }, 404)

      if (mobile && mobile !== existing.mobile) {
        const dup = await env.DB.prepare('SELECT id FROM customers WHERE shop_id = ? AND mobile = ? AND id != ?').bind(shopId, mobile, id).first()
        if (dup) return json({ error: 'Mobile number already used by another customer in this shop' }, 409)
      }

      const now = new Date().toISOString()
      await env.DB.prepare(`
        UPDATE customers SET
          name = coalesce(?, name),
          mobile = coalesce(?, mobile),
          updated_at = ?
        WHERE id = ? AND shop_id = ?
      `).bind(name ? name.trim() : null, mobile ? mobile.trim() : null, now, id, shopId).run()

      const updated = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(id).first()
      return json({ data: updated })
    }

    if (pathname.match(/^\/customers\/([^/]+)$/) && method === 'DELETE') {
      const admin = await authenticateAdmin(request, env)
      if (!admin) return json({ error: 'Unauthorized' }, 401)
      const shopId = resolveActiveShopId(request, admin)

      const id = pathname.split('/')[2]
      const customer = await env.DB.prepare('SELECT * FROM customers WHERE id = ? AND shop_id = ?').bind(id, shopId).first() as any
      if (!customer) return json({ error: 'Customer not found' }, 404)

      // Count transactions for this customer in this shop
      const txCountRow = await env.DB.prepare('SELECT count(*) as count FROM transactions WHERE customer_id = ? AND shop_id = ?').bind(id, shopId).first() as any
      const txCount = txCountRow?.count || 0

      const now = new Date().toISOString()
      const auditId = crypto.randomUUID()

      if (txCount === 0) {
        // Complete hard deletion
        await env.DB.batch([
          env.DB.prepare('DELETE FROM cashback_ledger WHERE customer_id = ? AND shop_id = ?').bind(id, shopId),
          env.DB.prepare('DELETE FROM customers WHERE id = ? AND shop_id = ?').bind(id, shopId),
          env.DB.prepare(`
            INSERT INTO admin_audit_logs (id, shop_id, action, performed_by, details, created_at)
            VALUES (?, ?, 'DELETE_CUSTOMER_PURGED', ?, ?, ?)
          `).bind(auditId, shopId, admin.email, JSON.stringify({ customer_id: id, transactions_retained: 0, completely_removed: true }), now)
        ])
        return json({ success: true, customer_id: id, transactions_retained: 0, completely_removed: true })
      } else {
        // Anonymization preservation
        const anonMobile = 'DEL' + id.substring(0, 7)
        await env.DB.batch([
          env.DB.prepare('DELETE FROM cashback_ledger WHERE customer_id = ? AND shop_id = ?').bind(id, shopId),
          env.DB.prepare(`
            UPDATE customers SET
              name = '[Deleted Customer]',
              mobile = ?,
              cashback_balance = 0.0,
              total_purchases = 0.0,
              cashback_earned = 0.0,
              cashback_redeemed = 0.0,
              updated_at = ?
            WHERE id = ? AND shop_id = ?
          `).bind(anonMobile, now, id, shopId),
          env.DB.prepare(`
            UPDATE transactions SET
              notes = coalesce(notes, '') || ' (Customer account deleted)',
              updated_at = ?
            WHERE customer_id = ? AND shop_id = ?
          `).bind(now, id, shopId),
          env.DB.prepare(`
            INSERT INTO admin_audit_logs (id, shop_id, action, performed_by, details, created_at)
            VALUES (?, ?, 'DELETE_CUSTOMER', ?, ?, ?)
          `).bind(auditId, shopId, admin.email, JSON.stringify({ customer_id: id, transactions_retained: txCount, completely_removed: false }), now)
        ])
        return json({ success: true, customer_id: id, transactions_retained: txCount, completely_removed: false })
      }
    }

    if (pathname === '/customers/delete-all' && method === 'POST') {
      const admin = await authenticateAdmin(request, env)
      if (!admin) return json({ error: 'Unauthorized' }, 401)
      const shopId = resolveActiveShopId(request, admin)

      const now = new Date().toISOString()
      const auditId = crypto.randomUUID()

      // Fetch all customers and transactions strictly for THIS SHOP
      const { results: allCustomers } = await env.DB.prepare('SELECT id FROM customers WHERE shop_id = ?').bind(shopId).all() as any
      const { results: txCustomers } = await env.DB.prepare('SELECT DISTINCT customer_id FROM transactions WHERE shop_id = ?').bind(shopId).all() as any
      const txCustSet = new Set((txCustomers || []).map((t: any) => t.customer_id))

      const statements: D1PreparedStatement[] = [
        env.DB.prepare('DELETE FROM cashback_ledger WHERE shop_id = ?').bind(shopId)
      ]

      let hardDeleted = 0
      let anonymized = 0

      for (const cust of (allCustomers || [])) {
        if (!txCustSet.has(cust.id)) {
          statements.push(env.DB.prepare('DELETE FROM customers WHERE id = ? AND shop_id = ?').bind(cust.id, shopId))
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
            WHERE id = ? AND shop_id = ?
          `).bind(anonMobile, now, cust.id, shopId))
          anonymized++
        }
      }

      statements.push(env.DB.prepare(`
        INSERT INTO admin_audit_logs (id, shop_id, action, performed_by, details, created_at)
        VALUES (?, ?, 'DELETE_ALL_CUSTOMERS', ?, ?, ?)
      `).bind(auditId, shopId, admin.email, JSON.stringify({ hard_deleted: hardDeleted, anonymized }), now))

      await env.DB.batch(statements)
      return json({ success: true, hard_deleted: hardDeleted, anonymized })
    }

    // ─── BILLING: SERVER-SIDE TRANSACTIONAL PROCESS (TENANT ISOLATED) ──────────
    if (pathname === '/billing/process' && method === 'POST') {
      const admin = await authenticateAdmin(request, env)
      const shopId = resolveActiveShopId(request, admin)

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

      // UPI verification check
      if (payment_method === 'upi' && !payment_verified && !notes?.includes('Payment: UPI (Verified)')) {
        return json({
          error: 'UPI payment receipt must be verified by the merchant before completing the transaction.'
        }, 400)
      }

      // 1. Idempotency check
      if (idempotency_key) {
        const existingTx = await env.DB.prepare('SELECT * FROM transactions WHERE idempotency_key = ?').bind(idempotency_key).first()
        if (existingTx) {
          const updatedCustomer = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(customer_id).first()
          return json({ success: true, transaction: existingTx, customer: updatedCustomer, idempotent: true })
        }
      }

      // 2. Fetch customer (with shop fallback)
      let customer = await env.DB.prepare('SELECT * FROM customers WHERE id = ? AND shop_id = ?').bind(customer_id, shopId).first() as any
      if (!customer) {
        customer = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(customer_id).first() as any
      }
      if (!customer) return json({ error: 'Customer not found' }, 404)

      // 3. Fetch shop settings
      let settings = await env.DB.prepare('SELECT * FROM shop_settings WHERE shop_id = ?').bind(shopId).first() as any
      if (!settings) {
        settings = await env.DB.prepare('SELECT * FROM shop_settings LIMIT 1').first() as any
      }
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

      const expectedPayable = Math.round(Math.max(0, billAmt - cbRedeemed) * 100) / 100
      if (Math.abs(amtPaid - expectedPayable) > 0.01) {
        return json({
          error: `Amount paid ₹${amtPaid} does not match expected amount ₹${expectedPayable} (Bill: ₹${billAmt} - Redeemed: ₹${cbRedeemed})`
        }, 400)
      }

      // 5. Calculate cashback earned: 2% on net paid if bill >= minPurchase
      let calcCashback = 0
      if (billAmt >= minPurchase) {
        calcCashback = Math.round(amtPaid * (cbPercentage / 100) * 100) / 100
      }

      // 6. Calculate new balances
      const balanceAfterRedemption = Math.round((customer.cashback_balance - cbRedeemed) * 100) / 100
      const newBalance = Math.round((balanceAfterRedemption + calcCashback) * 100) / 100
      const newPurchases = Math.round((customer.total_purchases + amtPaid) * 100) / 100
      const newEarned = Math.round((customer.cashback_earned + calcCashback) * 100) / 100
      const newRedeemed = Math.round((customer.cashback_redeemed + cbRedeemed) * 100) / 100

      const txId = crypto.randomUUID()
      const now = new Date().toISOString()
      const batchStatements: D1PreparedStatement[] = []

      // Create transaction record
      batchStatements.push(env.DB.prepare(`
        INSERT INTO transactions (
          id, shop_id, customer_id, service_category, bill_amount,
          cashback_redeemed, amount_paid, cashback_earned,
          status, notes, payment_method, idempotency_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?)
      `).bind(
        txId, shopId, customer_id, service_category, billAmt,
        cbRedeemed, amtPaid, calcCashback,
        notes || null, payment_method || 'cash', idempotency_key || null, now, now
      ))

      // Update customer balance
      batchStatements.push(env.DB.prepare(`
        UPDATE customers SET
          total_purchases = ?,
          cashback_earned = ?,
          cashback_redeemed = ?,
          cashback_balance = ?,
          updated_at = ?
        WHERE id = ?
      `).bind(newPurchases, newEarned, newRedeemed, newBalance, now, customer_id))

      // Record debit in ledger if cashback was redeemed
      if (cbRedeemed > 0) {
        const debitId = crypto.randomUUID()
        batchStatements.push(env.DB.prepare(`
          INSERT INTO cashback_ledger (
            id, shop_id, customer_id, transaction_id, credit, debit, balance_after, description, created_at
          ) VALUES (?, ?, ?, ?, 0.0, ?, ?, ?, ?)
        `).bind(
          debitId, shopId, customer_id, txId, cbRedeemed, balanceAfterRedemption,
          `Redeemed on bill #${txId.substring(0, 8)}`, now
        ))
      }

      // Record credit in ledger if cashback was earned
      if (calcCashback > 0) {
        const creditId = crypto.randomUUID()
        batchStatements.push(env.DB.prepare(`
          INSERT INTO cashback_ledger (
            id, shop_id, customer_id, transaction_id, credit, debit, balance_after, description, created_at
          ) VALUES (?, ?, ?, ?, ?, 0.0, ?, ?, ?)
        `).bind(
          creditId, shopId, customer_id, txId, calcCashback, newBalance,
          `Cashback earned on ${service_category} (₹${amtPaid} paid)`, now
        ))
      }

      await env.DB.batch(batchStatements)

      const updatedCustomer = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(customer_id).first()
      const createdTx = await env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(txId).first()

      return json({
        success: true,
        transaction: createdTx,
        customer: updatedCustomer
      })
    }

    // ─── TRANSACTION CANCELLATION & REVERSAL (TENANT ISOLATED) ────────────────
    if (pathname.match(/^\/transactions\/([^/]+)\/cancel$/) && method === 'POST') {
      const admin = await authenticateAdmin(request, env)
      if (!admin) return json({ error: 'Unauthorized' }, 401)
      const shopId = resolveActiveShopId(request, admin)

      const txId = pathname.split('/')[2]
      const tx = await env.DB.prepare('SELECT * FROM transactions WHERE id = ? AND shop_id = ?').bind(txId, shopId).first() as any
      if (!tx) return json({ error: 'Transaction not found in this shop' }, 404)
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
            id, shop_id, customer_id, transaction_id, credit, debit, balance_after, description, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          reversalLedgerId, shopId, tx.customer_id, txId,
          tx.cashback_redeemed, tx.cashback_earned, newBal,
          `Reversal for cancelled transaction #${txId}`, now
        )
      ])

      const updatedCustomer = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(tx.customer_id).first()
      return json({ success: true, customer: updatedCustomer })
    }

    // ─── TRANSACTIONS & LEDGER (TENANT ISOLATED) ──────────────────────────────
    if (pathname === '/transactions' && method === 'GET') {
      const admin = await authenticateAdmin(request, env)
      const shopId = resolveActiveShopId(request, admin)

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
        WHERE t.shop_id = ?
      `
      const params: any[] = [shopId]

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
      return json({ data: results || [] })
    }

    if (pathname === '/ledger' && method === 'GET') {
      const customerId = url.searchParams.get('customer_id')
      if (!customerId) return json({ error: 'customer_id is required' }, 400)

      const admin = await authenticateAdmin(request, env)
      const shopId = resolveActiveShopId(request, admin)

      const { results } = await env.DB.prepare(
        'SELECT * FROM cashback_ledger WHERE customer_id = ? AND shop_id = ? ORDER BY created_at DESC'
      ).bind(customerId, shopId).all()
      return json({ data: results || [] })
    }

    // ─── DASHBOARD STATS (TENANT ISOLATED) ────────────────────────────────────
    if (pathname === '/dashboard/stats' && method === 'GET') {
      const admin = await authenticateAdmin(request, env)
      const shopId = resolveActiveShopId(request, admin)

      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayStartStr = todayStart.toISOString()

      // Today's completed transactions for this shop
      const todayRow = await env.DB.prepare(`
        SELECT
          coalesce(sum(amount_paid), 0) as today_sales,
          coalesce(sum(cashback_earned), 0) as today_cashback,
          count(*) as today_tx_count
        FROM transactions
        WHERE shop_id = ? AND status = 'completed' AND created_at >= ?
      `).bind(shopId, todayStartStr).first() as any

      // Month's sales for this shop
      const monthStart = new Date()
      monthStart.setDate(1)
      monthStart.setHours(0, 0, 0, 0)
      const monthStartStr = monthStart.toISOString()

      const monthRow = await env.DB.prepare(`
        SELECT coalesce(sum(amount_paid), 0) as month_sales
        FROM transactions
        WHERE shop_id = ? AND status = 'completed' AND created_at >= ?
      `).bind(shopId, monthStartStr).first() as any

      // Total active customers for this shop
      const custRow = await env.DB.prepare(`
        SELECT count(*) as total_customers, coalesce(sum(cashback_balance), 0) as total_wallet_balance
        FROM customers
        WHERE shop_id = ? AND name != '[Deleted Customer]' AND mobile NOT LIKE 'DEL%'
      `).bind(shopId).first() as any

      // All-time totals for this shop
      const allTimeRow = await env.DB.prepare(`
        SELECT
          coalesce(sum(amount_paid), 0) as total_sales,
          coalesce(sum(cashback_earned), 0) as total_cashback_earned,
          coalesce(sum(cashback_redeemed), 0) as total_cashback_redeemed,
          count(*) as total_transactions
        FROM transactions
        WHERE shop_id = ? AND status = 'completed'
      `).bind(shopId).first() as any

      // Recent 10 transactions for this shop
      const { results: recentTransactions } = await env.DB.prepare(`
        SELECT t.*, c.name as customer_name, c.mobile as customer_mobile
        FROM transactions t
        LEFT JOIN customers c ON t.customer_id = c.id
        WHERE t.shop_id = ?
        ORDER BY t.created_at DESC LIMIT 10
      `).bind(shopId).all()

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

    // ─── DUAL SCREEN CUSTOMER DISPLAY STATE (PER-SHOP ISOLATED) ───────────────
    if (pathname === '/display/session' && method === 'GET') {
      const admin = await authenticateAdmin(request, env)
      const shopId = resolveActiveShopId(request, admin)
      let shopName = 'Smart Cashback'
      const s = await env.DB?.prepare('SELECT name FROM shops WHERE id = ?').bind(shopId).first() as any
      if (s?.name) shopName = s.name
      return json({ data: getDisplaySession(shopId, shopName) })
    }

    if (pathname === '/display/session' && method === 'POST') {
      const admin = await authenticateAdmin(request, env)
      const body = await request.json().catch(() => ({})) as any
      const shopId = body.shopId || resolveActiveShopId(request, admin)

      const session = getDisplaySession(shopId)
      const updated = {
        ...session,
        ...body,
        shopId,
        updatedAt: Date.now()
      }
      shopDisplaySessions.set(shopId, updated)
      return json({ data: updated })
    }

    if (pathname === '/display/reset' && method === 'POST') {
      const admin = await authenticateAdmin(request, env)
      const body = await request.json().catch(() => ({})) as any
      const shopId = body.shopId || resolveActiveShopId(request, admin)

      let shopName = 'Smart Cashback'
      const s = await env.DB?.prepare('SELECT name FROM shops WHERE id = ?').bind(shopId).first() as any
      if (s?.name) shopName = s.name

      const resetSession = {
        sessionId: `sess_shop_${shopId}_${Date.now()}`,
        shopId,
        mode: 'welcome',
        customerName: '',
        customerMobile: '',
        shopName,
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
      shopDisplaySessions.set(shopId, resetSession)
      return json({ success: true, data: resetSession })
    }

    // ─── R2 STORAGE: DATABASE EXPORT & BACKUPS ────────────────────────────────
    if (pathname === '/storage/backup' && method === 'POST') {
      const admin = await authenticateAdmin(request, env)
      if (!admin) return json({ error: 'Unauthorized' }, 401)

      const [
        { results: shops },
        { results: customers },
        { results: transactions },
        { results: ledger },
        { results: settings },
        { results: categories }
      ] = await Promise.all([
        env.DB.prepare('SELECT * FROM shops').all(),
        env.DB.prepare('SELECT * FROM customers').all(),
        env.DB.prepare('SELECT * FROM transactions').all(),
        env.DB.prepare('SELECT * FROM cashback_ledger').all(),
        env.DB.prepare('SELECT * FROM shop_settings').all(),
        env.DB.prepare('SELECT * FROM service_categories').all()
      ])

      const backupData = {
        timestamp: new Date().toISOString(),
        engine: 'Cloudflare D1 Multi-Tenant',
        counts: {
          shops: shops.length,
          customers: customers.length,
          transactions: transactions.length,
          cashback_ledger: ledger.length,
          shop_settings: settings.length,
          service_categories: categories.length
        },
        shops,
        customers,
        transactions,
        cashback_ledger: ledger,
        shop_settings: settings,
        service_categories: categories
      }

      const backupJson = JSON.stringify(backupData, null, 2)
      const filename = `backups/backup_${Date.now()}.json`

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
