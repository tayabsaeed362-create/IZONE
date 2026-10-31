'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  BarChart3, TrendingUp, DollarSign, ArrowLeft, Download,
  Package, Calendar, Users, CreditCard, RotateCcw, AlertTriangle,
  ChevronRight, Award, AlertCircle,
} from 'lucide-react'
import { useSession } from 'next-auth/react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

type AnalyticsData = {
  range: string
  overview: {
    revenue: number
    grossProfit: number
    grossMarginPercent: number
    totalExpenses: number
    netProfit: number
    totalUnitsSold: number
    totalTransactions: number
    totalReturnsAmount: number
    totalReturnsCount: number
  }
  valuation: {
    purchaseCost: number
    retailPotential: number
  }
  salesTrend: Array<{ date: string; revenue: number; profit: number; count: number }>
  categorySales: Array<{ categoryName: string; revenue: number; count: number }>
  paymentMethods: Array<{ method: string; amount: number; count: number }>
  cashierPerformance: Array<{
    userId: string
    name: string
    role: string
    totalRevenue: number
    transactionCount: number
  }>
  bestSelling: Array<{
    productId: string
    name: string
    sku: string
    quantity: number
    revenue: number
  }>
  slowMoving: Array<{
    id: string
    name: string
    sku: string
    quantity: number
    tiedUpCapital: number
  }>
}

const PIE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#6366F1']

