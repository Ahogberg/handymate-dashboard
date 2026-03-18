/**
 * Lantmäteriet API — lagfarter (fastighetsförsäljningar)
 * Mock-implementation tills API-nyckel finns.
 */

import type { PropertyLead } from '../types'
import type { LeadSegment } from '../segmentation'

const LANTMATERIET_API_KEY = process.env.LANTMATERIET_API_KEY

const MOCK_PROPERTIES: PropertyLead[] = [
  { address: 'Ekvägen 14, 123 45 Stockholm', propertyType: 'villa', builtYear: 1972, energyClass: 'E', purchaseDate: '2026-02-15', ownerName: 'Erik Andersson' },
  { address: 'Björkgatan 8, 123 45 Stockholm', propertyType: 'radhus', builtYear: 1968, energyClass: 'F', purchaseDate: '2026-01-28', ownerName: 'Maria Svensson' },
  { address: 'Tallstigen 22, 123 45 Stockholm', propertyType: 'villa', builtYear: 1983, energyClass: 'D', purchaseDate: '2026-03-01', ownerName: 'Johan Berg' },
  { address: 'Granvägen 5, 123 45 Stockholm', propertyType: 'villa', builtYear: 1965, energyClass: 'G', purchaseDate: '2026-02-20', ownerName: 'Anna Lindqvist' },
  { address: 'Lönnvägen 11, 123 45 Stockholm', propertyType: 'radhus', builtYear: 1978, energyClass: 'E', purchaseDate: '2026-03-10', ownerName: 'Lars Pettersson' },
  { address: 'Aspgatan 3, 123 45 Stockholm', propertyType: 'villa', builtYear: 1955, energyClass: 'F', purchaseDate: '2026-01-15', ownerName: 'Karin Johansson' },
  { address: 'Pilvägen 17, 123 45 Stockholm', propertyType: 'villa', builtYear: 1991, energyClass: 'C', purchaseDate: '2026-03-05', ownerName: 'Per Nilsson' },
  { address: 'Syrengatan 9, 123 45 Stockholm', propertyType: 'bostadsrätt', builtYear: 1975, energyClass: 'D', purchaseDate: '2026-02-10', ownerName: 'Eva Gustafsson' },
]

export async function fetchPropertySales(
  serviceArea: string | null,
  segment: LeadSegment
): Promise<PropertyLead[]> {
  if (!LANTMATERIET_API_KEY) {
    console.warn('[Lantmäteriet] API-nyckel saknas — använder mockdata')
    return filterProperties(MOCK_PROPERTIES, segment)
  }

  // TODO: Implementera riktig API-anrop mot Lantmäteriet
  // const url = `https://api.lantmateriet.se/distribution/produkter/...`
  console.warn('[Lantmäteriet] Riktigt API ej implementerat ännu — använder mockdata')
  return filterProperties(MOCK_PROPERTIES, segment)
}

function filterProperties(properties: PropertyLead[], segment: LeadSegment): PropertyLead[] {
  const now = new Date()
  const cutoffDate = new Date(now.getTime() - segment.purchaseDays * 24 * 60 * 60 * 1000)

  return properties.filter(p => {
    // Filter by property type
    if (!segment.propertyTypes.includes(p.propertyType)) return false

    // Filter by built year
    if (segment.builtYearRange && p.builtYear) {
      if (p.builtYear < segment.builtYearRange[0] || p.builtYear > segment.builtYearRange[1]) {
        // If recent purchase, include anyway
        if (!segment.recentPurchase) return false
        if (!p.purchaseDate || new Date(p.purchaseDate) < cutoffDate) return false
      }
    }

    // Filter by energy class
    if (segment.energyClasses && p.energyClass) {
      if (!segment.energyClasses.includes(p.energyClass)) {
        if (!segment.recentPurchase) return false
        if (!p.purchaseDate || new Date(p.purchaseDate) < cutoffDate) return false
      }
    }

    // Filter by recent purchase
    if (segment.recentPurchase && p.purchaseDate) {
      if (new Date(p.purchaseDate) >= cutoffDate) return true
    }

    return true
  })
}
