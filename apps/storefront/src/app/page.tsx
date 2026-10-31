import React from 'react'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Navbar } from '@/components/Navbar'
import { Footer } from '@/components/Footer'
import { ProductCard, StorefrontProduct } from '@/components/ProductCard'
import { getWhatsAppNumber } from '@/lib/whatsapp'
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Truck,
  Phone,
  Zap,
  Smartphone,
  Headphones,
  BatteryCharging,
  Layers,
  Watch,
  CheckCircle2,
} from 'lucide-react'

// Force dynamic rendering so central POS inventory updates reflect on the storefront
export const dynamic = 'force-dynamic'

async function getFeaturedProducts(): Promise<StorefrontProduct[]> {
  try {
    const products = await prisma.product.findMany({
      where: {
        isPublished: true,
        status: 'ACTIVE',
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        brand: { select: { id: true, name: true } },
        variants: {
          select: {
            id: true,
            name: true,
            sku: true,
            sellingPrice: true,
            quantity: true,
          },
        },
      },
      orderBy: [
        { isFeatured: 'desc' },
        { createdAt: 'desc' },
      ],
      take: 8,
    })

    return products as unknown as StorefrontProduct[]
  } catch (err) {
    console.error('Error querying featured products:', err)
    return []
  }
}

async function getCategories() {
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: { products: { where: { isPublished: true, status: 'ACTIVE' } } },
        },
      },
      orderBy: { sortOrder: 'asc' },
    })
    return categories
  } catch (err) {
    console.error('Error querying categories:', err)
    return []
  }
}

