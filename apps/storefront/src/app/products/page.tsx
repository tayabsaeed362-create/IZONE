import React from 'react'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Navbar } from '@/components/Navbar'
import { Footer } from '@/components/Footer'
import { ProductCard, StorefrontProduct } from '@/components/ProductCard'
import { Sparkles, SlidersHorizontal, Search, RotateCcw } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface ProductsPageProps {
  searchParams: Promise<{
    category?: string
    brand?: string
    search?: string
    sort?: string
    inStock?: string
    minPrice?: string
    maxPrice?: string
  }>
}

export default async function ProductsCatalogPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams
  const selectedCategory = params.category || 'all'
  const selectedBrand = params.brand || 'all'
  const searchQuery = (params.search || '').trim().toLowerCase()
  const sort = params.sort || 'featured'
  const inStockOnly = params.inStock === 'true'

  // Build Prisma query filters
  const where: any = {
    isPublished: true,
    status: 'ACTIVE',
  }

  if (selectedCategory && selectedCategory !== 'all') {
    where.category = {
      slug: selectedCategory,
    }
  }

  if (selectedBrand && selectedBrand !== 'all') {
    where.brand = {
      name: selectedBrand,
    }
  }

  if (inStockOnly) {
    where.quantity = {
      gt: 0,
    }
  }

  if (params.minPrice || params.maxPrice) {
    where.sellingPrice = {}
    if (params.minPrice) where.sellingPrice.gte = parseFloat(params.minPrice)
    if (params.maxPrice) where.sellingPrice.lte = parseFloat(params.maxPrice)
  }

  // Sort orders
  let orderBy: any = [{ isFeatured: 'desc' }, { createdAt: 'desc' }]
  if (sort === 'price-asc') orderBy = [{ sellingPrice: 'asc' }]
  if (sort === 'price-desc') orderBy = [{ sellingPrice: 'desc' }]
  if (sort === 'newest') orderBy = [{ createdAt: 'desc' }]

  // Execute database queries
  const [rawProducts, categories, brands] = await Promise.all([
    prisma.product.findMany({
      where,
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
      orderBy,
    }),
    prisma.category.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.brand.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  // Filter search query in-memory for comprehensive SKU, variant & name matching
  let products = rawProducts as unknown as StorefrontProduct[]
  if (searchQuery) {
    products = products.filter(
      (p) =>
        p.name.toLowerCase().includes(searchQuery) ||
        p.sku.toLowerCase().includes(searchQuery) ||
        p.brand?.name.toLowerCase().includes(searchQuery) ||
        p.category?.name.toLowerCase().includes(searchQuery) ||
        p.variants?.some((v) => v.name.toLowerCase().includes(searchQuery) || v.sku.toLowerCase().includes(searchQuery))
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f19] text-slate-100 antialiased selection:bg-sky-500 selection:text-white">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* ── Catalog Header ──────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 pb-6 border-b border-slate-800 gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-400 uppercase tracking-wider mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>OFFICIAL PRODUCT CATALOG</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              All Mobile Devices & Accessories
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Showing {products.length} genuine product{products.length === 1 ? '' : 's'} available in store.
            </p>
          </div>

          {/* Quick Sort Dropdown */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-medium">Sort By:</span>
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-xl p-1 text-xs">
              <Link
                href={`/products?category=${selectedCategory}&brand=${selectedBrand}&sort=featured&search=${searchQuery}`}
                className={`px-2.5 py-1 rounded-lg transition ${
                  sort === 'featured' ? 'bg-sky-500/20 text-sky-400 font-semibold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Featured
              </Link>
              <Link
                href={`/products?category=${selectedCategory}&brand=${selectedBrand}&sort=price-asc&search=${searchQuery}`}
                className={`px-2.5 py-1 rounded-lg transition ${
                  sort === 'price-asc' ? 'bg-sky-500/20 text-sky-400 font-semibold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Price: Low to High
              </Link>
              <Link
                href={`/products?category=${selectedCategory}&brand=${selectedBrand}&sort=price-desc&search=${searchQuery}`}
                className={`px-2.5 py-1 rounded-lg transition ${
                  sort === 'price-desc' ? 'bg-sky-500/20 text-sky-400 font-semibold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Price: High to Low
              </Link>
              <Link
                href={`/products?category=${selectedCategory}&brand=${selectedBrand}&sort=newest&search=${searchQuery}`}
                className={`px-2.5 py-1 rounded-lg transition ${
                  sort === 'newest' ? 'bg-sky-500/20 text-sky-400 font-semibold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Newest
              </Link>
            </div>
          </div>
        </div>

        {/* ── Main Layout: Sidebar Filters + Products Grid ─────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* ── Left Sidebar Filters ────────────────────────────────── */}
          <aside className="lg:col-span-1 space-y-6">
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-sky-400" />
                  Filters
                </span>
                {(selectedCategory !== 'all' || selectedBrand !== 'all' || searchQuery || inStockOnly) && (
                  <Link
                    href="/products"
                    className="text-xs text-sky-400 hover:text-sky-300 font-medium flex items-center gap-1 transition"
                  >
                    <RotateCcw className="w-3 h-3" /> Reset
                  </Link>
                )}
              </div>

              {/* Category Filter */}
              <div>
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5">Category</h3>
                <div className="space-y-1">
                  <Link
                    href={`/products?category=all&brand=${selectedBrand}&sort=${sort}&search=${searchQuery}`}
                    className={`block px-3 py-1.5 rounded-lg text-xs transition ${
                      selectedCategory === 'all'
                        ? 'bg-sky-500/20 text-sky-400 font-bold border border-sky-500/30'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    All Categories
                  </Link>
                  {categories.map((cat) => (
                    <Link
                      key={cat.id}
                      href={`/products?category=${cat.slug}&brand=${selectedBrand}&sort=${sort}&search=${searchQuery}`}
                      className={`block px-3 py-1.5 rounded-lg text-xs transition ${
                        selectedCategory === cat.slug
                          ? 'bg-sky-500/20 text-sky-400 font-bold border border-sky-500/30'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                      }`}
                    >
                      {cat.name}
                    </Link>
                  ))}
                </div>
              </div>

              {/* Brand Filter */}
              {brands.length > 0 && (
                <div className="pt-4 border-t border-slate-800">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5">Brand</h3>
                  <div className="space-y-1">
                    <Link
                      href={`/products?category=${selectedCategory}&brand=all&sort=${sort}&search=${searchQuery}`}
                      className={`block px-3 py-1.5 rounded-lg text-xs transition ${
                        selectedBrand === 'all'
                          ? 'bg-sky-500/20 text-sky-400 font-bold border border-sky-500/30'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                      }`}
                    >
                      All Brands
                    </Link>
                    {brands.map((b) => (
                      <Link
                        key={b.id}
                        href={`/products?category=${selectedCategory}&brand=${encodeURIComponent(b.name)}&sort=${sort}&search=${searchQuery}`}
                        className={`block px-3 py-1.5 rounded-lg text-xs transition ${
                          selectedBrand === b.name
                            ? 'bg-sky-500/20 text-sky-400 font-bold border border-sky-500/30'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                        }`}
                      >
                        {b.name}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Stock Filter Toggle */}
              <div className="pt-4 border-t border-slate-800">
                <Link
                  href={`/products?category=${selectedCategory}&brand=${selectedBrand}&sort=${sort}&search=${searchQuery}&inStock=${
                    inStockOnly ? 'false' : 'true'
                  }`}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold border transition ${
                    inStockOnly
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span>In-Stock Items Only</span>
                  <span
                    className={`w-2 h-2 rounded-full ${inStockOnly ? 'bg-emerald-400' : 'bg-slate-600'}`}
                  />
                </Link>
              </div>
            </div>
          </aside>

          {/* ── Products Grid ───────────────────────────────────────── */}
          <div className="lg:col-span-3">
            {products.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            ) : (
              <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800 space-y-4">
                <div className="w-12 h-12 rounded-xl bg-slate-800 mx-auto flex items-center justify-center text-slate-400">
                  <Search className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-white">No products matched your filters</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Try clearing your search query or switching categories to find what you&apos;re looking for.
                </p>
                <div className="pt-2">
                  <Link
                    href="/products"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset All Filters
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
