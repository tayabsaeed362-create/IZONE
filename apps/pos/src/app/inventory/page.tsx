'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  Package, Plus, Search, Filter, ArrowUpDown, Edit, Archive,
  AlertTriangle, CheckCircle, ArrowDownLeft, ArrowUpRight, Barcode,
  Tag, RefreshCw, X, ChevronRight, Layers, Smartphone, Sparkles,
  DollarSign, ShoppingCart, Home, ArchiveRestore, Check, AlertCircle,
  HelpCircle, Eye, Box
} from 'lucide-react'
import { toast } from 'sonner'
import { ProductIntakeForm } from '@/components/inventory/ProductIntakeForm'
import { ProductPhotos } from '@/components/inventory/ProductPhotos'
import { useSession } from 'next-auth/react'

export type ProductItem = {
  id: string
  sku: string
  name: string
  slug: string
  description: string | null
  categoryId: string | null
  brandId: string | null
  supplierId: string | null
  purchasePrice: number
  sellingPrice: number
  minSellingPrice: number
  discountAmount: number
  quantity: number
  minStockLevel: number
  imei1?: string | null
  imei2?: string | null
  imeiCycle?: number
  hasImei: boolean
  status: 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED'
  isApproved?: boolean
  images: string[]
  isPublished?: boolean
  isFeatured?: boolean
  onlineDescription?: string | null
  onlinePrice?: number | null
  createdAt: string
  updatedAt: string
  category?: { id: string; name: string } | null
  brand?: { id: string; name: string } | null
  supplier?: { id: string; name: string } | null
  barcodes: Array<{ id: string; barcode: string; type: string }>
  variants: Array<{
    id: string
    name: string
    sku: string
    quantity: number
    sellingPrice: number
    purchasePrice: number
    minSellingPrice?: number
    barcodes: Array<{ barcode: string }>
  }>
  _count?: { variants: number }
}

type CategoryItem = {
  id: string
  name: string
  slug: string
  _count: { products: number }
}

