'use client'

import { useEffect, useState, useTransition } from 'react'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import {
  Search,
  ArrowRight,
  Receipt,
  RotateCcw,
  X,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  Loader2,
  Check,
} from 'lucide-react'

type SaleItem = {
  id: string
  productId: string
  variantId?: string | null
  productName: string
  sku: string
  quantity: number
  unitPrice: number
  unitCost?: number
  discountAmount: number
  totalAmount: number
  imei?: string | null
}

type ReturnRecord = {
  id: string
  totalAmount: number
  reason?: string | null
  items: Array<{
    productId: string
    variantId?: string | null
    quantity: number
  }>
}

type Sale = {
  id: string
  saleNumber: string
  subtotal?: number
  discountAmount?: number
  totalAmount: number
  saleAt: string
  status: 'COMPLETED' | 'PARTIAL_REFUND' | 'REFUNDED' | 'CANCELLED' | string
  customer: { name: string; phone?: string | null } | null
  user?: { name: string } | null
  items: SaleItem[]
  payments: Array<{ method: string; amount: number }>
  returns?: ReturnRecord[]
}

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([])
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [unauthorized, setUnauthorized] = useState(false)
  const [selected, setSelected] = useState<Sale | null>(null)

  // Refund Modal State
  const [refundSale, setRefundSale] = useState<Sale | null>(null)
  const [returnSelections, setReturnSelections] = useState<
    Record<string, { quantity: number; isDamaged: boolean }>
  >({})
  const [refundDeduction, setRefundDeduction] = useState<number>(0)
  const [refundMethod, setRefundMethod] = useState<'CASH' | 'CARD' | 'MOBILE_WALLET' | 'CREDIT'>('CASH')
  const [refundReason, setRefundReason] = useState('Customer returned item')
  const [refundSubmitting, setRefundSubmitting] = useState(false)
  const [refundError, setRefundError] = useState('')
  const [successToast, setSuccessToast] = useState('')

  async function loadSales(pageNum: number, searchQ: string, signal?: AbortSignal) {
    setLoading(true)
    setError('')
    setUnauthorized(false)
    try {
      const response = await fetch(
        `/api/sales?page=${pageNum}&q=${encodeURIComponent(searchQ)}`,
        { signal }
      )
      if (response.status === 401) {
        setUnauthorized(true)
        throw new Error('Sign in to view your sales history.')
      }
      if (!response.ok) throw new Error('Sales could not be loaded. Please try again.')
      const result = await response.json()
      setSales(result.data.sales || [])
      setPages(result.data.pagination.pages || 1)
    } catch (err) {
      if (!signal?.aborted) {
        setSales([])
        setError(err instanceof Error ? err.message : 'Unable to load sales')
      }
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      loadSales(page, query, controller.signal)
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, page])

  // Helper to calculate available quantity for return
  function getAvailableItemQty(sale: Sale, item: SaleItem): number {
    const prevReturned = (sale.returns ?? []).reduce((sum, r) => {
      const match = r.items.find(
        (ri) => ri.productId === item.productId && ri.variantId === item.variantId
      )
      return sum + (match?.quantity ?? 0)
    }, 0)
    return Math.max(0, item.quantity - prevReturned)
  }

  // Open Refund Modal for a specific sale
  function openRefundModal(sale: Sale) {
    setRefundSale(sale)
    setRefundError('')
    setRefundDeduction(0)
    setRefundReason('Customer returned item')
    setRefundMethod('CASH')

    // Pre-select first eligible item by default
    const initial: Record<string, { quantity: number; isDamaged: boolean }> = {}
    let selectedFirst = false
    sale.items.forEach((item) => {
      const avail = getAvailableItemQty(sale, item)
      if (avail > 0 && !selectedFirst) {
        initial[item.id] = { quantity: avail, isDamaged: false }
        selectedFirst = true
      } else {
        initial[item.id] = { quantity: 0, isDamaged: false }
      }
    })
    setReturnSelections(initial)
  }

  function toggleReturnItem(itemId: string, maxQty: number) {
    setReturnSelections((prev) => {
      const current = prev[itemId] || { quantity: 0, isDamaged: false }
      const newQty = current.quantity > 0 ? 0 : maxQty
      return { ...prev, [itemId]: { ...current, quantity: newQty } }
    })
  }

  function setReturnItemQty(itemId: string, qty: number, maxQty: number) {
    const validQty = Math.max(0, Math.min(qty, maxQty))
    setReturnSelections((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || { isDamaged: false }), quantity: validQty },
    }))
  }

  function toggleReturnDamaged(itemId: string) {
    setReturnSelections((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || { quantity: 1 }), isDamaged: !prev[itemId]?.isDamaged },
    }))
  }

  // Calculation for current selection
  const selectedItems = refundSale?.items.filter(
    (item) => (returnSelections[item.id]?.quantity ?? 0) > 0
  ) ?? []

  const grossRefundAmount = selectedItems.reduce((sum, item) => {
    const qty = returnSelections[item.id]?.quantity ?? 0
    const effectiveUnitPrice =
      item.quantity > 0 ? item.totalAmount / item.quantity : item.unitPrice
    return sum + qty * effectiveUnitPrice
  }, 0)

  const effectiveDeduction = Math.min(grossRefundAmount, Math.max(0, refundDeduction || 0))
  const netRefundAmount = Math.max(0, grossRefundAmount - effectiveDeduction)

  async function handleSubmitRefund(e: React.FormEvent) {
    e.preventDefault()
    if (!refundSale) return
    if (selectedItems.length === 0) {
      setRefundError('Please select at least one item to return.')
      return
    }

    setRefundSubmitting(true)
    setRefundError('')

    try {
      const payload = {
        saleId: refundSale.id,
        reason: refundReason.trim() || 'Customer returned item',
        refundMethod,
        deductionAmount: effectiveDeduction,
        items: selectedItems.map((item) => ({
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
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to process refund')
      }

      setSuccessToast(`Refund of ₨${netRefundAmount.toLocaleString()} successfully processed!`)
      setTimeout(() => setSuccessToast(''), 4000)

      setRefundSale(null)
      setSelected(null)
      // Refresh sales list to reflect new status immediately
      loadSales(page, query)
    } catch (err) {
      setRefundError(err instanceof Error ? err.message : 'Error processing refund')
    } finally {
      setRefundSubmitting(false)
    }
  }

  function formatCurrency(val: number) {
    return `₨ ${Math.round(val).toLocaleString()}`
  }

  return (
    <main className="dashboard">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-xl font-medium animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 size={18} />
          <span>{successToast}</span>
        </div>
      )}

      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR TRANSACTION LEDGER</div>
          <h1>
            Sales<span>.</span>
          </h1>
          <p>Find transactions, issue refunds, and review purchased items.</p>
        </div>
        <Link href="/pos" className="btn-primary">
          New sale <ArrowRight size={15} />
        </Link>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <h2>Sales history</h2>
          <label className="flex items-center gap-2">
            <Search size={17} />
            <input
              aria-label="Search sales"
              className="input-field"
              placeholder="Invoice or customer phone"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(1)
              }}
            />
          </label>
        </div>

        {error ? (
          <div className="empty-state" role="alert">
            <p>{error}</p>
            {unauthorized && (
              <button
                className="btn-primary"
                onClick={() => signIn(undefined, { callbackUrl: '/sales' })}
              >
                Sign in
              </button>
            )}
          </div>
        ) : loading ? (
          <div className="empty-state">Loading sales...</div>
        ) : sales.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Transaction</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th className="numeric">Amount</th>
                  <th style={{ textAlign: 'center', width: '130px' }}>Refund Action</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => {
                  const isFullyRefunded = sale.status === 'REFUNDED'
                  const isPartial = sale.status === 'PARTIAL_REFUND'

                  return (
                    <tr key={sale.id}>
                      <td>
                        <button
                          className="text-blue-600 font-bold hover:underline"
                          onClick={() => setSelected(selected?.id === sale.id ? null : sale)}
                        >
                          {sale.saleNumber}
                        </button>
                      </td>
                      <td>
                        <div className="font-medium text-slate-900">
                          {sale.customer?.name || 'Walk-in customer'}
                        </div>
                        {sale.customer?.phone && (
                          <div className="text-[11px] text-slate-400 font-mono">
                            {sale.customer.phone}
                          </div>
                        )}
                      </td>
                      <td>{new Date(sale.saleAt).toLocaleDateString('en-PK')}</td>
                      <td>
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold ${
                            isFullyRefunded
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : isPartial
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {sale.status}
                        </span>
                      </td>
                      <td className="numeric font-bold text-slate-900">
                        ₨ {sale.totalAmount.toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {isFullyRefunded ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                            <Check size={12} /> Refunded
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openRefundModal(sale)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-bold transition shadow-xs"
                            title="Issue Refund for this invoice"
                          >
                            <RotateCcw size={13} className="text-amber-700" />
                            Refund
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <Receipt size={24} />
            <p>No sales found.</p>
          </div>
        )}

        <div className="panel-footer">
          <button disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      </div>

      {/* Selected Sale Detail Drawer */}
      {selected && (
        <section className="panel mt-5">
          <div className="panel-heading">
            <div>
              <h2>{selected.saleNumber}</h2>
              <p className="text-xs text-slate-500">
                Customer: {selected.customer?.name || 'Walk-in'} • Date:{' '}
                {new Date(selected.saleAt).toLocaleDateString('en-PK')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {selected.status !== 'REFUNDED' && (
                <button
                  type="button"
                  onClick={() => openRefundModal(selected)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold hover:bg-amber-500/20 transition-colors"
                >
                  <RotateCcw size={14} /> Refund Items
                </button>
              )}
              <button onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>
          {selected.items.map((item) => (
            <div className="product-row" key={item.id}>
              <div>
                <strong>{item.productName}</strong>
                <small>
                  Quantity: {item.quantity} • Sold @{' '}
                  {formatCurrency(
                    item.quantity > 0 ? item.totalAmount / item.quantity : item.unitPrice
                  )}
                  {item.imei && ` • IMEI: ${item.imei}`}
                </small>
              </div>
              <span className="font-bold">₨ {item.totalAmount.toLocaleString()}</span>
            </div>
          ))}
        </section>
      )}

      {/* ======================================================== */}
      {/* REFUND MODAL DIRECTLY IN SALES TAB                      */}
      {/* ======================================================== */}
      {refundSale && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden text-slate-900">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                  <RotateCcw size={17} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    Issue Refund: {refundSale.saleNumber}
                  </h3>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {refundSale.customer?.name || 'Walk-in'} • Net Invoice Paid:{' '}
                    <span className="font-bold text-slate-800">
                      ₨ {refundSale.totalAmount.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRefundSale(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSubmitRefund} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {refundError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{refundError}</span>
                </div>
              )}

              {/* Items selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Select Items and Quantities to Return:
                </label>
                <div className="space-y-2.5">
                  {refundSale.items.map((item) => {
                    const availableQty = getAvailableItemQty(refundSale, item)
                    const sel = returnSelections[item.id] || { quantity: 0, isDamaged: false }
                    const isSelected = sel.quantity > 0
                    const effectiveUnitPrice =
                      item.quantity > 0 ? item.totalAmount / item.quantity : item.unitPrice

                    if (availableQty === 0) {
                      return (
                        <div
                          key={item.id}
                          className="p-3 rounded-xl border border-slate-200 bg-slate-100 opacity-60 flex items-center justify-between"
                        >
                          <div>
                            <div className="font-bold text-slate-700">{item.productName}</div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              All {item.quantity} units already refunded
                            </div>
                          </div>
                          <span className="text-[11px] font-semibold text-slate-400">
                            Fully Returned
                          </span>
                        </div>
                      )
                    }

                    return (
                      <div
                        key={item.id}
                        className={`p-3 rounded-xl border transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50/40'
                            : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2.5 cursor-pointer flex-1">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleReturnItem(item.id, availableQty)}
                              className="w-4 h-4 text-blue-600 rounded"
                            />
                            <div>
                              <div className="font-bold text-slate-900">{item.productName}</div>
                              <div className="text-[11px] text-slate-500 font-mono">
                                Purchased @ {formatCurrency(effectiveUnitPrice)}
                                {effectiveUnitPrice < item.unitPrice && (
                                  <span className="text-emerald-700 font-semibold ml-1.5">
                                    (Discounted from {formatCurrency(item.unitPrice)})
                                  </span>
                                )}
                                {item.imei && ` • IMEI: ${item.imei}`}
                              </div>
                            </div>
                          </label>
                          <div className="font-bold text-slate-800 text-right">
                            {formatCurrency(sel.quantity * effectiveUnitPrice)}
                          </div>
                        </div>

                        {isSelected && (
                          <div className="mt-2.5 pt-2.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-600 font-medium">Return Qty:</span>
                              <input
                                type="number"
                                min="1"
                                max={availableQty}
                                value={sel.quantity}
                                onChange={(e) =>
                                  setReturnItemQty(
                                    item.id,
                                    parseInt(e.target.value) || 0,
                                    availableQty
                                  )
                                }
                                className="w-16 px-2 py-1 rounded-lg border border-slate-300 bg-white font-mono text-center font-bold"
                              />
                              <span className="text-slate-400 text-[11px]">of {availableQty}</span>
                            </div>

                            <label className="flex items-center gap-1.5 cursor-pointer bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 text-amber-900 text-[11px]">
                              <input
                                type="checkbox"
                                checked={sel.isDamaged}
                                onChange={() => toggleReturnDamaged(item.id)}
                                className="w-3.5 h-3.5 text-amber-600 rounded"
                              />
                              <ShieldAlert size={12} className="text-amber-600" />
                              <span className="font-medium">Damaged / Do Not Restock</span>
                            </label>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Deduction Amount (Katoti) */}
              <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="block text-xs font-bold text-amber-900">
                      Deduction Amount / Katoti (PKR)
                    </label>
                    <p className="text-[11px] text-amber-700">
                      Enter deduction amount (0 or custom cut from refund)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-600 font-mono">Rs</span>
                    <input
                      type="number"
                      min="0"
                      max={grossRefundAmount}
                      value={refundDeduction || ''}
                      placeholder="0"
                      onChange={(e) =>
                        setRefundDeduction(Math.max(0, parseInt(e.target.value) || 0))
                      }
                      className="w-32 px-3 py-1.5 rounded-lg border border-amber-300 bg-white font-mono text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] text-amber-800 font-semibold mr-1">Quick Select:</span>
                  <button
                    type="button"
                    onClick={() => setRefundDeduction(0)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                      refundDeduction === 0
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-white border border-amber-300 text-amber-900 hover:bg-amber-100'
                    }`}
                  >
                    Rs 0 (Full Refund)
                  </button>
                  {[5, 10, 15, 20].map((pct) => {
                    const cut = Math.round((grossRefundAmount * pct) / 100)
                    return (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setRefundDeduction(cut)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                          refundDeduction === cut
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'bg-white border border-amber-300 text-amber-900 hover:bg-amber-100'
                        }`}
                      >
                        {pct}% ({formatCurrency(cut)})
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Refund Method & Reason */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Refund Method</label>
                  <select
                    value={refundMethod}
                    onChange={(e) => setRefundMethod(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  >
                    <option value="CASH">Cash Refund</option>
                    <option value="CARD">Debit / Credit Card</option>
                    <option value="MOBILE_WALLET">Easypaisa / JazzCash</option>
                    <option value="CREDIT">Store Credit</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Return Reason</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Defective / customer mind change"
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Calculation Summary & Submit Button */}
              <div className="p-4 bg-slate-900 text-white rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 shadow-md">
                <div>
                  <div className="text-xs text-slate-400 flex items-center gap-2">
                    <span>Items Gross: {formatCurrency(grossRefundAmount)}</span>
                    {effectiveDeduction > 0 && (
                      <span className="text-amber-400 font-semibold">
                        • Katoti: -{formatCurrency(effectiveDeduction)}
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-bold mt-0.5">
                    Net Refund Payable:{' '}
                    <span className="text-emerald-400 text-base">
                      {formatCurrency(netRefundAmount)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRefundSale(null)}
                    disabled={refundSubmitting}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={refundSubmitting || selectedItems.length === 0}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 transition flex items-center gap-1.5 shadow-sm"
                  >
                    {refundSubmitting ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <RotateCcw size={13} />
                        <span>Process Refund</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}
