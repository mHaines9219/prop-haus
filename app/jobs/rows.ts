/**
 * Row view-models for the /jobs board. Built on the server from lib/jobs
 * (which reaches the database) and handed to the client table as plain data,
 * so the board never imports server-only code.
 */

import { jobRollupCopy, type CrewRequestRow, type Job } from '@/lib/jobs';
import type { OrderStatus } from '@/lib/orders';

export type JobThumb = { id: string; name: string; image: string };

export type JobRow = {
  id: string;
  /** "ABCDEF12": the short code the row reads as. */
  code: string;
  status: OrderStatus;
  /** §9.7 aggregate copy: "Sent to 3 vendors. Newel confirmed 4 of 6 items. 2 pending." */
  rollup: string;
  vendors: number;
  vendorNames: string[];
  messagesSent: number;
  items: number;
  itemsConfirmed: number;
  thumbs: JobThumb[];
  createdAt: string;
  updatedAt: string;
};

export function toJobRow(job: Job): JobRow {
  return {
    id: job.id,
    code: job.id.slice(0, 8).toUpperCase(),
    status: job.status,
    rollup: jobRollupCopy(job),
    vendors: job.vendorSummaries.length,
    vendorNames: job.vendorSummaries.map((v) => v.vendor),
    messagesSent: job.messagesSent,
    items: job.items.length,
    itemsConfirmed: job.items.filter((i) => i.status === 'confirmed').length,
    thumbs: job.items
      .filter((i): i is typeof i & { image: string } => Boolean(i.image))
      .slice(0, 3)
      .map((i) => ({ id: i.id, name: i.name, image: i.image })),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export type CrewRow = CrewRequestRow;
