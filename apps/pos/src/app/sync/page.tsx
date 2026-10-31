'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useSyncManager } from '@/hooks/useSyncManager'
import {
  getDb,
  getStorageEstimate,
  exportOfflineBackup,
  type SyncQueueItem,
} from '@/lib/db'
import { formatDateTime } from '@izone/shared'

export default function SyncCenterPage() {
  const { data: session, status } = useSession()
  const sync = useSyncManager()

  const [queueItems, setQueueItems] = useState<SyncQueueItem[]>([])
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [storageInfo, setStorageInfo] = useState<{ usage: number; quota: number } | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [selectedConflict, setSelectedConflict] = useState<SyncQueueItem | null>(null)

  // ── Load Queue Items from IndexedDB ─────────────────────────
  const loadQueue = useCallback(async () => {
    try {
      const db = getDb()
      let items: SyncQueueItem[] = []
      if (filterStatus === 'all') {
        items = await db.syncQueue.orderBy('createdAt').reverse().toArray()
      } else {
        items = await db.syncQueue
          .where('status')
          .equals(filterStatus as any)
          .reverse()
          .sortBy('createdAt')
      }
      setQueueItems(items)

      const est = await getStorageEstimate()
      setStorageInfo(est)
    } catch (err) {
      console.error('Error loading sync queue:', err)
    }
  }, [filterStatus])

  useEffect(() => {
    loadQueue()
  }, [loadQueue, sync.isSyncing, sync.pendingCount])

  // ── Retry Failed Items ───────────────────────────────────────
  const retryFailed = async () => {
    const db = getDb()
    await db.syncQueue.where('status').anyOf(['FAILED', 'CONFLICT']).modify({
      status: 'PENDING',
      attempts: 0,
      updatedAt: new Date().toISOString(),
    })
    await sync.syncNow()
    await loadQueue()
  }

  // ── Export Backup JSON ───────────────────────────────────────
  const handleExportBackup = async () => {
    setIsExporting(true)
    try {
      const json = await exportOfflineBackup()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `izone-offline-backup-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Failed to export offline backup: ' + err)
    } finally {
      setIsExporting(false)
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  if (status !== 'loading' && session?.user && session.user.role !== 'OWNER') {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
        <div className="p-8 max-w-md w-full text-center space-y-4 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl">
          <div className="w-12 h-12 bg-amber-950/60 text-amber-400 border border-amber-800/60 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
            ⚠️
          </div>
          <h2 className="text-xl font-bold text-white">Access Restricted</h2>
          <p className="text-sm text-zinc-400">Offline queue management & sync center is restricted to Store Owners only.</p>
          <Link href="/pos" className="btn-primary inline-flex items-center gap-2">
            Go to Point of Sale
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col antialiased">
      {/* ── Top Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-zinc-900/90 backdrop-blur-md border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 group text-zinc-400 hover:text-white transition">
            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center text-white font-black text-sm shadow-md">
              iZ
            </div>
            <div>
              <span className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                Sync Center
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-primary-600/20 text-primary-400 font-semibold uppercase">
                  Offline Engine
                </span>
              </span>
              <p className="text-[11px] text-zinc-400">Queue monitoring & conflict resolution</p>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/pos"
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow"
          >
            <span>🛒</span>
            <span>Open POS Terminal</span>
          </Link>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/80 border border-zinc-700 text-xs text-zinc-300">
            <span className="font-semibold text-white">{session?.user?.name ?? 'Ali Haider'}</span>
          </div>
        </div>
      </header>

      {/* ── Main Container ─────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-5">
        {/* Unsynced Sales Warning Banner */}
        {sync.pendingCount > 0 && (
          <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-800/60 text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <h4 className="text-sm font-bold text-amber-300">
                  {sync.pendingCount} Unsynchronized Sale{sync.pendingCount !== 1 ? 's' : ''} Stored Locally
                </h4>
                <p className="text-xs text-amber-400/80 mt-0.5">
                  Transactions are safely recorded in IndexedDB. Connect to internet and sync to generate authoritative cloud invoices.
                </p>
              </div>
            </div>
            <button
              onClick={() => sync.syncNow()}
              disabled={sync.isSyncing || !sync.isOnline}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition whitespace-nowrap shadow"
            >
              {sync.isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
        )}

        {/* Conflict Warning Banner */}
        {sync.conflictCount > 0 && (
          <div className="p-4 rounded-2xl bg-red-950/40 border border-red-800/60 text-red-200 flex items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🚨</span>
              <div>
                <h4 className="text-sm font-bold text-red-300">
                  {sync.conflictCount} Inventory Conflict{sync.conflictCount !== 1 ? 's' : ''} Detected
                </h4>
                <p className="text-xs text-red-400/80 mt-0.5">
                  Some items were oversold while offline. Customer payments are preserved. Review conflict details below.
                </p>
              </div>
            </div>
            <button
              onClick={() => setFilterStatus('CONFLICT')}
              className="px-3.5 py-1.5 rounded-xl bg-red-800/80 hover:bg-red-700 text-white font-semibold text-xs transition"
            >
              Review Conflicts
            </button>
          </div>
        )}

        {/* Status KPI Cards Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Card 1: Network & Offline Readiness */}
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Network & Engine</span>
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  sync.isOnline ? 'bg-emerald-500' : 'bg-red-500'
                }`}
              />
            </div>
            <div className="mt-2">
              <div className="text-lg font-bold text-white flex items-center gap-2">
                {sync.isOnline ? 'Online' : 'Offline'}
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-md font-semibold uppercase ${
                    sync.offlineStatus === 'OFFLINE_READY' || sync.offlineStatus === 'ONLINE'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-amber-500/20 text-amber-400'
                  }`}
                >
                  {sync.initialSyncCompleted ? 'Offline Ready' : 'Not Initialized'}
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                {sync.offlineProductCount} products cached locally
              </p>
            </div>
          </div>

          {/* Card 2: Queue Status */}
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Pending Queue</span>
              <span className="text-xs font-mono">Operations</span>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-extrabold text-white font-mono">
                {sync.pendingCount}
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                {sync.isSyncing ? 'Processing background sync...' : 'Waiting for sync'}
              </p>
            </div>
          </div>

          {/* Card 3: Conflicts & Failures */}
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Conflicts / Failed</span>
              <span className="text-xs font-mono">Audit</span>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-extrabold text-white font-mono flex items-center gap-2">
                <span className={sync.conflictCount > 0 ? 'text-red-400' : 'text-zinc-200'}>
                  {sync.conflictCount}
                </span>
                <span className="text-sm font-normal text-zinc-500">/</span>
                <span className={sync.failedCount > 0 ? 'text-amber-400' : 'text-zinc-500'}>
                  {sync.failedCount}
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                {sync.conflictCount > 0 ? 'Action required by owner' : 'No unresolved conflicts'}
              </p>
            </div>
          </div>

          {/* Card 4: Local Storage Quota */}
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Storage Quota</span>
              <span className="text-xs font-mono">IndexedDB</span>
            </div>
            <div className="mt-2">
              <div className="text-sm font-bold text-white truncate">
                {storageInfo ? `${formatBytes(storageInfo.usage)} used` : 'Estimating...'}
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                {storageInfo ? `Limit: ${formatBytes(storageInfo.quota)}` : 'Persistent mode granted'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Control Action Buttons ─────────────────────────────── */}
        <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span>Last successful sync:</span>
            <span className="font-semibold text-zinc-200">
              {sync.lastSyncAt ? formatDateTime(sync.lastSyncAt) : 'Never'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => sync.syncNow()}
              disabled={sync.isSyncing || !sync.isOnline}
              className="px-3.5 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition shadow"
            >
              {sync.isSyncing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Syncing...</span>
                </>
              ) : (
                <>
                  <span>🔄</span>
                  <span>Sync Now</span>
                </>
              )}
            </button>

            {(sync.failedCount > 0 || sync.conflictCount > 0) && (
              <button
                onClick={retryFailed}
                className="px-3.5 py-2 rounded-xl bg-amber-600/80 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow"
              >
                <span>🔁</span>
                <span>Retry Failed</span>
              </button>
            )}

            <button
              onClick={() => sync.downloadInitialData()}
              disabled={!sync.isOnline}
              className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 font-semibold text-xs flex items-center gap-1.5 transition border border-zinc-700"
            >
              <span>📥</span>
              <span>Re-download Catalog</span>
            </button>

            <button
              onClick={handleExportBackup}
              disabled={isExporting}
              className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs flex items-center gap-1.5 transition border border-zinc-700"
            >
              <span>💾</span>
              <span>{isExporting ? 'Exporting...' : 'Export JSON Backup'}</span>
            </button>
          </div>
        </div>

        {/* ── Sync Operation Queue Table ─────────────────────────── */}
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col">
          {/* Table Header & Filters */}
          <div className="p-4 border-b border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-zinc-950/40">
            <div>
              <h3 className="text-sm font-bold text-white">Synchronization Queue</h3>
              <p className="text-xs text-zinc-400">Local operations stored in IndexedDB</p>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
              {['all', 'PENDING', 'SYNCED', 'CONFLICT', 'FAILED'].map((st) => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`px-2.5 py-1 rounded-lg font-medium transition ${
                    filterStatus === st
                      ? 'bg-primary-600 text-white font-semibold'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  {st.charAt(0) + st.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Queue List Table */}
          <div className="overflow-x-auto">
            {queueItems.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-zinc-500 text-center p-4">
                <span className="text-2xl mb-1">📋</span>
                <p className="text-xs font-semibold text-zinc-400">No sync operations found</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Offline sales will appear in this queue automatically.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="bg-zinc-950 text-[11px] text-zinc-500 uppercase border-b border-zinc-800 font-mono">
                  <tr>
                    <th className="py-2.5 px-4">Operation ID</th>
                    <th className="py-2.5 px-4">Type</th>
                    <th className="py-2.5 px-4">Created At</th>
                    <th className="py-2.5 px-4">Attempts</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-mono text-xs">
                  {queueItems.map((item) => (
                    <tr key={item.id} className="hover:bg-zinc-800/30 transition">
                      <td className="py-3 px-4 font-bold text-white truncate max-w-[160px]">
                        {item.id}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[11px] font-semibold text-zinc-200">
                          {item.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-zinc-400 text-[11px]">
                        {formatDateTime(item.createdAt)}
                      </td>
                      <td className="py-3 px-4 text-zinc-400">{item.attempts}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            item.status === 'SYNCED'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : item.status === 'PENDING' || item.status === 'PROCESSING'
                              ? 'bg-amber-500/20 text-amber-400'
                              : item.status === 'CONFLICT'
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-sans text-xs">
                        {item.status === 'CONFLICT' ? (
                          <button
                            onClick={() => setSelectedConflict(item)}
                            className="text-red-400 hover:text-red-300 font-bold underline"
                          >
                            Inspect Conflict
                          </button>
                        ) : item.errorMsg ? (
                          <span className="text-red-400 text-[11px] truncate max-w-[200px] block">
                            {item.errorMsg}
                          </span>
                        ) : (
                          <span className="text-zinc-500 text-[11px]">Confirmed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>

      {/* ── Conflict Details Modal ─────────────────────────────── */}
      {selectedConflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg bg-zinc-900 border border-red-800/80 rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-red-400">
                <span className="text-xl">🚨</span>
                <h3 className="text-sm font-bold text-white">Stock Conflict Details</h3>
              </div>
              <button
                onClick={() => setSelectedConflict(null)}
                className="text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-zinc-300">
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 text-red-300 space-y-1">
                <p className="font-bold">Oversell Notice</p>
                <p className="text-[11px]">{selectedConflict.errorMsg}</p>
              </div>

              <div>
                <span className="text-[11px] text-zinc-500 font-mono">Operation ID:</span>
                <p className="font-mono text-white text-xs">{selectedConflict.id}</p>
              </div>

              <div>
                <span className="text-[11px] text-zinc-500 font-mono">Created At:</span>
                <p className="text-zinc-300">{formatDateTime(selectedConflict.createdAt)}</p>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1 text-zinc-400 text-[11px]">
                <p className="font-bold text-zinc-200">Reconciliation Policy:</p>
                <p>
                  1. The customer payment and physical sale are permanently preserved in PostgreSQL.
                </p>
                <p>
                  2. Central stock was decremented to accurately track inventory shortfall.
                </p>
                <p>
                  3. Action: Receive restock intake in Inventory or review physical store shelf.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => setSelectedConflict(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
