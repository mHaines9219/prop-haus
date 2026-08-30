# Competitor API captures — intake

Drop competitor network captures here. The analysis in
`docs/backend-api-analysis.md` (section 3) lists exactly what we're looking
for; once files land, the compare/contrast in section 4 gets written and the
"emulate" bucket reviewed before implementation.

## How to capture (Chrome)

1. Open DevTools → Network tab on the competitor site. Check "Preserve log".
2. Walk the flows that matter (in priority order):
   - search: type a query, watch the requests as you type and on submit
   - browse: open a category, apply filters, paginate / infinite-scroll
   - item detail: open a product page
   - cart / hold / availability: add an item, anything quote-related
3. Either right-click any request → **Copy → Copy as HAR** (whole session,
   preferred) or save individual responses (right-click → Copy → Copy
   response) as `.json`.

## Naming

```
docs/competitor-captures/<competitor>/<flow>-<yyyymmdd>.har
docs/competitor-captures/<competitor>/<flow>-<note>.json
```

e.g. `acmeprops/search-20260830.har`, `acmeprops/browse-page2.json`.

## Before committing

- HARs record cookies and auth headers. Strip them (or capture logged-out
  where possible). A quick pass: search the HAR for `cookie`,
  `authorization`, `set-cookie` and blank the values.
- A sentence or two of context per competitor in a `notes.md` next to the
  files helps a lot: what the product is, what felt fast/slow in use,
  anything you noticed in the UI that the API explains.
