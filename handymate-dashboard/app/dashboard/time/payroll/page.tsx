'use client'

import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Download,
  FileText,
  Loader2,
  Wallet,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'
import { PermissionGate } from '@/components/PermissionGate'
import Link from 'next/link'

interface PayrollEntry {
  employee: string
  email: string
  employment_type: string
  period: string
  hourly_wage: number
  regular_hours: number
  overtime_50_hours: number
  overtime_100_hours: number
  ob1_hours: number
  ob2_hours: number
  total_hours: number
  travel_km: number
  travel_reimbursement: number
  allowance_days: number
  allowance_amount: number
  gross_amount: {
    regular: number
    overtime_50: number
    overtime_100: number
    ob1: number
    ob2: number
    travel: number
    allowance: number
    total: number
  }
}

export default function PayrollPage() {
  const business = useBusiness()
  const [period, setPeriod] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [payroll, setPayroll] = useState<PayrollEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (business.business_id) fetchPayroll()
  }, [business.business_id, period])

  async function fetchPayroll() {
    setLoading(true)
    try {
      const res = await fetch(`/api/time-reports/payroll-export?period=${period}`)
      if (res.ok) {
        const data = await res.json()
        setPayroll(data.payroll || [])
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  const changePeriod = (delta: number) => {
    const [y, m] = period.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setPeriod(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const fmtKr = (n: number) => n.toLocaleString('sv-SE') + ' kr'
  const grandTotal = payroll.reduce((s, p) => s + p.gross_amount.total, 0)

  const periodLabel = (() => {
    const [y, m] = period.split('-').map(Number)
    const months = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december']
    return `${months[m - 1]} ${y}`
  })()

  return (
    <PermissionGate permission="see_financials">
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      <div className="relative">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/time"
            className="p-2 bg-white border border-gray-200 rounded-xl text-gray-500 hover:text-gray-900">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center">
            <div className="p-3 rounded-xl bg-emerald-600 mr-4">
              <Wallet className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Löneunderlag</h1>
              <p className="text-gray-500 text-sm">Export per medarbetare och period</p>
            </div>
          </div>
        </div>

        {/* Period nav + export */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => changePeriod(-1)}
              className="p-2 bg-white border border-gray-200 rounded-lg text-gray-500 hover:text-gray-900">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 text-sm font-medium min-w-[180px] text-center capitalize">
              {periodLabel}
            </span>
            <button onClick={() => changePeriod(1)}
              className="p-2 bg-white border border-gray-200 rounded-lg text-gray-500 hover:text-gray-900">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-2">
            <a href={`/api/time-reports/payroll-export?period=${period}&format=csv`}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 hover:border-emerald-300">
              <Download className="w-4 h-4" />
              CSV
            </a>
            <a href={`/api/time-reports/payroll-export?period=${period}&format=html`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 hover:border-emerald-300">
              <FileText className="w-4 h-4" />
              PDF
            </a>
          </div>
        </div>

        {/* Grand total */}
        {payroll.length > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 flex items-center justify-between">
            <span className="text-emerald-700 font-medium">Total bruttolön {periodLabel}</span>
            <span className="text-2xl font-bold text-emerald-700">{fmtKr(grandTotal)}</span>
          </div>
        )}

        {/* Per-employee cards */}
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          </div>
        ) : payroll.length === 0 ? (
          <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-12 text-center">
            <Wallet className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Inga tidrapporter denna period</p>
          </div>
        ) : (
          <div className="space-y-4">
            {payroll.map((p, i) => (
              <div key={i} className="bg-white shadow-sm rounded-2xl border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{p.employee}</h3>
                    <p className="text-xs text-gray-500">
                      {p.employment_type === 'owner' ? 'Ägare' : p.employment_type === 'contractor' ? 'Underentreprenör' : 'Anställd'}
                      {p.hourly_wage > 0 && ` · ${p.hourly_wage} kr/tim`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-gray-900">{fmtKr(p.gross_amount.total)}</p>
                    <p className="text-xs text-gray-500">brutto</p>
                  </div>
                </div>

                <div className="p-4">
                  {/* Hours breakdown */}
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-3">
                    <div className="text-center">
                      <p className="text-xs text-gray-500">Normal</p>
                      <p className="text-sm font-bold text-gray-900">{p.regular_hours}h</p>
                      <p className="text-xs text-gray-400">{fmtKr(p.gross_amount.regular)}</p>
                    </div>
                    {p.overtime_50_hours > 0 && (
                      <div className="text-center">
                        <p className="text-xs text-orange-600">ÖT 50%</p>
                        <p className="text-sm font-bold text-orange-600">{p.overtime_50_hours}h</p>
                        <p className="text-xs text-orange-400">{fmtKr(p.gross_amount.overtime_50)}</p>
                      </div>
                    )}
                    {p.overtime_100_hours > 0 && (
                      <div className="text-center">
                        <p className="text-xs text-red-600">ÖT 100%</p>
                        <p className="text-sm font-bold text-red-600">{p.overtime_100_hours}h</p>
                        <p className="text-xs text-red-400">{fmtKr(p.gross_amount.overtime_100)}</p>
                      </div>
                    )}
                    {p.ob1_hours > 0 && (
                      <div className="text-center">
                        <p className="text-xs text-indigo-600">OB1</p>
                        <p className="text-sm font-bold text-indigo-600">{p.ob1_hours}h</p>
                        <p className="text-xs text-indigo-400">{fmtKr(p.gross_amount.ob1)}</p>
                      </div>
                    )}
                    {p.travel_km > 0 && (
                      <div className="text-center">
                        <p className="text-xs text-amber-600">Resa</p>
                        <p className="text-sm font-bold text-amber-600">{p.travel_km} km</p>
                        <p className="text-xs text-amber-400">{fmtKr(p.travel_reimbursement)}</p>
                      </div>
                    )}
                    {p.allowance_days > 0 && (
                      <div className="text-center">
                        <p className="text-xs text-teal-600">Traktamente</p>
                        <p className="text-sm font-bold text-teal-600">{p.allowance_days}d</p>
                        <p className="text-xs text-teal-400">{fmtKr(p.allowance_amount)}</p>
                      </div>
                    )}
                  </div>

                  <div className="text-xs text-gray-400 pt-2 border-t border-gray-100">
                    Totalt {p.total_hours}h
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </PermissionGate>
  )
}
