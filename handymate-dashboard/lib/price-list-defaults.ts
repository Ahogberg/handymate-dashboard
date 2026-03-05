interface PriceListEntry {
  category: 'labor' | 'material' | 'service'
  name: string
  unit: string
  unit_price: number
}

const BRANCH_PRICES: Record<string, PriceListEntry[]> = {
  electrician: [
    { category: 'labor', name: 'Elinstallation', unit: 'timme', unit_price: 550 },
    { category: 'labor', name: 'Felsökning', unit: 'timme', unit_price: 650 },
    { category: 'service', name: 'Elbilsladdare installation', unit: 'st', unit_price: 12000 },
    { category: 'service', name: 'Jordfelsbrytare byte', unit: 'st', unit_price: 2500 },
    { category: 'material', name: 'Eluttag (enkel)', unit: 'st', unit_price: 150 },
    { category: 'material', name: 'LED-spot', unit: 'st', unit_price: 250 },
  ],
  plumber: [
    { category: 'labor', name: 'VVS-arbete', unit: 'timme', unit_price: 550 },
    { category: 'labor', name: 'Akut utryckning', unit: 'timme', unit_price: 850 },
    { category: 'service', name: 'Stopp i avlopp', unit: 'st', unit_price: 1200 },
    { category: 'service', name: 'Byta blandare', unit: 'st', unit_price: 1800 },
    { category: 'material', name: 'Blandare standard', unit: 'st', unit_price: 1500 },
    { category: 'material', name: 'WC-stol', unit: 'st', unit_price: 3500 },
  ],
  carpenter: [
    { category: 'labor', name: 'Snickeriarbete', unit: 'timme', unit_price: 500 },
    { category: 'service', name: 'Altanbygge', unit: 'kvm', unit_price: 3500 },
    { category: 'service', name: 'Köksmontering', unit: 'st', unit_price: 15000 },
    { category: 'material', name: 'Trall (tryckimpregnerad)', unit: 'kvm', unit_price: 350 },
    { category: 'material', name: 'Reglar 45x95', unit: 'lpm', unit_price: 45 },
  ],
  painter: [
    { category: 'labor', name: 'Måleriarbete', unit: 'timme', unit_price: 450 },
    { category: 'service', name: 'Rum (väggar + tak)', unit: 'kvm golv', unit_price: 650 },
    { category: 'service', name: 'Fasadmålning', unit: 'kvm', unit_price: 350 },
    { category: 'material', name: 'Väggfärg (vit)', unit: 'liter', unit_price: 120 },
    { category: 'material', name: 'Grundfärg', unit: 'liter', unit_price: 150 },
  ],
  construction: [
    { category: 'labor', name: 'Byggarbete', unit: 'timme', unit_price: 500 },
    { category: 'labor', name: 'Rivning', unit: 'timme', unit_price: 450 },
    { category: 'service', name: 'Badrumsrenovering', unit: 'st', unit_price: 85000 },
    { category: 'service', name: 'Köksrenovering', unit: 'st', unit_price: 75000 },
    { category: 'material', name: 'Gipsskiva 13mm', unit: 'st', unit_price: 95 },
  ],
  roofing: [
    { category: 'labor', name: 'Takarbete', unit: 'timme', unit_price: 500 },
    { category: 'service', name: 'Takbyte (betongpannor)', unit: 'kvm', unit_price: 1200 },
    { category: 'service', name: 'Plåttak', unit: 'kvm', unit_price: 900 },
    { category: 'material', name: 'Betongpanna', unit: 'st', unit_price: 35 },
  ],
  flooring: [
    { category: 'labor', name: 'Golvläggning', unit: 'timme', unit_price: 500 },
    { category: 'service', name: 'Parkettläggning', unit: 'kvm', unit_price: 450 },
    { category: 'service', name: 'Kakel/klinker', unit: 'kvm', unit_price: 850 },
    { category: 'material', name: 'Parkett (ek)', unit: 'kvm', unit_price: 550 },
  ],
  gardening: [
    { category: 'labor', name: 'Trädgårdsarbete', unit: 'timme', unit_price: 400 },
    { category: 'service', name: 'Häckklippning', unit: 'lpm', unit_price: 80 },
    { category: 'service', name: 'Gräsklippning', unit: 'kvm', unit_price: 8 },
    { category: 'service', name: 'Stenläggning', unit: 'kvm', unit_price: 850 },
  ],
  cleaning: [
    { category: 'labor', name: 'Städning', unit: 'timme', unit_price: 350 },
    { category: 'service', name: 'Hemstäd (3:a)', unit: 'st', unit_price: 1200 },
    { category: 'service', name: 'Flyttstäd (3:a)', unit: 'st', unit_price: 3500 },
    { category: 'service', name: 'Fönsterputs', unit: 'st', unit_price: 150 },
  ],
  moving: [
    { category: 'labor', name: 'Flyttpersonal', unit: 'timme', unit_price: 450 },
    { category: 'service', name: 'Lägenhetsflytt (2:a)', unit: 'st', unit_price: 5000 },
    { category: 'service', name: 'Vilaflytt', unit: 'st', unit_price: 12000 },
    { category: 'material', name: 'Flyttkartonger (10st)', unit: 'paket', unit_price: 250 },
  ],
  hvac: [
    { category: 'labor', name: 'VVS/Ventilation', unit: 'timme', unit_price: 550 },
    { category: 'service', name: 'Värmepump installation', unit: 'st', unit_price: 25000 },
    { category: 'service', name: 'AC-service', unit: 'st', unit_price: 2500 },
    { category: 'material', name: 'Ventilationsdon', unit: 'st', unit_price: 450 },
  ],
  locksmith: [
    { category: 'labor', name: 'Låssmedsarbete', unit: 'timme', unit_price: 600 },
    { category: 'service', name: 'Låsöppning (dagtid)', unit: 'st', unit_price: 1200 },
    { category: 'service', name: 'Låsbyte cylinder', unit: 'st', unit_price: 2500 },
    { category: 'material', name: 'Cylinderlås (klass 3)', unit: 'st', unit_price: 800 },
  ],
  other: [
    { category: 'labor', name: 'Arbete', unit: 'timme', unit_price: 450 },
    { category: 'service', name: 'Konsultation', unit: 'timme', unit_price: 500 },
    { category: 'service', name: 'Småjobb', unit: 'st', unit_price: 1500 },
  ],
}

/**
 * Get default price list entries for a branch
 */
export function getDefaultPriceList(branch: string): PriceListEntry[] {
  return BRANCH_PRICES[branch] || BRANCH_PRICES.other
}
