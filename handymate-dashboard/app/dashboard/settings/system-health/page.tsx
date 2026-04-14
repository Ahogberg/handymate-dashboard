'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCw, Copy } from 'lucide-react'

interface AuditItem {
  table: string
  column: string
  status: string
  critical: boolean
}

interface MigrationGroup {
  migration: string
  sql_file: string
  items: AuditItem[]
}

interface AuditResponse {
  summary: {
    total_checked: number
    ok: number
    missing: number
    missing_critical: number
    healthy: boolean
  }
  missing_by_migration: MigrationGroup[]
}

export default function SystemHealthPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<AuditResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  async function runAudit() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/debug/schema-audit')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { runAudit() }, [])

  function copyMigrationPath(path: string) {
    navigator.clipboard.writeText(path)
    setCopied(path)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 sm:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Systemhälsa</h1>
            <p className="text-sm text-gray-500 mt-1">
              Kontrollerar att databasens schema matchar det koden förväntar sig.
            </p>
          </div>
          <button
            onClick={runAudit}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-[#0F766E] text-white hover:bg-[#0c5e57] disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Kör audit igen
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 mb-6">
            {error}
          </div>
        )}

        {loading && !data && (
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
            <Loader2 className="w-8 h-8 text-[#0F766E] animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Kontrollerar schema...</p>
          </div>
        )}

        {data && (
          <>
            {/* Sammanfattning */}
            <div className={`rounded-xl border p-6 mb-6 ${
              data.summary.healthy
                ? 'bg-[#F0FDF4] border-[#BBF7D0]'
                : data.summary.missing_critical > 0
                ? 'bg-[#FEF2F2] border-[#FECACA]'
                : 'bg-[#FFFBEB] border-[#FDE68A]'
            }`}>
              <div className="flex items-start gap-4">
                {data.summary.healthy ? (
                  <CheckCircle2 className="w-8 h-8 text-[#16A34A] shrink-0" />
                ) : data.summary.missing_critical > 0 ? (
                  <XCircle className="w-8 h-8 text-[#DC2626] shrink-0" />
                ) : (
                  <AlertTriangle className="w-8 h-8 text-[#D97706] shrink-0" />
                )}
                <div>
                  <h2 className="font-semibold text-gray-900">
                    {data.summary.healthy
                      ? 'Schema är synkat'
                      : data.summary.missing_critical > 0
                      ? `${data.summary.missing_critical} kritiska avvikelser`
                      : `${data.summary.missing} avvikelser (ej kritiska)`}
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {data.summary.ok} av {data.summary.total_checked} kolumner finns på plats.
                  </p>
                </div>
              </div>
            </div>

            {/* Lista på saknade per migration */}
            {data.missing_by_migration.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-[10px] tracking-[0.1em] uppercase text-[#CBD5E1] font-medium px-1">
                  Saknade migrationer
                </h3>
                {data.missing_by_migration.map(group => (
                  <div key={group.migration} className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
                    <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-gray-900">{group.migration}</h4>
                        <p className="text-[12px] text-[#64748B] mt-0.5 font-mono">{group.sql_file}</p>
                      </div>
                      <button
                        onClick={() => copyMigrationPath(group.sql_file)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        {copied === group.sql_file ? 'Kopierat!' : 'Kopiera sökväg'}
                      </button>
                    </div>
                    <ul className="divide-y divide-[#F1F5F9]">
                      {group.items.map((item, i) => (
                        <li key={i} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                          {item.critical ? (
                            <XCircle className="w-4 h-4 text-[#DC2626] shrink-0" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0" />
                          )}
                          <span className="font-mono text-[#0F172A]">{item.table}.{item.column}</span>
                          <span className="text-[11px] text-[#94A3B8] ml-auto">
                            {item.status === 'missing_table' ? 'Tabell saknas' : item.status === 'missing_column' ? 'Kolumn saknas' : item.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}

                <div className="bg-[#F1F5F9] rounded-xl p-5 text-sm text-[#475569]">
                  <p className="font-medium text-gray-900 mb-2">Hur du fixar</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Öppna Supabase SQL Editor</li>
                    <li>Kör innehållet i respektive <code className="font-mono text-[12px]">.sql</code>-fil ovan</li>
                    <li>Kör audit igen för att verifiera</li>
                  </ol>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
