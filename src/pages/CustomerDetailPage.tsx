import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Receipt, Wallet, Gift, ShoppingBag, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/cashback'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import type { Customer, Transaction, CashbackLedger } from '@/types'

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [ledger, setLedger] = useState<CashbackLedger[]>([])
  const [tab, setTab] = useState<'transactions' | 'ledger'>('transactions')
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const [custRes, txRes, ledgerRes] = await Promise.all([
      supabase.from('customers').select('*').eq('id', id).single(),
      supabase.from('transactions').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
      supabase.from('cashback_ledger').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
    ])
    setCustomer(custRes.data as Customer)
    setTransactions((txRes.data as Transaction[]) ?? [])
    setLedger((ledgerRes.data as CashbackLedger[]) ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleCancelTx = async (tx: Transaction) => {
    if (tx.status !== 'completed') return
    if (!confirm('Cancel this transaction? A reversal entry will be created.')) return

    const { error } = await supabase.rpc('cancel_transaction', { p_transaction_id: tx.id })
    if (error) {
      toast.error('Failed to cancel: ' + error.message)
      return
    }
    toast.success('Transaction cancelled and cashback reversed')
    fetchData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="text-center py-16 text-slate-400">
        Customer not found.{' '}
        <button onClick={() => navigate('/customers')} className="text-brand-600 dark:text-brand-400 hover:underline">
          Go back
        </button>
      </div>
    )
  }

  const stats = [
    { label: 'Total Purchases', value: formatCurrency(customer.total_purchases), icon: ShoppingBag, color: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-dark-800' },
    { label: 'Cashback Earned', value: formatCurrency(customer.cashback_earned), icon: Gift, color: 'text-brand-600 dark:text-brand-400', bg: 'bg-brand-50 dark:bg-brand-950/40 border border-brand-100 dark:border-brand-900/60' },
    { label: 'Cashback Used', value: formatCurrency(customer.cashback_redeemed), icon: Receipt, color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-dark-800' },
    { label: 'Available Balance', value: formatCurrency(customer.cashback_balance), icon: Wallet, color: 'text-brand-700 dark:text-brand-300', bg: 'bg-brand-100/50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-800' },
  ]

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/customers')} className="btn-icon">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="section-title">{customer.name}</h1>
          <p className="section-subtitle">
            {customer.mobile} · Customer since {format(new Date(customer.created_at), 'dd MMMM yyyy')}
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={`rounded-2xl p-4 ${bg} flex flex-col gap-2 shadow-sm`}>
            <Icon size={18} className={color} />
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{label}</p>
            <p className={`text-lg font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-dark-800">
        {(['transactions', 'ledger'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-semibold capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'text-brand-600 dark:text-brand-400 border-brand-600 dark:border-brand-400'
                : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {t === 'transactions' ? 'Transactions' : 'Cashback Ledger'}
          </button>
        ))}
      </div>

      {/* Transactions table */}
      {tab === 'transactions' && (
        <div className="page-card overflow-x-auto animate-fade-in">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Service</th>
                <th>Bill Amount</th>
                <th>Redeemed</th>
                <th>Paid</th>
                <th>Cashback</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400 text-sm">
                    No transactions recorded yet.
                  </td>
                </tr>
              )}
              {transactions.map(tx => (
                <tr key={tx.id}>
                  <td className="text-xs font-mono text-slate-500">
                    {format(new Date(tx.created_at), 'dd MMM yyyy, hh:mm a')}
                  </td>
                  <td className="text-xs font-medium text-slate-900 dark:text-slate-200">
                    {tx.service_category}
                  </td>
                  <td className="text-xs font-medium">{formatCurrency(tx.bill_amount)}</td>
                  <td className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                    {tx.cashback_redeemed > 0 ? `−${formatCurrency(tx.cashback_redeemed)}` : '—'}
                  </td>
                  <td className="text-xs font-bold text-slate-900 dark:text-white">
                    {formatCurrency(tx.amount_paid)}
                  </td>
                  <td className="text-xs text-brand-600 dark:text-brand-400 font-semibold">
                    +{formatCurrency(tx.cashback_earned)}
                  </td>
                  <td>
                    <span className={`badge ${tx.status === 'completed' ? 'badge-green' : tx.status === 'cancelled' ? 'badge-red' : 'badge-yellow'}`}>
                      {tx.status}
                    </span>
                  </td>
                  <td>
                    {tx.status === 'completed' && (
                      <button
                        onClick={() => handleCancelTx(tx)}
                        className="btn-icon text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        title="Cancel transaction"
                      >
                        <XCircle size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Ledger table */}
      {tab === 'ledger' && (
        <div className="page-card overflow-x-auto animate-fade-in">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Credit</th>
                <th>Debit</th>
                <th>Balance After</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-400 text-sm">
                    No ledger entries recorded yet.
                  </td>
                </tr>
              )}
              {ledger.map(entry => (
                <tr key={entry.id}>
                  <td className="text-xs font-mono text-slate-500">
                    {format(new Date(entry.created_at), 'dd MMM yyyy, hh:mm a')}
                  </td>
                  <td className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                    {entry.description}
                  </td>
                  <td className="text-xs text-brand-600 dark:text-brand-400 font-semibold">
                    {entry.credit > 0 ? `+${formatCurrency(entry.credit)}` : '—'}
                  </td>
                  <td className="text-xs text-rose-500 dark:text-rose-400 font-semibold">
                    {entry.debit > 0 ? `−${formatCurrency(entry.debit)}` : '—'}
                  </td>
                  <td className="text-xs font-bold text-slate-900 dark:text-white">
                    {formatCurrency(entry.balance_after)}
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
