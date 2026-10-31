'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getPendingSyncItems,
  markSyncItemStatus,
  updateLocalSaleServerConfirmation,
  downloadAndStoreProducts,
  downloadAndStoreCategories,
  getSetting,
  setSetting,
  getDb,
} from '@/lib/db'

export type OfflineStatus =
  | 'ONLINE'
  | 'OFFLINE_READY'
  | 'OFFLINE_NOT_INITIALIZED'
  | 'PENDING_SYNC'
  | 'SYNCING'
  | 'SYNCED'
  | 'SYNC_FAILED'
  | 'STOCK_CONFLICT'

export type SyncState = {
  isOnline: boolean
  isSyncing: boolean
  pendingCount: number
  failedCount: number
  conflictCount: number
  lastSyncAt: string | null
  lastSyncStatus: 'idle' | 'success' | 'partial' | 'failed' | 'conflict'
  initialSyncCompleted: boolean
  offlineProductCount: number
  offlineStatus: OfflineStatus
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api'
const MAX_RETRY_ATTEMPTS = 5
const SYNC_INTERVAL_MS = 30_000 // 30 seconds

export function useSyncManager() {
  const [state, setState] = useState<SyncState>({
    isOnline: true, // Always start true for consistent SSR & initial hydration
    isSyncing: false,
    pendingCount: 0,
    failedCount: 0,
    conflictCount: 0,
    lastSyncAt: null,
    lastSyncStatus: 'idle',
    initialSyncCompleted: false,
    offlineProductCount: 0,
    offlineStatus: 'ONLINE',
  })

  const syncInProgress = useRef(false)
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Refresh counts and evaluate offline status ───────────────
  const refreshCounts = useCallback(async () => {
    try {
      const db = getDb()
      const pending = await db.syncQueue.where('status').anyOf(['PENDING', 'PROCESSING']).count()
      const failed = await db.syncQueue
        .where('status')
        .equals('FAILED')
        .filter((i) => i.attempts < MAX_RETRY_ATTEMPTS)
        .count()
      const conflicts = await db.syncQueue.where('status').equals('CONFLICT').count()

      const lastSyncAt = await getSetting<string>('lastSuccessfulSyncAt')
      const initialSyncCompleted = (await getSetting<boolean>('initialSyncCompleted')) ?? false
      const offlineProductCount = (await getSetting<number>('offlineProductCount')) ?? (await db.products.count())

      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true

      // Determine computed status
      let offlineStatus: OfflineStatus = 'ONLINE'
      if (!isOnline) {
        if (!initialSyncCompleted || offlineProductCount === 0) {
          offlineStatus = 'OFFLINE_NOT_INITIALIZED'
        } else if (pending > 0) {
          offlineStatus = 'PENDING_SYNC'
        } else {
          offlineStatus = 'OFFLINE_READY'
        }
      } else {
        if (conflicts > 0) {
          offlineStatus = 'STOCK_CONFLICT'
        } else if (syncInProgress.current) {
          offlineStatus = 'SYNCING'
        } else if (pending > 0) {
          offlineStatus = 'PENDING_SYNC'
        } else if (failed > 0) {
          offlineStatus = 'SYNC_FAILED'
        } else {
          offlineStatus = 'ONLINE'
        }
      }

      setState((prev) => ({
        ...prev,
        isOnline,
        pendingCount: pending,
        failedCount: failed,
        conflictCount: conflicts,
        lastSyncAt: lastSyncAt ?? null,
        initialSyncCompleted,
        offlineProductCount,
        offlineStatus,
      }))
    } catch (err) {
      console.warn('Sync refresh error:', err)
    }
  }, [])

  // ── Process sync queue with exponential backoff & acknowledgments ─
  const processQueue = useCallback(async () => {
    if (syncInProgress.current || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      return
    }

    const items = await getPendingSyncItems()
    if (items.length === 0) {
      await refreshCounts()
      return
    }

    syncInProgress.current = true
    setState((prev) => ({ ...prev, isSyncing: true, offlineStatus: 'SYNCING' }))

    let succeeded = 0
    let failed = 0
    let conflicts = 0

    for (const item of items) {
      try {
        await markSyncItemStatus(item.id, 'PROCESSING')

        // 15-second network timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15_000)

        const res = await fetch(`${API_BASE}/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: item.id,
            type: item.type,
            payload: item.payload,
            createdAt: item.createdAt,
          }),
          signal: controller.signal,
        })
        clearTimeout(timeoutId)

        if (res.ok) {
          const json = await res.json()
          const opResult = json.data?.results?.[0]

          if (opResult?.status === 'CONFLICT') {
            await markSyncItemStatus(item.id, 'CONFLICT', opResult.error || 'Stock conflict')
            conflicts++
          } else if (json.success) {
            // Server acknowledgment received
            const serverData = opResult?.data as { saleId?: string; saleNumber?: string } | undefined
            const saleId = serverData?.saleId
            const saleNumber = serverData?.saleNumber

            if (item.type === 'SALE' && saleId && saleNumber) {
              await updateLocalSaleServerConfirmation(item.id, saleId, saleNumber)
            } else {
              await markSyncItemStatus(item.id, 'SYNCED')
            }
            succeeded++
          } else {
            await markSyncItemStatus(item.id, 'FAILED', json.error || 'Server rejected operation')
            failed++
          }
        } else if (res.status === 409) {
          // Idempotency: Duplicate already processed on server
          await markSyncItemStatus(item.id, 'SYNCED')
          succeeded++
        } else {
          const text = await res.text()
          await markSyncItemStatus(item.id, 'FAILED', `HTTP ${res.status}: ${text.slice(0, 150)}`)
          failed++
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Network error'
        await markSyncItemStatus(item.id, 'FAILED', errorMsg)
        failed++
      }
    }

    const status = conflicts > 0 ? 'conflict' : failed === 0 ? 'success' : succeeded === 0 ? 'failed' : 'partial'
    if (status === 'success') {
      await setSetting('lastSuccessfulSyncAt', new Date().toISOString())
    }

    syncInProgress.current = false
    setState((prev) => ({
      ...prev,
      isSyncing: false,
      lastSyncAt: status === 'success' ? new Date().toISOString() : prev.lastSyncAt,
      lastSyncStatus: status,
    }))

    await refreshCounts()
  }, [refreshCounts])

  // ── Initial and Incremental Data Download ────────────────────
  const downloadInitialData = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    try {
      const lastSync = await getSetting<string>('lastProductSyncAt')
      const params = lastSync ? `?since=${encodeURIComponent(lastSync)}` : ''

      const [productsRes, categoriesRes] = await Promise.all([
        fetch(`${API_BASE}/products/offline-export${params}`),
        fetch(`${API_BASE}/categories`),
      ])

      if (productsRes.ok) {
        const productsJson = await productsRes.json()
        if (productsJson.success && Array.isArray(productsJson.data)) {
          await downloadAndStoreProducts(productsJson.data)
        }
      }

      if (categoriesRes.ok) {
        const catsJson = await categoriesRes.json()
        if (catsJson.success && Array.isArray(catsJson.data)) {
          await downloadAndStoreCategories(catsJson.data)
        }
      }

      await refreshCounts()
    } catch (err) {
      console.warn('Initial offline data download notice:', err)
    }
  }, [refreshCounts])

  // ── Manual Sync Action ───────────────────────────────────────
  const syncNow = useCallback(async () => {
    await processQueue()
    await downloadInitialData()
  }, [processQueue, downloadInitialData])

  // ── Connectivity & Visibility Listeners ──────────────────────
  useEffect(() => {
    const handleOnline = () => {
      setState((prev) => ({ ...prev, isOnline: true }))
      processQueue()
      downloadInitialData()
    }

    const handleOffline = () => {
      setState((prev) => ({ ...prev, isOnline: false }))
      refreshCounts()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        processQueue()
      }
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Initial load
    refreshCounts()
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      downloadInitialData().then(() => processQueue())
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [processQueue, downloadInitialData, refreshCounts])

  // ── Periodic Background Sync ─────────────────────────────────
  useEffect(() => {
    syncIntervalRef.current = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        processQueue()
      }
    }, SYNC_INTERVAL_MS)

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current)
      }
    }
  }, [processQueue])

  return {
    ...state,
    syncNow,
    refreshCounts,
    downloadInitialData,
  }
}
