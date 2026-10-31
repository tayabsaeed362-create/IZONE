import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { prisma } from '@izone/database'
import { CreateProductSchema, apiSuccess, apiError } from '@izone/shared'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// GET /api/products — List products with search, category, brand, status, and pagination
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const isOwner = session?.user?.role === 'OWNER'

    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q') ?? ''
    const categoryId = searchParams.get('category')
    const brandId = searchParams.get('brand')
    const status = searchParams.get('status')
    const lowStockOnly = searchParams.get('lowStock') === 'true'
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100)

    const where: Record<string, unknown> = {}
    if (q.trim()) {
      where['OR'] = [
        { name: { contains: q.trim(), mode: 'insensitive' } },
        { sku: { contains: q.trim(), mode: 'insensitive' } },
        { imei1: { contains: q.trim(), mode: 'insensitive' } },
        { imei2: { contains: q.trim(), mode: 'insensitive' } },
        { barcodes: { some: { barcode: { contains: q.trim() } } } },
      ]
    }
    if (categoryId && categoryId !== 'all') where['categoryId'] = categoryId
    if (brandId && brandId !== 'all') where['brandId'] = brandId
    if (status && status !== 'all') where['status'] = status
    if (lowStockOnly) where['quantity'] = { lte: 5 }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          brand: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
          barcodes: { select: { id: true, barcode: true, type: true } },
          variants: {
            where: { isActive: true },
            include: { barcodes: { select: { barcode: true } } },
          },
          _count: { select: { variants: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.product.count({ where }),
    ])

    // Never expose purchase costs to non-owners or unauthenticated callers
    const sanitizedProducts = products.map((p) => {
      const sanitizedVariants = p.variants.map((v) => {
        if (!isOwner) {
          const { purchasePrice: _cost, ...safeVariant } = v
          return safeVariant
        }
        return v
      })
      if (!isOwner) {
        const { purchasePrice: _cost, ...safeProduct } = p
        return { ...safeProduct, variants: sanitizedVariants }
      }
      return { ...p, variants: sanitizedVariants }
    })

    return NextResponse.json(
      apiSuccess({
        products: sanitizedProducts,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      })
    )
  } catch (err) {
    console.error('GET /api/products error:', err)
    return NextResponse.json(apiError('Internal server error'), { status: 500 })
  }
}

