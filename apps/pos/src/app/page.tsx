'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, ArrowRight, ShoppingBag, Package, Receipt, TrendingUp, Plus, RefreshCw, Wifi, WifiOff, AlertTriangle, Layers, Smartphone, Headphones, Zap, Box, CalendarDays } from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { useSyncManager } from '@/hooks/useSyncManager'
import { useSession } from 'next-auth/react'
import type { DashboardStats } from './dashboard-types'

const money = (value: number) => `Rs ${new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(value)}`
const compact = (value: number) => `Rs ${new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}`
const categoryIcon = (name: string) => /sound|audio|earbud|earphone|headphone/i.test(name) ? Headphones : /charg|power|cable/i.test(name) ? Zap : /phone|device|case|galaxy|xiaomi|iphone/i.test(name) ? Smartphone : Box
function Empty({ text }: { text: string }) { return <div className="empty-state"><Package size={25}/><p>{text}</p></div> }
export default function DashboardPage() {
  const { data: session } = useSession()
  const isOwner = session?.user?.role === 'OWNER'
  const sync = useSyncManager()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [date, setDate] = useState('')
  useEffect(() => { setDate(new Date().toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })) }, [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(''); setStats(null)
    fetch(`/api/reports/dashboard?period=${period}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Unable to load dashboard')
      const result = await response.json()
      if (!result.success) throw new Error('Unable to load dashboard')
      setStats(result.data)
    }).catch(err => { if (err.name !== 'AbortError') setError('Your dashboard data is unavailable. Check your connection and try again.') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [period, revision])
  const value = (n: number | undefined, currency = false) => loading ? '…' : n === undefined ? '—' : currency ? money(n) : n.toLocaleString()
  const categories = stats?.categoryDistribution || []
  const categoryTotal = categories.reduce((sum, cat) => sum + cat.revenue, 0)
  const metrics = [
    { label: 'Total revenue', amount: stats?.summary.totalRevenue, currency: true, icon: TrendingUp, note: 'Completed sales', featured: true },
    ...(isOwner ? [
      { label: 'Gross profit', amount: stats?.summary.grossProfit, currency: true, icon: Layers, note: stats ? `${stats.summary.grossMarginPercent.toFixed(1)}% gross margin` : 'Revenue less cost' }
    ] : [
      { label: 'Catalog products', amount: stats?.inventory.totalProducts, icon: Box, note: 'Available in store' }
    ]),
    { label: 'Transactions', amount: stats?.summary.transactionCount, icon: Receipt, note: 'Completed transactions' },
    { label: 'Average order', amount: stats?.summary.averageOrderValue, currency: true, icon: ShoppingBag, note: 'Value per transaction' },
  ]
  return <main className="dashboard">
    <div className="page-heading"><div><div className="eyebrow">YOUR BUSINESS, AT A GLANCE</div><h1>Store overview<span>.</span></h1><p>A clear view of your sales, stock, and daily operations.</p></div><Link href="/pos" className="btn-primary"><Plus size={17}/> New sale</Link></div>
    <section className="welcome-banner"><div><span className="banner-kicker">MADE FOR YOUR EVERYDAY</span><h2>Great retail starts<br/>with a little clarity.</h2><p>Everything you need to keep iZone moving.</p><Link href="/inventory">Explore your inventory <ArrowRight size={16}/></Link></div><div className="device-art" role="img" aria-label="Illustration of a premium smartphone, wireless earbuds and charging accessories"><div className="art-orbit"/><div className="art-phone"><div className="phone-camera"/><div className="phone-glow"/><span>iZ.</span></div><div className="art-buds"><span/><span/><i/></div><div className="art-charger"><Zap size={27}/></div></div><span className="banner-edition">iZONE / RETAIL WORKSPACE</span></section>
    <div className="dashboard-toolbar"><div className="period-control" aria-label="Reporting period">{(['today', 'week', 'month'] as const).map(p => <button key={p} aria-pressed={period === p} onClick={() => setPeriod(p)}>{p === 'today' ? 'Today' : p === 'week' ? 'This week' : 'This month'}</button>)}</div><span className="date-label"><CalendarDays size={15}/>{date}</span><button className="icon-button" aria-label="Refresh dashboard" onClick={() => setRevision(v => v + 1)} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/></button></div>
    {error && <div className="data-error" role="alert"><AlertTriangle size={18}/><span>{error}</span><button onClick={() => setRevision(v => v + 1)}>Retry</button></div>}
    <section className="metrics-grid" aria-label="Sales metrics" aria-busy={loading}>{metrics.map(({ label, amount, currency, icon: Icon, note, featured }) => <article className={`metric-card ${featured ? 'featured' : ''}`} key={label}><div className="metric-title">{label}<span className="metric-icon"><Icon size={18}/></span></div><strong>{value(amount, currency)}</strong><div className="metric-note"><span/>{note}</div></article>)}</section>
    <section className="quick-actions" aria-label="Quick actions">{[
      { href: '/pos', title: 'Make a sale', sub: 'Open your terminal', icon: ShoppingBag },
      { href: '/inventory/new', title: 'Add a product', sub: 'Grow your catalog', icon: Plus },
      ...(isOwner ? [
        { href: '/purchases', title: 'Receive stock', sub: 'Manage purchases', icon: Package },
        { href: '/reports', title: 'View reports', sub: 'See the bigger picture', icon: BarChart3Icon }
      ] : [
        { href: '/sales', title: 'Sales ledger', sub: 'Review sales transactions', icon: Receipt },
        { href: '/inventory', title: 'Check inventory', sub: 'Stock search & barcodes', icon: Package }
      ])
    ].map(({href,title,sub,icon:Icon}) => <Link key={href} href={href}><span className="action-icon"><Icon size={20}/></span><span><strong>{title}</strong><small>{sub}</small></span><ArrowUpRight size={17}/></Link>)}</section>
    <div className="analytics-grid"><section className="panel sales-chart"><div className="panel-heading"><div><h2>Sales performance</h2><p>Revenue for the selected period</p></div><span className="chart-legend"><i/> Revenue</span></div><div className="chart-summary"><strong>{value(stats?.summary.totalRevenue, true)}</strong><span>{period === 'today' ? 'Today' : period === 'week' ? 'This week' : 'This month'}</span></div><div className="chart-container">{loading ? <div className="skeleton"/> : stats?.salesTrend.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={stats.salesTrend} margin={{top: 12, right: 12, left: 0, bottom: 0}}><defs><linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4078ee" stopOpacity={0.22}/><stop offset="100%" stopColor="#4078ee" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="4 5" vertical={false} stroke="#e8edf5"/><XAxis dataKey="date" tickFormatter={d => new Date(`${d}T12:00:00`).toLocaleDateString('en', { month: 'short', day: 'numeric' })} tick={{fontSize: 11, fill: '#7c889c'}} axisLine={false} tickLine={false} dy={10}/><YAxis tickFormatter={compact} tick={{fontSize: 10, fill: '#7c889c'}} axisLine={false} tickLine={false} width={72}/><Tooltip formatter={(n: number) => [money(n), 'Revenue']} contentStyle={{borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12}}/><Area type="monotone" dataKey="revenue" stroke="#3974e8" strokeWidth={3} fill="url(#revenue-fill)" dot={{r: 4, fill: '#3974e8', stroke: '#fff', strokeWidth: 2}}/></AreaChart></ResponsiveContainer> : <Empty text={error ? 'Sales data unavailable' : 'Your next sale starts the story. No sales in this period.'}/>}</div><Link className="panel-footer" href={isOwner ? "/reports" : "/sales"}>{isOwner ? "Explore sales analytics" : "View transaction ledger"} <ArrowRight size={15}/></Link></section>
    <section className="panel"><div className="panel-heading"><div><h2>Inventory snapshot</h2><p>Keep your shelves a step ahead</p></div><Package size={19}/></div>{isOwner && <div className="inventory-value"><span>Inventory value · at cost</span><strong>{value(stats?.inventory.totalValue, true)}</strong></div>}<div className="inventory-counts"><div><strong>{value(stats?.inventory.totalProducts)}</strong><span>Active products</span></div><div><strong>{value(stats?.inventory.totalCustomers)}</strong><span>Customers</span></div></div><Link href="/inventory?filter=low" className="stock-summary"><span className="stock-status amber"/><span>Low stock</span><strong>{value(stats?.inventory.lowStockCount)}</strong><ArrowUpRight size={15}/></Link><Link href="/inventory?filter=out" className="stock-summary"><span className="stock-status rose"/><span>Out of stock</span><strong>{value(stats?.inventory.outOfStockCount)}</strong><ArrowUpRight size={15}/></Link><Link className="panel-footer" href="/inventory">Manage inventory <ArrowRight size={15}/></Link></section></div>
    <div className="details-grid"><section className="panel"><div className="panel-heading"><div><h2>Best sellers</h2><p>Standout products this period</p></div>{isOwner && <Link href="/reports" aria-label="View best seller reports"><ArrowUpRight size={18}/></Link>}</div>{stats?.topProducts.length ? stats.topProducts.map((product, index) => { const Icon = categoryIcon(product.name); return <div className="product-row" key={product.productId}><span className="product-thumbnail"><Icon size={23}/></span><div><strong>{product.name}</strong><small>{product.unitsSold} units sold</small></div><span className="product-amount">{compact(product.revenue)}<small>#{index + 1}</small></span></div> }) : <Empty text={loading ? 'Loading products…' : error ? 'Product data unavailable' : 'Best sellers will appear after your first sale.'}/>}</section>
    <section className="panel"><div className="panel-heading"><div><h2>Stock alerts</h2><p>Items that need your attention</p></div><span className="soft-icon"><AlertTriangle size={18}/></span></div>{stats?.lowStockWatchlist?.length ? stats.lowStockWatchlist.map(product => <Link href="/inventory?filter=low" className="product-row" key={product.id}><span className="product-thumbnail"><Package size={21}/></span><div><strong>{product.name}</strong><small>{product.sku}</small></div><span className={`stock-pill ${product.quantity <= 0 ? 'out' : ''}`}>{product.quantity < 0 ? `Stock deficit (${product.quantity})` : product.quantity === 0 ? 'Out of stock' : `${product.quantity} left`}</span></Link>) : <Empty text={loading ? 'Checking stock…' : error ? 'Stock data unavailable' : 'No stock alerts returned.'}/>}<Link className="panel-footer" href="/inventory?filter=low">Review stock levels <ArrowRight size={15}/></Link></section>
    <section className="panel"><div className="panel-heading"><div><h2>Category mix</h2><p>All-time revenue · top categories</p></div><Layers size={18}/></div>{categories.length ? categories.map((cat, index) => { const Icon = categoryIcon(cat.name); const percent = categoryTotal ? cat.revenue / categoryTotal * 100 : 0; return <div className="category-row" key={cat.name}><span className="category-thumbnail"><Icon size={18}/></span><div><div><strong>{cat.name}</strong><span>{percent.toFixed(0)}%</span></div><div className="category-track"><span style={{width: `${percent}%`, background: ['#3974e8','#678fe3','#92b0eb','#aec4ee','#d0dcf3'][index % 5]}}/></div></div></div> }) : <Empty text={loading ? 'Loading categories…' : error ? 'Category data unavailable' : 'Category insights appear as products sell.'}/>}</section></div>
    <section className="panel recent-sales"><div className="panel-heading"><div><h2>Recent sales</h2><p>The latest activity across your store</p></div><Link className="text-link" href="/sales">View all sales <ArrowRight size={15}/></Link></div>{stats?.recentSales?.length ? <div className="table-scroll"><table><thead><tr><th>Transaction</th><th>Customer</th><th>Items</th><th>Payment</th><th>Date</th><th className="numeric">Amount</th></tr></thead><tbody>{stats.recentSales.map(sale => <tr key={sale.id}><td><Link href="/sales">{sale.saleNumber}</Link></td><td>{sale.customerName}</td><td>{sale.itemCount}</td><td><span className="payment-pill">{sale.paymentMethod.replaceAll('_',' ')}</span></td><td>{new Date(sale.saleAt).toLocaleDateString('en-PK', {month:'short',day:'numeric'})}</td><td className="numeric">{money(sale.totalAmount)}</td></tr>)}</tbody></table></div> : <Empty text={loading ? 'Loading recent sales…' : error ? 'Recent sales unavailable' : 'No transactions yet. Your completed sales will appear here.'}/>}</section>
    {isOwner && stats?.monthly && <section className="monthly-strip"><div><span className="eyebrow">THE MONTH SO FAR</span><h2>Monthly performance</h2></div>{[{label:'Revenue',value:stats.monthly.revenue},{label:'Gross profit',value:stats.monthly.grossProfit},{label:'Expenses',value:stats.monthly.expenses},{label:'Net profit',value:stats.monthly.netProfit}].map(item => <div key={item.label}><span>{item.label}</span><strong>{money(item.value)}</strong></div>)}</section>}
    <footer className="dashboard-footer"><span>iZone by Haider <span className="footer-dot">·</span> A little more in control.</span>{isOwner ? <Link href="/sync">{sync.isOnline ? <Wifi size={14}/> : <WifiOff size={14}/>} {sync.isSyncing ? 'Syncing' : !sync.isOnline ? 'Offline' : sync.pendingCount ? `${sync.pendingCount} pending sync` : 'Connected'}<ArrowUpRight size={13}/></Link> : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#64748b' }}>{sync.isOnline ? <Wifi size={14}/> : <WifiOff size={14}/>} {sync.isSyncing ? 'Syncing' : !sync.isOnline ? 'Offline' : sync.pendingCount ? `${sync.pendingCount} pending sync` : 'Connected'}</span>}</footer>
  </main>
}
function BarChart3Icon({size}: {size?: number}) { return <TrendingUp size={size}/> }

