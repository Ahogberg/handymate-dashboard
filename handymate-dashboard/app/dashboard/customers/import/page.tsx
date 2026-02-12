'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { 
  ArrowLeft, 
  Upload, 
  FileSpreadsheet,
  Check,
  AlertCircle,
  Loader2,
  Download,
  X
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'

interface ParsedRow {
  name: string
  phone_number: string
  email: string
  address: string
  raw: string[]
}

interface ColumnMapping {
  name: number | null
  phone_number: number | null
  email: number | null
  address: number | null
}

export default function ImportCustomersPage() {
  const router = useRouter()
  const business = useBusiness()
  
  const [step, setStep] = useState(1)
  const [file, setFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<ColumnMapping>({
    name: null,
    phone_number: null,
    email: null,
    address: null
  })
  const [parsedData, setParsedData] = useState<ParsedRow[]>([])
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const parseCSV = (text: string): { headers: string[]; rows: string[][] } => {
    const lines = text.split(/\r?\n/).filter(line => line.trim())
    if (lines.length === 0) return { headers: [], rows: [] }

    // Detect delimiter (comma, semicolon, or tab)
    const firstLine = lines[0]
    let delimiter = ','
    if (firstLine.includes(';') && !firstLine.includes(',')) delimiter = ';'
    if (firstLine.includes('\t') && !firstLine.includes(',') && !firstLine.includes(';')) delimiter = '\t'

    const parseRow = (line: string): string[] => {
      const result: string[] = []
      let current = ''
      let inQuotes = false
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === delimiter && !inQuotes) {
          result.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      result.push(current.trim())
      return result
    }

    const headers = parseRow(lines[0])
    const rows = lines.slice(1).map(parseRow).filter(row => row.some(cell => cell))

    return { headers, rows }
  }

  const handleFile = useCallback((selectedFile: File) => {
    setFile(selectedFile)
    
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const { headers: parsedHeaders, rows: parsedRows } = parseCSV(text)
      setHeaders(parsedHeaders)
      setRows(parsedRows)
      
      // Auto-detect column mapping
      const autoMapping: ColumnMapping = {
        name: null,
        phone_number: null,
        email: null,
        address: null
      }
      
      parsedHeaders.forEach((header, index) => {
        const h = header.toLowerCase()
        if (h.includes('namn') || h.includes('name') || h.includes('kund')) {
          autoMapping.name = index
        }
        if (h.includes('telefon') || h.includes('phone') || h.includes('mobil') || h.includes('tel')) {
          autoMapping.phone_number = index
        }
        if (h.includes('mail') || h.includes('e-post') || h.includes('epost')) {
          autoMapping.email = index
        }
        if (h.includes('adress') || h.includes('address') || h.includes('gata') || h.includes('street')) {
          autoMapping.address = index
        }
      })
      
      setMapping(autoMapping)
      setStep(2)
    }
    reader.readAsText(selectedFile, 'UTF-8')
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && (droppedFile.name.endsWith('.csv') || droppedFile.name.endsWith('.txt'))) {
      handleFile(droppedFile)
    }
  }, [handleFile])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      handleFile(selectedFile)
    }
  }

  const formatPhoneNumber = (phone: string): string => {
    // Ta bort allt utom siffror och +
    let cleaned = phone.replace(/[^\d+]/g, '')
    
    // Om det börjar med 0, ersätt med +46
    if (cleaned.startsWith('0')) {
      cleaned = '+46' + cleaned.slice(1)
    }
    
    // Om det inte börjar med +, anta Sverige
    if (!cleaned.startsWith('+')) {
      cleaned = '+46' + cleaned
    }
    
    return cleaned
  }

  const validatePhoneNumber = (phone: string): boolean => {
    const formatted = formatPhoneNumber(phone)
    // Svensk mobilnummer: +46 7X XXX XX XX (10 siffror efter +46)
    // Svensk fast: +46 X XXX XXX (7-9 siffror efter +46)
    return /^\+46\d{7,10}$/.test(formatted)
  }

  const prepareData = () => {
    if (mapping.phone_number === null) return

    const prepared: ParsedRow[] = rows.map(row => ({
      name: mapping.name !== null ? row[mapping.name] || '' : '',
      phone_number: formatPhoneNumber(row[mapping.phone_number!] || ''),
      email: mapping.email !== null ? row[mapping.email] || '' : '',
      address: mapping.address !== null ? row[mapping.address] || '' : '',
      raw: row
    })).filter(row => row.phone_number && validatePhoneNumber(row.phone_number))

    setParsedData(prepared)
    setStep(3)
  }

  const handleImport = async () => {
    setImporting(true)
    
    let success = 0
    let failed = 0
    const errors: string[] = []

    for (const row of parsedData) {
      try {
        // Kolla om kunden redan finns (baserat på telefonnummer)
        const { data: existing } = await supabase
          .from('customer')
          .select('customer_id')
          .eq('business_id', business.business_id)
          .eq('phone_number', row.phone_number)
          .single()

        if (existing) {
          // Uppdatera befintlig kund
          await supabase
            .from('customer')
            .update({
              name: row.name || undefined,
              email: row.email || undefined,
              address_line: row.address || undefined,
            })
            .eq('customer_id', existing.customer_id)
          success++
        } else {
          // Skapa ny kund
          const customerId = 'cust_' + Math.random().toString(36).substr(2, 9)
          const { error } = await supabase
            .from('customer')
            .insert({
              customer_id: customerId,
              business_id: business.business_id,
              name: row.name || 'Okänd',
              phone_number: row.phone_number,
              email: row.email || null,
              address_line: row.address || null,
              created_at: new Date().toISOString(),
            })

          if (error) {
            failed++
            errors.push(`${row.name || row.phone_number}: ${error.message}`)
          } else {
            success++
          }
        }
      } catch (err: any) {
        failed++
        errors.push(`${row.name || row.phone_number}: ${err.message}`)
      }
    }

    setImportResult({ success, failed, errors })
    setStep(4)
    setImporting(false)
  }

  const downloadTemplate = () => {
    const template = 'Namn,Telefon,E-post,Adress\nAnna Andersson,0701234567,anna@example.com,Storgatan 1\nErik Eriksson,0709876543,erik@example.com,Lillvägen 5'
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'kundimport_mall.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-8 bg-slate-50 min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-blue-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-cyan-50 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/dashboard/customers"
            className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Importera kunder</h1>
            <p className="text-gray-500 text-sm">Ladda upp en CSV-fil med dina befintliga kunder</p>
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-4 mb-8">
          {[
            { num: 1, label: 'Ladda upp' },
            { num: 2, label: 'Mappa kolumner' },
            { num: 3, label: 'Granska' },
            { num: 4, label: 'Klart' }
          ].map((s, i) => (
            <div key={s.num} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= s.num 
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white' 
                  : 'bg-gray-100 text-gray-400'
              }`}>
                {step > s.num ? <Check className="w-4 h-4" /> : s.num}
              </div>
              <span className={`ml-2 text-sm hidden sm:block ${step >= s.num ? 'text-gray-900' : 'text-gray-400'}`}>
                {s.label}
              </span>
              {i < 3 && <div className="w-8 sm:w-12 h-px bg-gray-100 mx-2 sm:mx-4"></div>}
            </div>
          ))}
        </div>

        {/* Step 1: Upload */}
        {step === 1 && (
          <div className="space-y-6">
            <div 
              className={`bg-white shadow-sm rounded-2xl border-2 border-dashed p-12 text-center transition-all ${
                dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-300'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Dra och släpp din fil här
              </h3>
              <p className="text-gray-400 mb-6">eller</p>
              <label className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:opacity-90 cursor-pointer">
                <FileSpreadsheet className="w-5 h-5 mr-2" />
                Välj fil
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>
              <p className="text-xs text-gray-400 mt-4">Stödjer CSV-filer (komma-, semikolon- eller tab-separerade)</p>
            </div>

            <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Tips för import</h3>
              <ul className="space-y-3 text-sm text-gray-500">
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <span>Se till att telefonnummer är i kolumn (07XXXXXXXX eller +467XXXXXXXX)</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <span>Första raden ska innehålla kolumnrubriker (Namn, Telefon, etc.)</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <span>Dubbletter (samma telefonnummer) uppdateras automatiskt</span>
                </li>
              </ul>
              
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-2 mt-6 text-sm text-blue-600 hover:text-blue-500"
              >
                <Download className="w-4 h-4" />
                Ladda ner exempelmall
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Map columns */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Mappa kolumner</h3>
                  <p className="text-sm text-gray-400">Välj vilka kolumner som motsvarar kunddata</p>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <FileSpreadsheet className="w-4 h-4" />
                  {file?.name}
                </div>
              </div>

              <div className="grid gap-4">
                {[
                  { key: 'name', label: 'Namn', required: false },
                  { key: 'phone_number', label: 'Telefonnummer', required: true },
                  { key: 'email', label: 'E-post', required: false },
                  { key: 'address', label: 'Adress', required: false }
                ].map((field) => (
                  <div key={field.key} className="flex items-center gap-4">
                    <label className="w-32 text-sm text-gray-500">
                      {field.label}
                      {field.required && <span className="text-red-600 ml-1">*</span>}
                    </label>
                    <select
                      value={mapping[field.key as keyof ColumnMapping] ?? ''}
                      onChange={(e) => setMapping({
                        ...mapping,
                        [field.key]: e.target.value === '' ? null : parseInt(e.target.value)
                      })}
                      className="flex-1 px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    >
                      <option value="">-- Välj kolumn --</option>
                      {headers.map((header, index) => (
                        <option key={index} value={index}>{header}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {mapping.phone_number === null && (
                <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-sm text-amber-600">
                    ⚠️ Du måste välja en kolumn för telefonnummer
                  </p>
                </div>
              )}
            </div>

            {/* Preview */}
            <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Förhandsgranskning (första 5 rader)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      {headers.map((header, i) => (
                        <th key={i} className="px-3 py-2 text-left text-gray-400 font-medium">
                          {header}
                          {Object.entries(mapping).find(([_, v]) => v === i) && (
                            <span className="ml-2 text-blue-600">
                              ← {Object.entries(mapping).find(([_, v]) => v === i)?.[0]}
                            </span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-b border-gray-200/50">
                        {row.map((cell, j) => (
                          <td key={j} className="px-3 py-2 text-gray-700">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400 mt-4">Visar {Math.min(5, rows.length)} av {rows.length} rader</p>
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep(1)}
                className="px-6 py-3 text-gray-500 hover:text-gray-900 transition-colors"
              >
                ← Tillbaka
              </button>
              <button
                onClick={prepareData}
                disabled={mapping.phone_number === null}
                className="px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Fortsätt
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Redo att importera</h3>
              <p className="text-gray-400 mb-6">
                {parsedData.length} kunder kommer att importeras
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-gray-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-gray-900">{parsedData.length}</p>
                  <p className="text-xs text-gray-400">Totalt</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-gray-900">{parsedData.filter(r => r.name).length}</p>
                  <p className="text-xs text-gray-400">Med namn</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-gray-900">{parsedData.filter(r => r.email).length}</p>
                  <p className="text-xs text-gray-400">Med e-post</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-gray-900">{parsedData.filter(r => r.address).length}</p>
                  <p className="text-xs text-gray-400">Med adress</p>
                </div>
              </div>

              {rows.length - parsedData.length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-6">
                  <p className="text-sm text-amber-600">
                    ⚠️ {rows.length - parsedData.length} rader hoppas över (ogiltigt telefonnummer)
                  </p>
                </div>
              )}

              {/* Sample data */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">Namn</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">Telefon</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">E-post</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">Adress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-b border-gray-200/50">
                        <td className="px-3 py-2 text-gray-700">{row.name || '-'}</td>
                        <td className="px-3 py-2 text-gray-700">{row.phone_number}</td>
                        <td className="px-3 py-2 text-gray-700">{row.email || '-'}</td>
                        <td className="px-3 py-2 text-gray-700">{row.address || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedData.length > 10 && (
                <p className="text-xs text-gray-400 mt-4">Visar 10 av {parsedData.length} kunder</p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep(2)}
                className="px-6 py-3 text-gray-500 hover:text-gray-900 transition-colors"
              >
                ← Tillbaka
              </button>
              <button
                onClick={handleImport}
                disabled={importing}
                className="flex items-center px-8 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Importerar...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 mr-2" />
                    Importera {parsedData.length} kunder
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Done */}
        {step === 4 && importResult && (
          <div className="space-y-6">
            <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-8 text-center">
              {importResult.success > 0 ? (
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-emerald-600" />
                </div>
              ) : (
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <X className="w-8 h-8 text-red-600" />
                </div>
              )}
              
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {importResult.success > 0 ? 'Import klar!' : 'Import misslyckades'}
              </h2>
              
              <div className="flex items-center justify-center gap-8 my-6">
                <div>
                  <p className="text-3xl font-bold text-emerald-600">{importResult.success}</p>
                  <p className="text-sm text-gray-400">Importerade</p>
                </div>
                {importResult.failed > 0 && (
                  <div>
                    <p className="text-3xl font-bold text-red-600">{importResult.failed}</p>
                    <p className="text-sm text-gray-400">Misslyckade</p>
                  </div>
                )}
              </div>

              {importResult.errors.length > 0 && (
                <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl text-left">
                  <p className="text-sm font-medium text-red-600 mb-2">Fel:</p>
                  <ul className="text-xs text-red-700 space-y-1 max-h-32 overflow-y-auto">
                    {importResult.errors.slice(0, 10).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {importResult.errors.length > 10 && (
                      <li>...och {importResult.errors.length - 10} till</li>
                    )}
                  </ul>
                </div>
              )}

              <div className="flex items-center justify-center gap-4 mt-8">
                <Link
                  href="/dashboard/customers"
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:opacity-90"
                >
                  Visa kunder
                </Link>
                <Link
                  href="/dashboard/campaigns/new"
                  className="px-6 py-3 bg-gray-100 border border-gray-300 rounded-xl font-medium text-gray-900 hover:bg-gray-200"
                >
                  Skapa kampanj
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
