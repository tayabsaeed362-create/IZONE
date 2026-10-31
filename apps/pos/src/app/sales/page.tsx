'use client'
import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { Search, ArrowRight, Receipt, RotateCcw } from 'lucide-react'
type Sale = { id: string; saleNumber: string; totalAmount: number; saleAt: string; status: string; customer: { name: string } | null; items: Array<{id:string;productName:string;quantity:number;totalAmount:number}>; payments: Array<{method:string}> }
export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([])
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [unauthorized, setUnauthorized] = useState(false)
  const [selected, setSelected] = useState<Sale | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true); setError(''); setUnauthorized(false)
      try {
        const response = await fetch(`/api/sales?page=${page}&q=${encodeURIComponent(query)}`, {signal:controller.signal})
        if (response.status === 401) { setUnauthorized(true); throw new Error('Sign in to view your sales history.') }
        if (!response.ok) throw new Error('Sales could not be loaded. Please try again.')
        const result = await response.json()
        setSales(result.data.sales); setPages(result.data.pagination.pages || 1)
      } catch (err) { if (!controller.signal.aborted) { setSales([]); setError(err instanceof Error ? err.message : 'Unable to load sales') } }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query,page])
  return <main className="dashboard"><div className="page-heading"><div><div className="eyebrow">YOUR TRANSACTION LEDGER</div><h1>Sales<span>.</span></h1><p>Find transactions and review purchased items.</p></div><Link href="/pos" className="btn-primary">New sale <ArrowRight size={15}/></Link></div><div className="panel"><div className="panel-heading"><h2>Sales history</h2><label className="flex items-center gap-2"><Search size={17}/><input aria-label="Search sales" className="input-field" placeholder="Invoice or customer" value={query} onChange={e => {setQuery(e.target.value);setPage(1)}}/></label></div>{error ? <div className="empty-state" role="alert"><p>{error}</p>{unauthorized && <button className="btn-primary" onClick={() => signIn(undefined,{callbackUrl:'/sales'})}>Sign in</button>}</div> : loading ? <div className="empty-state">Loading sales...</div> : sales.length ? <div className="table-scroll"><table><thead><tr><th>Transaction</th><th>Customer</th><th>Date</th><th>Status</th><th className="numeric">Amount</th></tr></thead><tbody>{sales.map(sale => <tr key={sale.id}><td><button className="text-blue-600" onClick={() => setSelected(selected?.id === sale.id ? null : sale)}>{sale.saleNumber}</button></td><td>{sale.customer?.name || 'Walk-in customer'}</td><td>{new Date(sale.saleAt).toLocaleDateString('en-PK')}</td><td>{sale.status}</td><td className="numeric">Rs {sale.totalAmount.toLocaleString()}</td></tr>)}</tbody></table></div> : <div className="empty-state"><Receipt size={24}/><p>No sales found.</p></div>}<div className="panel-footer"><button disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page} of {pages}</span><button disabled={page >= pages || loading} onClick={() => setPage(p => p + 1)}>Next</button></div></div>{selected && <section className="panel mt-5"><div className="panel-heading"><h2>{selected.saleNumber}</h2><div className="flex items-center gap-3">{selected.status !== 'REFUNDED' && <Link href={`/returns?invoice=${encodeURIComponent(selected.saleNumber)}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-lg text-xs font-semibold hover:bg-amber-500/20 transition-colors"><RotateCcw size={14} /> Return Item</Link>}<button onClick={() => setSelected(null)}>Close</button></div></div>{selected.items.map(item => <div className="product-row" key={item.id}><div><strong>{item.productName}</strong><small>Quantity: {item.quantity}</small></div><span>Rs {item.totalAmount.toLocaleString()}</span></div>)}</section>}</main>
}
