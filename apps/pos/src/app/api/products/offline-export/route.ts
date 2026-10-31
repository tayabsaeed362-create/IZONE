import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@izone/database'
import { apiSuccess, apiError, type OfflineProduct } from '@izone/shared'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// GET /api/products/offline-export
// Returns all products in a format ready for IndexedDB storage
// Supports incremental sync via ?since=ISO_DATE
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(apiError('Unauthorized'), { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const since = searchParams.get('since')

    const products = await prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        ...(since ? { updatedAt: { gte: new Date(since) } } : {}),
      },
      include: {
        category: { select: { id: true, name: true } },
        brand: { select: { name: true } },
        variants: {
          where: { isActive: true },
          include: {
            barcodes: { select: { barcode: true } },
          },
        },
        barcodes: { select: { barcode: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })

    const isOwner = session.user.role === 'OWNER'
    const offlineProducts: OfflineProduct[] = products.map(p => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      slug: p.slug,
      categoryId: p.categoryId,
      categoryName: p.category?.name ?? null,
      brandName: p.brand?.name ?? null,
      purchasePrice: isOwner ? p.purchasePrice : 0,
      sellingPrice: p.sellingPrice,
      minSellingPrice: p.minSellingPrice,
      discountAmount: p.discountAmount,
      quantity: p.quantity,
      minStockLevel: p.minStockLevel,
      hasImei: p.hasImei,
      imei1: p.imei1,
      imei2: p.imei2,
      imeiCycle: p.imeiCycle,
      images: p.images,
      barcodes: p.barcodes.map(b => b.barcode),
      variants: p.variants.map(v => ({
        id: v.id,
        name: v.name,
        sku: v.sku,
        attributes: v.attributes as Record<string, string>,
        purchasePrice: isOwner ? v.purchasePrice : 0,
        sellingPrice: v.sellingPrice,
        minSellingPrice: v.minSellingPrice,
        quantity: v.quantity,
        imageUrl: v.imageUrl,
        barcodes: v.barcodes.map(b => b.barcode),
      })),
      updatedAt: p.updatedAt.toISOString(),
    }))

    return NextResponse.json(
      apiSuccess(offlineProducts),
      {
        headers: {
          'Cache-Control': 'private, no-store', // Auth-required; no CDN cache
        },
      }
    )
  } catch (err) {
    console.error('GET /api/products/offline-export error:', err)
    return NextResponse.json(apiError('Internal server error'), { status: 500 })
  }
}
