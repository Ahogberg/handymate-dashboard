import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#09090b] relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-violet-500/20 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-fuchsia-500/15 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative bg-zinc-900/50 backdrop-blur-xl p-8 rounded-3xl border border-zinc-800 max-w-md w-full mx-4">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-violet-500/25">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Handymate</h1>
          <p className="text-zinc-400">AI-driven back office för hantverkare</p>
        </div>
        
        <Link 
          href="/dashboard"
          className="block w-full bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white py-4 px-4 rounded-xl text-center font-semibold hover:from-violet-600 hover:to-fuchsia-600 transition-all shadow-lg shadow-violet-500/25"
        >
          Gå till Dashboard
        </Link>
        
        <p className="text-center text-sm text-zinc-500 mt-6">
          Demo-läge • Ingen inloggning krävs
        </p>

        <div className="mt-8 pt-6 border-t border-zinc-800">
          <p className="text-center text-xs text-zinc-600">
            <a href="https://handymate.se" className="text-violet-400 hover:text-violet-300 transition-colors">
              ← Tillbaka till handymate.se
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
