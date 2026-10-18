/**
 * The user's free-text job summary on a project (projects.summary).
 *
 * Kept apart from lib/projects.ts, which imports node:crypto and the
 * service-role client, so the client-side box can share the limit without
 * pulling server code into the browser bundle.
 */

/** The most a job summary can hold; mirrors the check constraint in 20261017120000_project_summary.sql. */
export const PROJECT_SUMMARY_MAX = 4000;
