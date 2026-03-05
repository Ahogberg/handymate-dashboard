/**
 * Branschspecifika hero-bilder för hemsidebyggaren.
 * URLs från Unsplash med optimerade parametrar.
 */

export interface IndustryImage {
  url: string
  label: string
}

export const INDUSTRY_HERO_IMAGES: Record<string, IndustryImage[]> = {
  electrician: [
    { url: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=1920&q=80', label: 'Elinstallation' },
    { url: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=1920&q=80', label: 'Elarbete i hemmet' },
    { url: 'https://images.unsplash.com/photo-1555664424-778a1e5e1b48?w=1920&q=80', label: 'Elektriker på jobb' },
  ],
  carpenter: [
    { url: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=1920&q=80', label: 'Snickeriarbete' },
    { url: 'https://images.unsplash.com/photo-1588854337115-1c67d9247e4d?w=1920&q=80', label: 'Träbearbetning' },
    { url: 'https://images.unsplash.com/photo-1600585152220-90363fe7e115?w=1920&q=80', label: 'Kök & inredning' },
  ],
  painter: [
    { url: 'https://images.unsplash.com/photo-1562259929-b4e1fd3aef09?w=1920&q=80', label: 'Målning inomhus' },
    { url: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=1920&q=80', label: 'Fasadmålning' },
    { url: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=1920&q=80', label: 'Renovering' },
  ],
  plumber: [
    { url: 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=1920&q=80', label: 'Rörarbete' },
    { url: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=1920&q=80', label: 'Badrumsrenovering' },
    { url: 'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=1920&q=80', label: 'VVS-installation' },
  ],
  hvac: [
    { url: 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=1920&q=80', label: 'Värmesystem' },
    { url: 'https://images.unsplash.com/photo-1631545806609-30b3e4f2f2f3?w=1920&q=80', label: 'Ventilation' },
    { url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=1920&q=80', label: 'Modernt hem' },
  ],
  construction: [
    { url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1920&q=80', label: 'Byggarbetsplats' },
    { url: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1920&q=80', label: 'Husbygge' },
    { url: 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=1920&q=80', label: 'Konstruktion' },
  ],
  roofing: [
    { url: 'https://images.unsplash.com/photo-1632759145351-1d592919f522?w=1920&q=80', label: 'Takläggning' },
    { url: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=1920&q=80', label: 'Takarbete' },
    { url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1920&q=80', label: 'Fasad & tak' },
  ],
  flooring: [
    { url: 'https://images.unsplash.com/photo-1581858726788-75bc0f6a952d?w=1920&q=80', label: 'Golvläggning' },
    { url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1920&q=80', label: 'Parkettgolv' },
    { url: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1920&q=80', label: 'Modernt golv' },
  ],
  gardening: [
    { url: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=1920&q=80', label: 'Trädgårdsarbete' },
    { url: 'https://images.unsplash.com/photo-1558904541-efa843a96f01?w=1920&q=80', label: 'Trädgårdsdesign' },
    { url: 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=1920&q=80', label: 'Grön trädgård' },
  ],
  moving: [
    { url: 'https://images.unsplash.com/photo-1600518464441-9154a4dea21b?w=1920&q=80', label: 'Flytt' },
    { url: 'https://images.unsplash.com/photo-1600585152220-90363fe7e115?w=1920&q=80', label: 'Nytt hem' },
    { url: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=1920&q=80', label: 'Flytthjälp' },
  ],
  cleaning: [
    { url: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1920&q=80', label: 'Professionell städning' },
    { url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1920&q=80', label: 'Rent hem' },
    { url: 'https://images.unsplash.com/photo-1527515545081-5db817172677?w=1920&q=80', label: 'Städservice' },
  ],
  locksmith: [
    { url: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=1920&q=80', label: 'Låssmed' },
    { url: 'https://images.unsplash.com/photo-1558882224-dda166ffe28a?w=1920&q=80', label: 'Säkerhet' },
    { url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1920&q=80', label: 'Hemmiljö' },
  ],
  other: [
    { url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1920&q=80', label: 'Hantverkare' },
    { url: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1920&q=80', label: 'Professionell service' },
    { url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1920&q=80', label: 'Hem & fastighet' },
  ],
}

export function getImagesForBranch(branch: string | null | undefined): IndustryImage[] {
  if (!branch) return INDUSTRY_HERO_IMAGES.other
  return INDUSTRY_HERO_IMAGES[branch.toLowerCase()] || INDUSTRY_HERO_IMAGES.other
}
