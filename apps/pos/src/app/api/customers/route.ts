import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@izone/database'
import { apiSuccess, apiError } from '@izone/shared'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'

const CustomerInputSchema = z.object({
  name: z.string().min(1, 'Customer name is required'),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

// GET /api/customers — List all customers with total spent, orders count, and last purchase date
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json(apiError('Unauthorized: Please sign in', 'UNAUTHORIZED'), { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') ?? ''
    const page = parseInt(searchParams.get('page') ?? '1', 10)
    const limit = parseInt(searchParams.get('limit') ?? '50', 10)

    const where: any = {}
    if (search.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: 'insensitive' } },
        { phone: { contains: search.trim(), mode: 'insensitive' } },
      ]
    }

    const [customers, totalCount] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: {
            select: { sales: true },
          },
          sales: {
            select: {
              id: true,
              saleNumber: true,
              totalAmount: true,
              saleAt: true,
              status: true,
            },
            orderBy: { saleAt: 'desc' },
          },
        },
      }),
      prisma.customer.count({ where }),
    ])

    const formattedCustomers = customers.map(c => {
      const totalSpent = c.sales.reduce((sum, s) => sum + s.totalAmount, 0)
      const lastPurchaseAt = c.sales[0]?.saleAt ?? null
      const latestInvoiceNo = c.sales[0]?.saleNumber ?? null

      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        address: c.address,
        notes: c.notes,
        createdAt: c.createdAt,
        ordersCount: c._count.sales,
        totalSpent,
        lastPurchaseAt,
        latestInvoiceNo,
      }
    })

    return NextResponse.json(
      apiSuccess({
        customers: formattedCustomers,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      })
    )
  } catch (err: any) {
    console.error('GET /api/customers error:', err)
    return NextResponse.json(apiError('Failed to fetch customers'), { status: 500 })
  }
}

// POST /api/customers — Manually register or create a new customer
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json(apiError('Unauthorized: Please sign in', 'UNAUTHORIZED'), { status: 401 })
    }

    const body = await request.json()
    const parsed = CustomerInputSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(apiError(parsed.error.errors[0]?.message ?? 'Invalid customer data'), { status: 400 })
    }

    const { name, phone, email, address, notes } = parsed.data

    if (phone?.trim()) {
      const existing = await prisma.customer.findUnique({
        where: { phone: phone.trim() },
      })
      if (existing) {
        return NextResponse.json(apiError('A customer with this phone number already exists', 'PHONE_EXISTS'), { status: 400 })
      }
    }

    const customer = await prisma.customer.create({
      data: {
        name: name.trim(),
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        address: address?.trim() || null,
        notes: notes?.trim() || null,
      },
    })

    return NextResponse.json(apiSuccess(customer, 'Customer added successfully'), { status: 201 })
  } catch (err: any) {
    console.error('POST /api/customers error:', err)
    return NextResponse.json(apiError('Failed to create customer'), { status: 500 })
  }
}
