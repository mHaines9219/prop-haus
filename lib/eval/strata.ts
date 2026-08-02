import type { PropItem } from '../types';

/**
 * An item is "enriched" if the pipeline gave it any semantic facet beyond name
 * and category. These are exactly the fields a mood query — "70s apartment",
 * "luxury hotel lobby" — can match against; an item without them embeds as
 * `name | category` and can only be found by its product name.
 *
 * Lives in lib/ rather than alongside a script so eval runners can share it
 * without importing a module that executes on load.
 */
export function isEnriched(item: PropItem): boolean {
  return Boolean(
    item.style?.length ||
      item.era ||
      item.materials?.length ||
      item.colors?.length ||
      item.vibes?.length ||
      item.settingType?.length ||
      item.genreFit?.length ||
      item.tags?.length,
  );
}
