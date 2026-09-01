import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { readAgreementText, AGREEMENT_VERSION } from '@/lib/partners/agreement'

export const metadata = {
  title: 'Handymate Partneravtal',
}

export default function PartnerAgreementPage() {
  const agreementText = readAgreementText()

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="border-b border-gray-100 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-4 flex items-center justify-between gap-4">
          <Link href="/partners/register" className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Tillbaka till registreringen</span>
          </Link>
          <span className="text-xs text-gray-400">Version {AGREEMENT_VERSION}</span>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-12">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-10">
          <div className="prose prose-slate max-w-none [&_table]:w-full [&_th]:text-left">
            <ReactMarkdown>{agreementText}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  )
}
