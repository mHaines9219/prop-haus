const STEPS = [
  {
    n: '01',
    label: 'Find it',
    copy: 'Describe it, upload a reference, or get specific. We search thousands of pieces across every vendor.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <circle cx="9" cy="9" r="5.5" />
        <path d="M13.5 13.5 L18 18" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    n: '02',
    label: 'Source it',
    copy: 'Add pieces to your pull list. Organize by room, scene, or shoot day, and keep every option in one place.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <rect x="3" y="3" width="14" height="14" />
        <path d="M10 7v6M7 10h6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    n: '03',
    label: 'Check out',
    copy: 'Request availability and holds from multiple vendors at the same time. One click when you\'re ready.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="M3 5h2l2.4 9h9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7.5 8h9l-1.5 6H9" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="10" cy="17" r="1.2" />
        <circle cx="15" cy="17" r="1.2" />
      </svg>
    ),
  },
  {
    n: '04',
    label: 'Get on set',
    copy: 'We write the vendor emails and fill the paperwork from your profile, so the truck arrives loaded and you show up ready.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <rect x="2" y="7" width="12" height="9" />
        <path d="M14 10h2l2 3v3h-4v-6z" strokeLinejoin="round" />
        <circle cx="5.5" cy="17" r="1.5" />
        <circle cx="14.5" cy="17" r="1.5" />
      </svg>
    ),
  },
];

/**
 * Four small ads in a row (DESIGN.md §9.2): each step is a cream box with
 * the step number in a coral tag, a red condensed headline, an ink line
 * drawing, and a listing paragraph.
 */
export function HowItWorks() {
  return (
    <section id="how">
      <div className="mx-auto w-full max-w-[1400px] px-3 py-10 sm:px-5 sm:py-14">
        <p className="mb-3 flex items-center gap-2.5 font-heading text-[11px] font-extrabold uppercase tracking-[0.14em] text-paper/80">
          <span aria-hidden className="inline-block h-[3px] w-6 bg-coral" />
          How Prop Haus works
        </p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
          {STEPS.map((step) => (
            <div
              key={step.n}
              className="sheet flex flex-col gap-3 border-[1.5px] border-ink bg-card p-4 text-foreground sm:p-5"
            >
              <span className="text-foreground/80">{step.icon}</span>
              <p className="ad-headline text-[22px]">
                <span className="text-foreground/45">{step.n}</span>
                {' '}
                {step.label}
              </p>
              <p className="text-[13px] leading-[19px] text-text-secondary">{step.copy}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
