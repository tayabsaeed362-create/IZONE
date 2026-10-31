'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  RotateCcw, Search, ArrowLeft, AlertCircle, CheckCircle2,
  Receipt, ShieldAlert, Package, Calendar, User, X,
} from 'lucide-react'
import { useSession } from 'next-auth/react'

type SaleItem = {
  id: string
  productId: string
  variantId: string | null
  productName: string
  sku: string
  quantity: number
  unitPrice: number
  totalAmount: number
}

type SaleLookupResult = {
  id: string
  saleNumber: string
  saleAt: string
  status: string
  totalAmount: number
  customer: { name: string; phone: string | null } | null
  items: SaleItem[]
}

type ReturnRecord = {
  id: string
  reason: string
  totalAmount: number
  refundMethod: string
  createdAt: string
  sale: {
    saleNumber: string
    customer: { name: string } | null
  }
  items: Array<{
    id: string
    productName: string
    quantity: number
    unitPrice: number
    totalAmount: number
  }>
}

function formatCurrency(n: number) {
  return `₨${Math.round(n).toLocaleString()}`
}

export default function ReturnsPage() {
  const { data: session, status } = useSession()
  const [returnHistory, setReturnHistory] = useState<ReturnRecord[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  // Invoice lookup state
  const [invoiceQuery, setInvoiceQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [lookedUpSale, setLookedUpSale] = useState<SaleLookupResult | null>(null)
  const [lookupError, setLookupError] = useState('')

  // Return form state
  const [returnReason, setReturnReason] = useState('')
  const [refundMethod, setRefundMethod] = useState<'CASH' | 'CARD' | 'MOBILE_WALLET' | 'CREDIT'>('CASH')
  const [returnSelections, setReturnSelections] = useState<
    Record<string, { quantity: number; isDamaged: boolean }>
  >({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  async function fetchReturns() {
    setLoadingHistory(true)
    try {
      const res = await fetch('/api/returns')
      if (res.ok) {
        const d = await res.json()
        if (d.success) setReturnHistory(d.data.returns)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    fetchReturns()
  }, [])

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault()
    if (!invoiceQuery.trim()) return

    setSearching(true)
    setLookupError('')
    setLookedUpSale(null)
    setReturnSelections({})
    try {
      const res = await fetch(`/api/sales?search=${encodeURIComponent(invoiceQuery.trim())}`)
      if (res.ok) {
        const d = await res.json()
        if (d.success && d.data.sales.length > 0) {
          const matched = d.data.sales[0]
          setLookedUpSale(matched)
          // Default selections: 0 for all items
          const initialSelections: Record<string, { quantity: number; isDamaged: boolean }> = {}
          matched.items.forEach((item: SaleItem) => {
            initialSelections[item.id] = { quantity: 0, isDamaged: false }
          })
          setReturnSelections(initialSelections)
        } else {
          setLookupError('No invoice found matching that query. Enter invoice number like INV-2024-00001.')
        }
      }
    } catch {
      setLookupError('Failed to lookup invoice. Check connection.')
    } finally {
      setSearching(false)
    }
  }

  function toggleItemReturn(itemId: string, maxQty: number) {
    setReturnSelections(prev => {
      const current = prev[itemId] || { quantity: 0, isDamaged: false }
      const newQty = current.quantity > 0 ? 0 : 1
      return { ...prev, [itemId]: { ...current, quantity: newQty } }
    })
  }

  function setItemQuantity(itemId: string, qty: number, maxQty: number) {
    const validQty = Math.max(0, Math.min(qty, maxQty))
    setReturnSelections(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || { isDamaged: false }), quantity: validQty },
    }))
  }

  function toggleItemDamaged(itemId: string) {
    setReturnSelections(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || { quantity: 1 }), isDamaged: !prev[itemId]?.isDamaged },
    }))
  }

  // Calculate total refund amount
  const selectedItemsToReturn = lookedUpSale?.items.filter(
    item => (returnSelections[item.id]?.quantity ?? 0) > 0
  ) ?? []

  const totalRefund = selectedItemsToReturn.reduce((sum, item) => {
    const qty = returnSelections[item.id]?.quantity ?? 0
    return sum + (qty * item.unitPrice)
  }, 0)

  async function handleProcessReturn(e: React.FormEvent) {
    e.preventDefault()
    if (!lookedUpSale) return
    if (selectedItemsToReturn.length === 0) {
      setSubmitError('Select at least one item and quantity to return')
      return
    }
    if (!returnReason.trim()) {
      setSubmitError('Please state a reason for this return')
      return
    }

    setSubmitting(true)
    setSubmitError('')
    try {
      const payload = {
        saleId: lookedUpSale.id,
        reason: returnReason.trim(),
        refundMethod,
        items: selectedItemsToReturn.map(item => ({
          saleItemId: item.id,
          quantity: returnSelections[item.id].quantity,
          isDamaged: returnSelections[item.id].isDamaged,
        })),
      }

      const res = await fetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (data.success) {
        setSuccessMsg(`Return processed! ${formatCurrency(totalRefund)} refunded. Inventory updated.`)
        setLookedUpSale(null)
        setReturnReason('')
        setInvoiceQuery('')
        fetchReturns()
        setTimeout(() => setSuccessMsg(''), 5000)
      } else {
        setSubmitError(data.error?.message || 'Failed to process return')
      }
    } catch {
      setSubmitError('Network error while processing return')
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
        <p className="text-sm text-slate-600">Customer returns & refunds are restricted to Store Owners only.</p>
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
              <h1 className="text-lg font-bold text-slate-900 leading-tight">Returns & Refunds</h1>
              <p className="text-xs text-slate-500">Invoice-linked return processing & damaged goods handling</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5 space-y-6">
        {successMsg && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Invoice Lookup Form */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <h2 className="font-bold text-sm text-slate-900 mb-1 flex items-center gap-2">
            <RotateCcw size={16} className="text-blue-600" />
            Lookup Invoice for Return
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Enter the customer invoice number or sale ID printed on the customer receipt.
          </p>

          <form onSubmit={handleLookup} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="e.g. INV-2024-00001"
                value={invoiceQuery}
                onChange={e => setInvoiceQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={searching || !invoiceQuery.trim()}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm disabled:opacity-50"
            >
              {searching ? 'Finding...' : 'Find Invoice'}
            </button>
          </form>

          {lookupError && (
            <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-600 flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0" />
              <span>{lookupError}</span>
            </div>
          )}
        </div>

        {/* Invoice details and item selection */}
        {lookedUpSale && (
          <form
            onSubmit={handleProcessReturn}
            className="bg-white rounded-2xl p-5 border border-slate-200 shadow-md space-y-5 animate-in fade-in"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 text-base font-mono">{lookedUpSale.saleNumber}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                    {lookedUpSale.status}
                  </span>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                  <span className="flex items-center gap-1">
                    <Calendar size={12} /> {new Date(lookedUpSale.saleAt).toLocaleDateString('en-PK')}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <User size={12} /> {lookedUpSale.customer?.name ?? 'Walk-in Customer'}
                  </span>
                </div>
              </div>
              <div className="text-sm font-semibold text-slate-700">
                Original Total: <span className="font-bold text-slate-900">{formatCurrency(lookedUpSale.totalAmount)}</span>
              </div>
            </div>

            {submitError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-600 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Items selection list */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Select Items and Quantities to Return
              </label>
              <div className="space-y-3">
                {lookedUpSale.items.map(item => {
                  const sel = returnSelections[item.id] || { quantity: 0, isDamaged: false }
                  const isSelected = sel.quantity > 0

                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 rounded-xl border transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/40'
                          : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleItemReturn(item.id, item.quantity)}
                            className="w-4 h-4 text-blue-600 rounded"
                          />
                          <div>
                            <div className="font-bold text-slate-900 text-xs">{item.productName}</div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              {item.sku} • Sold: {item.quantity} units @ {formatCurrency(item.unitPrice)}
                            </div>
                          </div>
                        </div>

                        <div className="font-bold text-slate-800 text-xs">
                          {formatCurrency(sel.quantity * item.unitPrice)}
                        </div>
                      </div>

                      {isSelected && (
                        <div className="mt-3 pt-3 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-600 font-medium">Return Qty:</span>
                            <input
                              type="number"
                              min="1"
                              max={item.quantity}
                              value={sel.quantity}
                              onChange={e => setItemQuantity(item.id, parseInt(e.target.value) || 0, item.quantity)}
                              className="w-16 px-2 py-1 rounded-lg border border-slate-300 bg-white font-mono text-center font-bold"
                            />
                            <span className="text-slate-400 text-[11px]">of {item.quantity}</span>
                          </div>

                          {/* Damaged checkbox */}
                          <label className="flex items-center gap-2 cursor-pointer bg-amber-50 px-3 py-1 rounded-lg border border-amber-200 text-amber-900">
                            <input
                              type="checkbox"
                              checked={sel.isDamaged}
                              onChange={() => toggleItemDamaged(item.id)}
                              className="w-3.5 h-3.5 text-amber-600 rounded"
                            />
                            <ShieldAlert size={13} className="text-amber-600" />
                            <span className="font-medium text-[11px]">Damaged / Do Not Restock</span>
                          </label>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Return reason & refund method */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Return Reason *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Customer changed mind / wrong model / defective"
                  value={returnReason}
                  onChange={e => setReturnReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Refund Method</label>
                <select
                  value={refundMethod}
                  onChange={e => setRefundMethod(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="CASH">Cash Refund</option>
                  <option value="CARD">Debit / Credit Card</option>
                  <option value="MOBILE_WALLET">Easypaisa / JazzCash</option>
                  <option value="CREDIT">Store Credit</option>
                </select>
              </div>
            </div>

            {/* Refund banner */}
            <div className="p-4 bg-slate-900 text-white rounded-xl flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-300">Total Refund Payable to Customer</div>
                <div className="text-xl font-extrabold text-emerald-400">{formatCurrency(totalRefund)}</div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLookedUpSale(null)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:text-white border border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || selectedItemsToReturn.length === 0}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm disabled:opacity-50"
                >
                  {submitting ? 'Processing...' : 'Confirm Return & Refund'}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Return History Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <Receipt size={16} className="text-slate-500" />
              Processed Returns History
            </h2>
            <span className="text-xs text-slate-400 font-medium">{returnHistory.length} returns</span>
          </div>

          {loadingHistory ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : returnHistory.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              No returns have been processed yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {returnHistory.map(ret => (
                <div key={ret.id} className="p-4 sm:p-5 hover:bg-slate-50/70 transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs font-mono text-slate-900">
                        Invoice: {ret.sale.saleNumber}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                        {ret.refundMethod}
                      </span>
                    </div>
                    <div className="font-bold text-rose-600 text-xs font-mono">
                      -{formatCurrency(ret.totalAmount)}
                    </div>
                  </div>

                  <div className="text-xs text-slate-500 flex items-center justify-between">
                    <div>
                      <span className="font-medium text-slate-700">Reason:</span> {ret.reason}
                    </div>
                    <div>{new Date(ret.createdAt).toLocaleDateString('en-PK')}</div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ret.items.map(item => (
                      <span
                        key={item.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-[10px] text-slate-600 font-medium"
                      >
                        {item.quantity}× {item.productName} ({formatCurrency(item.unitPrice)})
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
