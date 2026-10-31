import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@izone/database'
import { apiSuccess, apiError } from '@izone/shared'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'

const CreateExpenseSchema = z.object({
  category: z.string().min(1, 'Category is required'),
  amount: z.number().positive('Amount must be greater than 0'),
  description: z.string().optional().nullable(),
  expenseAt: z.string().optional(), // ISO string
})

// GET /api/expenses — List expenses with category summary and date filtering
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json(apiError('Unauthorized', 'UNAUTHORIZED'), { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const limit = parseInt(searchParams.get('limit') ?? '50', 10)
    const page = parseInt(searchParams.get('page') ?? '1', 10)

    const where: any = {}
    if (category) where.category = category
    if (startDate || endDate) {
      where.expenseAt = {}
      if (startDate) where.expenseAt.gte = new Date(startDate)
      if (endDate) where.expenseAt.lte = new Date(endDate)
    }

    const [expenses, totalCount, categoryBreakdown, totalSum] = await Promise.all([
      prisma.expense.findMany({
        where,
        orderBy: { expenseAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, name: true } },
        },
      }),
      prisma.expense.count({ where }),
      prisma.expense.groupBy({
        by: ['category'],
        where,
        _sum: { amount: true },
        _count: { id: true },
        orderBy: { _sum: { amount: 'desc' } },
      }),
      prisma.expense.aggregate({
        where,
        _sum: { amount: true },
      }),
    ])

    return NextResponse.json(
      apiSuccess({
        expenses,
        totalAmount: totalSum._sum.amount ?? 0,
        categoryBreakdown: categoryBreakdown.map(c => ({
          category: c.category,
          amount: c._sum.amount ?? 0,
          count: c._count.id,
        })),
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      })
    )
  } catch (err) {
    console.error('GET /api/expenses error:', err)
    return NextResponse.json(apiError('Failed to fetch expenses'), { status: 500 })
  }
}

// POST /api/expenses — Create an expense record
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json(apiError('Unauthorized', 'UNAUTHORIZED'), { status: 401 })
    }

    if (session.user.role !== 'OWNER') {
      return NextResponse.json(apiError('Forbidden: Only store owners can record expenses', 'FORBIDDEN'), { status: 403 })
    }

    const body = await request.json()
    const parsed = CreateExpenseSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(apiError(parsed.error.errors[0]?.message ?? 'Invalid expense data'), { status: 400 })
    }

    const data = parsed.data
    const expense = await prisma.expense.create({
      data: {
        shopId: session.user.shopId || 'shop_main',
        userId: session.user.id,
        category: data.category.trim(),
        amount: data.amount,
        description: data.description?.trim() || null,
        expenseAt: data.expenseAt ? new Date(data.expenseAt) : new Date(),
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(apiSuccess(expense, 'Expense recorded successfully'), { status: 201 })
  } catch (err) {
    console.error('POST /api/expenses error:', err)
    return NextResponse.json(apiError('Failed to record expense'), { status: 500 })
  }
}
