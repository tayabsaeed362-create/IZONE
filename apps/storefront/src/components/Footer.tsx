import React from 'react'
import Link from 'next/link'
import { Phone, MapPin, Clock, ShieldCheck, Truck, RefreshCw } from 'lucide-react'
import { getWhatsAppNumber } from '@/lib/whatsapp'

export function Footer() {
  const waNumber = getWhatsAppNumber()

  return (
    <footer className="bg-slate-950 border-t border-slate-800/80 text-slate-400 text-sm">
      {/* ── Feature Highlights Banner ────────────────────────────── */}
      <div className="border-b border-slate-900 bg-slate-900/40 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">100% Genuine</h4>
              <p className="text-xs text-slate-400">Official authentic stock guaranteed</p>
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Fast Nationwide Delivery</h4>
              <p className="text-xs text-slate-400">Cash on delivery across Pakistan</p>
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Warranty & Return</h4>
              <p className="text-xs text-slate-400">Verified shop warranty protection</p>
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">WhatsApp Support</h4>
              <p className="text-xs text-slate-400">Direct order assistance with Haider</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Footer Links ────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand Info */}
          <div className="space-y-4 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-600 to-cyan-400 flex items-center justify-center text-white font-black text-sm shadow-md">
                iZ
              </div>
              <span className="text-lg font-black text-white tracking-tight">
                iZone <span className="text-sky-400 font-semibold text-xs">by Haider</span>
              </span>
            </Link>
            <p className="text-xs leading-relaxed text-slate-400">
              Your premier retail destination for authentic smartphones, high-speed GaN chargers, wireless earbuds, smartwatches, and premium phone covers in Pakistan.
            </p>
            <div className="pt-2">
              <a
                href={`https://wa.me/${waNumber}?text=Hello%20iZone%20by%20Haider.`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition"
              >
                <Phone className="w-3.5 h-3.5" /> Order via WhatsApp
              </a>
            </div>
          </div>

          {/* Quick Categories */}
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Popular Categories</h3>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/products?category=smartphones" className="hover:text-white transition">Smartphones (Apple & Samsung)</Link>
              </li>
              <li>
                <Link href="/products?category=chargers-adapters" className="hover:text-white transition">Fast Chargers & Adapters</Link>
              </li>
              <li>
                <Link href="/products?category=wireless-earbuds" className="hover:text-white transition">AirPods & Wireless Earbuds</Link>
              </li>
              <li>
                <Link href="/products?category=power-banks" className="hover:text-white transition">High-Capacity Power Banks</Link>
              </li>
              <li>
                <Link href="/products?category=mobile-covers" className="hover:text-white transition">Cases, Covers & Screen Protectors</Link>
              </li>
            </ul>
          </div>

          {/* Customer Service & Policies */}
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Customer Service</h3>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/products" className="hover:text-white transition">Full Product Catalog</Link>
              </li>
              <li>
                <a href={`https://wa.me/${waNumber}?text=Check%20Warranty%20Claim`} target="_blank" rel="noopener noreferrer" className="hover:text-white transition">Warranty Claim & Verification</a>
              </li>
              <li>
                <span className="text-slate-500">7-Day Check Warranty Policy</span>
              </li>
              <li>
                <span className="text-slate-500">Local Pickup Available</span>
              </li>
              <li>
                <span className="text-slate-500">Same-Day Dispatch</span>
              </li>
            </ul>
          </div>

          {/* Shop Location & Contact */}
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Visit Our Store</h3>
            <ul className="space-y-2.5 text-xs">
              <li className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <span>Shop #12, Ground Floor, Mobile Market, Pakistan</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                <a href={`tel:+${waNumber}`} className="hover:text-white transition font-mono">+{waNumber}</a>
              </li>
              <li className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Mon – Sat: 11:00 AM – 10:00 PM</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom copyright */}
        <div className="mt-12 pt-6 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <p>© {new Date().getFullYear()} iZone by Haider. All rights reserved.</p>
          <p className="flex items-center gap-2">
            <span>Prices listed in PKR (Rs.)</span>
            <span>•</span>
            <span>Stock updated from central POS</span>
          </p>
        </div>
      </div>
    </footer>
  )
}
