// Constrained vocabulary for AI-search filters.
// Enrichment must pick from these lists (or omit) — prevents drift.

export const STYLES = [
  'mid-century-modern', 'art-deco', 'art-nouveau', 'victorian', 'edwardian', 'georgian',
  'baroque', 'rococo', 'neoclassical', 'gothic', 'industrial', 'bauhaus', 'modernist',
  'postmodern', 'memphis', 'hollywood-regency', 'french-provincial', 'italian-modern',
  'scandinavian', 'shaker', 'arts-and-crafts', 'mission', 'tudor', 'colonial',
  'farmhouse', 'rustic', 'bohemian', 'minimalist', 'maximalist', 'brutalist',
  'space-age', 'atomic-age', 'retro-futurist', 'steampunk', 'cyberpunk',
  'asian', 'chinoiserie', 'japandi', 'moroccan', 'mediterranean', 'spanish-colonial',
  'southwestern', 'tropical', 'tiki', 'nautical', 'safari',
  'contemporary', 'transitional', 'eclectic', 'glam', 'biedermeier',
] as const;

export const ERAS = [
  '1800s', '1810s', '1820s', '1830s', '1840s', '1850s', '1860s', '1870s', '1880s', '1890s',
  '1900s', '1910s', '1920s', '1930s', '1940s', '1950s', '1960s', '1970s', '1980s', '1990s',
  '2000s', '2010s', '2020s',
  'pre-1900', 'period-historical', 'futuristic', 'timeless',
] as const;

export const MATERIALS = [
  'wood', 'oak', 'walnut', 'mahogany', 'teak', 'rosewood', 'pine', 'maple', 'birch',
  'metal', 'brass', 'bronze', 'copper', 'iron', 'steel', 'chrome', 'aluminum', 'gold-leaf',
  'silver', 'pewter', 'nickel',
  'glass', 'crystal', 'mirror', 'stained-glass', 'frosted-glass',
  'leather', 'suede', 'velvet', 'silk', 'linen', 'cotton', 'wool', 'mohair', 'chenille',
  'plastic', 'acrylic', 'lucite', 'fiberglass', 'resin', 'rubber',
  'ceramic', 'porcelain', 'stoneware', 'marble', 'granite', 'stone', 'concrete',
  'paper', 'cardboard', 'wicker', 'rattan', 'bamboo', 'cane',
  'neon', 'fabric', 'vinyl', 'lacquer',
] as const;

export const COLORS = [
  'black', 'white', 'gray', 'silver', 'beige', 'cream', 'ivory', 'tan', 'brown', 'walnut',
  'red', 'crimson', 'burgundy', 'pink', 'rose', 'coral', 'salmon',
  'orange', 'amber', 'rust', 'terracotta', 'mustard', 'gold', 'brass',
  'yellow', 'lemon', 'olive',
  'green', 'forest', 'sage', 'mint', 'emerald', 'lime',
  'blue', 'navy', 'royal', 'sky', 'teal', 'turquoise', 'powder-blue',
  'purple', 'lavender', 'violet', 'plum',
  'multicolor', 'patterned', 'natural-wood', 'distressed',
] as const;

export const VIBES = [
  'cinematic', 'editorial', 'theatrical', 'elegant', 'opulent', 'luxurious', 'glamorous',
  'rustic', 'cozy', 'industrial', 'minimal', 'maximalist', 'eclectic', 'whimsical',
  'futuristic', 'retro', 'vintage', 'antique', 'aged', 'distressed', 'pristine',
  'moody', 'gothic', 'dark', 'bright', 'airy',
  'playful', 'kitschy', 'campy', 'serious', 'formal', 'casual', 'masculine', 'feminine',
  'utilitarian', 'high-tech', 'low-tech', 'handmade', 'mass-produced',
] as const;

export const SETTING_TYPES = [
  'living-room', 'dining-room', 'kitchen', 'bedroom', 'bathroom', 'office', 'study',
  'library', 'hallway', 'entryway', 'closet', 'attic', 'basement',
  'restaurant', 'bar', 'cafe', 'diner', 'hotel-lobby', 'hotel-room', 'casino',
  'classroom', 'lecture-hall', 'gymnasium',
  'hospital', 'doctor-office', 'dental-office', 'lab', 'morgue',
  'police-station', 'prison', 'courtroom', 'interrogation-room',
  'church', 'temple', 'mosque',
  'storefront', 'salon', 'barbershop', 'laundromat', 'newsroom', 'radio-studio',
  'warehouse', 'factory', 'workshop', 'construction-site',
  'street', 'alley', 'rooftop', 'patio', 'garden', 'park', 'beach', 'forest',
  'spaceship', 'sci-fi-set', 'fantasy-set', 'period-set',
] as const;

export const GENRE_FIT = [
  'period-drama', 'sci-fi', 'fantasy', 'horror', 'thriller', 'crime', 'film-noir',
  'comedy', 'romance', 'western', 'war', 'spy', 'action', 'superhero',
  'contemporary-drama', 'documentary',
  'commercial', 'editorial-fashion', 'music-video', 'live-event', 'theatrical-stage',
] as const;

export const ENUM_LIST = {
  style: STYLES,
  era: ERAS,
  materials: MATERIALS,
  colors: COLORS,
  vibes: VIBES,
  settingType: SETTING_TYPES,
  genreFit: GENRE_FIT,
} as const;
