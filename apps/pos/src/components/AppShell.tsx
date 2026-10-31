'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { LayoutDashboard, ShoppingBag, Package, Receipt, Users, BarChart3, Truck, Wallet, RotateCcw, RefreshCw, Menu, X, ArrowUpRight, Store, LogOut, User as UserIcon } from 'lucide-react'
import { useSession, signOut } from 'next-auth/react'

type NavLink = {
  href: string
  label: string
  icon: any
  ownerOnly?: boolean
}

const links: NavLink[] = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/pos', label: 'Point of sale', icon: ShoppingBag },
  { href: '/inventory', label: 'Inventory', icon: Package },
  { href: '/sales', label: 'Sales', icon: Receipt },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/reports', label: 'Reports', icon: BarChart3, ownerOnly: true },
  { href: '/purchases', label: 'Purchases', icon: Truck },
  { href: '/suppliers', label: 'Suppliers', icon: Store, ownerOnly: true },
  { href: '/expenses', label: 'Expenses', icon: Wallet, ownerOnly: true },
  { href: '/returns', label: 'Returns', icon: RotateCcw, ownerOnly: true },
  { href: '/sync', label: 'Sync center', icon: RefreshCw, ownerOnly: true },
]
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const isOwner = session?.user?.role === 'OWNER'
  const visibleLinks = links.filter(link => !link.ownerOnly || isOwner)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  return <div className="app-shell">
    <a className="skip-link" href="#workspace">Skip to content</a>
    {open && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    <aside className={`app-sidebar ${open ? 'is-open' : ''}`} aria-label="Main navigation">
      <Link href="/" className="brand" onClick={() => setOpen(false)}><span className="brand-mark">iZ<span>•</span></span><span>iZone<small>BY HAIDER</small></span></Link>
      <button className="sidebar-close" aria-label="Close navigation" onClick={() => setOpen(false)}><X size={20}/></button>
      <div className="nav-label">WORKSPACE</div>
      <nav>{visibleLinks.map(({ href, label, icon: Icon }, i) => <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={(href === '/' ? pathname === '/' : pathname.startsWith(href)) ? 'page' : undefined} className={`app-nav-link ${i === 5 ? 'nav-divider' : ''}`}><Icon size={18}/><span>{label}</span></Link>)}</nav>
      <div className="sidebar-bottom">
        <span className="store-avatar">{session?.user ? <UserIcon size={19}/> : <Store size={19}/>}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {session?.user ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <strong style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.user.name}</strong>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  title="Sign out"
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                >
                  <LogOut size={15} />
                </button>
              </div>
              <small style={{ color: '#64748b', textTransform: 'capitalize' }}>{session.user.role.toLowerCase()}</small>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <div>
                <strong>Guest</strong>
                <small style={{ display: 'block', color: '#94a3b8' }}>Not signed in</small>
              </div>
              <Link href={`/login?callbackUrl=${encodeURIComponent(pathname)}`} style={{ fontSize: '12px', fontWeight: 600, color: '#3974e8' }}>
                Sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </aside>
    <div className="app-workspace">
      <header className="workspace-bar"><div className="workspace-crumb"><button className="menu-toggle" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}><Menu size={21}/></button><span>Workspace</span><span className="crumb-slash">/</span><strong>{visibleLinks.find(l => l.href === '/' ? pathname === '/' : pathname.startsWith(l.href))?.label || 'Inventory'}</strong></div><Link href="/pos" className="terminal-link">Open terminal <ArrowUpRight size={16}/></Link></header>
      <div id="workspace" className="workspace-content">{children}</div>
    </div>
    <nav className="bottom-navigation" aria-label="Mobile navigation">{visibleLinks.slice(0, 5).map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}><Icon size={20}/><span>{label === 'Point of sale' ? 'POS' : label}</span></Link>)}</nav>
  </div>
}
