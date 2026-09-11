/** Editorial starting points, never a price list or technical installation specification. */
export interface TradeStartPackage {
  name: string
  scope: string
  labor: string
  materials: string[]
  questions: string[]
}
const pack = (name: string, scope: string, labor: string, materials: string[], questions: string[]): TradeStartPackage => ({ name, scope, labor, materials, questions })
export const TRADE_START_PACKAGES: Record<string, TradeStartPackage[]> = {
  electrician: [
    pack('Service och felsökning', 'Mindre elservice, felsökning och reparation.', 'Elektrikerarbete', ['Uttag och strömbrytare', 'Installationsmaterial'], ['Vilket problem ska lösas?', 'Vad ingår i servicebesöket?']),
    pack('El vid renovering', 'Elinstallationer i befintliga rum, kök och badrum.', 'Elektrikerarbete', ['Uttag och strömbrytare', 'Kabel', 'Installationsmaterial'], ['Vilka rum och hur många punkter?', 'Vad finns redan och vad ska återställas?']),
    pack('Elcentral och elsäkerhet', 'Arbete kring elcentral och avgränsade kontrolluppdrag.', 'Elektrikerarbete', ['Elcentral', 'Skyddsapparater'], ['Vilken anläggning och omfattning?', 'Vilka produkter och kontroller ingår?']),
    pack('Laddbox', 'Installation av vald laddbox med tydlig omfattning.', 'Elektrikerarbete', ['Laddbox', 'Lastbalansering', 'Kabel'], ['Vilken modell och placering?', 'Vilken kabelväg och vilket markarbete behövs?']),
    pack('Belysning', 'Installation eller byte av belysning inne och ute.', 'Elektrikerarbete', ['Armatur', 'Drivdon', 'Styrning'], ['Antal, placering och åtkomlighet?', 'Äger kunden redan utrustningen?']),
  ],
  plumber: [
    pack('Service och reparation', 'Felsökning, läckor och mindre VVS-reparationer.', 'VVS-arbete', ['Reservdel', 'Koppling', 'Ventil'], ['Vilket fel och vilken utrustning?', 'Ingår felsökning och material i besöket?']),
    pack('Badrum', 'VVS-delen av ett nytt eller renoverat badrum.', 'VVS-arbete', ['Blandare', 'Sanitetsporslin', 'Rör och kopplingar'], ['Vilka produkter och anslutningar?', 'Vilka arbeten gör andra yrkesgrupper?']),
    pack('Kök och vatteninstallationer', 'Vatten och avlopp till kök och ansluten utrustning.', 'VVS-arbete', ['Köksblandare', 'Avloppsdel', 'Anslutningsmaterial'], ['Vilken utrustning ska anslutas?', 'Finns fungerande anslutningar på rätt plats?']),
    pack('Värmeinstallation', 'Installation eller byte av specificerad värmeutrustning.', 'VVS-arbete', ['Värmeutrustning', 'Radiator', 'Ventil'], ['Vilket befintligt system och vald produkt?', 'Vad ingår i driftsättning och bortforsling?']),
    pack('Avlopp', 'Avgränsad avloppsservice, reparation eller byte.', 'VVS-arbete', ['Avloppsrör', 'Rördel'], ['Var finns problemet och hur kommer man åt?', 'Behövs spolning, filmning eller markarbete?']),
  ],
  construction: [
    pack('Invändig renovering', 'Väggar, golv och snickerier i befintliga rum.', 'Bygg- och snickeriarbete', ['Skivmaterial', 'Regelvirke', 'List'], ['Vilka rum och ytor?', 'Ingår rivning, skydd och återställning?']),
    pack('Köksrenovering', 'Montering och byggarbete kring kök.', 'Bygg- och snickeriarbete', ['Köksinredning', 'Bänkskiva', 'Monteringsmaterial'], ['Vilken inredning levererar kunden?', 'Hur avgränsas el, VVS och ytskikt?']),
    pack('Altan och utebyggnation', 'Altaner och avgränsade snickerier utomhus.', 'Bygg- och snickeriarbete', ['Trall', 'Konstruktionsvirke', 'Infästning'], ['Mått, höjd och markförutsättningar?', 'Vilket material och vilken grundläggning?']),
    pack('Fönster och dörrar', 'Byte eller montering med tydlig återställning.', 'Bygg- och snickeriarbete', ['Fönster eller dörr', 'Foder', 'Tätningsmaterial'], ['Antal, mått och vald produkt?', 'Vad ingår i invändig och utvändig återställning?']),
    pack('Tillbyggnad', 'Byggarbete enligt avgränsad ritning och beställning.', 'Bygg- och snickeriarbete', ['Konstruktionsvirke', 'Skivmaterial', 'Isolering'], ['Vilka ritningar och vilken omfattning finns?', 'Vem ansvarar för grund och installationer?']),
  ],
  painter: [
    pack('Invändig målning', 'Målning av väggar och tak med definierat underarbete.', 'Måleriarbete', ['Vägg- och takfärg', 'Spackel', 'Skyddsmaterial'], ['Vilka ytor och vilket skick?', 'Kulör, färgsystem och omfattning på underarbetet?']),
    pack('Fasadmålning', 'Utvändig målning med specificerad förbehandling.', 'Måleriarbete', ['Fasadfärg', 'Grundfärg', 'Rengöringsmedel'], ['Fasadmaterial, yta och skick?', 'Vad krävs för åtkomst och väderskydd?']),
    pack('Snickerimålning', 'Målning av lister, dörrar, fönster och andra snickerier.', 'Måleriarbete', ['Snickerifärg', 'Grundfärg', 'Slipmaterial'], ['Vilka objekt, antal och befintligt skick?', 'Ingår demontering och återmontering?']),
    pack('Tapetsering', 'Tapetsering och avtalat underarbete.', 'Måleriarbete', ['Tapet', 'Tapetlim', 'Spackel'], ['Ytor, mönsterpassning och underlag?', 'Tillhandahåller kunden tapeten?']),
    pack('Trapphus och gemensamma utrymmen', 'Samordnad målning i fastighetens gemensamma delar.', 'Måleriarbete', ['Vägg- och takfärg', 'Snickerifärg', 'Skyddsmaterial'], ['Vilka ytor och tillträdestider?', 'Hur hanteras skydd och arbete i etapper?']),
  ],
  roofing: [
    pack('Takomläggning', 'Byte av avtalade taklager och anslutningar.', 'Tak- och plåtarbete', ['Takbeklädnad', 'Underlagstak', 'Läkt'], ['Taktyp, yta och befintligt skick?', 'Ingår rivning, avfall och åtkomst?']),
    pack('Takservice och reparation', 'Felsökning och avgränsad reparation av tak.', 'Tak- och plåtarbete', ['Takmaterial', 'Tätningsmaterial', 'Infästning'], ['Var finns skadan och vilket underlag finns?', 'Vilken åtkomst och omfattning behövs?']),
    pack('Takavvattning', 'Byte eller montering av rännor och stuprör.', 'Tak- och plåtarbete', ['Hängränna', 'Stuprör', 'Rännkrok'], ['Längder, dimensioner och material?', 'Hur ansluts vattnet vidare?']),
    pack('Takfönster', 'Installation eller byte av valt takfönster.', 'Tak- och plåtarbete', ['Takfönster', 'Intäckning', 'Invändigt smygmaterial'], ['Modell, mått och taktyp?', 'Vad ingår i invändig återställning?']),
    pack('Byggnadsplåtslageri', 'Anpassade plåtdetaljer och anslutningar på byggnaden.', 'Tak- och plåtarbete', ['Plåt', 'Beslag', 'Infästning'], ['Vilka detaljer, mått och material?', 'Hur ordnas åtkomst och anslutningar?']),
  ],
  groundworks: [
    pack('Markförberedelse', 'Schaktning och förberedelse av avgränsad yta.', 'Markarbete', ['Fyllnadsmaterial', 'Geotextil'], ['Yta, nivåer och åtkomlighet?', 'Vilka massor ska bort eller tillföras?']),
    pack('Dränering och dagvatten', 'Avgränsad dränering och dagvattenhantering.', 'Markarbete', ['Dräneringsrör', 'Dränerande material', 'Brunn'], ['Längder, djup och befintliga förhållanden?', 'Vilken anslutning och återställning ingår?']),
    pack('Stenläggning och uppfart', 'Markbeläggning med specificerat underarbete.', 'Markarbete', ['Marksten', 'Bärlager', 'Kantstöd'], ['Yta och avsedd belastning?', 'Vilka nivåer, produkter och avslut önskas?']),
    pack('Grundarbete', 'Mark- och grundförberedelser enligt underlag.', 'Markarbete', ['Bärlager', 'Isolering', 'Grundmaterial'], ['Vilket konstruktions- och markunderlag finns?', 'Vad ingår i grund respektive byggentreprenad?']),
    pack('Utomhusmiljö', 'Anläggning av avgränsade trädgårds- och gårdsytor.', 'Markarbete', ['Matjord', 'Gräs eller växter', 'Kantmaterial'], ['Vilka ytor och vilket slutresultat?', 'Ingår bevattning och efterföljande skötsel?']),
  ],
  general_contractor: [
    pack('Bostadsrenovering', 'Samordnad renovering med avgränsade delentreprenader.', 'Bygg- och samordningsarbete', ['Byggmaterial', 'Ytskiktsmaterial'], ['Vilka rum och yrkesgrupper ingår?', 'Vilka leveranser och kostnader ligger hos kunden?']),
    pack('Badrum', 'Samordnat badrumsprojekt med tydliga ansvarsgränser.', 'Bygg- och samordningsarbete', ['Badrumsinredning', 'Ytskiktsmaterial'], ['Vilka produkter och handlingar finns?', 'Hur avgränsas bygg, tätskikt, el och VVS?']),
    pack('Kök', 'Samordnat köksprojekt från underarbete till montering.', 'Bygg- och samordningsarbete', ['Köksinredning', 'Bänkskiva', 'Byggmaterial'], ['Vad levererar kunden och vilka installationer berörs?', 'Vilken tidplan och omfattning gäller?']),
    pack('Tillbyggnad', 'Samordnad tillbyggnad enligt godkänt projektunderlag.', 'Bygg- och samordningsarbete', ['Byggmaterial', 'Isolering', 'Fönster och dörrar'], ['Vilka handlingar, delentreprenader och gränser gäller?', 'Hur fördelas leveranser och etapper?']),
    pack('Nybyggnation', 'Samordnat nybyggnadsprojekt med definierad leverans.', 'Bygg- och samordningsarbete', ['Byggmaterial', 'Grundmaterial', 'Installationsmaterial'], ['Vilket underlag och vilken entreprenadomfattning?', 'Vad ingår i projektering, grund och installationer?']),
  ],
  other: [],
}
export function getTradeStartPackage(trade: string | undefined, name: string | undefined) {
  if (!name) return undefined
  const primary = trade ? TRADE_START_PACKAGES[trade]?.find(p => p.name === name) : undefined
  if (primary) return primary
  const matches = Object.values(TRADE_START_PACKAGES).flat().filter(p => p.name === name)
  return matches.length === 1 ? matches[0] : undefined
}
