/**
 * The user-assigned job status (orders.job_status).
 *
 * Shared by the server (lib/orders.ts, the status route) and the client (the
 * project Jobs table, the JobStatusSelect), so this module has no server imports.
 * `orders.status` is the vendor-driven lifecycle; this is the user's own board:
 * active (working it), pending (parked), done (wrapped).
 */

export const JOB_STATUSES = ['active', 'pending', 'done'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const DEFAULT_JOB_STATUS: JobStatus = 'active';

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  active: 'Active',
  pending: 'Pending',
  done: 'Done',
};

/** Board order: what you are working comes first, what is wrapped last. */
export const JOB_STATUS_RANK: Record<JobStatus, number> = { active: 0, pending: 1, done: 2 };

export function isJobStatus(value: unknown): value is JobStatus {
  return typeof value === 'string' && (JOB_STATUSES as readonly string[]).includes(value);
}
