'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, ShoppingBag, Menu, X, Phone, ShieldCheck, Sparkles } from 'lucide-react'
import { getWhatsAppNumber } from '@/lib/whatsapp'

export function Navbar() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const waNumber = getWhatsAppNumber()

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/products?search=${encodeURIComponent(searchQuery.trim())}`)
      setIsMobileMenuOpen(false)
    }
  }

  return (
    <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80 transition-all">
      {/* ── Top Announcement Bar ───────────────────────────────── */}
      <div className="bg-gradient-to-r from-sky-950 via-slate-900 to-sky-950 border-b border-sky-900/40 text-xs py-1.5 px-4 text-center text-slate-300 font-medium">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="hidden sm:flex items-center gap-4 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5 text-sky-400">
              <ShieldCheck className="w-3.5 h-3.5" /> 100% Genuine Mobile Devices & Accessories
            </span>
            <span>•</span>
            <span>Shop #12, Mobile Market</span>
          </div>

          <div className="mx-auto sm:mx-0 flex items-center gap-3">
            <span className="text-slate-300">Fast Nationwide Shipping & Local Pickup</span>
            <a
              href={`https://wa.me/${waNumber}?text=Hello%20iZone%20by%20Haider,%20I%20have%20an%20inquiry.`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 transition"
            >
              <Phone className="w-3 h-3" /> WhatsApp Order
            </a>
          </div>
        </div>
      </div>

      {/* ── Main Navigation Bar ─────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-cyan-400 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-sky-500/20 group-hover:scale-105 transition">
              iZ
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-black tracking-tight text-white flex items-center gap-1.5">
                iZone
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  Haider
                </span>
              </span>
              <span className="text-[10px] text-slate-400 font-medium tracking-wide">
                SMART RETAIL & ACCESSORIES
              </span>
            </div>
          </Link>

          {/* Search Bar (Desktop) */}
          <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-md mx-4">
            <div className="relative w-full">
              <input
                type="text"
                placeholder="Search phones, chargers, earbuds, cases..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            </div>
          </form>

          {/* Desktop Nav Links */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-300">
            <Link href="/products" className="hover:text-white transition flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              All Catalog
            </Link>
            <Link href="/products?category=smartphones" className="hover:text-white transition">
              Smartphones
            </Link>
            <Link href="/products?category=chargers-adapters" className="hover:text-white transition">
              Chargers
            </Link>
            <Link href="/products?category=wireless-earbuds" className="hover:text-white transition">
              Earbuds
            </Link>
            <Link href="/products?category=power-banks" className="hover:text-white transition">
              Power Banks
            </Link>
          </nav>

          {/* Quick Actions */}
          <div className="flex items-center gap-3">
            <a
              href={`https://wa.me/${waNumber}?text=Hello%20iZone%20by%20Haider,%20I%20want%20to%20order.`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white text-xs font-bold shadow-md shadow-emerald-500/20 transition active:scale-95"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>WhatsApp Order</span>
            </a>

            <Link
              href="/products"
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition"
              title="View Catalog"
            >
              <ShoppingBag className="w-4 h-4" />
            </Link>

            {/* Mobile menu trigger */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Search Input */}
        <div className="md:hidden pb-3">
          <form onSubmit={handleSearch} className="relative w-full">
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          </form>
        </div>
      </div>

      {/* ── Mobile Navigation Dropdown ───────────────────────────── */}
      {isMobileMenuOpen && (
        <div className="lg:hidden bg-slate-900 border-b border-slate-800 px-4 py-4 space-y-3 animate-fadeIn">
          <div className="flex flex-col space-y-2 text-sm font-medium text-slate-300">
            <Link
              href="/products"
              onClick={() => setIsMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-slate-800 hover:text-white transition flex items-center justify-between"
            >
              <span>All Products Catalog</span>
              <Sparkles className="w-4 h-4 text-sky-400" />
            </Link>
            <Link
              href="/products?category=smartphones"
              onClick={() => setIsMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-slate-800 hover:text-white transition"
            >
              Smartphones
            </Link>
            <Link
              href="/products?category=chargers-adapters"
              onClick={() => setIsMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-slate-800 hover:text-white transition"
            >
              Chargers & Adapters
            </Link>
            <Link
              href="/products?category=wireless-earbuds"
              onClick={() => setIsMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-slate-800 hover:text-white transition"
            >
              Wireless Earbuds
            </Link>
            <Link
              href="/products?category=power-banks"
              onClick={() => setIsMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-slate-800 hover:text-white transition"
            >
              Power Banks
            </Link>
            <Link
              href="/products?category=mobile-covers"
              onClick={() => setIsMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-slate-800 hover:text-white transition"
            >
              Mobile Covers & Cases
            </Link>
          </div>

          <div className="pt-2 border-t border-slate-800 flex flex-col gap-2">
            <a
              href={`https://wa.me/${waNumber}?text=Hello%20iZone%20by%20Haider,%20I%20want%20to%20order.`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-center text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
            >
              <Phone className="w-4 h-4" /> Order Directly on WhatsApp
            </a>
          </div>
        </div>
      )}
    </header>
  )
}
