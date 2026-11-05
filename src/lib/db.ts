/**
 * Smart Cashback – Cloudflare D1 & Workers Client
 * Direct typed client and query builder for Cloudflare native backend.
 */

import { cloudflareApi } from './api'
import { cloudflareAdapter } from './cloudflareAdapter'

export const api = cloudflareApi
export const db = cloudflareAdapter
export default db

