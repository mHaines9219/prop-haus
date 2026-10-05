/**
 * The user-assigned project status (projects.status).
 *
 * Shared by the server (lib/projects.ts, the status route) and the client (the
 * Dashboard table, the ProjectStatusSelect), so this module has no server
 * imports. It is the user's own board tag for a production: active (working
 * it), pending (parked), done (wrapped). Nothing on an order or a vendor
 * reply writes it.
 */

export const PROJECT_STATUSES = ['active', 'pending', 'done'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const DEFAULT_PROJECT_STATUS: ProjectStatus = 'active';

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Active',
  pending: 'Pending',
  done: 'Done',
};

/** Board order: what you are working comes first, what is wrapped last. */
export const PROJECT_STATUS_RANK: Record<ProjectStatus, number> = { active: 0, pending: 1, done: 2 };

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === 'string' && (PROJECT_STATUSES as readonly string[]).includes(value);
}
