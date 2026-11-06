import { z } from 'zod';

/**
 * The Space Lab scene document: the one structure the render, the floor plan,
 * the items rail and the chat model all read, and the only thing the chat is
 * allowed to change, through `SceneCommand`s applied by `applyCommands`.
 *
 * Units are feet. The room is a box with its back-left floor corner at the
 * origin: x runs along the back wall from the left wall (0) to the right
 * wall (room.width); z runs from the back wall (0) toward the viewer
 * (room.depth). A placement is the centre of an item's footprint, and
 * `rotation` is degrees clockwise seen from above, 0 meaning the item faces
 * the viewer.
 */

export const RoomSchema = z.object({
  width: z.number().min(4).max(200),
  depth: z.number().min(4).max(200),
  height: z.number().min(6).max(40),
});
export type Room = z.infer<typeof RoomSchema>;

export const SizeSchema = z.object({
  w: z.number().positive(),
  d: z.number().positive(),
  h: z.number().positive(),
});
export type Size = z.infer<typeof SizeSchema>;

export const StudioItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  vendor: z.string(),
  size: SizeSchema,
});
export type StudioItem = z.infer<typeof StudioItemSchema>;

export const PlacementSchema = z.object({
  x: z.number(),
  z: z.number(),
  rotation: z.number(),
});
export type Placement = z.infer<typeof PlacementSchema>;

export const SceneSchema = z.object({
  room: RoomSchema,
  items: z.array(StudioItemSchema).max(100),
  placements: z.record(z.string(), PlacementSchema),
});
export type Scene = z.infer<typeof SceneSchema>;

export const SceneCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('place'), itemId: z.string(), x: z.number(), z: z.number(), rotation: z.number().optional() }),
  z.object({ type: z.literal('move'), itemId: z.string(), x: z.number(), z: z.number() }),
  z.object({ type: z.literal('rotate'), itemId: z.string(), rotation: z.number() }),
  z.object({ type: z.literal('remove'), itemId: z.string() }),
  z.object({ type: z.literal('resize_room'), width: z.number(), depth: z.number() }),
]);
export type SceneCommand = z.infer<typeof SceneCommandSchema>;

export type ApplyResult = {
  scene: Scene;
  /** Commands that named an item the scene does not have, with the reason. */
  rejected: { command: SceneCommand; reason: string }[];
};

const normalizeRotation = (deg: number) => (((Math.round(deg) % 360) + 360) % 360);

/** An item's footprint on the floor after rotation: 90 and 270 swap w and d. */
export function footprint(item: StudioItem, rotation: number): { w: number; d: number } {
  const quarter = normalizeRotation(rotation) % 180 !== 0;
  return quarter ? { w: item.size.d, d: item.size.w } : { w: item.size.w, d: item.size.d };
}

/** Keep the whole footprint inside the room. */
function clamp(room: Room, item: StudioItem, p: Placement): Placement {
  const fp = footprint(item, p.rotation);
  const halfW = Math.min(fp.w / 2, room.width / 2);
  const halfD = Math.min(fp.d / 2, room.depth / 2);
  return {
    x: Math.min(Math.max(p.x, halfW), room.width - halfW),
    z: Math.min(Math.max(p.z, halfD), room.depth - halfD),
    rotation: normalizeRotation(p.rotation),
  };
}

function applyOne(scene: Scene, command: SceneCommand): Scene | string {
  if (command.type === 'resize_room') {
    const room = RoomSchema.safeParse({ ...scene.room, width: command.width, depth: command.depth });
    if (!room.success) return 'room size out of range';
    const placements = Object.fromEntries(
      Object.entries(scene.placements).map(([id, p]) => {
        const item = scene.items.find((i) => i.id === id);
        return [id, item ? clamp(room.data, item, p) : p];
      }),
    );
    return { ...scene, room: room.data, placements };
  }

  const item = scene.items.find((i) => i.id === command.itemId);
  if (!item) return `no item "${command.itemId}"`;
  const current = scene.placements[item.id];

  switch (command.type) {
    case 'place':
      return {
        ...scene,
        placements: {
          ...scene.placements,
          [item.id]: clamp(scene.room, item, { x: command.x, z: command.z, rotation: command.rotation ?? current?.rotation ?? 0 }),
        },
      };
    case 'move':
      if (!current) return `"${item.name}" is not in the room`;
      return { ...scene, placements: { ...scene.placements, [item.id]: clamp(scene.room, item, { ...current, x: command.x, z: command.z }) } };
    case 'rotate':
      if (!current) return `"${item.name}" is not in the room`;
      return { ...scene, placements: { ...scene.placements, [item.id]: clamp(scene.room, item, { ...current, rotation: command.rotation }) } };
    case 'remove': {
      if (!current) return `"${item.name}" is not in the room`;
      const placements = { ...scene.placements };
      delete placements[item.id];
      return { ...scene, placements };
    }
  }
}

/** Apply commands in order. A rejected command leaves the scene as it was. */
export function applyCommands(scene: Scene, commands: SceneCommand[]): ApplyResult {
  const rejected: ApplyResult['rejected'] = [];
  let next = scene;
  for (const command of commands) {
    const result = applyOne(next, command);
    if (typeof result === 'string') rejected.push({ command, reason: result });
    else next = result;
  }
  return { scene: next, rejected };
}

/** Where a named wall or spot is, for an item of this footprint. */
export function anchorPosition(
  room: Room,
  fp: { w: number; d: number },
  anchor: 'back' | 'front' | 'left' | 'right' | 'center',
): { x: number; z: number } {
  const cx = room.width / 2;
  const cz = room.depth / 2;
  switch (anchor) {
    case 'back':
      return { x: cx, z: fp.d / 2 };
    case 'front':
      return { x: cx, z: room.depth - fp.d / 2 };
    case 'left':
      return { x: fp.w / 2, z: cz };
    case 'right':
      return { x: room.width - fp.w / 2, z: cz };
    case 'center':
      return { x: cx, z: cz };
  }
}

/** The placeholder set until an order feeds the studio: six pieces, three placed. */
export function placeholderScene(): Scene {
  const items: StudioItem[] = [
    { id: 'sofa', name: 'Tufted velvet sofa', vendor: 'Newel', size: { w: 7, d: 3, h: 2.8 } },
    { id: 'lamp', name: 'Brass floor lamp', vendor: 'Prop N Spoon', size: { w: 1.2, d: 1.2, h: 5.5 } },
    { id: 'coffee-table', name: 'Walnut coffee table', vendor: 'Eclectic', size: { w: 4, d: 2, h: 1.4 } },
    { id: 'armchair', name: 'Rattan armchair', vendor: 'Newel', size: { w: 2.8, d: 2.8, h: 3 } },
    { id: 'ficus', name: 'Ficus, 6 ft', vendor: 'Eclectic', size: { w: 2, d: 2, h: 6 } },
    { id: 'rug', name: 'Shag rug, 8×10', vendor: 'Prop N Spoon', size: { w: 10, d: 8, h: 0.1 } },
  ];
  return {
    room: { width: 18, depth: 12, height: 9 },
    items,
    placements: {
      sofa: { x: 9, z: 1.5, rotation: 0 },
      lamp: { x: 4.5, z: 1, rotation: 0 },
      'coffee-table': { x: 9, z: 5, rotation: 0 },
    },
  };
}
