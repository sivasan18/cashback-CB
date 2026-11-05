import { useState, useCallback } from 'react'
import { Download, BarChart3, Filter } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/cashback'
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'
import toast from 'react-hot-toast'
import type { Transaction } from '@/types'

type ReportType = 'daily' | 'weekly' | 'monthly' | 'custom' | 'cashback_issued' | 'cashback_redeemed' | 'outstanding'

interface ReportRow extends Transaction {
  customer_name: string
  customer_mobile: string
}

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>('daily')
  const [fromDate, setFromDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [toDate, setToDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(false)
  const [hasRun, setHasRun] = useState(false)

  const getDateRange = useCallback((): [string, string] => {
    const now = new Date()
    switch (reportType) {
      case 'daily': return [startOfDay(now).toISOString(), endOfDay(now).toISOString()]
      case 'weekly': return [startOfWeek(now, { weekStartsOn: 1 }).toISOString(), endOfWeek(now, { weekStartsOn: 1 }).toISOString()]
      case 'monthly': return [startOfMonth(now).toISOString(), endOfMonth(now).toISOString()]
      case 'custom':
      case 'cashback_issued':
      case 'cashback_redeemed':
      case 'outstanding': {
        const [fy, fm, fd] = fromDate.split('-').map(Number)
        const [ty, tm, td] = toDate.split('-').map(Number)
        const start = new Date(fy, fm - 1, fd, 0, 0, 0, 0).toISOString()
        const end = new Date(ty, tm - 1, td, 23, 59, 59, 999).toISOString()
        return [start, end]
      }
    }
  }, [reportType, fromDate, toDate])

  const runReport = useCallback(async () => {
    setLoading(true)
    setHasRun(true)
    const [from, to] = getDateRange()

    let query = supabase
      .from('transactions')
      .select('*, customers(name, mobile)')
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: false })

    if (reportType === 'cashback_issued') {
      query = query.gt('cashback_earned', 0)
    } else if (reportType === 'cashback_redeemed') {
      query = query.gt('cashback_redeemed', 0)
    }

    if (reportType !== 'outstanding') {
      query = query.eq('status', 'completed')
    }

    const { data, error } = await query.limit(500)
    if (error) {
      toast.error('Failed to load report')
      setLoading(false)
      return
    }

    setRows(
      ((data ?? []) as Record<string, unknown>[]).map(t => ({
        ...t,
        customer_name: ((t.customers as { name: string } | null)?.name) ?? 'Unknown',
        customer_mobile: ((t.customers as { mobile: string } | null)?.mobile) ?? '',
      })) as ReportRow[]
    )
    setLoading(false)
  }, [getDateRange, reportType])

  const exportCSV = () => {
    if (rows.length === 0) {
      toast.error('No data to export')
      return
    }
    const headers = ['Date', 'Customer', 'Mobile', 'Service', 'Bill Amount', 'Cashback Redeemed', 'Amount Paid', 'Cashback Earned', 'Status']
    const csvRows = rows.map(r => [
      format(new Date(r.created_at), 'dd/MM/yyyy HH:mm'),
      r.customer_name,
      r.customer_mobile,
      r.service_category,
      r.bill_amount.toFixed(2),
      r.cashback_redeemed.toFixed(2),
      r.amount_paid.toFixed(2),
      r.cashback_earned.toFixed(2),
      r.status,
    ])
    const csv = [headers, ...csvRows].map(row => row.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `smart-cashback-report-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Report exported successfully')
  }

  const totals = {
    sales: rows.reduce((s, r) => s + r.amount_paid, 0),
    cashbackIssued: rows.reduce((s, r) => s + r.cashback_earned, 0),
    cashbackRedeemed: rows.reduce((s, r) => s + r.cashback_redeemed, 0),
    bills: rows.reduce((s, r) => s + r.bill_amount, 0),
  }

  const REPORT_TYPES: { value: ReportType; label: string }[] = [
    { value: 'daily', label: "Today's Sales" },
    { value: 'weekly', label: 'This Week' },
    { value: 'monthly', label: 'This Month' },
    { value: 'custom', label: 'Custom Range' },
    { value: 'cashback_issued', label: 'Cashback Issued' },
    { value: 'cashback_redeemed', label: 'Cashback Redeemed' },
    { value: 'outstanding', label: 'All Transactions' },
  ]

  return (
    <div className="space-y-6">
      <div className="section-header">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <BarChart3 size={22} className="text-brand-600 dark:text-brand-400" /> Reports
          </h1>
          <p className="section-subtitle">Sales revenue, cashback issuance and transaction audit logs</p>
        </div>
        {rows.length > 0 && (
          <button onClick={exportCSV} className="btn-secondary">
            <Download size={16} /> Export CSV
          </button>
        )}
      </div>

      {/* Filter panel */}
      <div className="page-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <Filter size={14} className="text-brand-600 dark:text-brand-400" /> Report Filters
        </h2>
        <div className="flex flex-wrap gap-2">
          {REPORT_TYPES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setReportType(value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                reportType === value
                  ? 'bg-brand-600 text-white border-brand-600 dark:bg-brand-500 shadow-sm'
                  : 'bg-white dark:bg-dark-850 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-dark-700 hover:border-brand-400 dark:hover:border-brand-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {(reportType === 'custom' || reportType === 'cashback_issued' || reportType === 'cashback_redeemed' || reportType === 'outstanding') && (
          <div className="flex flex-wrap gap-3 items-end pt-1">
            <div>
              <label className="form-label">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="form-input"
                max={toDate}
              />
            </div>
            <div>
              <label className="form-label">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="form-input"
                min={fromDate}
                max={format(new Date(), 'yyyy-MM-dd')}
              />
            </div>
          </div>
        )}

        <button onClick={runReport} className="btn-primary" disabled={loading}>
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Loading…
            </span>
          ) : 'Run Report'}
        </button>
      </div>

      {/* Summary cards */}
      {hasRun && !loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
          {[
            { label: 'Total Sales', value: formatCurrency(totals.sales), className: 'text-brand-700 dark:text-brand-300' },
            { label: 'Cashback Issued', value: formatCurrency(totals.cashbackIssued), className: 'text-brand-600 dark:text-brand-400' },
            { label: 'Cashback Redeemed', value: formatCurrency(totals.cashbackRedeemed), className: 'text-slate-700 dark:text-slate-300' },
            { label: 'Transactions', value: rows.length.toString(), className: 'text-brand-800 dark:text-brand-200' },
          ].map(({ label, value, className }, i) => (
            <div key={i} className="stat-card">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{label}</p>
              <p className={`text-xl font-bold mt-1 ${className}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Results table */}
      {hasRun && !loading && (
        <div className="page-card overflow-x-auto animate-fade-in">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer</th>
                <th>Mobile</th>
                <th>Service</th>
                <th>Bill Amount</th>
                <th>Redeemed</th>
                <th>Paid</th>
                <th>Earned</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400 text-sm">
                    No transactions found for the selected period.
                  </td>
                </tr>
              )}
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="text-xs font-mono text-slate-500">
                    {format(new Date(r.created_at), 'dd/MM/yyyy HH:mm')}
                  </td>
                  <td className="font-semibold text-slate-900 dark:text-white text-xs">{r.customer_name}</td>
                  <td className="font-mono text-xs text-slate-500">{r.customer_mobile}</td>
                  <td className="text-xs text-slate-800 dark:text-slate-200">{r.service_category}</td>
                  <td className="text-xs font-medium">{formatCurrency(r.bill_amount)}</td>
                  <td className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                    {r.cashback_redeemed > 0 ? `−${formatCurrency(r.cashback_redeemed)}` : '—'}
                  </td>
                  <td className="text-xs font-bold text-slate-900 dark:text-white">{formatCurrency(r.amount_paid)}</td>
                  <td className="text-xs text-brand-600 dark:text-brand-400 font-semibold">+{formatCurrency(r.cashback_earned)}</td>
                  <td>
                    <span className={`badge ${r.status === 'completed' ? 'badge-green' : r.status === 'cancelled' ? 'badge-red' : 'badge-yellow'}`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
