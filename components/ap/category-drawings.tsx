import type { ReactNode } from 'react';

/**
 * Ink line drawings for the classified column, one per home-page
 * meta-category, drawn the way the big ad's room is: 2px strokes, 1.25px
 * detail lines, round caps, a hatched floor line. Decorative; the category
 * name stays in the link text.
 */
const DRAWINGS: Record<string, ReactNode> = {
  'Wall Decor & Mirrors': (
    <>
      <Floor />
      <circle cx="72" cy="14" r="2" />
      <path d="M52 30 L72 14 L92 30" strokeWidth="1.25" />
      <rect x="28" y="30" width="88" height="64" />
      <rect x="36" y="38" width="72" height="48" strokeWidth="1.25" />
      <path d="M44 78 l18 -22 l12 14 l10 -10 l20 18" strokeWidth="1.5" />
      <circle cx="96" cy="50" r="5" strokeWidth="1.5" />
      <path d="M166 18 q6 -8 12 0" strokeWidth="1.5" />
      <ellipse cx="172" cy="62" rx="34" ry="44" />
      <ellipse cx="172" cy="62" rx="27" ry="37" strokeWidth="1.25" />
      <path d="M158 40 q-10 12 -8 30" strokeWidth="1.25" />
    </>
  ),
  'Lighting': (
    <>
      <Floor />
      <path d="M60 8 V40" />
      <path d="M36 74 h48 l-8 -34 h-32 z" />
      <path d="M42 62 h36" strokeWidth="1.25" />
      <path d="M53 74 q0 10 7 12 q7 -2 7 -12" />
      <path d="M46 92 l-5 5 M74 92 l5 5 M60 96 v6" strokeWidth="1.25" />
      <path d="M148 66 h60 l-8 -30 h-44 z" />
      <path d="M154 54 h48" strokeWidth="1.25" />
      <path d="M178 66 V80" />
      <path d="M170 122 v-10 q-10 -12 0 -22 q-6 -6 0 -10 M186 122 v-10 q10 -12 0 -22 q6 -6 0 -10" />
      <path d="M170 80 h16" />
      <path d="M158 122 h40" />
    </>
  ),
  'Signage': (
    <>
      <Floor />
      <path d="M112 122 V92 M128 122 V92 M100 122 h40" />
      <path d="M40 40 h130 l30 26 l-30 26 h-130 z" />
      <path d="M52 52 h112 l18 14 l-18 14 h-112 z" strokeWidth="1.25" />
      <g strokeWidth="1.5">
      <circle cx="60" cy="46" r="2.5" /><circle cx="80" cy="46" r="2.5" /><circle cx="100" cy="46" r="2.5" /><circle cx="120" cy="46" r="2.5" /><circle cx="140" cy="46" r="2.5" /><circle cx="160" cy="46" r="2.5" />
      <circle cx="60" cy="86" r="2.5" /><circle cx="80" cy="86" r="2.5" /><circle cx="100" cy="86" r="2.5" /><circle cx="120" cy="86" r="2.5" /><circle cx="140" cy="86" r="2.5" /><circle cx="160" cy="86" r="2.5" />
      <circle cx="46" cy="66" r="2.5" /><circle cx="178" cy="56" r="2.5" /><circle cx="178" cy="76" r="2.5" /><circle cx="190" cy="66" r="2.5" />
      </g>
      <path d="M66 62 h56 M66 72 h40" strokeWidth="3" />
    </>
  ),
  'Accessories & Props': (
    <>
      <Floor />
      <path d="M52 122 q-6 0 -4 -8 l12 -30 q2 -6 8 -6 h104 q6 0 8 6 l12 30 q2 8 -4 8 z" />
      <circle cx="120" cy="100" r="17" />
      <circle cx="120" cy="100" r="8" strokeWidth="1.25" />
      <g strokeWidth="1.5">
      <circle cx="127" cy="88" r="2.5" /><circle cx="133" cy="95" r="2.5" /><circle cx="133" cy="105" r="2.5" /><circle cx="127" cy="112" r="2.5" />
      <circle cx="118" cy="113" r="2.5" /><circle cx="110" cy="109" r="2.5" /><circle cx="107" cy="100" r="2.5" /><circle cx="110" cy="91" r="2.5" />
      </g>
      <path d="M132 110 l6 6" />
      <path d="M84 78 v-8 M156 78 v-8" />
      <path d="M74 60 q46 -22 92 0" />
      <ellipse cx="68" cy="64" rx="12" ry="8" />
      <ellipse cx="172" cy="64" rx="12" ry="8" />
      <path d="M190 98 q12 0 12 5 q0 5 -12 5 q12 0 12 5 q0 5 -12 5" strokeWidth="1.5" />
    </>
  ),
  'Kitchen & Tableware': (
    <>
      <Floor />
      <path d="M44 120 q-12 -16 -6 -36 h60 q6 20 -6 36 z" />
      <path d="M52 84 q16 -10 32 0" />
      <circle cx="68" cy="74" r="3" />
      <path d="M98 96 q14 -6 16 -22 q2 -4 4 0 q-2 20 -18 26" />
      <path d="M40 92 q-20 4 -12 26" />
      <ellipse cx="146" cy="116" rx="28" ry="5" />
      <ellipse cx="146" cy="108" rx="28" ry="5" />
      <ellipse cx="146" cy="100" rx="28" ry="5" />
      <ellipse cx="146" cy="100" rx="17" ry="2.5" strokeWidth="1.25" />
      <ellipse cx="204" cy="118" rx="22" ry="4" />
      <path d="M190 100 h28 l-3 16 h-22 z" />
      <path d="M218 104 q10 2 0 10" />
      <path d="M198 92 q3 -5 0 -10 M206 92 q3 -5 0 -10" strokeWidth="1.25" />
    </>
  ),
  'Furniture': (
    <>
      <Floor />
      <path d="M42 92 V70 q0 -10 10 -10 h80 q10 0 10 10 v22" />
      <path d="M42 92 q-12 0 -12 12 v18 h20 v-22 q0 -8 -8 -8 z" />
      <path d="M142 92 q12 0 12 12 v18 h-20 v-22 q0 -8 8 -8 z" />
      <path d="M50 92 h84 v22 h-84 z" />
      <path d="M92 92 v22 M70 66 v20 M114 66 v20" strokeWidth="1.25" />
      <rect x="170" y="80" width="60" height="34" />
      <path d="M200 80 v34" strokeWidth="1.25" />
      <path d="M182 97 h8 M210 97 h8" />
      <path d="M176 114 v8 M224 114 v8" />
      <path d="M184 76 h22 v4 h-22 z M186 72 h18 v4 h-18 z" strokeWidth="1.5" />
    </>
  ),
  'Textiles & Rugs': (
    <>
      <Floor />
      <path d="M32 22 h84" />
      <circle cx="30" cy="22" r="3" strokeWidth="1.5" /><circle cx="118" cy="22" r="3" strokeWidth="1.5" />
      <path d="M44 24 v44 q10 -8 20 0 q10 8 20 0 q10 -8 20 0 v-44" />
      <path d="M59 24 v42 M74 24 v42 M89 24 v42" strokeWidth="1.25" />
      <path d="M30 118 h140 l-18 -32 h-104 z" />
      <path d="M44 112 h112 l-12 -20 h-88 z" strokeWidth="1.25" />
      <path d="M100 92 l14 8 l-14 8 l-14 -8 z" />
      <path d="M100 96 l7 4 l-7 4 l-7 -4 z" strokeWidth="1.25" />
      <path d="M32 114 l-7 1 M37 106 l-7 1 M41 98 l-7 1 M46 90 l-7 1 M168 114 l7 1 M163 106 l7 1 M159 98 l7 1 M154 90 l7 1" strokeWidth="1.5" />
      <path d="M182 122 v-12 h40 q6 0 6 6 q0 6 -6 6 z" />
      <path d="M184 110 v-12 h36 q6 0 6 6 q0 6 -6 6 z" />
      <path d="M183 98 v-12 h38 q6 0 6 6 q0 6 -6 6 z" />
      <path d="M182 116 h6 M184 104 h6 M183 92 h6" strokeWidth="1.25" />
    </>
  ),
  'Bed & Bath': (
    <>
      <Floor />
      <path d="M30 122 V52 q0 -6 6 -6 q6 0 6 6 v70" />
      <path d="M42 88 h96 v16 h-96" />
      <path d="M46 88 v-10 q0 -4 4 -4 h28 q4 0 4 4 v10" strokeWidth="1.5" />
      <path d="M100 88 q6 8 0 16" strokeWidth="1.25" />
      <path d="M138 122 V80 q0 -4 4 -4 q4 0 4 4 v42" />
      <path d="M42 110 h96" strokeWidth="1.5" />
      <path d="M48 110 v12 M132 110 v12" />
      <path d="M160 84 h72 q6 0 4 8 l-6 18 q-2 4 -6 4 h-56 q-4 0 -6 -4 l-6 -18 q-2 -8 4 -8 z" />
      <path d="M166 90 h60" strokeWidth="1.25" />
      <path d="M174 114 q-6 4 -4 8 M218 114 q6 4 4 8" />
      <path d="M228 84 v-12 q0 -8 -8 -8 h-2" />
      <circle cx="216" cy="62" r="3" strokeWidth="1.5" />
      <path d="M186 76 q3 -5 0 -10 M200 76 q3 -5 0 -10" strokeWidth="1.25" />
    </>
  ),
  'Other': (
    <>
      <Floor />
      <rect x="36" y="66" width="64" height="56" />
      <path d="M44 66 v56 M92 66 v56" strokeWidth="1.25" />
      <path d="M54 106 v-22 m-5 6 l5 -6 l5 6 M64 106 v-22 m-5 6 l5 -6 l5 6" strokeWidth="1.5" />
      <path d="M74 82 h14 q0 12 -7 14 q-7 -2 -7 -14 z M81 96 v8 M76 104 h10" strokeWidth="1.5" />
      <circle cx="68" cy="52" r="12" />
      <path d="M60 42 l16 20 M68 40 q8 12 0 24" strokeWidth="1.25" />
      <rect x="130" y="82" width="84" height="40" />
      <path d="M130 82 v-10 q0 -8 8 -8 h68 q8 0 8 8 v10" />
      <path d="M150 64 v58 M194 64 v58" strokeWidth="1.25" />
      <rect x="166" y="78" width="12" height="10" strokeWidth="1.5" />
      <path d="M126 94 q-6 4 0 8 M218 94 q6 4 0 8" />
    </>
  ),
};

function Floor() {
  return (
    <>
      <path d="M12 122 H228" />
      <path d="M30 122 l-8 10 M60 122 l-8 10 M90 122 l-8 10 M120 122 l-8 10 M150 122 l-8 10 M180 122 l-8 10 M210 122 l-8 10" strokeWidth="1.25" />
    </>
  );
}

export function hasCategoryDrawing(name: string): boolean {
  return name in DRAWINGS;
}

export function CategoryDrawing({ name, className }: { name: string; className?: string }) {
  const drawing = DRAWINGS[name];
  if (!drawing) return null;
  return (
    <svg
      viewBox="0 0 240 140"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {drawing}
    </svg>
  );
}