function formatCurrency(n: number) {
  if (n >= 1_000_000) return `₨${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `₨${(n / 1_000).toFixed(0)}K`
  return `₨${Math.round(n).toLocaleString()}`
}

export default function ReportsPage() {
  const { data: session, status } = useSession()
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [range, setRange] = useState<'today' | 'week' | 'month' | 'year'>('month')

  async function fetchAnalytics() {
    setLoading(true)
    setLoadError('')
    setData(null)
    try {
      const res = await fetch(`/api/reports/analytics?range=${range}`)
      if (!res.ok) throw new Error(res.status === 401 ? 'Sign in to view your reports.' : 'Reports are unavailable. Please try again.')
      if (res.ok) {
        const json = await res.json()
        if (json.success) setData(json.data)
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to load reports')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAnalytics()
  }, [range])

  function exportCSV() {
    if (!data) return

    let csvContent = 'data:text/csv;charset=utf-8,'
    csvContent += `iZone by Haider - Sales & Analytics Report (${range.toUpperCase()})\r\n\r\n`
    csvContent += 'Overview Metric,Value\r\n'
    csvContent += `Total Revenue,PKR ${data.overview.revenue}\r\n`
    csvContent += `Gross Profit,PKR ${data.overview.grossProfit}\r\n`
    csvContent += `Gross Margin,${data.overview.grossMarginPercent.toFixed(1)}%\r\n`
    csvContent += `Total Expenses,PKR ${data.overview.totalExpenses}\r\n`
    csvContent += `Estimated Net Profit,PKR ${data.overview.netProfit}\r\n`
    csvContent += `Total Units Sold,${data.overview.totalUnitsSold}\r\n`
    csvContent += `Transactions,${data.overview.totalTransactions}\r\n`
    csvContent += `Inventory Cost Valuation,PKR ${data.valuation.purchaseCost}\r\n`
    csvContent += `Inventory Retail Potential,PKR ${data.valuation.retailPotential}\r\n\r\n`

    csvContent += 'Best Selling Products\r\n'
    csvContent += 'Product Name,SKU,Units Sold,Revenue\r\n'
    data.bestSelling.forEach(p => {
      csvContent += `"${p.name}","${p.sku}",${p.quantity},${p.revenue}\r\n`
    })

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `izone_report_${range}_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (status !== 'loading' && session?.user && session.user.role !== 'OWNER') {
    return (
      <div className="p-8 max-w-md mx-auto text-center space-y-4 my-12 bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle size={24} />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Access Restricted</h2>
        <p className="text-sm text-slate-600">Financial reports & business analytics are restricted to Store Owners only.</p>
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
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="p-2 -ml-2 text-slate-500 hover:text-slate-800 rounded-lg">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">Analytics & Reports</h1>
              <p className="text-xs text-slate-500">Business intelligence, profit margins & sales trends</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCSV}
              disabled={!data}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-5 space-y-6">
        {loadError && <div className="data-error" role="alert"><span>{loadError}</span><Link href="/login?callbackUrl=/reports" className="text-link">Sign in</Link><button onClick={fetchAnalytics}>Retry</button></div>}
        {/* Date Range Tabs */}
        <div className="flex items-center justify-between">
          <div className="flex bg-white rounded-xl border border-slate-200 p-1 shadow-sm">
            {(['today', 'week', 'month', 'year'] as const).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                  range === r
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {r === 'today' ? 'Today' : r === 'week' ? '7 Days' : r === 'month' ? '30 Days' : '1 Year'}
              </button>
            ))}
          </div>

          <span className="text-xs text-slate-400 font-medium hidden sm:inline">
            Real-time data from PostgreSQL central database
          </span>
        </div>

        {/* Financial KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500">Total Revenue</span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <DollarSign size={16} />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900">
              {loading ? '—' : formatCurrency(data?.overview.revenue ?? 0)}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {data?.overview.totalTransactions ?? 0} confirmed sales
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500">Gross Profit</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <TrendingUp size={16} />
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-600">
              {loading ? '—' : formatCurrency(data?.overview.grossProfit ?? 0)}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {data ? `${data.overview.grossMarginPercent.toFixed(1)}% gross margin` : '—'}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500">Expenses & Net Profit</span>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <CreditCard size={16} />
              </div>
            </div>
            <div className="text-2xl font-bold text-indigo-600">
              {loading ? '—' : formatCurrency(data?.overview.netProfit ?? 0)}
            </div>
            <div className="text-xs text-rose-500 font-medium mt-1">
              -{formatCurrency(data?.overview.totalExpenses ?? 0)} overhead expenses
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500">Stock Valuation</span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Package size={16} />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900">
              {loading ? '—' : formatCurrency(data?.valuation.purchaseCost ?? 0)}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Retail potential: {formatCurrency(data?.valuation.retailPotential ?? 0)}
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Revenue Trend Area Chart */}
          <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800 mb-1">Sales & Profit Trend</h2>
            <p className="text-xs text-slate-400 mb-4">Revenue vs gross profit timeline over selected period</p>
            <div className="h-64 w-full">
              {data && data.salesTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.salesTrend}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorProf" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      stroke="#94A3B8"
                      fontSize={11}
                      tickFormatter={str => {
                        const d = new Date(str)
                        return `${d.getDate()}/${d.getMonth() + 1}`
                      }}
                    />
                    <YAxis
                      tickLine={false}
                      stroke="#94A3B8"
                      fontSize={11}
                      tickFormatter={n => `₨${n >= 1000 ? `${(n / 1000).toFixed(0)}k` : n}`}
                    />
                    <Tooltip
                      formatter={(val: any) => [`₨${Math.round(val).toLocaleString()}`, '']}
                      contentStyle={{
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                        fontSize: '12px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue"
                      stroke="#3B82F6"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorRev)"
                    />
                    <Area
                      type="monotone"
                      dataKey="profit"
                      name="Gross Profit"
                      stroke="#10B981"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorProf)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  No sales recorded in this period
                </div>
              )}
            </div>
          </div>

          {/* Payment Methods Breakdown */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex flex-col justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800 mb-1">Payment Methods</h2>
              <p className="text-xs text-slate-400 mb-4">Cash vs electronic payments</p>
              <div className="h-44 w-full">
                {data && data.paymentMethods.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.paymentMethods}
                        dataKey="amount"
                        nameKey="method"
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={4}
                      >
                        {data.paymentMethods.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val: any) => formatCurrency(val)} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    No payment data
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              {data?.paymentMethods.map((pm, i) => (
                <div key={pm.method} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    <span className="text-slate-600 font-medium">{pm.method}</span>
                  </div>
                  <span className="font-bold text-slate-900">{formatCurrency(pm.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Category Sales & Cashier Performance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sales by Category Bar Chart */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800 mb-1">Department & Category Revenue</h2>
            <p className="text-xs text-slate-400 mb-4">Top product categories by volume</p>
            <div className="h-56 w-full">
              {data && data.categorySales.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.categorySales.slice(0, 6)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                    <XAxis type="number" stroke="#94A3B8" fontSize={11} tickFormatter={n => `₨${n >= 1000 ? `${(n / 1000).toFixed(0)}k` : n}`} />
                    <YAxis dataKey="categoryName" type="category" stroke="#94A3B8" fontSize={11} width={90} />
                    <Tooltip formatter={(val: any) => formatCurrency(val)} />
                    <Bar dataKey="revenue" fill="#3B82F6" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  No category data
                </div>
              )}
            </div>
          </div>

          {/* Cashier Performance */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800 mb-1">Cashier & Staff Performance</h2>
            <p className="text-xs text-slate-400 mb-4">Total revenue and bills rung up per user</p>
            {data && data.cashierPerformance.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {data.cashierPerformance.map((c, i) => (
                  <div key={c.userId} className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-700">
                        {c.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                          {c.name}
                          {i === 0 && <Award size={13} className="text-amber-500" />}
                        </div>
                        <div className="text-[11px] text-slate-400">{c.role} • {c.transactionCount} transactions</div>
                      </div>
                    </div>
                    <div className="font-bold text-slate-900 text-sm">
                      {formatCurrency(c.totalRevenue)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-slate-400">No staff sales data recorded</div>
            )}
          </div>
        </div>

        {/* Top Products vs Slow Moving Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Best Sellers */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-800">Best-Selling Items</h2>
                <p className="text-xs text-slate-400">Highest volume accessories and phones</p>
              </div>
              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">
                Top Performers
              </span>
            </div>

            {data && data.bestSelling.length > 0 ? (
              <div className="space-y-2.5">
                {data.bestSelling.map((p, i) => (
                  <div
                    key={p.productId}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-5 h-5 rounded-md bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      <div className="truncate">
                        <div className="text-xs font-bold text-slate-800 truncate">{p.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{p.sku}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <div className="text-xs font-bold text-slate-900">{formatCurrency(p.revenue)}</div>
                      <div className="text-[10px] text-emerald-600 font-semibold">{p.quantity} sold</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">No sales data for top products</div>
            )}
          </div>

          {/* Slow Moving Products */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-800">Slow-Moving Stock Alerts</h2>
                <p className="text-xs text-slate-400">Stocked items with 0 sales in selected period</p>
              </div>
              <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg flex items-center gap-1">
                <AlertTriangle size={12} /> Tied Capital
              </span>
            </div>

            {data && data.slowMoving.length > 0 ? (
              <div className="space-y-2.5">
                {data.slowMoving.map(p => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50/40 border border-amber-200/60"
                  >
                    <div className="truncate min-w-0">
                      <div className="text-xs font-bold text-slate-800 truncate">{p.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {p.quantity} units sitting in store
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <div className="text-xs font-bold text-amber-800 font-mono">
                        {formatCurrency(p.tiedUpCapital)}
                      </div>
                      <div className="text-[10px] text-slate-400">Capital tied up</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">No slow-moving inventory detected</div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
