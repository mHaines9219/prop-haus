const STEPS = [
  {
    n: '01',
    label: 'Find it',
    copy: 'Describe it, upload a reference, or get specific — we search thousands of pieces across every vendor.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
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
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <rect x="3" y="3" width="14" height="14" rx="2" />
        <path d="M10 7v6M7 10h6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    n: '03',
    label: 'Check out',
    copy: 'Request availability and holds from multiple vendors at the same time. One click when you\'re ready.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
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
    copy: 'We handle COIs, delivery notes, and invoices, so the truck arrives loaded and you show up ready.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <rect x="2" y="7" width="12" height="9" rx="1.5" />
        <path d="M14 10h2l2 3v3h-4v-6z" strokeLinejoin="round" />
        <circle cx="5.5" cy="17" r="1.5" />
        <circle cx="14.5" cy="17" r="1.5" />
      </svg>
    ),
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="border-t border-border">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16">
        {/* Section label */}
        <p className="mb-8 flex items-center gap-2.5 font-heading text-[11px] font-bold uppercase tracking-[0.1em] text-text-tertiary">
          <span aria-hidden className="text-accent">—</span>
          How Prop Haus works
        </p>

        {/* Steps */}
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 sm:gap-8">
          {STEPS.map((step) => (
            <div key={step.n} className="flex flex-col gap-3">
              <span className="text-text-tertiary">{step.icon}</span>
              <p className="font-heading text-[13px] font-bold uppercase tracking-[0.06em] text-foreground">
                <span className="text-accent">{step.n}</span>
                {' '}
                {step.label}
              </p>
              <p className="text-[13px] leading-[1.6] text-text-tertiary">{step.copy}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
