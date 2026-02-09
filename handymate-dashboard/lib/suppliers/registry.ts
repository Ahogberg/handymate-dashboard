/**
 * Supplier Registry
 * Central registry för grossist-definitioner och adapters
 */

import { SupplierDefinition, SupplierAdapter } from './types'
import { MockAdapter } from './mock'
import { AhlsellAdapter } from './ahlsell'

export const SUPPLIER_DEFINITIONS: SupplierDefinition[] = [
  {
    key: 'ahlsell',
    name: 'Ahlsell',
    description: 'VVS, El, Verktyg & Maskiner',
    authType: 'api_key',
    credentialFields: [
      { key: 'customer_number', label: 'Kundnummer', type: 'text', required: true, placeholder: '12345' },
      { key: 'api_key', label: 'API-nyckel', type: 'password', required: true, placeholder: 'Din API-nyckel' }
    ],
    available: true
  },
  {
    key: 'dahl',
    name: 'Dahl',
    description: 'VVS & VA-produkter',
    authType: 'credentials',
    credentialFields: [
      { key: 'customer_number', label: 'Kundnummer', type: 'text', required: true, placeholder: '12345' },
      { key: 'username', label: 'Användarnamn', type: 'text', required: true, placeholder: '' },
      { key: 'password', label: 'Lösenord', type: 'password', required: true, placeholder: '' }
    ],
    available: false
  },
  {
    key: 'elektroskandia',
    name: 'Elektroskandia',
    description: 'El & Belysning',
    authType: 'api_key',
    credentialFields: [
      { key: 'customer_number', label: 'Kundnummer', type: 'text', required: true, placeholder: '12345' },
      { key: 'api_key', label: 'API-nyckel', type: 'password', required: true, placeholder: 'Din API-nyckel' }
    ],
    available: false
  },
  {
    key: 'solar',
    name: 'Solar Sverige',
    description: 'El, VVS, Ventilation',
    authType: 'api_key',
    credentialFields: [
      { key: 'customer_number', label: 'Kundnummer', type: 'text', required: true, placeholder: '12345' },
      { key: 'api_key', label: 'API-nyckel', type: 'password', required: true, placeholder: 'Din API-nyckel' }
    ],
    available: false
  }
]

const USE_MOCK = process.env.USE_MOCK_SUPPLIERS === 'true'

const adapters: Record<string, SupplierAdapter> = {
  ahlsell: USE_MOCK ? new MockAdapter('ahlsell') : new AhlsellAdapter(),
  dahl: new MockAdapter('dahl'),
  elektroskandia: new MockAdapter('elektroskandia'),
  solar: new MockAdapter('solar')
}

export function getAdapter(supplierKey: string): SupplierAdapter | null {
  return adapters[supplierKey] || null
}

export function getDefinition(supplierKey: string): SupplierDefinition | undefined {
  return SUPPLIER_DEFINITIONS.find(d => d.key === supplierKey)
}
