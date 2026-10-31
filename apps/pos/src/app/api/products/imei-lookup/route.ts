import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@izone/database'
import { apiSuccess, apiError } from '@izone/shared'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(apiError('Unauthorized: Authentication required', 'AUTH_REQUIRED'), { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const imei = (searchParams.get('imei') ?? '').trim()

    if (!imei || !/^\d{15}$/.test(imei)) {
      return NextResponse.json(apiError('Valid 15-digit IMEI is required', 'BAD_REQUEST'), { status: 400 })
    }

    const instances = await prisma.product.findMany({
      where: {
        OR: [
          { imei1: imei },
          { imei2: imei },
        ],
      },
      select: {
        id: true,
        name: true,
        sku: true,
        imei1: true,
        imei2: true,
        imeiCycle: true,
        purchasePrice: session.user.role === 'OWNER',
        sellingPrice: true,
        minSellingPrice: true,
        quantity: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    if (instances.length === 0) {
      return NextResponse.json(apiSuccess({ found: false, count: 0, nextCycle: 1 }))
    }

    const maxCycle = Math.max(...instances.map(p => p.imeiCycle || 1), instances.length)
    const nextCycle = maxCycle + 1

    return NextResponse.json(
      apiSuccess({
        found: true,
        count: instances.length,
        nextCycle,
        latestInstance: instances[0],
        history: instances,
      })
    )
  } catch (err: any) {
    console.error('GET /api/products/imei-lookup error:', err)
    return NextResponse.json(apiError(err.message ?? 'Internal server error'), { status: 500 })
  }
}
