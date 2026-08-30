-- PLACEHOLDER: replace with real contractor data before launch.
-- Seed a handful of realistic-shaped contractors for the /crew browse page.
-- All details (names, photos, rates) are invented; swap in real data via the
-- platform admin or a separate CSV import when real contractors are onboarded.

insert into public.contractors (name, photo, skills, city, rate_low, rate_high, bio) values

-- PLACEHOLDER contractor 1
(
  'Marcus Rivera',
  null,
  ARRAY['set-hands', 'set-dressing', 'load-in', 'load-out'],
  'los_angeles',
  65000,   -- $650/day
  80000,   -- $800/day
  'Ten years on set across commercials, music videos, and features. Handles large-scale loads and delicate hero props with equal care. Based in the Valley.'
),

-- PLACEHOLDER contractor 2
(
  'Dana Kim',
  null,
  ARRAY['delivery', 'load-in', 'load-out'],
  'los_angeles',
  45000,
  55000,
  'Cargo van owner-operator with a clean driving record and production insurance. Specializes in time-sensitive same-day pulls across the LA basin.'
),

-- PLACEHOLDER contractor 3
(
  'Theo Macias',
  null,
  ARRAY['set-hands', 'general'],
  'los_angeles',
  55000,
  70000,
  'Versatile production assistant available for full-day and multi-day bookings. Background in art department prep and swing gang work.'
),

-- PLACEHOLDER contractor 4
(
  'Priya Nair',
  null,
  ARRAY['set-dressing', 'set-hands', 'load-in'],
  'los_angeles',
  70000,
  85000,
  'Former prop master's lead with a sharp eye for continuity and placement. Comfortable running a small crew on commercial and editorial sets.'
),

-- PLACEHOLDER contractor 5
(
  'Jordan Blake',
  null,
  ARRAY['delivery', 'set-hands'],
  'los_angeles',
  40000,
  50000,
  'Reliable day-player covering deliveries, pickups, and general on-set assistance. Own vehicle, available weekends and short notice.'
),

-- PLACEHOLDER contractor 6
(
  'Camille Dubois',
  null,
  ARRAY['set-dressing', 'general', 'load-out'],
  'los_angeles',
  75000,
  90000,
  'Experienced swing gang lead. Meticulous about wrap and return — props leave the way they arrived. Works closely with production designers on tight timelines.'
);
