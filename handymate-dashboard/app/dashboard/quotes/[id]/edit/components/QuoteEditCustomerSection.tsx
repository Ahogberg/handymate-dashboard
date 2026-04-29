'use client'

interface Customer {
  customer_id: string
  name: string
  phone_number: string
  email: string
  address_line: string
  personal_number?: string
  property_designation?: string
}

interface QuoteEditCustomerSectionProps {
  customers: Customer[]
  selectedCustomer: string
  setSelectedCustomer: (id: string) => void
  validDays: number
  setValidDays: (n: number) => void
  title: string
  setTitle: (s: string) => void
  description: string
  setDescription: (s: string) => void
}

/**
 * Kund + giltighetstid + titel + beskrivning. Kombinerar
 * STEG 1-3 i user-spec'en (Customer + Description + Validity)
 * eftersom de delar samma kort visuellt och är redan placerade
 * tillsammans i nuvarande layout.
 */
export function QuoteEditCustomerSection({
  customers,
  selectedCustomer,
  setSelectedCustomer,
  validDays,
  setValidDays,
  title,
  setTitle,
  description,
  setDescription,
}: QuoteEditCustomerSectionProps) {
  return (
    <div className="bg-white border-thin border-[#E2E8F0] rounded-xl px-7 py-6">
      <div className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#475569] mb-4">Kund</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-[12px] text-[#64748B] mb-1">Kund *</label>
          <select
            value={selectedCustomer}
            onChange={e => setSelectedCustomer(e.target.value)}
            className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
          >
            <option value="">Välj kund...</option>
            {customers.map(c => (
              <option key={c.customer_id} value={c.customer_id}>
                {c.name} — {c.phone_number}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[12px] text-[#64748B] mb-1">Giltighetstid</label>
          <select
            value={validDays}
            onChange={e => setValidDays(parseInt(e.target.value))}
            className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
          >
            <option value={14}>14 dagar</option>
            <option value={30}>30 dagar</option>
            <option value={60}>60 dagar</option>
            <option value={90}>90 dagar</option>
          </select>
        </div>
      </div>
      <div className="mb-3">
        <label className="block text-[12px] text-[#64748B] mb-1">Titel</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="T.ex. Elinstallation kök"
          className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
        />
      </div>
      <div>
        <label className="block text-[12px] text-[#64748B] mb-1">
          Beskrivning <span className="text-[11px] text-[#CBD5E1]">(valfri)</span>
        </label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Kort beskrivning av jobbet..."
          rows={2}
          className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E] resize-y"
        />
      </div>
    </div>
  )
}
