export const CATEGORIES = [
  { slug: 'seating', name: 'Seating' },
  { slug: 'tables-desks', name: 'Tables & Desks' },
  { slug: 'beds-bedroom', name: 'Beds & Bedroom' },
  { slug: 'storage-credenzas', name: 'Storage & Credenzas' },
  { slug: 'bars-counters', name: 'Bars & Counters' },
  { slug: 'outdoor-garden', name: 'Outdoor & Garden' },
  { slug: 'lighting', name: 'Lighting' },
  { slug: 'artwork-wall', name: 'Artwork & Wall Dressing' },
  { slug: 'mirrors-decorative-objects', name: 'Mirrors & Decorative Objects' },
  { slug: 'rugs-floor', name: 'Rugs & Floor Coverings' },
  { slug: 'linens-textiles', name: 'Linens & Textiles' },
  { slug: 'sculptures', name: 'Sculptures' },
  { slug: 'graphics-signage', name: 'Graphics & Signage' },
  { slug: 'electronics-tech', name: 'Electronics & Tech' },
  { slug: 'weapons-military', name: 'Weapons & Military' },
  { slug: 'vehicles-transport', name: 'Vehicles & Transport' },
  { slug: 'floral-plants', name: 'Floral & Plants' },
  { slug: 'medical-anatomical', name: 'Medical & Anatomical' },
  { slug: 'specialized-environments', name: 'Specialized Environments' },
  { slug: 'event-essentials', name: 'Event Essentials' },
  { slug: 'industrial-hardware', name: 'Industrial & Hardware' },
  { slug: 'accessories-hand-props', name: 'Accessories & Hand Props' },
  { slug: 'rigged-effects', name: 'Rigged Effects' },
  { slug: 'office', name: 'Office' },
  { slug: 'bed-bath', name: 'Bed & Bath' },
  { slug: 'other', name: 'Other' },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]['slug'];

// Order matters: more specific rules first.
const RULES: Array<[RegExp, CategorySlug]> = [
  // Highly specific specialties first
  [/\b(taxidermy|skeleton|cadaver|anatomical|medical|surgical|hospital|dental|ekg|x-?ray|stethoscope|wheelchair|gurney|iv\s?stand)\b/i, 'medical-anatomical'],
  [/\b(gun|guns|rifle|pistol|firearm|holster|holsters|weapon|weapons|military|tactical|army|navy|marines|samurai|sword|swords|knife|knives|grenade|ammo|ammunition|bayonet|machete)\b/i, 'weapons-military'],
  [/\b(explosive|explosives|detonat|squib|pyro|practical\s?effect|rigged|breakaway)\b/i, 'rigged-effects'],
  [/\b(neon|signage|sign\b|signs\b|billboard|marquee|newspaper|magazine|menu|menus|poster|posters|graphic|graphics|printed\s?matter)\b/i, 'graphics-signage'],
  [/\b(phone|phones|telephone|computer|laptop|monitor|television|tv\b|radio|radios|drone|drones|console|consoles?\s?(?:gaming|video)|dj\b|command\s?center|electronics?|audio|speaker|amplifier|turntable|typewriter|fax|projector)\b/i, 'electronics-tech'],
  [/\b(car|cars|bike|bicycle|motorcycle|scooter|skateboard|wagon|carriage|cart|carts|vehicle|vehicles|transport|wheelchair|stroller)\b/i, 'vehicles-transport'],
  [/\b(floral|flower|flowers|plant|plants|tree|trees|shrub|topiary|bouquet|landscaping|foliage|garden\s?plant|silk\s?flower)\b/i, 'floral-plants'],
  [/\b(barbershop|laundromat|casino|courtroom|prison|jail|cell|religious|church|temple|altar|pulpit|salon|barber|diner\s?set|police\s?station|bar\s?set)\b/i, 'specialized-environments'],
  [/\b(staging|dance\s?floor|pipe\s?and\s?drape|pipe\s?&\s?drape|carnival\s?ride|booth\s?(?:photo)?|step\s?and\s?repeat|event|themed|theme|party|festival|holiday|christmas|halloween|easter|fiesta|carnival|wedding)\b/i, 'event-essentials'],
  [/\b(plumbing|toilet|faucet|sink\b|column|columns|pedestal|pedestals|structural|hardware|fixture|fixtures|industrial)\b/i, 'industrial-hardware'],

  // Furniture (specific before general)
  [/\b(bed\b|beds\b|mattress|headboard|bunk|crib|nightstand|night\s?stand|bedroom)\b/i, 'beds-bedroom'],
  [/\b(linen|linens|towel|towels|pillow|pillows|sheet|sheets|duvet|comforter|blanket|throw|throws|fabric|textile|drape|drapery|curtain|curtains)\b/i, 'linens-textiles'],
  [/\b(rug|rugs|carpet|carpets|floor\s?covering)\b/i, 'rugs-floor'],
  [/\b(bar\b|bars\b|counter|counters|barstool|bar\s?stool)\b/i, 'bars-counters'],
  [/\b(credenza|sideboard|cabinet|cabinets|chest|chests|dresser|dressers|armoire|wardrobe|bookcase|bookshelf|shelving|storage)\b/i, 'storage-credenzas'],
  [/\b(sofa|sofas|couch|couches|chair|chairs|seating|bergere|stool|stools|bench|benches|ottoman|ottomans|loveseat|loveseats|settee|throne|thrones|recliner|chaise|daybed)\b/i, 'seating'],
  [/\b(table|tables|desk|desks|console|consoles)\b/i, 'tables-desks'],
  [/\b(outdoor|patio|garden|exterior|umbrella|outdoor\s?furniture)\b/i, 'outdoor-garden'],

  // Lighting / art / mirrors / decor
  [/\b(light|lights|lighting|lamp|lamps|chandelier|chandeliers|sconce|sconces|pendant|lantern|lanterns|floor\s?lamp|table\s?lamp)\b/i, 'lighting'],
  [/\b(painting|paintings|print|prints|photograph|photographs|drawing|drawings|tapestry|wall\s?art|wall\s?dressing|framed\s?art)\b/i, 'artwork-wall'],
  [/\b(sculpture|sculptures|bust|busts|statue|statues|figurine|figurines)\b/i, 'sculptures'],
  [/\b(mirror|mirrors|vase|vases|candelabra|clock|clocks|globe|globes|frame|frames|decor|decoration|object|objects|accessor|figure|figurine)\b/i, 'mirrors-decorative-objects'],

  // Office / bath
  [/\b(office|file|filing|desk\s?lamp|cubicle)\b/i, 'office'],
  [/\b(bath|bathroom|toilet|soap|toothbrush|shampoo|toiletry|toiletries)\b/i, 'bed-bath'],

  // Hand props fallback
  [/\b(book|books|wallet|wallets|lighter|lighters|ashtray|bottle|bottles|prop\b|hand\s?prop|misc|miscellaneous)\b/i, 'accessories-hand-props'],
];

export function mapToUnifiedCategory(path: string[]): CategorySlug {
  const haystack = path.join(' / ').toLowerCase();
  for (const [re, slug] of RULES) {
    if (re.test(haystack)) return slug;
  }
  return 'other';
}

export function categoryName(slug: string): string {
  return CATEGORIES.find((c) => c.slug === slug)?.name ?? slug;
}
