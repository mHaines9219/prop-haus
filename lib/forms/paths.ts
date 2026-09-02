/**
 * Route paths for the paperwork flow. Pure and dependency-free so client
 * components can import them without dragging the Anvil SDK (documents.ts)
 * into the browser bundle.
 */

/** Where the mock (and the real provider's iframe) sign page lives. */
export function signPagePath(orderId: string, documentId: string): string {
  return `/orders/${orderId}/sign/${documentId}`;
}
