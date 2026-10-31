import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@izone/database'
import { apiSuccess, apiError } from '@izone/shared'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'

const SupplierInputSchema = z.object({
  name: z.string().min(2, 'Supplier name is required'),
  contactName: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

// GET /api/suppliers — List suppliers with purchase and product metrics
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json(apiError('Unauthorized: Please sign in', 'UNAUTHORIZED'), { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') ?? ''
    const includeInactive = searchParams.get('includeInactive') === 'true'

    const where: any = {}
    if (!includeInactive) {
      where.isActive = true
    }

    if (search.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: 'insensitive' } },
        { contactName: { contains: search.trim(), mode: 'insensitive' } },
        { phone: { contains: search.trim(), mode: 'insensitive' } },
      ]
    }

    const suppliers = await prisma.supplier.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            products: true,
            purchases: true,
          },
        },
        purchases: {
          select: {
            totalAmount: true,
            purchasedAt: true,
          },
          orderBy: { purchasedAt: 'desc' },
          take: 1,
        },
      },
    })

    const result = suppliers.map(s => {
      // Calculate total purchased volume if any
      return {
        id: s.id,
        name: s.name,
        contactName: s.contactName,
        phone: s.phone,
        email: s.email,
        address: s.address,
        notes: s.notes,
        isActive: s.isActive,
        createdAt: s.createdAt,
        productCount: s._count.products,
        purchaseCount: s._count.purchases,
        lastPurchaseAt: s.purchases[0]?.purchasedAt ?? null,
      }
    })

    return NextResponse.json(apiSuccess(result))
  } catch (err) {
    console.error('GET /api/suppliers error:', err)
    return NextResponse.json(apiError('Failed to fetch suppliers'), { status: 500 })
  }
}

// POST /api/suppliers — Create a new supplier
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json(apiError('Unauthorized: Please sign in', 'UNAUTHORIZED'), { status: 401 })
    }

    if (session.user.role !== 'OWNER') {
      return NextResponse.json(apiError('Forbidden: Only store owners can create suppliers', 'FORBIDDEN'), { status: 403 })
    }

    const body = await request.json()
    const parsed = SupplierInputSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(apiError(parsed.error.errors[0]?.message ?? 'Invalid supplier data'), { status: 400 })
    }

    const supplier = await prisma.supplier.create({
      data: {
        name: parsed.data.name.trim(),
        contactName: parsed.data.contactName?.trim() || null,
        phone: parsed.data.phone?.trim() || null,
        email: parsed.data.email?.trim() || null,
        address: parsed.data.address?.trim() || null,
        notes: parsed.data.notes?.trim() || null,
      },
    })

    return NextResponse.json(apiSuccess(supplier, 'Supplier created successfully'), { status: 201 })
  } catch (err) {
    console.error('POST /api/suppliers error:', err)
    return NextResponse.json(apiError('Failed to create supplier'), { status: 500 })
  }
}
