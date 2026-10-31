'use client'

import React from 'react'
import { formatCurrency, formatDateTime } from '@izone/shared'

export interface ReceiptData {
  saleNumber: string
  saleAt: string
  cashierName: string
  customer?: {
    name: string
    phone?: string | null
    address?: string | null
  } | null
  items: Array<{
    productName: string
    sku: string
    quantity: number
    unitPrice: number
    discountAmount: number
    totalAmount: number
    imei?: string | null
  }>
  subtotal: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  payments: Array<{
    method: string
    amount: number
    reference?: string | null
  }>
  totalPaid: number
  changeDue: number
  notes?: string | null
  isOffline?: boolean
  syncStatus?: 'LOCAL' | 'SYNCING' | 'SYNCED' | 'FAILED' | 'CONFLICT'
}

interface ReceiptModalProps {
  isOpen: boolean
  onClose: () => void
  receipt: ReceiptData | null
  onNewSale: () => void
}

export function ReceiptModal({ isOpen, onClose, receipt, onNewSale }: ReceiptModalProps) {
  if (!isOpen || !receipt) return null

  const isOffline = receipt.isOffline || receipt.syncStatus === 'LOCAL'

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      {/* Container */}
      <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Modal Top Actions */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-zinc-950/70 print:hidden">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isOffline ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500 animate-pulse'
              }`}
            />
            <h3 className="text-sm font-semibold text-white">
              {isOffline ? 'Sale Saved Locally' : 'Sale Completed'}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-xs font-medium flex items-center gap-1.5 transition"
            >
              <span>🖨️</span>
              <span>Print Receipt</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
              aria-label="Close receipt"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Printable Receipt Paper Container */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-zinc-950 flex justify-center">
          <div
            id="receipt-paper"
            className="w-full max-w-[340px] bg-white text-black p-5 rounded-lg font-mono text-xs shadow-lg space-y-3 leading-relaxed border border-zinc-200 print:border-none print:shadow-none print:p-0 print:w-full"
          >
            {/* Header */}
            <div className="text-center border-b border-dashed border-zinc-400 pb-3">
              <h1 className="text-base font-extrabold tracking-wide uppercase">iZone by Haider</h1>
              <p className="text-[11px] text-zinc-700">Smart Retail & Mobile Accessories</p>
              <p className="text-[10px] text-zinc-600 mt-1">Shop #12, Mobile Market, Lahore</p>
              <p className="text-[10px] text-zinc-600">Tel: +92-300-1234567 | info@izone.pk</p>
            </div>

            {isOffline && (
              <div className="bg-amber-100 text-amber-900 border border-amber-300 p-1.5 rounded text-[10px] text-center font-bold tracking-tight">
                ⚠️ SALE RECORDED OFFLINE — PENDING SYNC
              </div>
            )}

            {/* Meta */}
            <div className="text-[11px] space-y-0.5 border-b border-dashed border-zinc-300 pb-2">
              <div className="flex justify-between">
                <span className="font-semibold">{isOffline ? 'Temporary Receipt:' : 'Invoice:'}</span>
                <span className="font-bold">{receipt.saleNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Date:</span>
                <span>{formatDateTime(receipt.saleAt)}</span>
              </div>
              <div className="flex justify-between">
                <span>Cashier:</span>
                <span>{receipt.cashierName}</span>
              </div>
              {receipt.customer?.name && (
                <div className="flex justify-between">
                  <span>Customer:</span>
                  <span>{receipt.customer.name} {receipt.customer.phone ? `(${receipt.customer.phone})` : ''}</span>
                </div>
              )}
            </div>

            {/* Items Table */}
            <div className="border-b border-dashed border-zinc-300 pb-2">
              <div className="flex justify-between font-bold text-[10px] uppercase text-zinc-600 border-b border-zinc-300 pb-1 mb-1">
                <span className="w-1/2">Item</span>
                <span className="w-1/6 text-center">Qty</span>
                <span className="w-1/3 text-right">Price</span>
              </div>

              <div className="space-y-1.5">
                {receipt.items.map((item, idx) => (
                  <div key={idx} className="text-[11px]">
                    <div className="font-semibold text-zinc-900 leading-tight">
                      {item.productName}
                    </div>
                    {item.imei && (
                      <div className="text-[9px] text-zinc-600">IMEI: {item.imei}</div>
                    )}
                    <div className="flex justify-between text-zinc-700">
                      <span className="text-[10px] text-zinc-500">SKU: {item.sku}</span>
                      <span className="w-1/6 text-center font-medium">x{item.quantity}</span>
                      <span className="w-1/3 text-right font-medium">
                        {formatCurrency(item.totalAmount)}
                      </span>
                    </div>
                    {item.discountAmount > 0 && (
                      <div className="text-[10px] text-emerald-700 text-right">
                        (Disc: -{formatCurrency(item.discountAmount)})
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="text-[11px] space-y-1 border-b border-dashed border-zinc-400 pb-2">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>{formatCurrency(receipt.subtotal)}</span>
              </div>
              {receipt.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>Order Discount:</span>
                  <span>-{formatCurrency(receipt.discountAmount)}</span>
                </div>
              )}
              {receipt.taxAmount > 0 && (
                <div className="flex justify-between">
                  <span>Tax:</span>
                  <span>{formatCurrency(receipt.taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-extrabold pt-1 border-t border-zinc-300">
                <span>NET PAYABLE:</span>
                <span>{formatCurrency(receipt.totalAmount)}</span>
              </div>
            </div>

            {/* Payments & Change */}
            <div className="text-[11px] space-y-0.5 border-b border-dashed border-zinc-400 pb-2">
              {receipt.payments.map((p, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>Paid ({p.method}):</span>
                  <span className="font-semibold">{formatCurrency(p.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold text-zinc-900">
                <span>Change Returned:</span>
                <span>{formatCurrency(receipt.changeDue)}</span>
              </div>
            </div>

            {/* Footer & Policy */}
            <div className="text-center pt-2 space-y-1">
              <div className="text-[11px] font-bold tracking-wider uppercase">
                *** THANK YOU FOR YOUR VISIT ***
              </div>
              <p className="text-[9px] text-zinc-600 leading-snug">
                Exchange / Return permitted within 3 days with original invoice. Electronics warranty handled by brand service center.
              </p>
              <div className="pt-1 text-[10px] text-zinc-400 font-mono">
                {receipt.saleNumber}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Bottom Actions */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-950/70 flex items-center justify-between print:hidden">
          <button
            onClick={() => {
              onClose()
              onNewSale()
            }}
            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition"
          >
            <span>➕</span>
            <span>Start New Sale</span>
          </button>
        </div>
      </div>
    </div>
  )
}
