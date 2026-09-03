/**
 * Row view-models for the /projects dashboard table. Built on the server from
 * lib/projects (which reaches the database) and handed to the client table as
 * plain data, so the table never imports server-only code.
 */

import {
  allItems,
  projectDocumentCount,
  projectItemCount,
  sceneFolders,
  type Project,
} from '@/lib/projects';

export type ProjectThumb = { itemId: string; name: string; image: string };

export type ProjectRow = {
  id: string;
  name: string;
  scenes: number;
  items: number;
  documents: number;
  thumbs: ProjectThumb[];
  updatedAt: string;
  archivedAt: string | null;
};

export function toProjectRow(p: Project): ProjectRow {
  return {
    id: p.id,
    name: p.name,
    scenes: sceneFolders(p).length,
    items: projectItemCount(p),
    documents: projectDocumentCount(p),
    thumbs: allItems(p)
      .filter((i): i is typeof i & { image: string } => Boolean(i.image))
      .slice(0, 3)
      .map((i) => ({ itemId: i.itemId, name: i.name, image: i.image })),
    updatedAt: p.updatedAt,
    archivedAt: p.archivedAt ?? null,
  };
}
