'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ShoppingBag, Plus, ArrowLeft, Trash2, CheckCircle2,
  AlertCircle, Building2, Calendar, FileText, X, Check,
  Clock, User, Filter, AlertTriangle
} from 'lucide-react'
import { useSession } from 'next-auth/react'

type ProductOption = {
  id: string
  name: string
  sku: string
  purchasePrice: number
  quantity: number
  hasImei: boolean
  variants: Array<{ id: string; name: string; sku: string; purchasePrice: number }>
}

type SupplierOption = {
  id: string
  name: string
}

type PurchaseRecord = {
  id: string
  invoiceNo: string
  status: string
  isApproved?: boolean
  totalAmount: number
  paidAmount: number
  purchasedAt: string
  supplier: { name: string } | null
  user?: { id: string; name: string } | null
  items: Array<{
    id: string
    productId: string
    quantity: number
    unitCost: number
    totalCost: number
    product: { id: string; name: string; sku: string }
    imeiList: string[]
  }>
}

type LineItemDraft = {
  productId: string
  variantId: string
  productName: string
  quantity: number
  unitCost: number
  hasImei: boolean
  imeiListText: string
}

function formatCurrency(n: number) {
  return `₨${Math.round(n).toLocaleString()}`
}

export default function PurchasesPage() {
  const { data: session } = useSession()
  const isOwner = session?.user?.role === 'OWNER'

  const [purchases, setPurchases] = useState<PurchaseRecord[]>([])
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Filter state
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'RECEIVED'>('ALL')

  // Owner Review & Approval Modal state
  const [approvingPurchase, setApprovingPurchase] = useState<PurchaseRecord | null>(null)
  const [approvalItemCosts, setApprovalItemCosts] = useState<Record<string, string>>({})
  const [isApprovingBusy, setIsApprovingBusy] = useState(false)

  // Form state
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [notes, setNotes] = useState('')
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([])

  async function loadData() {
    setLoading(true)
    try {
      const [purchasesRes, suppliersRes, productsRes] = await Promise.all([
        fetch('/api/purchases'),
        fetch('/api/suppliers'),
        fetch('/api/products?limit=100'),
      ])

      if (purchasesRes.ok) {
        const d = await purchasesRes.json()
        if (d.success) setPurchases(d.data.purchases)
      }
      if (suppliersRes.ok) {
        const d = await suppliersRes.json()
        if (d.success) setSuppliers(d.data)
      }
      if (productsRes.ok) {
        const d = await productsRes.json()
        if (d.success) setProducts(d.data.products)
      }
    } catch (err) {
      console.error('Failed to load purchases data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  function addLineItem(prodId: string) {
    const prod = products.find(p => p.id === prodId)
    if (!prod) return

    setLineItems(prev => [
      ...prev,
      {
        productId: prod.id,
        variantId: '',
        productName: prod.name,
        quantity: 1,
        unitCost: prod.purchasePrice || 0,
        hasImei: prod.hasImei,
        imeiListText: '',
      },
    ])
  }

  function removeLineItem(index: number) {
    setLineItems(prev => prev.filter((_, i) => i !== index))
  }

  function updateLineItem(index: number, field: keyof LineItemDraft, val: any) {
    setLineItems(prev => {
      const copy = [...prev]
      copy[index] = { ...copy[index], [field]: val }
      return copy
    })
  }

  const purchaseTotal = lineItems.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0)

  async function handleRecordPurchase(e: React.FormEvent) {
    e.preventDefault()
    if (lineItems.length === 0) {
      setErrorMsg('Add at least one product to the purchase invoice')
      return
    }

    setSubmitting(true)
    setErrorMsg('')
    try {
      const payload = {
        supplierId: selectedSupplierId || null,
        invoiceNo: invoiceNo.trim() || undefined,
        status: isOwner ? 'RECEIVED' : 'ORDERED',
        notes: notes.trim() || null,
        items: lineItems.map(item => ({
          productId: item.productId,
          variantId: item.variantId || null,
          quantity: Number(item.quantity),
          unitCost: Number(item.unitCost) || 0,
          imeiList: item.imeiListText
            ? item.imeiListText.split(/[\n,]/).map(s => s.trim()).filter(Boolean)
            : [],
        })),
      }

      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (data.success) {
        setSuccessMsg(
          isOwner
            ? 'Stock intake recorded successfully! Inventory has been updated.'
            : 'Purchase order submitted successfully! Sent to Store Owner for review and stock intake approval.'
        )
        setShowModal(false)
        setLineItems([])
        setInvoiceNo('')
        setNotes('')
        loadData()
        setTimeout(() => setSuccessMsg(''), 5000)
      } else {
        setErrorMsg(data.error?.message || 'Failed to record purchase')
      }
    } catch {
      setErrorMsg('Network error while processing purchase')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleApprovePurchase(e: React.FormEvent) {
    e.preventDefault()
    if (!approvingPurchase) return

    setIsApprovingBusy(true)
    setErrorMsg('')
    try {
      const itemsPayload = approvingPurchase.items.map(item => ({
        id: item.id,
        unitCost: approvalItemCosts[item.id] !== undefined ? (parseFloat(approvalItemCosts[item.id]) || 0) : item.unitCost,
      }))

      const res = await fetch(`/api/purchases/${approvingPurchase.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsPayload }),
      })

      const data = await res.json()
      if (data.success) {
        setSuccessMsg(`Purchase #${approvingPurchase.invoiceNo} approved! Stock has been intaken into inventory.`)
        setApprovingPurchase(null)
        loadData()
        setTimeout(() => setSuccessMsg(''), 5000)
      } else {
        setErrorMsg(data.error?.message || 'Failed to approve purchase')
      }
    } catch {
      setErrorMsg('Network error while approving purchase')
    } finally {
      setIsApprovingBusy(false)
    }
  }

  // Filter calculations
  const pendingCount = purchases.filter(p => !p.isApproved || p.status === 'ORDERED').length
  const receivedCount = purchases.filter(p => p.isApproved && p.status === 'RECEIVED').length

  const filteredPurchases = purchases.filter(p => {
    if (statusFilter === 'PENDING') return !p.isApproved || p.status === 'ORDERED'
    if (statusFilter === 'RECEIVED') return p.isApproved && p.status === 'RECEIVED'
    return true
  })

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
              <h1 className="text-lg font-bold text-slate-900 leading-tight">Stock Purchases</h1>
              <p className="text-xs text-slate-500">
                {isOwner
                  ? 'Intake wholesale inventory & approve purchase orders'
                  : 'Submit wholesale orders for Owner review & approval'}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setErrorMsg('')
              setShowModal(true)
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
          >
            <Plus size={16} />
            <span>{isOwner ? 'New Purchase Intake' : 'New Purchase Order'}</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5 space-y-4">
        {successMsg && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Owner Pending Approvals Banner */}
        {isOwner && pendingCount > 0 && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 flex items-center justify-between gap-3 text-amber-900">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-200/80 text-amber-800 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} />
              </div>
              <div>
                <strong className="text-xs font-bold block">
                  {pendingCount} Purchase Order{pendingCount > 1 ? 's' : ''} Awaiting Your Approval
                </strong>
                <p className="text-[11px] text-amber-700">
                  Staff submitted new stock orders. Review quantities and unit costs to intake stock into POS inventory.
                </p>
              </div>
            </div>
            <button
              onClick={() => setStatusFilter('PENDING')}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-xs shrink-0 transition"
            >
              View Pending ({pendingCount})
            </button>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              statusFilter === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            All Purchases ({purchases.length})
          </button>
          <button
            onClick={() => setStatusFilter('PENDING')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
              statusFilter === 'PENDING'
                ? 'bg-amber-600 text-white'
                : 'bg-white text-amber-800 hover:bg-amber-50 border border-amber-200'
            }`}
          >
            {pendingCount > 0 && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
            Needs Approval ({pendingCount})
          </button>
          <button
            onClick={() => setStatusFilter('RECEIVED')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              statusFilter === 'RECEIVED'
                ? 'bg-emerald-600 text-white'
                : 'bg-white text-emerald-800 hover:bg-emerald-50 border border-emerald-200'
            }`}
          >
            Received & Intaken ({receivedCount})
          </button>
        </div>

        {/* Purchases List */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <ShoppingBag size={16} className="text-blue-600" />
              <span>Purchase Invoices & Orders</span>
            </h2>
            <span className="text-xs text-slate-400 font-medium">{filteredPurchases.length} records</span>
          </div>

          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : filteredPurchases.length === 0 ? (
            <div className="text-center py-16">
              <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No Purchases Found</p>
              <p className="text-xs text-slate-400 mt-1 mb-4">
                {statusFilter === 'PENDING'
                  ? 'There are no purchase orders currently waiting for approval.'
                  : 'Record a purchase order to update inventory counts.'}
              </p>
              <button
                onClick={() => setShowModal(true)}
                className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-xl"
              >
                {isOwner ? 'Intake First Stock' : 'Create Purchase Order'}
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredPurchases.map(p => {
                const isPending = !p.isApproved || p.status === 'ORDERED'
                return (
                  <div key={p.id} className="p-4 sm:p-5 hover:bg-slate-50/70 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                          isPending ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          <FileText size={16} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm font-mono">{p.invoiceNo}</span>
                            {isPending ? (
                              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                Needs Approval
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                                RECEIVED
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                            <span className="flex items-center gap-1">
                              <Building2 size={12} /> {p.supplier?.name ?? 'Direct Purchase'}
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Calendar size={12} /> {new Date(p.purchasedAt).toLocaleDateString('en-PK')}
                            </span>
                            {p.user?.name && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1 text-slate-600">
                                  <User size={12} /> Submitted by: <strong>{p.user.name}</strong>
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right Action / Total Area */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0">
                        <div className="text-left sm:text-right">
                          <div className="font-bold text-slate-900 text-sm">{formatCurrency(p.totalAmount)}</div>
                          <div className="text-xs text-slate-400">{p.items.length} items</div>
                        </div>

                        {/* Owner Approval Button vs Cashier Status */}
                        {isPending && (
                          <div>
                            {isOwner ? (
                              <button
                                onClick={() => {
                                  setApprovingPurchase(p)
                                  const initialCosts: Record<string, string> = {}
                                  p.items.forEach(it => {
                                    initialCosts[it.id] = it.unitCost ? String(it.unitCost) : ''
                                  })
                                  setApprovalItemCosts(initialCosts)
                                }}
                                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
                              >
                                <CheckCircle2 size={14} />
                                Review & Approve
                              </button>
                            ) : (
                              <span className="text-[11px] font-medium text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                                Awaiting Owner Approval
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Line items pills */}
                    <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
                      {p.items.map(item => (
                        <span
                          key={item.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-[11px] text-slate-700 font-medium"
                        >
                          <span className="font-semibold">{item.quantity}×</span>
                          <span className="truncate max-w-[150px]">{item.product.name}</span>
                          <span className="text-slate-400">@{formatCurrency(item.unitCost)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {/* ── MODAL: CREATE NEW PURCHASE ────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <div>
                <h2 className="font-bold text-slate-900 text-sm">
                  {isOwner ? 'New Stock Purchase & Intake' : 'Submit Stock Purchase Order'}
                </h2>
                <p className="text-xs text-slate-500">
                  {isOwner
                    ? 'Intake inventory and update cost prices atomically'
                    : 'Submit purchase items for Owner approval before stock is intaken'}
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleRecordPurchase} className="flex-1 overflow-y-auto p-5 space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-600 flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {!isOwner && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                  <Clock size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>Staff Submission Mode:</strong> This purchase order will be sent to the Store Owner for approval. Stock counts will update once approved.
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Supplier</label>
                  <select
                    value={selectedSupplierId}
                    onChange={e => setSelectedSupplierId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Select a supplier (Optional)</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Invoice / Reference #</label>
                  <input
                    type="text"
                    placeholder="e.g. HAF-2024-8902"
                    value={invoiceNo}
                    onChange={e => setInvoiceNo(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Product selector to add line items */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Add Product to Intake</label>
                <select
                  onChange={e => {
                    if (e.target.value) {
                      addLineItem(e.target.value)
                      e.target.value = ''
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">+ Choose product to intake...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Current Stock: {p.quantity}) — Last Cost: {formatCurrency(p.purchasePrice)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Line Items List */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">Intake Items ({lineItems.length})</label>
                {lineItems.length === 0 ? (
                  <div className="p-4 border-2 border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-400">
                    No products selected yet. Pick products above to enter quantities and unit costs.
                  </div>
                ) : (
                  lineItems.map((item, index) => {
                    const prod = products.find(p => p.id === item.productId)
                    return (
                      <div
                        key={index}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-900 truncate max-w-[280px]">
                            {item.productName}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeLineItem(index)}
                            className="p-1 text-slate-400 hover:text-red-500"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        {prod?.variants && prod.variants.length > 0 && (
                          <div>
                            <select
                              value={item.variantId}
                              onChange={e => updateLineItem(index, 'variantId', e.target.value)}
                              className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
                            >
                              <option value="">Standard / Default Variant</option>
                              {prod.variants.map(v => (
                                <option key={v.id} value={v.id}>
                                  {v.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[11px] text-slate-500">Intake Quantity</label>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={e => updateLineItem(index, 'quantity', parseInt(e.target.value) || 1)}
                              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white font-mono"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-slate-500">
                              Unit Cost (₨) {!isOwner && <span className="text-slate-400 font-normal">(Optional)</span>}
                            </label>
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={item.unitCost || ''}
                              onChange={e => updateLineItem(index, 'unitCost', parseFloat(e.target.value) || 0)}
                              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white font-mono"
                            />
                          </div>
                        </div>

                        {item.hasImei && (
                          <div>
                            <label className="text-[11px] text-slate-500">IMEI Numbers (Comma or line separated)</label>
                            <textarea
                              rows={2}
                              placeholder="e.g. 352847291049281, 352847291049282"
                              value={item.imeiListText}
                              onChange={e => updateLineItem(index, 'imeiListText', e.target.value)}
                              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white font-mono resize-none"
                            />
                          </div>
                        )}

                        <div className="text-right text-[11px] text-slate-500 font-medium">
                          Line Total: <span className="font-bold text-slate-800">{formatCurrency(item.quantity * item.unitCost)}</span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Purchase Total & Notes */}
              <div className="p-3 bg-emerald-50 rounded-xl flex items-center justify-between text-xs text-emerald-900">
                <span className="font-semibold">Estimated Total:</span>
                <span className="text-base font-bold text-emerald-700">{formatCurrency(purchaseTotal)}</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes / Delivery Reference</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Received via TCS, payment made by cash"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs resize-none"
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
                  disabled={submitting || lineItems.length === 0}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm disabled:opacity-50"
                >
                  {submitting
                    ? 'Submitting...'
                    : (isOwner ? 'Confirm & Intake Stock' : 'Submit for Owner Approval')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: OWNER REVIEW & APPROVE PURCHASE ────────────── */}
      {approvingPurchase && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 text-sm">Review & Approve Purchase</h2>
                  <p className="text-xs text-slate-500">Verify unit costs and intake stock into inventory</p>
                </div>
              </div>
              <button
                onClick={() => setApprovingPurchase(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleApprovePurchase} className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Order Metadata summary */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Invoice / Ref:</span>
                  <strong className="font-mono text-slate-900">{approvingPurchase.invoiceNo}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Supplier:</span>
                  <span className="font-medium text-slate-800">{approvingPurchase.supplier?.name || 'Direct / None'}</span>
                </div>
                {approvingPurchase.user?.name && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Submitted by:</span>
                    <span className="font-semibold text-slate-800">{approvingPurchase.user.name}</span>
                  </div>
                )}
              </div>

              {/* Items list with editable costs */}
              <div className="space-y-2.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Purchase Items ({approvingPurchase.items.length}) — Set Unit Cost
                </label>
                {approvingPurchase.items.map(item => {
                  const currentCostVal = approvalItemCosts[item.id] !== undefined ? approvalItemCosts[item.id] : String(item.unitCost || '')
                  const parsedCost = parseFloat(currentCostVal) || 0
                  const lineTotal = item.quantity * parsedCost

                  return (
                    <div key={item.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <strong className="text-slate-900 font-semibold">{item.product.name}</strong>
                        <span className="font-bold text-slate-700 bg-slate-200/70 px-2 py-0.5 rounded text-[11px]">
                          Qty: {item.quantity}
                        </span>
                      </div>

                      {item.imeiList && item.imeiList.length > 0 && (
                        <div className="text-[11px] text-slate-500">
                          IMEIs: <span className="font-mono">{item.imeiList.join(', ')}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-200/60">
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] text-slate-600 font-medium whitespace-nowrap">Unit Cost (₨):</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0"
                            value={currentCostVal}
                            onChange={e => setApprovalItemCosts({ ...approvalItemCosts, [item.id]: e.target.value })}
                            className="w-28 px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400">Total: </span>
                          <strong className="text-slate-800">{formatCurrency(lineTotal)}</strong>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-amber-900 flex items-center justify-between">
                <span className="font-semibold">Calculated Total:</span>
                <strong className="text-base text-amber-800 font-bold">
                  {formatCurrency(
                    approvingPurchase.items.reduce((sum, item) => {
                      const cost = approvalItemCosts[item.id] !== undefined ? (parseFloat(approvalItemCosts[item.id]) || 0) : item.unitCost
                      return sum + item.quantity * cost
                    }, 0)
                  )}
                </strong>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setApprovingPurchase(null)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isApprovingBusy}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Check size={15} />
                  {isApprovingBusy ? 'Intaking Stock...' : 'Approve & Intake Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