// POST /api/products — Create product with barcode, initial stock movement, and audit log
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(apiError('Unauthorized: Authentication required', 'AUTH_REQUIRED'), { status: 401 })
    }
    const isOwner = session.user.role === 'OWNER'
    const isCashier = session.user.role === 'CASHIER'
    if (!isOwner && !isCashier) {
      return NextResponse.json(apiError('Forbidden: Only store staff can create products', 'FORBIDDEN'), { status: 403 })
    }
    const userId = session.user.id

    const body = await request.json()
    const parsed = CreateProductSchema.safeParse({ ...body, sku: body.sku?.trim() || `IZ-${randomUUID()}` })
    if (!parsed.success) {
      return NextResponse.json(apiError(parsed.error.errors[0]?.message ?? 'Invalid product data'), { status: 400 })
    }

    const data = parsed.data
    if (data.minSellingPrice > 0 && data.sellingPrice > 0 && data.minSellingPrice > data.sellingPrice) {
      return NextResponse.json(apiError('Threshold selling price cannot be greater than regular selling price'), { status: 400 })
    }

    let imeiCycle = data.imeiCycle || 1
    let skuToUse = data.sku

    if (data.imei1 || data.imei2) {
      const category = data.categoryId ? await prisma.category.findUnique({ where: { id: data.categoryId } }) : null
      if (!category || !/^(smart\s*phones?|mobile\s*phones?)$/i.test(category.name.trim())) {
        return NextResponse.json(apiError('IMEI fields are only available for smartphones'), { status: 400 })
      }
      if (data.imei1 && data.imei1 === data.imei2) {
        return NextResponse.json(apiError('IMEI 1 and IMEI 2 must be different'), { status: 400 })
      }

      // Check for repeat phone trade-in / buy-and-sell cycles
      const previousCycles = await prisma.product.findMany({
        where: {
          OR: [
            ...(data.imei1 ? [{ imei1: data.imei1 }, { imei2: data.imei1 }] : []),
            ...(data.imei2 ? [{ imei1: data.imei2 }, { imei2: data.imei2 }] : []),
          ],
        },
        orderBy: { createdAt: 'desc' },
      })

      if (previousCycles.length > 0) {
        const maxPastCycle = Math.max(...previousCycles.map(p => p.imeiCycle || 1), previousCycles.length)
        imeiCycle = maxPastCycle + 1
        // Auto-assign unique identifier to SKU so it never conflicts with previous buyback cycles
        skuToUse = `${skuToUse.replace(/-C\d+$/, '')}-C${imeiCycle}`
      }
    }

    const existingSku = await prisma.product.findUnique({ where: { sku: skuToUse } })
    if (existingSku) {
      skuToUse = `${skuToUse}-${Date.now().toString(36)}`
    }

    const defaultShop = await prisma.shop.findFirst({ select: { id: true } })
    if (!defaultShop) {
      return NextResponse.json(apiError('No shop found. Run database seed first.'), { status: 500 })
    }

    // Atomic creation
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name: data.name,
          slug: data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') + '-' + Date.now().toString(36),
          sku: skuToUse,
          description: data.description,
          categoryId: data.categoryId,
          brandId: data.brandId,
          supplierId: data.supplierId,
          purchasePrice: data.purchasePrice,
          sellingPrice: data.sellingPrice,
          minSellingPrice: data.minSellingPrice ?? 0,
          discountAmount: data.discountAmount ?? 0,
          quantity: data.initialStock ?? 0,
          minStockLevel: data.minStockLevel ?? 5,
          hasImei: Boolean(data.imei1 || data.imei2 || data.hasImei),
          imei1: data.imei1,
          imei2: data.imei2,
          imeiCycle: imeiCycle,
          images: data.images ?? [],
          status: isOwner ? 'ACTIVE' : 'INACTIVE',
          isApproved: isOwner,
          isPublished: isOwner ? ((body as any).isPublished ?? true) : false,
          isFeatured: (body as any).isFeatured ?? false,
          onlineDescription: (body as any).onlineDescription ?? data.description,
          onlinePrice: (body as any).onlinePrice ?? data.sellingPrice,
        },
      })

      // Add barcode if provided, or register IMEI barcode for phones without standard barcode
      const barcodeCandidate = data.barcode?.trim() || (data.imei1 ? (imeiCycle === 1 ? data.imei1 : `${data.imei1}-C${imeiCycle}`) : null)
      if (barcodeCandidate) {
        const existingBarcode = await tx.productBarcode.findUnique({ where: { barcode: barcodeCandidate } })
        if (!existingBarcode) {
          await tx.productBarcode.create({
            data: {
              productId: created.id,
              barcode: barcodeCandidate,
              type: 'CODE128',
            },
          })
        }
      }

      // Record initial inventory movement
      if (data.initialStock && data.initialStock > 0) {
        await tx.inventoryMovement.create({
          data: {
            productId: created.id,
            type: 'INITIAL',
            quantity: data.initialStock,
            balanceBefore: 0,
            balanceAfter: data.initialStock,
            reason: 'Initial stock intake',
            referenceType: 'Manual',
            referenceId: `init_${created.id}`,
            createdBy: userId,
          },
        })
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          userId,
          action: 'PRODUCT_CREATED',
          entityType: 'Product',
          entityId: created.id,
          after: JSON.parse(JSON.stringify(created)),
        },
      })

      return created
    })

    return NextResponse.json(apiSuccess(product), { status: 201 })
  } catch (err: any) {
    console.error('POST /api/products error:', err)
    return NextResponse.json(apiError(err.message ?? 'Internal server error'), { status: 500 })
  }
}
