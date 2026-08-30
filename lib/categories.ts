// Order matters here too: the home page browse rail renders CATEGORIES in
// array order. Ranked by rental demand (event-rental industry segment data +
// set-decoration core scope: furniture first, then lighting/art/decor, then
// specialty buckets that are searched for rather than browsed).
export const CATEGORIES = [
  { slug: 'seating', name: 'Seating' },
  { slug: 'tables-desks', name: 'Tables & Desks' },
  { slug: 'lighting', name: 'Lighting' },
  { slug: 'artwork-wall', name: 'Artwork & Wall Dressing' },
  { slug: 'rugs-floor', name: 'Rugs & Floor Coverings' },
  { slug: 'mirrors-decorative-objects', name: 'Mirrors & Decorative Objects' },
  { slug: 'floral-plants', name: 'Floral & Plants' },
  { slug: 'linens-textiles', name: 'Linens & Textiles' },
  { slug: 'storage-credenzas', name: 'Storage & Credenzas' },
  { slug: 'electronics-tech', name: 'Electronics & Tech' },
  { slug: 'kitchen-tableware', name: 'Kitchen & Tableware' },
  { slug: 'beds-bedroom', name: 'Beds & Bedroom' },
  { slug: 'bars-counters', name: 'Bars & Counters' },
  { slug: 'sculptures', name: 'Sculptures' },
  { slug: 'graphics-signage', name: 'Graphics & Signage' },
  { slug: 'event-essentials', name: 'Event Essentials' },
  { slug: 'outdoor-garden', name: 'Outdoor & Garden' },
  { slug: 'sports-recreation', name: 'Sports & Recreation' },
  { slug: 'accessories-hand-props', name: 'Accessories & Hand Props' },
  { slug: 'office', name: 'Office' },
  { slug: 'bed-bath', name: 'Bed & Bath' },
  { slug: 'industrial-hardware', name: 'Industrial & Hardware' },
  { slug: 'specialized-environments', name: 'Specialized Environments' },
  { slug: 'medical-anatomical', name: 'Medical & Anatomical' },
  { slug: 'weapons-military', name: 'Weapons & Military' },
  { slug: 'vehicles-transport', name: 'Vehicles & Transport' },
  { slug: 'rigged-effects', name: 'Rigged Effects' },
  { slug: 'other', name: 'Other' },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]['slug'];