export default function InventoryPage() {
  const { data: session } = useSession()
  const isOwner = session?.user?.role === 'OWNER'
  const [products, setProducts] = useState<ProductItem[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const filter = new URLSearchParams(window.location.search).get('filter')
    if (filter === 'low' || filter === 'out') setStockFilter(filter)
  }, [])

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<'smartphones' | 'accessories'>('smartphones')
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out' | 'pending'>('all')

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editPhotoBusy, setEditPhotoBusy] = useState(false)
  const [isStockModalOpen, setIsStockModalOpen] = useState(false)
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false)

  // Selected for editing / action
  const [currentProduct, setCurrentProduct] = useState<ProductItem | null>(null)

  // Owner Review & Approval state
  const [approvingProduct, setApprovingProduct] = useState<ProductItem | null>(null)
  const [approvalForm, setApprovalForm] = useState({ purchasePrice: '', sellingPrice: '', minSellingPrice: '' })
  const [isApprovingBusy, setIsApprovingBusy] = useState(false)

  // Stock Movement Modal State
  const [stockForm, setStockForm] = useState<{
    productId: string
    variantId?: string
    direction: 'IN' | 'OUT'
    type: 'PURCHASE' | 'ADJUSTMENT' | 'DAMAGE' | 'RETURN'
    quantity: string
    unitCost: string
    reason: string
  }>({
    productId: '',
    variantId: '',
    direction: 'IN',
    type: 'PURCHASE',
    quantity: '5',
    unitCost: '',
    reason: '',
  })
  const [isSubmittingStock, setIsSubmittingStock] = useState(false)

  // ── Fetch Initial Data ─────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [prodRes, catRes] = await Promise.all([
        fetch('/api/products?limit=100'),
        fetch('/api/categories'),
      ])

      const prodJson = await prodRes.json()
      const catJson = await catRes.json()

      if (prodJson.success) setProducts(prodJson.data.products)
      if (catJson.success) setCategories(catJson.data)
    } catch (err) {
      console.error('Failed to load inventory data:', err)
      toast.error('Failed to load products from database')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Check URL params for direct restock modal launch
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('action') === 'restock') {
        setIsStockModalOpen(true)
      }
    }
  }, [])

  // ── Filtered Products ──────────────────────────────────────
  const categoryGroups = useMemo(() => {
    const activeProducts = products.filter(p => p.status !== 'DISCONTINUED')
    const isSmartphone = (product: ProductItem) => {
      const name = product.category?.name ?? categories.find(cat => cat.id === product.categoryId)?.name ?? ''
      return /^(smart\s*phones?|mobile\s*phones?)$/i.test(name.trim())
    }
    return {
      smartphones: activeProducts.filter(isSmartphone),
      accessories: activeProducts.filter(product => !isSmartphone(product)),
    }
  }, [products, categories])

  const filteredProducts = useMemo(() => {
    return categoryGroups[selectedCategory].filter((p) => {

      // Stock status filter
      if (stockFilter === 'low' && (p.quantity > p.minStockLevel || p.quantity === 0)) return false
      if (stockFilter === 'out' && p.quantity > 0) return false
      if (stockFilter === 'pending' && p.isApproved !== false) return false

      // Search query filter (matches name, SKU, or any barcode)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchesName = p.name.toLowerCase().includes(q)
        const matchesSku = p.sku.toLowerCase().includes(q)
        const matchesBarcode = p.barcodes.some((b) => b.barcode.toLowerCase().includes(q))
        const matchesImei = (p.imei1 && p.imei1.toLowerCase().includes(q)) || (p.imei2 && p.imei2.toLowerCase().includes(q))
        if (!matchesName && !matchesSku && !matchesBarcode && !matchesImei) return false
      }

      return true
    })
  }, [categoryGroups, selectedCategory, stockFilter, searchQuery])

  // Quick Counts
  const stats = useMemo(() => {
    const total = products.filter((p) => p.status !== 'DISCONTINUED').length
    const lowStock = products.filter((p) => p.status !== 'DISCONTINUED' && p.quantity > 0 && p.quantity <= p.minStockLevel).length
    const outOfStock = products.filter((p) => p.status !== 'DISCONTINUED' && p.quantity === 0).length
    const pending = products.filter((p) => p.isApproved === false).length
    const totalInventoryValue = products
      .filter((p) => p.status !== 'DISCONTINUED')
      .reduce((sum, p) => sum + p.quantity * p.purchasePrice, 0)
    return { total, lowStock, outOfStock, pending, totalInventoryValue }
  }, [products])

  const handleEditProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentProduct || editPhotoBusy) return

    try {
      const res = await fetch(`/api/products/${currentProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: currentProduct.name,
          images: currentProduct.images,
          purchasePrice: currentProduct.purchasePrice,
          sellingPrice: currentProduct.sellingPrice,
          minSellingPrice: currentProduct.minSellingPrice,
          minStockLevel: currentProduct.minStockLevel,
          categoryId: currentProduct.categoryId,
          brandId: currentProduct.brandId,
          description: currentProduct.description,
        }),
      })

      const json = await res.json()
      if (json.success) {
        toast.success('Product updated successfully!')
        setIsEditModalOpen(false)
        loadData()
      } else {
        toast.error(json.error || 'Failed to update product')
      }
    } catch {
      toast.error('Network error updating product')
    }
  }

  // ── Handle Archive Product ─────────────────────────────────
  const handleArchive = async () => {
    if (!currentProduct) return
    try {
      const res = await fetch(`/api/products/${currentProduct.id}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (json.success) {
        toast.success(`Product "${currentProduct.name}" archived!`)
        setIsArchiveModalOpen(false)
        loadData()
      } else {
        toast.error(json.error || 'Failed to archive product')
      }
    } catch {
      toast.error('Network error archiving product')
    }
  }

  // ── Handle Stock Movement (Stock In / Stock Out) ────────────
  const handleStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stockForm.productId) {
      toast.error('Please select a product')
      return
    }

    const qty = parseInt(stockForm.quantity)
    if (!qty || qty <= 0) {
      toast.error('Please enter a valid positive quantity')
      return
    }

    setIsSubmittingStock(true)
    try {
      const res = await fetch('/api/inventory/movement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: stockForm.productId,
          variantId: stockForm.variantId || undefined,
          direction: stockForm.direction,
          type: stockForm.type,
          quantity: qty,
          unitCost: stockForm.unitCost ? parseFloat(stockForm.unitCost) : undefined,
          reason: stockForm.reason || (stockForm.direction === 'IN' ? 'Stock Restock' : 'Stock Adjustment'),
        }),
      })

      const json = await res.json()
      if (json.success) {
        toast.success(
          `${stockForm.direction === 'IN' ? 'Stock In (+)' : 'Stock Out (-)'} ${qty} units recorded!`
        )
        setIsStockModalOpen(false)
        setStockForm({
          productId: '',
          variantId: '',
          direction: 'IN',
          type: 'PURCHASE',
          quantity: '5',
          unitCost: '',
          reason: '',
        })
        loadData()
      } else {
        toast.error(json.error || 'Failed to record movement')
      }
    } catch {
      toast.error('Network error recording inventory movement')
    } finally {
      setIsSubmittingStock(false)
    }
  }

  // ── Handle Owner Review & Approval ──────────────────────────
  const handleApproveProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!approvingProduct) return

    const purchase = parseFloat(approvalForm.purchasePrice) || 0
    const selling = parseFloat(approvalForm.sellingPrice) || 0
    const minSelling = parseFloat(approvalForm.minSellingPrice) || 0

    if (selling <= 0) {
      toast.error('Selling price must be greater than 0 before approving for POS.')
      return
    }

    if (minSelling > selling) {
      toast.error('Minimum threshold price cannot be higher than Selling price.')
      return
    }

    try {
      setIsApprovingBusy(true)
      const res = await fetch(`/api/products/${approvingProduct.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchasePrice: purchase,
          sellingPrice: selling,
          minSellingPrice: minSelling,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to approve product')
      }

      toast.success(`"${approvingProduct.name}" approved & activated for POS sales!`)
      setApprovingProduct(null)
      loadData()
    } catch (err: any) {
      toast.error(err.message || 'Error approving product')
    } finally {
      setIsApprovingBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* ── Top Header Navigation ────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-slate-900 border-b border-slate-800 text-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center hover:bg-slate-700 transition"
              title="Return to Dashboard"
            >
              <Home className="w-4.5 h-4.5 text-slate-300" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-lg leading-tight tracking-tight text-white">Product & Inventory</h1>
                <span className="text-xs bg-blue-600/30 text-blue-300 border border-blue-500/30 font-semibold px-2 py-0.5 rounded-full">
                  Catalog
                </span>
              </div>
              <p className="text-xs text-slate-400">Manage catalog, variants, prices & stock levels</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isOwner && (
              <button
                onClick={() => setIsStockModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
              >
                <Box className="w-4 h-4 text-emerald-400" />
                <span>Stock In/Out</span>
              </button>
            )}
            <button
              aria-label="Add Product"
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/30 transition"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Product</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Content Container ───────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* ── Pending Owner Approval Notification Banner ─────── */}
        {isOwner && stats.pending > 0 && (
          <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200/90 text-amber-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs animate-fadeIn">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⏳</span>
              <div>
                <h4 className="text-sm font-bold text-amber-950">
                  {stats.pending} Product{stats.pending !== 1 ? 's' : ''} Awaiting Owner Approval & Pricing
                </h4>
                <p className="text-xs text-amber-800/90 mt-0.5">
                  Staff has submitted items without final prices. Set purchase cost, selling price, and threshold limit to approve and activate for POS.
                </p>
              </div>
            </div>
            <button
              onClick={() => setStockFilter('pending')}
              className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-1.5 transition whitespace-nowrap shadow-xs"
            >
              Review Pending Items ({stats.pending})
            </button>
          </div>
        )}

        {/* ── Metric Snapshot Banner ─────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-6">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1.5">
              <span>Total Active Products</span>
              <Package className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Across {categories.length} categories</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1.5">
              <span>Low Stock Alerts</span>
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold text-amber-600">{stats.lowStock}</div>
            <div className="text-[11px] text-amber-600/80 mt-0.5">Quantity &le; Min level</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1.5">
              <span>Out of Stock</span>
              <AlertCircle className="w-4 h-4 text-red-500" />
            </div>
            <div className="text-2xl font-bold text-red-600">{stats.outOfStock}</div>
            <div className="text-[11px] text-red-500/80 mt-0.5">Urgent restock needed</div>
          </div>

          {isOwner ? (
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1.5">
                <span>Inventory Valuation</span>
                <DollarSign className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-bold text-emerald-700">
                {Number.isFinite(stats.totalInventoryValue)
                  ? `Rs ${stats.totalInventoryValue.toLocaleString('en-PK', {maximumFractionDigits: 0})}`
                  : 'Restricted'}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">At wholesale cost</div>
            </div>
          ) : (
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1.5">
                <span>Catalog Status</span>
                <Package className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-2xl font-bold text-slate-800">{stats.total}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Active retail items</div>
            </div>
          )}
        </div>

        {/* ── Search & Filters Bar ────────────────────────────── */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs mb-6 space-y-4">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search products by name, SKU, or scan barcode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50/50"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Stock Status Buttons */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl text-xs font-medium self-start md:self-auto">
              <button
                onClick={() => setStockFilter('all')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  stockFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Stock
              </button>
              <button
                onClick={() => setStockFilter('low')}
                className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1 ${
                  stockFilter === 'low' ? 'bg-white text-amber-700 shadow-xs font-semibold' : 'text-slate-600 hover:text-amber-700'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Low ({stats.lowStock})
              </button>
              <button
                onClick={() => setStockFilter('out')}
                className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1 ${
                  stockFilter === 'out' ? 'bg-white text-red-700 shadow-xs font-semibold' : 'text-slate-600 hover:text-red-700'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-red-500" />
                Out ({stats.outOfStock})
              </button>
              {stats.pending > 0 && (
                <button
                  onClick={() => setStockFilter('pending')}
                  className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                    stockFilter === 'pending'
                      ? 'bg-amber-500 text-white shadow-xs font-bold'
                      : 'bg-amber-100 text-amber-800 hover:bg-amber-200 font-semibold'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse" />
                  Needs Approval ({stats.pending})
                </button>
              )}
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
            {([
              { id: 'smartphones', name: 'Smartphones' },
              { id: 'accessories', name: 'Accessories' },
            ] as const).map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                aria-pressed={selectedCategory === cat.id}
                className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition border ${
                  selectedCategory === cat.id
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {cat.name} ({categoryGroups[cat.id].length})
              </button>
            ))}
          </div>
        </div>

        {/* ── Products Display Grid ───────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-5 border border-slate-200 animate-pulse space-y-4">
                <div className="h-6 bg-slate-100 rounded-md w-3/4" />
                <div className="h-4 bg-slate-100 rounded-md w-1/2" />
                <div className="h-10 bg-slate-100 rounded-md" />
                <div className="h-8 bg-slate-100 rounded-md" />
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-md mx-auto">
            <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">No products match your criteria</h3>
            <p className="text-xs text-slate-500 mb-5">Try adjusting your search terms or clearing your category filters.</p>
            <button
              onClick={() => {
                setSearchQuery('')
                setStockFilter('all')
              }}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition"
            >
              Clear All Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProducts.map((product) => {
              const isLowStock = product.quantity > 0 && product.quantity <= product.minStockLevel
              const isOut = product.quantity === 0
              const margin = isOwner && product.sellingPrice > 0 && product.purchasePrice !== undefined
                ? Math.round(((product.sellingPrice - product.purchasePrice) / product.sellingPrice) * 100)
                : null

              return (
                <div
                  key={product.id}
                  className="bg-white rounded-2xl border border-slate-200/90 hover:border-slate-300 hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden group"
                >
                  <div className="p-5">
                    {/* Category & Stock Tag */}
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <span className="text-[11px] font-semibold tracking-wide uppercase px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-600">
                        {product.category?.name || 'General'}
                      </span>

                      <div className="flex items-center gap-1.5">
                        {product.isApproved === false ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            Needs Approval
                          </span>
                        ) : isOut ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-red-100 text-red-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
                            Out of Stock
                          </span>
                        ) : isLowStock ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                            Low Stock ({product.quantity})
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            {product.quantity} in stock
                          </span>
                        )}

                        {/* Storefront visibility badge */}
                        {product.isPublished ? (
                          <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200" title="Published on customer website">
                            <span>🌐</span> Store
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500" title="Hidden from customer website">
                            Draft
                          </span>
                        )}
                        {product.isFeatured && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                            ⭐ Featured
                          </span>
                        )}
                      </div>
                    </div>

                    {product.images?.length > 0 && <div className="flex gap-2 overflow-x-auto mb-3">
                      {product.images.map((src, index) => (
                        // Stored product images may be data URLs or existing catalog URLs.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={index} src={src} alt={`${product.name} photo ${index + 1}`} className="w-24 h-24 rounded-xl object-contain bg-slate-50 border border-slate-100 shrink-0"/>
                      ))}
                    </div>}
                    {/* Product Title & Brand */}
                    <h3 className="font-bold text-slate-900 text-base leading-snug mb-1 group-hover:text-blue-600 transition">
                      {product.name}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mb-3">
                      <span>SKU: <strong className="text-slate-600 font-mono">{product.sku}</strong></span>
                      {product.brand && (
                        <>
                          <span>•</span>
                          <span className="text-slate-600">{product.brand.name}</span>
                        </>
                      )}
                    </div>

                    {/* Barcode Snippet */}
                    {product.barcodes && product.barcodes.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono bg-slate-50 px-2.5 py-1 rounded-lg w-fit mb-3">
                        <Barcode className="w-3.5 h-3.5 text-slate-400" />
                        <span>{product.barcodes[0]?.barcode}</span>
                      </div>
                    )}

                    {/* Variants preview if any */}
                    {product.variants && product.variants.length > 0 && (
                      <div className="mb-3.5 p-2 rounded-xl bg-blue-50/60 border border-blue-100/80 text-[11px]">
                        <div className="font-semibold text-blue-900 mb-1 flex items-center justify-between">
                          <span>{product.variants.length} Variants</span>
                          <span className="text-blue-600">e.g. {product.variants[0]?.name}</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {product.variants.map((v) => (
                            <span key={v.id} className="bg-white border border-blue-200 px-1.5 py-0.5 rounded-md text-[10px] text-slate-700">
                              {v.name} ({v.quantity})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {(product.imei1 || product.imei2) && (
                      <div className="text-xs text-slate-500 space-y-1 mb-3">
                        <div className="flex items-center justify-between">
                          {product.imei1 && <p>IMEI 1: <span className="font-mono font-medium">{product.imei1}</span></p>}
                          {product.imeiCycle && product.imeiCycle > 1 ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-300">
                              Cycle #{product.imeiCycle}
                            </span>
                          ) : null}
                        </div>
                        {product.imei2 && <p>IMEI 2: <span className="font-mono font-medium">{product.imei2}</span></p>}
                      </div>
                    )}

                    {/* Pricing Grid */}
                    {isOwner ? (
                      <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50/80 border border-slate-100 text-center">
                        <div>
                          <div className="text-[10px] text-slate-400 font-medium">Selling Price</div>
                          <div className="text-sm font-bold text-slate-900">₨{product.sellingPrice.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 font-medium">Cost Price</div>
                          <div className="text-sm font-medium text-slate-600">{product.purchasePrice === undefined ? '—' : `Rs ${product.purchasePrice.toLocaleString()}`}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 font-medium">Gross Margin</div>
                          <div className="text-sm font-semibold text-emerald-600">{margin !== null && Number.isFinite(margin) ? `${margin}%` : '—'}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-100 flex items-center justify-between">
                        <div>
                          <div className="text-[10px] text-slate-400 font-medium">Selling Price</div>
                          <div className="text-base font-bold text-slate-900">₨{product.sellingPrice.toLocaleString()}</div>
                        </div>
                        <span className="text-xs px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200/60">
                          Retail Price
                        </span>
                      </div>
                    )}
                    {product.minSellingPrice > 0 && (
                      <div className="mt-2 flex items-center justify-between px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200/60 text-[11px] text-amber-800">
                        <span className="font-medium">Threshold (Min Sell):</span>
                        <span className="font-bold">₨{product.minSellingPrice.toLocaleString()}</span>
                      </div>
                    )}

                    {product.isApproved === false && (
                      <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                        <div className="flex items-center justify-between text-xs text-amber-800 mb-2">
                          <span className="font-semibold flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                            Cashier Added Product
                          </span>
                          <span className="text-[10px] bg-amber-200/70 text-amber-900 font-bold px-1.5 py-0.5 rounded">Pending Approval</span>
                        </div>
                        {isOwner ? (
                          <button
                            type="button"
                            onClick={() => {
                              setApprovingProduct(product)
                              setApprovalForm({
                                purchasePrice: product.purchasePrice ? String(product.purchasePrice) : '',
                                sellingPrice: product.sellingPrice ? String(product.sellingPrice) : '',
                                minSellingPrice: product.minSellingPrice ? String(product.minSellingPrice) : '',
                              })
                            }}
                            className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            Review Prices & Approve for POS
                          </button>
                        ) : (
                          <p className="text-[11px] text-amber-700 italic text-center">
                            Submitted to Owner for price setup & approval.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Card Bottom Actions */}
                  <div className="px-5 py-3 bg-slate-50/60 border-t border-slate-100 flex items-center justify-between">
                    {isOwner ? (
                      <button
                        onClick={() => {
                          setStockForm({
                            productId: product.id,
                            variantId: '',
                            direction: 'IN',
                            type: 'PURCHASE',
                            quantity: '10',
                            unitCost: product.purchasePrice?.toString() ?? '',
                            reason: 'Manual Stock Intake',
                          })
                          setIsStockModalOpen(true)
                        }}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition"
                      >
                        <ArrowDownLeft className="w-3.5 h-3.5" />
                        Adjust Stock
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">iZone Catalog</span>
                    )}

                    <div className="flex items-center gap-1.5">
                      {/* Quick Storefront Publish Toggle */}
                      <button
                        onClick={async () => {
                          const newPublished = !product.isPublished
                          try {
                            const res = await fetch(`/api/products/${product.id}`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ isPublished: newPublished }),
                            })
                            if (res.ok) {
                              toast.success(newPublished ? `"${product.name}" published to website` : `"${product.name}" hidden from website`)
                              loadData()
                            }
                          } catch {
                            toast.error('Failed to update website catalog status')
                          }
                        }}
                        className={`text-[11px] font-semibold px-2 py-1 rounded-lg border transition flex items-center gap-1 ${
                          product.isPublished
                            ? 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100'
                            : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                        }`}
                        title="Toggle visibility on customer website"
                      >
                        <span>🌐</span>
                        <span>{product.isPublished ? 'Online' : 'Hidden'}</span>
                      </button>

                      <button
                        onClick={() => {
                          setCurrentProduct(product)
                          setIsEditModalOpen(true)
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition"
                        title="Edit Product"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setCurrentProduct(product)
                          setIsArchiveModalOpen(true)
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                        title="Archive Product"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* ── MODAL: ADD PRODUCT ───────────────────────────────── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h2 className="font-bold text-base">Add New Product</h2>
                <p className="text-xs text-slate-400">Enter a title, scan a barcode, and set your stock.</p>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[75vh] overflow-y-auto">
              <ProductIntakeForm onSaved={() => { setIsAddModalOpen(false); loadData() }} onCancel={() => setIsAddModalOpen(false)} />
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: EDIT PRODUCT ──────────────────────────────── */}
      {isEditModalOpen && currentProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h2 className="font-bold text-base">Edit Product</h2>
                <p className="text-xs text-slate-400">SKU: {currentProduct.sku}</p>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditProduct} className="p-6 space-y-4 max-h-[75dvh] overflow-y-auto">
              <ProductPhotos images={currentProduct.images || []} onChange={images => setCurrentProduct(previous => previous ? {...previous, images} : previous)} onBusyChange={setEditPhotoBusy}/>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={currentProduct.name}
                  onChange={(e) => setCurrentProduct({ ...currentProduct, name: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cost Price (₨)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={currentProduct.purchasePrice}
                    onChange={(e) => setCurrentProduct({ ...currentProduct, purchasePrice: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Selling Price (₨)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={currentProduct.sellingPrice}
                    onChange={(e) => setCurrentProduct({ ...currentProduct, sellingPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-blue-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-amber-800 mb-1">Threshold Price (₨)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={currentProduct.minSellingPrice || ''}
                    onChange={(e) => setCurrentProduct({ ...currentProduct, minSellingPrice: parseFloat(e.target.value) || 0 })}
                    placeholder="Min floor"
                    className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm focus:border-amber-500"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-500">Threshold Selling Price: Cashiers/sellers cannot discount or sell below this floor price.</p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Low Stock Threshold</label>
                <input
                  type="number"
                  value={currentProduct.minStockLevel}
                  onChange={(e) => setCurrentProduct({ ...currentProduct, minStockLevel: parseInt(e.target.value) || 5 })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editPhotoBusy}
                  className="px-5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-md"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: STOCK IN / STOCK OUT MOVEMENT ─────────────── */}
      {isStockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Box className="w-5 h-5 text-emerald-400" />
                <div>
                  <h2 className="font-bold text-base">Inventory Stock Adjustment</h2>
                  <p className="text-xs text-slate-400">Auditable Stock In & Stock Out records</p>
                </div>
              </div>
              <button
                onClick={() => setIsStockModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleStockSubmit} className="p-6 space-y-4">
              {/* Direction selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Action Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setStockForm({ ...stockForm, direction: 'IN', type: 'PURCHASE' })}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                      stockForm.direction === 'IN'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
                    Stock In (Restock)
                  </button>

                  <button
                    type="button"
                    onClick={() => setStockForm({ ...stockForm, direction: 'OUT', type: 'ADJUSTMENT' })}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                      stockForm.direction === 'OUT'
                        ? 'bg-red-50 border-red-500 text-red-700 ring-2 ring-red-500/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <ArrowUpRight className="w-4 h-4 text-red-600" />
                    Stock Out (Deduct)
                  </button>
                </div>
              </div>

              {/* Product selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Product *</label>
                <select
                  required
                  value={stockForm.productId}
                  onChange={(e) => {
                    const sel = products.find((p) => p.id === e.target.value)
                    setStockForm({
                      ...stockForm,
                      productId: e.target.value,
                      unitCost: sel?.purchasePrice?.toString() ?? '',
                    })
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="">-- Choose product from list --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Current Stock: {p.quantity})
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity input */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Quantity ({stockForm.direction === 'IN' ? '+ In' : '- Out'}) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={stockForm.quantity}
                    onChange={(e) => setStockForm({ ...stockForm, quantity: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Unit Cost (₨)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Optional cost"
                    value={stockForm.unitCost}
                    onChange={(e) => setStockForm({ ...stockForm, unitCost: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason / Note</label>
                <input
                  type="text"
                  placeholder={stockForm.direction === 'IN' ? 'e.g. Restock from Hafeez Center' : 'e.g. Damaged piece write-off'}
                  value={stockForm.reason}
                  onChange={(e) => setStockForm({ ...stockForm, reason: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsStockModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingStock}
                  className={`px-5 py-2 text-xs font-semibold text-white rounded-xl shadow-md transition disabled:opacity-50 ${
                    stockForm.direction === 'IN' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'
                  }`}
                >
                  {isSubmittingStock ? 'Recording...' : `Confirm ${stockForm.direction === 'IN' ? 'Stock In' : 'Stock Out'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: ARCHIVE CONFIRMATION ───────────────────────── */}
      {isArchiveModalOpen && currentProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-center animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-3">
              <Archive className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 text-base mb-1">Archive Product?</h3>
            <p className="text-xs text-slate-500 mb-5">
              Are you sure you want to archive <strong>&ldquo;{currentProduct.name}&rdquo;</strong>? It will no longer appear on POS terminals or online storefronts.
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setIsArchiveModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleArchive}
                className="px-4 py-2 text-xs font-semibold bg-red-600 hover:bg-red-500 text-white rounded-xl shadow-md"
              >
                Yes, Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: OWNER REVIEW & APPROVAL ───────────────────── */}
      {approvingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Review & Approve Product</h3>
                  <p className="text-xs text-slate-500">
                    Verify pricing and activate for cashiers to sell on POS
                  </p>
                </div>
              </div>
              <button
                onClick={() => setApprovingProduct(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Product Summary Details */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 mb-5">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">{approvingProduct.name}</h4>
                  <p className="text-xs text-slate-500">
                    SKU: <span className="font-mono font-medium">{approvingProduct.sku}</span> • Stock: {approvingProduct.quantity} units
                  </p>
                </div>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                  Pending Owner Approval
                </span>
              </div>
              {(approvingProduct.imei1 || approvingProduct.imei2) && (
                <div className="mt-2.5 pt-2.5 border-t border-slate-200/80 text-xs text-slate-600 space-y-0.5">
                  {approvingProduct.imei1 && (
                    <div className="flex items-center justify-between">
                      <span>IMEI 1: <strong className="font-mono">{approvingProduct.imei1}</strong></span>
                      {approvingProduct.imeiCycle && approvingProduct.imeiCycle > 1 ? (
                        <span className="text-[10px] font-bold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded">Cycle #{approvingProduct.imeiCycle}</span>
                      ) : null}
                    </div>
                  )}
                  {approvingProduct.imei2 && (
                    <div>IMEI 2: <strong className="font-mono">{approvingProduct.imei2}</strong></div>
                  )}
                </div>
              )}
            </div>

            <form onSubmit={handleApproveProduct} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Purchase / Cost Price (₨) <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">₨</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    value={approvalForm.purchasePrice}
                    onChange={(e) => setApprovalForm({ ...approvalForm, purchasePrice: e.target.value })}
                    className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-mono"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">What the shop paid to acquire this product</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Retail Selling Price (₨) <span className="text-red-500 font-bold">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">₨</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="Enter retail price"
                    value={approvalForm.sellingPrice}
                    onChange={(e) => setApprovalForm({ ...approvalForm, sellingPrice: e.target.value })}
                    className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-mono font-bold text-slate-900"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">Standard price charged to customers at checkout</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Threshold (Minimum Selling Price) (₨) <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">₨</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 50000"
                    value={approvalForm.minSellingPrice}
                    onChange={(e) => setApprovalForm({ ...approvalForm, minSellingPrice: e.target.value })}
                    className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-mono"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Cashier will NOT be able to discount or sell below this floor price
                </p>
              </div>

              {/* Profit & Margin Calculator Preview */}
              {parseFloat(approvalForm.sellingPrice) > 0 && parseFloat(approvalForm.purchasePrice) > 0 && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs flex items-center justify-between">
                  <div>
                    <span className="text-emerald-800 font-medium">Estimated Profit: </span>
                    <strong className="text-emerald-900 font-bold">
                      ₨{(parseFloat(approvalForm.sellingPrice) - parseFloat(approvalForm.purchasePrice)).toLocaleString()}
                    </strong>
                  </div>
                  <div>
                    <span className="text-emerald-800 font-medium">Margin: </span>
                    <strong className="text-emerald-900 font-bold">
                      {Math.round(((parseFloat(approvalForm.sellingPrice) - parseFloat(approvalForm.purchasePrice)) / parseFloat(approvalForm.sellingPrice)) * 100)}%
                    </strong>
                  </div>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setApprovingProduct(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isApprovingBusy}
                  className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-md transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  {isApprovingBusy ? 'Activating...' : 'Approve & Activate for POS'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
