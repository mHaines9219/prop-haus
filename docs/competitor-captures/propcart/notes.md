# Propcart (propcart.com) — capture notes

Captured 2026-08-31 by walking the search flow logged out. No HAR saved;
the request anatomy below is the capture (client-side search — the full
request/response is visible from the browser).

## Architecture

Next.js frontend; search runs **client-direct against a Typesense cluster**
at `search.propcart.com` (collection `items`). A scoped short-lived
search-only key is minted per session from
`us-central1-propcart-dev.cloudfunctions.net/api/v1/vendors/<id>/search/items-key`.
Firestore for app data, PostHog + GA for analytics, reCAPTCHA on forms.

## Main search request (as fired by the results page)

```
GET https://search.propcart.com/collections/items/documents/search
  ?q=brass+floor+lamp
  &query_by=title,_tags,sku,skus,description,storageLocation,vendor.displayName
  &num_typos=2,2,0,0,2,0,2            # per-field typo tolerance; 0 on SKU fields
  &filter_by=vendor.isListed:=true && geoloc:(40.6782,-73.9442,100 mi)
  &sort_by=geoloc(40.6782,-73.9442,precision:100 mi):asc,_text_match:desc,rank:desc
  &exhaustive_search=true
  &facet_by=_tags,colors,priceSpecification.purchaseType,eras,styles,rooms,materials
  &max_facet_values=100&max_candidates=50&per_page=50&offset=0
  &enable_analytics=true
```

Two companion facet-only calls fire alongside (limit=0):
`facet_by=priceSpecification.bin` (price histogram for the slider, with a
live "average price is about $21" readout) and `facet_by=vendor.displayName`
(vendor filter counts).

## Typeahead (per keystroke)

Same collection, trimmed:
`include_fields=title,_tags,sku,vendor.displayName`, `per_page=5`,
`highlight_start_tag=<em>` — match highlighting rendered directly in the
dropdown. Cheap payloads because the projection is 4 fields.

## Notable design choices

- **Geo is first-class**: every query filters AND sorts by distance from
  the selected city's coordinates. Default sort is distance, then text
  match, then a stored `rank` field (editorial/demand boost), then recency.
- **Facets from the search engine**: tags, colors, purchase type, eras,
  styles, rooms, materials, vendors, price bins — all with live counts per
  active query. This is their whole filter sidebar; no separate facet API.
- **Purchase type as data**: Weekly Rental / Daily Rental / For Sale /
  Digital Download etc. are a faceted field, not separate catalogs.
- **Quote-only pricing renders as "Contact for pricing"** — nullable price
  is a display state, same treatment we use.

## Item detail page (`/item/<id>`)

Fields shown: title, price+period, description, vendor (name, city, phone),
SKU, size, quantity, **condition** (e.g. "Good"), category breadcrumb, full
tag list, availability-calendar CTA, same-vendor "more like this" carousel.
Condition is a field we don't carry at all.
