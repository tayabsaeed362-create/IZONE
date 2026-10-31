'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import {
  Users, Search, Plus, Phone, Calendar, ShoppingBag,
  ArrowRight, X, Clock, User, DollarSign, FileText,
  Smartphone, ChevronRight, Hash, MapPin, Receipt, ArrowLeft, RotateCcw,
  ShieldAlert, AlertCircle
} from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'

type CustomerItem = {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  createdAt: string
  ordersCount: number
  totalSpent: number
  lastPurchaseAt: string | null
  latestInvoiceNo: string | null
}

type CustomerDetail = CustomerItem & {
  sales: Array<{
    id: string
    saleNumber: string
    totalAmount: number
    subtotal: number
    discountAmount: number
    saleAt: string
    status: string
    notes: string | null
    user: { id: string; name: string } | null
    payments: Array<{ method: string; amount: number }>
    items: Array<{
      id: string
      productName: string
      sku: string
      quantity: number
      unitPrice: number
      totalAmount: number
      imei: string | null
    }>
  }>
}

function formatCurrency(n: number) {
  return `₨${Math.round(n).toLocaleString()}`
}

export default function CustomersPage() {
  const { data: session } = useSession()
  const isOwner = session?.user?.role === 'OWNER'

  const [customers, setCustomers] = useState<CustomerItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // View Customer Details & Bill History modal
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // New Customer Modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', phone: '', email: '', address: '', notes: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ── Return Item & Deduction Modal in Customer History ───────
  const [returnModalSale, setReturnModalSale] = useState<CustomerDetail['sales'][0] | null>(null)
  const [returnSelections, setReturnSelections] = useState<Record<string, { quantity: number; isDamaged: boolean }>>({})
  const [returnDeduction, setReturnDeduction] = useState<number>(0)
  const [returnReason, setReturnReason] = useState<string>('Customer returned item')
  const [returnRefundMethod, setReturnRefundMethod] = useState<'CASH' | 'CARD' | 'MOBILE_WALLET' | 'CREDIT'>('CASH')
  const [returnSubmitting, setReturnSubmitting] = useState<boolean>(false)
  const [returnError, setReturnError] = useState<string>('')

  function handleOpenReturnModal(sale: CustomerDetail['sales'][0]) {
    setReturnModalSale(sale)
    setReturnError('')
    setReturnDeduction(0)
    setReturnReason('Customer returned item')
    setReturnRefundMethod('CASH')
    const initial: Record<string, { quantity: number; isDamaged: boolean }> = {}
    sale.items.forEach((item, idx) => {
      initial[item.id] = { quantity: idx === 0 ? item.quantity : 0, isDamaged: false }
    })
    setReturnSelections(initial)
  }

  function toggleReturnItem(itemId: string, maxQty: number) {
    setReturnSelections(prev => {
      const current = prev[itemId] || { quantity: 0, isDamaged: false }
      const newQty = current.quantity > 0 ? 0 : maxQty
      return { ...prev, [itemId]: { ...current, quantity: newQty } }
    })
  }

  function setReturnItemQty(itemId: string, qty: number, maxQty: number) {
    const validQty = Math.max(0, Math.min(qty, maxQty))
    setReturnSelections(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || { isDamaged: false }), quantity: validQty },
    }))
  }

  function toggleReturnDamaged(itemId: string) {
    setReturnSelections(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || { quantity: 1 }), isDamaged: !prev[itemId]?.isDamaged },
    }))
  }

  const selectedReturnItems = returnModalSale?.items.filter(
    item => (returnSelections[item.id]?.quantity ?? 0) > 0
  ) ?? []

  const grossReturnAmount = selectedReturnItems.reduce((sum, item) => {
    const qty = returnSelections[item.id]?.quantity ?? 0
    const effectiveUnitPrice = item.quantity > 0 ? (item.totalAmount / item.quantity) : item.unitPrice
    return sum + (qty * effectiveUnitPrice)
  }, 0)

  const effectiveCustomerDeduction = Math.min(grossReturnAmount, Math.max(0, returnDeduction || 0))
  const netCustomerRefund = Math.max(0, grossReturnAmount - effectiveCustomerDeduction)

  async function handleSubmitReturn(e: React.FormEvent) {
    e.preventDefault()
    if (!returnModalSale) return
    if (selectedReturnItems.length === 0) {
      setReturnError('Select at least one item to return')
      return
    }

    setReturnSubmitting(true)
    setReturnError('')
    try {
      const payload = {
        saleId: returnModalSale.id,
        reason: returnReason.trim() || 'Customer returned item',
        refundMethod: returnRefundMethod,
        deductionAmount: effectiveCustomerDeduction,
        items: selectedReturnItems.map(item => ({
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
      if (res.ok && data.success) {
        toast.success(`Return of ${formatCurrency(netCustomerRefund)} processed!${effectiveCustomerDeduction > 0 ? ` (Deduction: ${formatCurrency(effectiveCustomerDeduction)})` : ''}`)
        setReturnModalSale(null)
        if (selectedCustomerId) {
          openCustomerDetail(selectedCustomerId)
        }
        loadCustomers()
      } else {
        setReturnError(data.error?.message || data.error || 'Failed to process return')
      }
    } catch {
      setReturnError('Network error while processing return')
    } finally {
      setReturnSubmitting(false)
    }
  }

  async function loadCustomers() {
    setLoading(true)
    try {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(search)}`)
      const json = await res.json()
      if (json.success) {
        setCustomers(json.data.customers)
      } else {
        toast.error(json.error || 'Failed to load customers')
      }
    } catch {
      toast.error('Network error loading customers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      loadCustomers()
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  async function openCustomerDetail(id: string) {
    setSelectedCustomerId(id)
    setLoadingDetail(true)
    setCustomerDetail(null)
    try {
      const res = await fetch(`/api/customers/${id}`)
      const json = await res.json()
      if (json.success) {
        setCustomerDetail(json.data)
      } else {
        toast.error(json.error || 'Failed to fetch customer purchase history')
      }
    } catch {
      toast.error('Network error loading customer history')
    } finally {
      setLoadingDetail(false)
    }
  }

  async function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault()
    if (!addForm.name.trim()) {
      toast.error('Customer name is required')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      })
      const json = await res.json()
      if (json.success) {
        toast.success(`Customer "${addForm.name}" created!`)
        setShowAddModal(false)
        setAddForm({ name: '', phone: '', email: '', address: '', notes: '' })
        loadCustomers()
      } else {
        toast.error(json.error || 'Failed to create customer')
      }
    } catch {
      toast.error('Network error creating customer')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Quick stats
  const totalCustomers = customers.length
  const totalSalesRevenue = customers.reduce((sum, c) => sum + c.totalSpent, 0)
  const repeatCustomers = customers.filter(c => c.ordersCount > 1).length

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* ── Top Header Navigation ────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 -ml-2 text-slate-500 hover:text-slate-800 rounded-xl transition"
              title="Return to Dashboard"
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                Customer Directory & Bill History
              </h1>
              <p className="text-xs text-slate-500">
                Track who bought what from POS checkout invoices automatically
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition"
          >
            <Plus size={16} />
            <span>Add Customer</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* ── Key Metrics Cards ─────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-slate-500">Total Registered Customers</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{totalCustomers}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Captured from POS bills</div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Users size={22} />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-slate-500">Customer Sales Volume</div>
              <div className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(totalSalesRevenue)}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Total spent across all bills</div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <DollarSign size={22} />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-slate-500">Repeat Buyers</div>
              <div className="text-2xl font-bold text-purple-600 mt-1">{repeatCustomers}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Bought more than once</div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <ShoppingBag size={22} />
            </div>
          </div>
        </div>

        {/* ── Search Bar ────────────────────────────────────────── */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <Search size={18} className="text-slate-400 ml-1 shrink-0" />
          <input
            type="text"
            placeholder="Search customers by name or phone number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-sm bg-transparent outline-none placeholder:text-slate-400 text-slate-900"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 text-xs"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* ── Customers List Table ──────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <Receipt size={16} className="text-blue-600" />
              <span>Customer Invoices & Purchases</span>
            </h2>
            <span className="text-xs text-slate-400 font-medium">{customers.length} records</span>
          </div>

          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : customers.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
                <Users size={24} />
              </div>
              <h3 className="font-bold text-slate-800 text-sm">No Customers Found</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-4">
                Jab bhi POS checkout par customer ka name ya phone enter kiya jayega, un ka mukammal record aur purchase bill yahan auto-link ho jaye ga!
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition"
              >
                + Register First Customer
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {customers.map(c => (
                <div
                  key={c.id}
                  onClick={() => openCustomerDetail(c.id)}
                  className="p-4 sm:p-5 hover:bg-slate-50/80 transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-sm font-bold text-slate-900">{c.name}</strong>
                        {c.ordersCount > 1 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            Repeat Buyer ({c.ordersCount}x)
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                        {c.phone && (
                          <span className="flex items-center gap-1 font-mono text-slate-700">
                            <Phone size={12} className="text-slate-400" /> {c.phone}
                          </span>
                        )}
                        {c.latestInvoiceNo && (
                          <>
                            <span>•</span>
                            <span className="text-slate-600 flex items-center gap-1">
                              <FileText size={12} className="text-slate-400" /> Latest Bill: <strong className="font-mono">{c.latestInvoiceNo}</strong>
                            </span>
                          </>
                        )}
                        {c.lastPurchaseAt && (
                          <>
                            <span>•</span>
                            <span className="text-slate-400 flex items-center gap-1">
                              <Calendar size={12} /> {new Date(c.lastPurchaseAt).toLocaleDateString('en-PK')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right side stats & action */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <div className="text-left sm:text-right">
                      <div className="font-bold text-slate-900 text-sm">{formatCurrency(c.totalSpent)}</div>
                      <div className="text-[11px] text-slate-400 font-medium">
                        {c.ordersCount} Bill{c.ordersCount !== 1 ? 's' : ''} Purchased
                      </div>
                    </div>
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-xs font-semibold flex items-center gap-1 transition"
                    >
                      <span>View History</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ── MODAL: CUSTOMER DETAIL & BILL INVOICES HISTORY ─────── */}
      {selectedCustomerId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-base shrink-0">
                  <User size={20} />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 text-sm">Customer Profile & Invoices</h2>
                  <p className="text-xs text-slate-500">Complete itemized purchase history and IMEI tracking</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCustomerId(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {loadingDetail ? (
                <div className="py-12 text-center text-slate-400 text-xs space-y-2">
                  <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin mx-auto" />
                  <p>Loading customer invoices and purchased items...</p>
                </div>
              ) : customerDetail ? (
                <>
                  {/* Customer Info Card */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">{customerDetail.name}</h3>
                        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-1">
                          {customerDetail.phone && (
                            <span className="flex items-center gap-1 font-mono font-medium text-slate-700">
                              <Phone size={12} className="text-slate-400" /> {customerDetail.phone}
                            </span>
                          )}
                          {customerDetail.address && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1 text-slate-600">
                                <MapPin size={12} className="text-slate-400" /> {customerDetail.address}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white border border-slate-200 text-center sm:text-right shrink-0">
                        <div className="text-[10px] text-slate-400 font-semibold uppercase">Total Spent</div>
                        <div className="text-base font-bold text-emerald-600">{formatCurrency(customerDetail.totalSpent)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Customer Purchase History */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Purchased Invoices ({customerDetail.sales.length})
                      </h4>
                      <span className="text-[11px] text-slate-400 font-medium">Auto-recorded at POS</span>
                    </div>

                    {customerDetail.sales.length === 0 ? (
                      <div className="p-6 border-2 border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-400">
                        No purchases recorded yet for this customer.
                      </div>
                    ) : (
                      customerDetail.sales.map((sale) => (
                        <div
                          key={sale.id}
                          className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition space-y-3"
                        >
                          {/* Invoice Top Details */}
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                            <div className="flex items-center gap-2">
                              <span className="font-bold font-mono text-sm text-slate-900">{sale.saleNumber}</span>
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                {sale.status}
                              </span>
                            </div>
                            <div className="text-right flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-900">{formatCurrency(sale.totalAmount)}</span>
                              {sale.status !== 'REFUNDED' && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenReturnModal(sale)}
                                  className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-[11px] font-semibold flex items-center gap-1 transition"
                                  title="Process Return & Refund"
                                >
                                  <RotateCcw size={12} />
                                  <span>Return Item</span>
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="flex items-center gap-1">
                                <Calendar size={12} className="text-slate-400" />
                                {new Date(sale.saleAt).toLocaleDateString('en-PK', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              {sale.user?.name && (
                                <>
                                  <span>•</span>
                                  <span className="text-slate-600">Sold by: <strong>{sale.user.name}</strong></span>
                                </>
                              )}
                            </div>
                            {sale.payments.length > 0 && (
                              <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                                Paid via: {sale.payments.map(p => p.method).join(', ')}
                              </span>
                            )}
                          </div>

                          {/* Itemized list of products in this bill */}
                          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 space-y-2 text-xs">
                            <div className="text-[11px] font-bold text-slate-600">Purchased Items:</div>
                            {sale.items.map((item) => (
                              <div key={item.id} className="flex items-start justify-between gap-2 border-b border-slate-200/50 last:border-0 pb-1.5 last:pb-0">
                                <div>
                                  <div className="font-semibold text-slate-900">
                                    {item.quantity}× {item.productName}
                                  </div>
                                  {item.imei && (
                                    <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                      <Smartphone size={12} className="text-blue-500" />
                                      IMEI: <strong className="font-mono text-slate-700">{item.imei}</strong>
                                    </div>
                                  )}
                                </div>
                                <div className="text-right font-medium text-slate-800">
                                  {formatCurrency(item.totalAmount)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: ADD NEW CUSTOMER ───────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 text-sm">Register New Customer</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Customer Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Muhammad Bilal"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. 03001234567"
                  value={addForm.phone}
                  onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Address / City
                </label>
                <input
                  type="text"
                  placeholder="e.g. Model Town, Lahore"
                  value={addForm.address}
                  onChange={(e) => setAddForm({ ...addForm, address: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Additional notes about customer..."
                  value={addForm.notes}
                  onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: PROCESS CUSTOMER RETURN WITH DEDUCTION ─────── */}
      {returnModalSale && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-amber-50/70 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-base shrink-0">
                  <RotateCcw size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Return Item & Refund — {returnModalSale.saleNumber}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Customer: <strong className="text-slate-700">{customerDetail?.name}</strong> • Bill Total: {formatCurrency(returnModalSale.totalAmount)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReturnModalSale(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitReturn} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {returnError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{returnError}</span>
                </div>
              )}

              {/* Items selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Select Items and Quantities to Return:
                </label>
                <div className="space-y-2.5">
                  {returnModalSale.items.map((item) => {
                    const sel = returnSelections[item.id] || { quantity: 0, isDamaged: false }
                    const isSelected = sel.quantity > 0

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
                              onChange={() => toggleReturnItem(item.id, item.quantity)}
                              className="w-4 h-4 text-blue-600 rounded"
                            />
                            <div>
                              <div className="font-bold text-slate-900">{item.productName}</div>
                              <div className="text-[11px] text-slate-500 font-mono">
                                Purchased @ {formatCurrency(item.quantity > 0 ? (item.totalAmount / item.quantity) : item.unitPrice)}
                                {item.quantity > 0 && (item.totalAmount / item.quantity) < item.unitPrice && (
                                  <span className="text-emerald-700 font-semibold ml-1.5">
                                    (Discounted from {formatCurrency(item.unitPrice)})
                                  </span>
                                )}
                                {item.imei && ` • IMEI: ${item.imei}`}
                              </div>
                            </div>
                          </label>
                          <div className="font-bold text-slate-800 text-right">
                            {formatCurrency(sel.quantity * (item.quantity > 0 ? (item.totalAmount / item.quantity) : item.unitPrice))}
                          </div>
                        </div>

                        {isSelected && (
                          <div className="mt-2.5 pt-2.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-600 font-medium">Return Qty:</span>
                              <input
                                type="number"
                                min="1"
                                max={item.quantity}
                                value={sel.quantity}
                                onChange={(e) => setReturnItemQty(item.id, parseInt(e.target.value) || 0, item.quantity)}
                                className="w-16 px-2 py-1 rounded-lg border border-slate-300 bg-white font-mono text-center font-bold"
                              />
                              <span className="text-slate-400 text-[11px]">of {item.quantity}</span>
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
                      max={grossReturnAmount}
                      value={returnDeduction || ''}
                      placeholder="0"
                      onChange={(e) => setReturnDeduction(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-32 px-3 py-1.5 rounded-lg border border-amber-300 bg-white font-mono text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] text-amber-800 font-semibold mr-1">Quick Select:</span>
                  <button
                    type="button"
                    onClick={() => setReturnDeduction(0)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                      returnDeduction === 0
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-white border border-amber-300 text-amber-900 hover:bg-amber-100'
                    }`}
                  >
                    Rs 0 (Full Refund)
                  </button>
                  {[5, 10, 15, 20].map((pct) => {
                    const cut = Math.round((grossReturnAmount * pct) / 100)
                    return (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setReturnDeduction(cut)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                          returnDeduction === cut
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
                    value={returnRefundMethod}
                    onChange={(e) => setReturnRefundMethod(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    placeholder="e.g. Defective / change of mind"
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Calculation Summary & Submit */}
              <div className="p-4 bg-slate-900 text-white rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4">
                <div>
                  <div className="text-xs text-slate-400 flex items-center gap-2">
                    <span>Gross: {formatCurrency(grossReturnAmount)}</span>
                    {effectiveCustomerDeduction > 0 && (
                      <>
                        <span>•</span>
                        <span className="text-amber-400 font-medium">Deduction: -{formatCurrency(effectiveCustomerDeduction)}</span>
                      </>
                    )}
                  </div>
                  <div className="text-xs text-slate-300 mt-0.5">Net Refund Payable to Customer</div>
                  <div className="text-2xl font-extrabold text-emerald-400">{formatCurrency(netCustomerRefund)}</div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setReturnModalSale(null)}
                    className="px-4 py-2 border border-slate-700 text-slate-300 hover:text-white rounded-xl font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={returnSubmitting || selectedReturnItems.length === 0}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold shadow-xs disabled:opacity-50"
                  >
                    {returnSubmitting ? 'Processing...' : `Confirm Return & Pay ${formatCurrency(netCustomerRefund)}`}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