// Order matters: more specific rules first.
//
// Every alternation is wrapped in \b(...)\b, so each word must match WHOLE —
// write plurals explicitly (bicycles?) or the plural form silently falls
// through ("Bicycles" never matched \bbicycle\b, which is how 25k items ended
// up in `other`). Same for stems: `accessor` and `decor` matched nothing.
// Exported for scripts/recategorize.ts, which mirrors these rules server-side.
export const RULES: Array<[RegExp, CategorySlug]> = [
  // Highly specific specialties first
  [/\b(taxidermy|skeletons?|cadavers?|anatomical|medical|surgical|hospital|dental|ekg|x-?ray|stethoscopes?|gurneys?|iv\s?stands?|lab\s?equipment|laboratory|scientific|microscopes?|beakers?|specimens?)\b/i, 'medical-anatomical'],
  [/\b(guns?|rifles?|pistols?|firearms?|holsters?|weapons?|military|tactical|army|navy|marines|samurai|swords?|kni(?:fe|ves)|grenades?|ammo|ammunition|bayonets?|machetes?|arsenal|cannons?|artillery)\b/i, 'weapons-military'],
  [/\b(explosives?|detonat|squibs?|pyro|practical\s?effects?|rigged|breakaway|stunts?|dumm(?:y|ies))\b/i, 'rigged-effects'],
  [/\b(neon|signage|signs?\b|billboards?|marquees?|newspapers?|magazines?|menus?|posters?|graphics?|printed\s?matter|backdrops?|banners?)\b/i, 'graphics-signage'],
  // Sculpture names ("Sculpture, Bust Of Brutus") beat "Art / Artwork" paths;
  // unambiguous art words beat depictions ("Painting, Fishing Boats" is art,
  // not a vehicle). Ambiguous ones (print, photograph, canvas) stay late so
  // "Leopard Print Pillow" still reads as linens.
  [/\b(sculptures?|busts?|statues?|figurines?|mannequins?|dress\s?forms?|wig\s?heads?|obelisks?|carvings?)\b/i, 'sculptures'],
  [/\b(paintings?|artworks?|wall\s?art|wall\s?dressing|framed\s?art|fine\s?art|photographic\s?art|watercolors?|lithographs?|etchings?|giclees?)\b/i, 'artwork-wall'],
  [/\b(phones?|telephones?|computers?|laptops?|monitors?|televisions?|tvs?\b|radios?|drones?|(?:gaming|video|game)\s?consoles?|dj\b|command\s?centers?|electronics?|audio|speakers?|amplifiers?|turntables?|typewriters?|fax|projectors?|cameras?|calculators?|cassettes?|stereos?|boombox(?:es)?|jukebox(?:es)?|record\s?players?|cd\s?players?|camcorders?|vcrs?|arcade|pinball)\b/i, 'electronics-tech'],
  [/\b(cars?|bikes?|bicycles?|tricycles?|motorcycles?|scooters?|skateboards?|wagons?|carriages?|carts?|vehicles?|transport|wheelchairs?|strollers?|aviation|aircraft|airplanes?|helicopters?|boats?|canoes?|kayaks?)\b/i, 'vehicles-transport'],
  [/\b(floral|flowers?|plants?|trees?|shrubs?|topiar(?:y|ies)|bouquets?|landscaping|foliage|silk\s?flowers?|planters?|jardinieres?|wreaths?|garlands?)\b/i, 'floral-plants'],
  // Strong lighting words beat kitchen/decor words in the same name — a
  // "Sconce, Crystal Dish And Drops" is lighting, not tableware. Weak words
  // (light, pendant) stay late: "Light Green Teapot" is not a light.
  [/\b(lighting|lamps?|sconces?|chandeliers?|lanterns?|lampposts?|lamp\s?posts?|streetlights?|torchieres?)\b/i, 'lighting'],
  [/\b(kitchenware|kitchen\s?(?:accessor(?:y|ies)|appliances?|utensils?)|cookware|bakeware|tableware|dinnerware|chinaware|flatware|silverware|cutlery|utensils?|plates?|platters?|bowls?|cups?|mugs?|saucers?|pitchers?|carafes?|decanters?|tea\s?pots?|teapots?|kettles?|pots?|pans?|saucepans?|skillets?|tureens?|compotes?|creamers?|shakers?|canisters?|jars?|glassware|stemware|tumblers?|highball|goblets?|trays?|cutting\s?boards?|spice\s?racks?|appliances?|stoves?|ovens?|refrigerators?|fridges?|freezers?|microwaves?|dishwashers?|toasters?|blenders?|espresso|coffee\s?(?:machines?|makers?)|fake\s?food|faux\s?food|foods?\b|cakes?|pastr(?:y|ies)|candy|pizza|produce|groceries|wine\b|liquor|cheese\b)\b/i, 'kitchen-tableware'],
  [/\b(jewelry|jewellery|watch(?:es)?|necklaces?|bracelets?|earrings?|brooch(?:es)?|luggage|suitcases?|briefcases?|duffels?|duffles?|backpacks?|purses?|handbags?|satchels?|toys?|plush|dolls?|stuffed\s?animals?|puzzles?|board\s?games?|boxed\s?games?|masks?|musical\s?instruments?|instruments?|guitars?|drums?\b|trumpets?|violins?|saxophones?|banjos?|ukuleles?|cigars?|cigarettes?|smoking|tobacco|flasks?|binoculars?|telescopes?)\b/i, 'accessories-hand-props'],
  [/\b(barbershops?|laundromats?|casinos?|courtrooms?|prisons?|jails?|cells?|religious|church(?:es)?|temples?|altars?|pulpits?|salons?|barbers?|diners?|police\s?stations?|bar\s?sets?|stores?\b|shops?\b|convenience|supermarkets?|grocer(?:y|ies)|bakery|delis?|restaurants?|cafes?|cafeterias?|tiki|nautical|western|lodges?|campsites?|librar(?:y|ies)|theaters?|theatres?|concessions?|garages?|mechanics?|playgrounds?|newsstands?|butchers?|saloons?|speakeas(?:y|ies))\b/i, 'specialized-environments'],
  [/\b(sports?|fitness|gym|exercise|treadmills?|dumbbells?|barbells?|golf|tennis|baseball|basketball|footballs?|soccer|hockey|bowling|billiards?|pool\s?tables?|ping\s?pong|table\s?tennis|foosball|darts|skis?\b|snowboards?|surfboards?|surfing|fishing|croquet|badminton|archery|boxing|trampolines?|saddles?|equestrian|camping|sleeping\s?bags?|coolers?)\b/i, 'sports-recreation'],
  [/\b(staging|dance\s?floors?|pipe\s?and\s?drape|pipe\s?&\s?drape|carnival\s?rides?|booths?|step\s?and\s?repeat|events?|themed|themes?|part(?:y|ies)|festivals?|holiday|christmas|halloween|easter|fiesta|carnival|weddings?)\b/i, 'event-essentials'],
  [/\b(plumbing|toilets?|faucets?|sinks?\b|columns?|pedestals?|structural|hardware|fixtures?|industrial|engines?|welding|lockers?|traffic\s?cones?|scaffold(?:ing)?|exhaust\s?fans?|motor\s?oil|automotive|auto\s?diagnostic|tools?\b|toolbox(?:es)?|ladders?|trash\s?cans?|garbage|recycle|recycling|dumpsters?|hydrants?|parking\s?meters?|streets?\b|alley|road\s?cases?|barricades?|pallets?|workbench(?:es)?)\b/i, 'industrial-hardware'],

  // Furniture (specific before general)
  [/\b(beds?\b|mattress(?:es)?|headboards?|bunks?|cribs?|nightstands?|night\s?stands?|bedroom)\b/i, 'beds-bedroom'],
  // Rugs before linens: "Moroccan Rug" under a "Textiles" path is a rug.
  [/\b(rugs?|carpets?|floor\s?coverings?)\b/i, 'rugs-floor'],
  [/\b(linens?|towels?|pillows?|sheets?|duvets?|comforters?|blankets?|throws?|fabrics?|textiles?|draper(?:y|ies)|drapes?|curtains?)\b/i, 'linens-textiles'],
  [/\b(bars?\b|counters?|barstools?|bar\s?stools?)\b/i, 'bars-counters'],
  [/\b(credenzas?|sideboards?|cabinets?|chests?|dressers?|armoires?|wardrobes?|bookcases?|bookshel(?:f|ves)|shelving|shel(?:f|ves)\b|storage|trunks?|crates?|baskets?|hampers?|coat\s?racks?|hat\s?racks?|valet\s?stands?|footlockers?)\b/i, 'storage-credenzas'],
  [/\b(sofas?|couch(?:es)?|chairs?|armchairs?|arm\s?chairs?|wingbacks?|seating|bergeres?|stools?|bench(?:es)?|ottomans?|loveseats?|settees?|thrones?|recliners?|chaises?|daybeds?)\b/i, 'seating'],
  [/\b(tables?|desks?|consoles?)\b/i, 'tables-desks'],
  [/\b(outdoors?|patio|gardens?|exterior|umbrellas?|picnic|lawn\b)\b/i, 'outdoor-garden'],

  // Lighting / art / mirrors / decor — weak/ambiguous words only; the strong
  // forms of these categories matched earlier.
  [/\b(lights?|pendants?)\b/i, 'lighting'],
  [/\b(prints?|photographs?|drawings?|tapestr(?:y|ies)|canvas(?:es)?|plaques?|shadow\s?box(?:es)?|shadowbox(?:es)?)\b/i, 'artwork-wall'],
  [/\b(mirrors?|vases?|candelabras?|clocks?|globes?|frames?|decor\b|decorations?|decorative|objects?|accessor(?:y|ies)|figures?|candles?|candlesticks?|candle\s?holders?|urns?|bookends?|troph(?:y|ies)|paperweights?|birdcages?|bird\s?cages?|floor\s?screens?|room\s?dividers?|folding\s?screens?|snow\s?globes?|curios?|trinkets?|cachepots?|incense)\b/i, 'mirrors-decorative-objects'],

  // Office / bath
  [/\b(office|files?\b|filing|desk\s?lamps?|cubicles?)\b/i, 'office'],
  [/\b(bath|bathroom|soap|toothbrush(?:es)?|shampoo|toiletr(?:y|ies))\b/i, 'bed-bath'],

  // Hand props fallback
  [/\b(books?|wallets?|lighters?|ashtrays?|bottles?|props?\b|hand\s?props?|misc|miscellaneous|models?\b|animals?\b|collectibles?|memorabilia|novelt(?:y|ies)|smalls)\b/i, 'accessories-hand-props'],
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
