export type DashboardStats = {
  period: string
  summary: {
    totalRevenue: number
    grossProfit: number
    transactionCount: number
    averageOrderValue: number
    totalExpenses: number
    estimatedNetProfit: number
    grossMarginPercent: number
  }
  monthly: {
    revenue: number
    expenses: number
    grossProfit: number
    netProfit: number
  }
  inventory: {
    totalProducts: number
    totalValue: number
    lowStockCount: number
    outOfStockCount: number
    totalCustomers: number
    pendingSyncCount: number
  }
  topProducts: Array<{ productId: string; name: string; unitsSold: number; revenue: number }>
  salesTrend: Array<{ date: string; revenue: number; count: number }>
  recentSales?: Array<{
    id: string
    saleNumber: string
    totalAmount: number
    saleAt: string
    customerName: string
    itemCount: number
    paymentMethod: string
  }>
  lowStockWatchlist?: Array<{
    id: string
    name: string
    sku: string
    quantity: number
    minStockLevel: number
    sellingPrice: number
  }>
  categoryDistribution?: Array<{
    name: string
    revenue: number
    count: number
  }>
}