export default async function HomePage() {
  const [featuredProducts, categories] = await Promise.all([
    getFeaturedProducts(),
    getCategories(),
  ])

  const waNumber = getWhatsAppNumber()

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f19] text-slate-100 antialiased selection:bg-sky-500 selection:text-white">
      <Navbar />

      <main className="flex-1">
        {/* ── HERO SECTION ─────────────────────────────────────────── */}
        <section className="relative overflow-hidden pt-12 pb-20 lg:pt-20 lg:pb-28 border-b border-slate-800/80">
          {/* Subtle ambient lighting gradients */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-sky-500/10 blur-[130px] rounded-full pointer-events-none" />
          <div className="absolute top-1/3 right-10 w-[300px] h-[300px] bg-cyan-500/10 blur-[100px] rounded-full pointer-events-none" />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="text-center max-w-3xl mx-auto space-y-6">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-semibold backdrop-blur-md">
                <Sparkles className="w-3.5 h-3.5" />
                <span>AUTHORIZED RETAILER & SMARTPHONE SPECIALIST</span>
              </div>

              {/* Main Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.15]">
                Authentic Phones & <br className="hidden sm:inline" />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-cyan-300 to-blue-500">
                  Premium Accessories
                </span>
              </h1>

              {/* Subheading */}
              <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
                Discover genuine Apple, Samsung, Anker, and Joyroom gear with verified shop warranty.
                Fast cash on delivery across Pakistan or direct instant order via WhatsApp.
              </p>

              {/* CTAs */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3.5">
                <Link
                  href="/products"
                  className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-gradient-to-r from-sky-600 to-cyan-500 hover:from-sky-500 hover:to-cyan-400 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-sky-600/25 transition active:scale-95"
                >
                  <span>Explore Product Catalog</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>

                <a
                  href={`https://wa.me/${waNumber}?text=Hello%20iZone%20by%20Haider,%20I%20would%20like%20to%20order.`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 font-bold text-sm flex items-center justify-center gap-2 transition active:scale-95"
                >
                  <Phone className="w-4 h-4 text-emerald-400" />
                  <span>WhatsApp Inquiry</span>
                </a>
              </div>

              {/* Trust Badges */}
              <div className="pt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-slate-400">
                <div className="flex items-center justify-center gap-1.5 p-2 rounded-lg bg-slate-900/40 border border-slate-800">
                  <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>100% Genuine</span>
                </div>
                <div className="flex items-center justify-center gap-1.5 p-2 rounded-lg bg-slate-900/40 border border-slate-800">
                  <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Same-Day Dispatch</span>
                </div>
                <div className="flex items-center justify-center gap-1.5 p-2 rounded-lg bg-slate-900/40 border border-slate-800">
                  <Truck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Nationwide COD</span>
                </div>
                <div className="flex items-center justify-center gap-1.5 p-2 rounded-lg bg-slate-900/40 border border-slate-800">
                  <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>Verified Warranty</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── FEATURED CATEGORIES SECTION ──────────────────────────── */}
        <section className="py-14 bg-slate-950/60 border-b border-slate-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
              <div>
                <span className="text-xs font-bold text-sky-400 tracking-wider uppercase">BROWSE BY CATEGORY</span>
                <h2 className="text-2xl sm:text-3xl font-black text-white mt-1">
                  Popular Departments
                </h2>
              </div>
              <Link
                href="/products"
                className="text-sm font-semibold text-sky-400 hover:text-sky-300 flex items-center gap-1 transition"
              >
                <span>View all products</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
              {/* Smartphones */}
              <Link
                href="/products?category=smartphones"
                className="group p-4 rounded-2xl bg-slate-900/70 border border-slate-800/80 hover:border-sky-500/50 hover:bg-slate-900 transition flex flex-col items-center text-center gap-2.5"
              >
                <div className="w-12 h-12 rounded-xl bg-sky-500/10 group-hover:bg-sky-500/20 text-sky-400 flex items-center justify-center transition">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white group-hover:text-sky-400 transition">Smartphones</h3>
                  <span className="text-[10px] text-slate-500">Apple & Samsung</span>
                </div>
              </Link>

              {/* Chargers & Adapters */}
              <Link
                href="/products?category=chargers-adapters"
                className="group p-4 rounded-2xl bg-slate-900/70 border border-slate-800/80 hover:border-sky-500/50 hover:bg-slate-900 transition flex flex-col items-center text-center gap-2.5"
              >
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 group-hover:bg-amber-500/20 text-amber-400 flex items-center justify-center transition">
                  <Zap className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white group-hover:text-sky-400 transition">Fast Chargers</h3>
                  <span className="text-[10px] text-slate-500">GaN & 45W/65W</span>
                </div>
              </Link>

              {/* Wireless Earbuds */}
              <Link
                href="/products?category=wireless-earbuds"
                className="group p-4 rounded-2xl bg-slate-900/70 border border-slate-800/80 hover:border-sky-500/50 hover:bg-slate-900 transition flex flex-col items-center text-center gap-2.5"
              >
                <div className="w-12 h-12 rounded-xl bg-purple-500/10 group-hover:bg-purple-500/20 text-purple-400 flex items-center justify-center transition">
                  <Headphones className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white group-hover:text-sky-400 transition">Wireless Earbuds</h3>
                  <span className="text-[10px] text-slate-500">AirPods & Buds</span>
                </div>
              </Link>

              {/* Power Banks */}
              <Link
                href="/products?category=power-banks"
                className="group p-4 rounded-2xl bg-slate-900/70 border border-slate-800/80 hover:border-sky-500/50 hover:bg-slate-900 transition flex flex-col items-center text-center gap-2.5"
              >
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 group-hover:bg-emerald-500/20 text-emerald-400 flex items-center justify-center transition">
                  <BatteryCharging className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white group-hover:text-sky-400 transition">Power Banks</h3>
                  <span className="text-[10px] text-slate-500">10k & 20k mAh</span>
                </div>
              </Link>

              {/* Mobile Covers */}
              <Link
                href="/products?category=mobile-covers"
                className="group p-4 rounded-2xl bg-slate-900/70 border border-slate-800/80 hover:border-sky-500/50 hover:bg-slate-900 transition flex flex-col items-center text-center gap-2.5"
              >
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 group-hover:bg-cyan-500/20 text-cyan-400 flex items-center justify-center transition">
                  <Layers className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white group-hover:text-sky-400 transition">Covers & Cases</h3>
                  <span className="text-[10px] text-slate-500">MagSafe & Clear</span>
                </div>
              </Link>

              {/* Smartwatches */}
              <Link
                href="/products?category=smartwatches"
                className="group p-4 rounded-2xl bg-slate-900/70 border border-slate-800/80 hover:border-sky-500/50 hover:bg-slate-900 transition flex flex-col items-center text-center gap-2.5"
              >
                <div className="w-12 h-12 rounded-xl bg-rose-500/10 group-hover:bg-rose-500/20 text-rose-400 flex items-center justify-center transition">
                  <Watch className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white group-hover:text-sky-400 transition">Smartwatches</h3>
                  <span className="text-[10px] text-slate-500">Fitness & Ultra</span>
                </div>
              </Link>
            </div>
          </div>
        </section>

        {/* ── FEATURED & BEST SELLING PRODUCTS ────────────────────── */}
        <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-10 gap-4">
            <div>
              <span className="text-xs font-bold text-sky-400 tracking-wider uppercase">AUTHENTIC STOCK</span>
              <h2 className="text-2xl sm:text-3xl font-black text-white mt-1">
                Featured Devices & Accessories
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Live prices and availability updated continuously from our central shop POS.
              </p>
            </div>

            <Link
              href="/products"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold border border-slate-700 transition"
            >
              <span>Browse Full Collection ({featuredProducts.length}+)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {featuredProducts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {featuredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800">
              <p className="text-slate-400 text-sm">Product catalog is being synchronized...</p>
            </div>
          )}
        </section>

        {/* ── WHATSAPP DIRECT ORDERING BANNER ─────────────────────── */}
        <section className="py-14 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-sky-950/40 border-y border-slate-800">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
              <Phone className="w-3.5 h-3.5" />
              <span>DIRECT WHATSAPP CONCIERGE</span>
            </div>

            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              Order in 30 Seconds with Haider
            </h2>

            <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed">
              No complicated account creation needed. Browse our catalog, tap &ldquo;Order on WhatsApp&rdquo;, and our team will immediately verify stock, share live photos if requested, and dispatch your order with tracking.
            </p>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href={`https://wa.me/${waNumber}?text=Hello%20iZone%20by%20Haider,%20I%20want%20to%20order%20products.`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition active:scale-95"
              >
                <Phone className="w-4 h-4" />
                <span>Message on WhatsApp (+{waNumber})</span>
              </a>

              <Link
                href="/products"
                className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm flex items-center justify-center gap-2 border border-slate-700 transition"
              >
                <span>View All Products First</span>
              </Link>
            </div>
          </div>
        </section>

        {/* ── WHY CHOOSE US SECTION ────────────────────────────────── */}
        <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-bold text-sky-400 tracking-wider uppercase">THE iZONE ADVANTAGE</span>
            <h2 className="text-2xl sm:text-3xl font-black text-white mt-1">
              Why Mobile Buyers Trust Us
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">Direct Sourcing, Zero Replicas</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Every charger, cable, phone and audio accessory is sourced from authorized distributors. We never sell master copies or unverified duplicates.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">Real-Time Central Stock</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Our public catalog syncs directly with our store POS terminal. What you see online reflects our genuine shop shelf inventory.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">Authentic Local Warranty</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Enjoy peace of mind with our 7-day check warranty on accessories and official brand warranty on boxed smartphones.
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
