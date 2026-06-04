import Link from 'next/link';
import type { PropItem } from '@/lib/types';
import { SOURCE_META } from '@/lib/types';

export function ItemCard({
  item,
  matchedVia,
}: {
  item: PropItem;
  matchedVia?: string[];
}) {
  const img = item.images[0];
  return (
    <Link
      href={`/item/${item.source}/${encodeURIComponent(item.sourceId)}`}
      className="group block"
    >
      <div className="aspect-[4/5] bg-ink/5 overflow-hidden relative">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt={item.name}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-ink/30 font-sans text-xs">
            No image
          </div>
        )}
        <span className="absolute top-2 left-2 font-sans text-[10px] uppercase tracking-widest px-2 py-0.5 bg-paper/90 border border-ink/20">
          {SOURCE_META[item.source].name}
        </span>
        {matchedVia && matchedVia.length > 0 && (
          <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
            {matchedVia.slice(0, 3).map((tag, i) => (
              <span
                key={i}
                className="font-sans text-[10px] uppercase tracking-widest px-2 py-0.5 bg-accent/90 text-paper truncate max-w-full"
                title={tag}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="mt-2">
        <p className="font-display text-base leading-tight line-clamp-2">{item.name}</p>
        {item.subcategory && (
          <p className="font-sans text-[10px] uppercase tracking-widest text-ink/50 mt-0.5">
            {item.subcategory}
          </p>
        )}
      </div>
    </Link>
  );
}
