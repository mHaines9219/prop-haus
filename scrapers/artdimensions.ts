import { writeSource } from './common/run';

const SOURCE = 'artdimensions' as const;

// TODO: Art Dimensions Inc lists on theacme.com (directory only) and operates their catalog at
// http://www.ArtDimensionsOnline.com via Propcart Pro. The Propcart rentals catalog
// (/rentals/Cleared%20Art and subcategories) is gated behind a login/signup wall — no product
// data is rendered for anonymous visitors. Without credentials or a Propcart vendor API, no
// inventory can be ingested. Revisit if vendor relationship is established.
async function main() {
  await writeSource(SOURCE, []);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
