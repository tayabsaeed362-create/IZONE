'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  CreditCard, Plus, ArrowLeft, Calendar, Tag, AlertCircle,
  TrendingDown, CheckCircle2, X, Filter,
} from 'lucide-react'

type Expense = {
  id: string
  category: string
  amount: number
  description: string | null
  expenseAt: string
  user: { name: string } | null
}

type CategorySummary = {
  category: string
  amount: number
  count: number
}

const EXPENSE_CATEGORIES = [
  'Shop Rent',
  'Electricity Bill',
  'Internet & Phone',
  'Staff Salary',
  'Transportation & Cargo',
  'Packaging & Supplies',
  'Tea & Refreshments',
  'Maintenance & Repairs',
  'Other Expense',
]

import { useSession } from 'next-auth/react'

function formatCurrency(n: number) {
  return `₨${Math.round(n).toLocaleString()}`
}

export default function ExpensesPage() {
  const { data: session, status } = useSession()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<CategorySummary[]>([])
  const [totalAmount, setTotalAmount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Form fields
  const [formCategory, setFormCategory] = useState(EXPENSE_CATEGORIES[0])
  const [formAmount, setFormAmount] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10))

  async function loadExpenses() {
    setLoading(true)
    try {
      let url = '/api/expenses'
      if (selectedCategory) {
        url += `?category=${encodeURIComponent(selectedCategory)}`
      }
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setExpenses(data.data.expenses)
          setCategories(data.data.categoryBreakdown)
          setTotalAmount(data.data.totalAmount)
        }
      }
    } catch (err) {
      console.error('Failed to load expenses:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadExpenses()
  }, [selectedCategory])

  async function handleCreateExpense(e: React.FormEvent) {
    e.preventDefault()
    const amt = parseFloat(formAmount)
    if (isNaN(amt) || amt <= 0) {
      setErrorMsg('Enter a valid expense amount')
      return
    }

    setSubmitting(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: formCategory,
          amount: amt,
          description: formDescription.trim() || null,
          expenseAt: new Date(formDate).toISOString(),
        }),
      })

      const data = await res.json()
      if (data.success) {
        setShowModal(false)
        setFormAmount('')
        setFormDescription('')
        setSuccessMsg(`Expense of ${formatCurrency(amt)} recorded successfully`)
        loadExpenses()
        setTimeout(() => setSuccessMsg(''), 4000)
      } else {
        setErrorMsg(data.error?.message || 'Failed to record expense')
      }
    } catch {
      setErrorMsg('Network error while saving expense')
    } finally {
      setSubmitting(false)
    }
  }

  if (status !== 'loading' && session?.user && session.user.role !== 'OWNER') {
    return (
      <div className="p-8 max-w-md mx-auto text-center space-y-4 my-12 bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle size={24} />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Access Restricted</h2>
        <p className="text-sm text-slate-600">Expenses management is restricted to Store Owners only.</p>
        <Link href="/pos" className="btn-primary inline-flex items-center gap-2">
          Go to Point of Sale
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="p-2 -ml-2 text-slate-500 hover:text-slate-800 rounded-lg">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">Shop Expenses</h1>
              <p className="text-xs text-slate-500">Track overheads, rent, salaries & operational costs</p>
            </div>
          </div>
          <button
            onClick={() => {
              setErrorMsg('')
              setShowModal(true)
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
          >
            <Plus size={16} />
            <span>Record Expense</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5 space-y-5">
        {successMsg && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Total Expense Metric Card */}
        <div className="bg-gradient-to-r from-rose-900 to-slate-900 text-white rounded-2xl p-5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-rose-300 text-xs font-semibold uppercase tracking-wider mb-1">
              <TrendingDown size={15} /> Total Recorded Expenses
            </div>
            <div className="text-3xl font-extrabold">{formatCurrency(totalAmount)}</div>
            <div className="text-xs text-slate-300 mt-1">{expenses.length} expense entries recorded</div>
          </div>

          {/* Category breakdown pill list */}
          <div className="flex flex-wrap gap-2 max-w-lg">
            {categories.slice(0, 4).map(c => (
              <div
                key={c.category}
                className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl px-3 py-1.5 text-xs"
              >
                <div className="text-[10px] text-slate-300">{c.category}</div>
                <div className="font-bold text-white">{formatCurrency(c.amount)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedCategory('')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
              selectedCategory === ''
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            All Categories
          </button>
          {EXPENSE_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Expenses List */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <CreditCard size={16} className="text-rose-500" />
              Expense Transactions
            </h2>
            <span className="text-xs text-slate-400 font-medium">{expenses.length} records</span>
          </div>

          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-16">
              <CreditCard className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No Expenses Recorded</p>
              <p className="text-xs text-slate-400 mt-1 mb-4">Record rent, utility bills, or staff salaries for accurate net profit calculation.</p>
              <button
                onClick={() => setShowModal(true)}
                className="px-4 py-2 bg-rose-600 text-white text-xs font-semibold rounded-xl"
              >
                Record First Expense
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {expenses.map(e => (
                <div key={e.id} className="p-4 sm:p-5 hover:bg-slate-50/70 transition-colors flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-xs shrink-0">
                      <Tag size={16} />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{e.category}</div>
                      {e.description && (
                        <p className="text-xs text-slate-500 line-clamp-1">{e.description}</p>
                      )}
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Calendar size={11} /> {new Date(e.expenseAt).toLocaleDateString('en-PK')}
                        </span>
                        {e.user && (
                          <span>Recorded by {e.user.name}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="font-bold text-rose-600 text-base font-mono">
                    -{formatCurrency(e.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Record Expense Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="font-bold text-slate-900 text-sm">Record Shop Expense</h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateExpense} className="p-5 space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-600 flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Expense Category *</label>
                <select
                  value={formCategory}
                  onChange={e => setFormCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  {EXPENSE_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (PKR) *</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  placeholder="e.g. 25000"
                  value={formAmount}
                  onChange={e => setFormAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={e => setFormDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description / Receipt Note</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Electricity bill paid for October 2024"
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs resize-none focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-sm disabled:opacity-50"
                >
                  {submitting ? 'Recording...' : 'Record Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
