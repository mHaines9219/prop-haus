-- PLACEHOLDER: replace with real vendor data before launch (FUT-1).
-- Seeds the new vendor categories: hair-makeup, styling, lighting-rigging,
-- catering. Same contractors table, category field distinguishes them.
-- All details (names, photos, rates) are invented.

insert into public.contractors (name, photo, skills, city, rate_low, rate_high, bio, category) values

-- HAIR & MAKEUP ------------------------------------------------------------

(
  'Sofia Reyes',
  null,
  ARRAY['makeup', 'sfx'],
  'los_angeles',
  85000,
  110000,
  'Key makeup artist for commercials and music videos. Clean beauty through full SFX prosthetics. Kit stocked for all skin tones.',
  'hair-makeup'
),
(
  'Andre Boateng',
  null,
  ARRAY['hair', 'grooming'],
  'los_angeles',
  70000,
  90000,
  'Session hair stylist and groomer. Editorial, e-comm, and talent grooming for interviews and press days. Fast between setups.',
  'hair-makeup'
),
(
  'Mei Tanaka',
  null,
  ARRAY['makeup', 'hair', 'hmu-team'],
  'los_angeles',
  95000,
  130000,
  'HMU department head. Brings a scalable team for multi-talent shoot days — one point of contact from test to wrap.',
  'hair-makeup'
),

-- STYLING ------------------------------------------------------------------

(
  'Isla Bergstrom',
  null,
  ARRAY['wardrobe', 'tailoring'],
  'los_angeles',
  80000,
  105000,
  'Wardrobe stylist with deep showroom relationships. Pulls, fittings, and on-set tailoring for commercial and celebrity work.',
  'styling'
),
(
  'Nico Alvarez',
  null,
  ARRAY['set-styling', 'wardrobe'],
  'los_angeles',
  65000,
  85000,
  'Set and prop stylist for tabletop and lifestyle. Builds looks that hold up in macro and keeps continuity tight across days.',
  'styling'
),
(
  'Harriet Cole',
  null,
  ARRAY['food-styling'],
  'los_angeles',
  90000,
  115000,
  'Food stylist for broadcast and packaging. Hero plates, pours, and steam on cue. Works with home economists for volume days.',
  'styling'
),

-- LIGHTING & RIGGING -------------------------------------------------------

(
  'Ray Okafor',
  null,
  ARRAY['gaffer', 'lighting-tech'],
  'los_angeles',
  85000,
  110000,
  'Gaffer with owner-operated 3-ton G&E package. Commercials, features, and stage work. Pre-rig planning included in the day.',
  'lighting-rigging'
),
(
  'Sam Kowalski',
  null,
  ARRAY['grip', 'rigging'],
  'los_angeles',
  60000,
  75000,
  'Key grip and certified rigger. Condor and truss experience, comfortable leading load-heavy stage builds and location rigs.',
  'lighting-rigging'
),
(
  'Val Herrera',
  null,
  ARRAY['lighting-tech', 'board-op'],
  'los_angeles',
  55000,
  70000,
  'Lighting tech and board op. LED volume and console-driven setups, tidy cable runs, fast wraps.',
  'lighting-rigging'
),

-- CATERING (partner vendors, not individuals) ------------------------------

(
  'Golden Hour Craft Services',
  null,
  ARRAY['craft-services', 'coffee-cart', 'dietary'],
  'los_angeles',
  null,
  null,
  'Craft services trailer and barista cart for crews of 15 to 150. Menus flex for dietary needs; restock runs handled mid-day.',
  'catering'
),
(
  'Backlot Table',
  null,
  ARRAY['full-catering', 'dietary'],
  'los_angeles',
  null,
  null,
  'Full hot-meal catering built around call sheets, not lunch rushes. Company-move friendly; per-head quotes within the hour.',
  'catering'
),
(
  'First Team Coffee Co.',
  null,
  ARRAY['coffee-cart'],
  'los_angeles',
  null,
  null,
  'Espresso cart with production power requirements figured out. Half-day and full-day bookings across the LA basin.',
  'catering'
);
