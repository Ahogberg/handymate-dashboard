import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-600 to-primary-800">
      <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-md w-full mx-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Handymate</h1>
          <p className="text-gray-600">AI-driven back office för hantverkare</p>
        </div>
        
        <Link 
          href="/dashboard"
          className="block w-full bg-primary-600 text-white py-3 px-4 rounded-lg text-center font-medium hover:bg-primary-700 transition"
        >
          Gå till Dashboard
        </Link>
        
        <p className="text-center text-sm text-gray-500 mt-6">
          Demo-läge • Ingen inloggning krävs
        </p>
      </div>
    </div>
  )
}
