import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * These two routes shipped with no session check at all, so anyone holding a
 * project id could approve a proposal or write a vendor's COI status. The
 * database-level fix is in `lib/projects.test.ts`, where the org filter is
 * exercised against real rows; this file guards the layer above it.
 *
 * WHY A SOURCE-READING TEST. The mutation functions now require an `orgId`, so
 * removing the check does not typecheck — unless the next person reaches for
 * some other org id to satisfy the parameter, which is exactly the shortcut a
 * deadline produces. A behavioural test would need a mocked Next request and
 * cookie jar to assert one line; reading the line is honest about what it
 * verifies and cannot pass for the wrong reason.
 *
 * Ordering is asserted on CALL SITES (`await currentOrgId(`), never on imports.
 * An earlier test of mine compared import positions and therefore measured
 * import order while appearing to measure control flow.
 */

const ROUTES = ['[id]/approve/route.ts', '[id]/coi/route.ts'];

describe('project mutation routes require a session', () => {
  it.each(ROUTES)('%s reads the session and 401s before mutating', (rel) => {
    const src = readFileSync(join(__dirname, rel), 'utf8');

    const session = src.indexOf('await currentOrgId(');
    expect(session, 'route does not read the session').toBeGreaterThan(-1);
    expect(src).toContain('401');

    // The mutation must come after the guard, not merely exist alongside it.
    const mutation = Math.max(
      src.indexOf('await approveProject('),
      src.indexOf('await setCoiStatus('),
    );
    expect(mutation).toBeGreaterThan(session);

    // The org id reaching the mutation must be the session's, not the caller's.
    // A route that reads `body.orgId` would satisfy every check above.
    expect(src).not.toMatch(/body\.\s*orgId/);
  });
});
