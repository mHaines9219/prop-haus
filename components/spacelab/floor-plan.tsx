import { footprint, type Scene } from '@/lib/spacelab/studio/scene';

/**
 * The floor plan: the scene from above, in ink. Same coordinates as the
 * render, so a piece against the back wall sits at the top of the drawing.
 */
export function FloorPlan({ scene }: { scene: Scene }) {
  const { room } = scene;
  const pad = 12;
  const scale = Math.min((200 - pad * 2) / room.width, (120 - pad * 2) / room.depth);
  const w = room.width * scale;
  const d = room.depth * scale;
  const ox = (200 - w) / 2;
  const oy = (120 - d) / 2;

  return (
    <svg
      viewBox="0 0 200 120"
      role="img"
      aria-label={`Floor plan: ${room.width} by ${room.depth} feet`}
      className="h-[120px] w-full max-w-[200px]"
    >
      <rect x={ox} y={oy} width={w} height={d} fill="var(--card)" stroke="var(--ink)" strokeWidth="2" />
      {scene.items.map((item) => {
        const p = scene.placements[item.id];
        if (!p) return null;
        const fp = footprint(item, p.rotation);
        return (
          <rect
            key={item.id}
            x={ox + (p.x - fp.w / 2) * scale}
            y={oy + (p.z - fp.d / 2) * scale}
            width={fp.w * scale}
            height={fp.d * scale}
            fill="var(--accent)"
            fillOpacity="0.55"
            stroke="var(--ink)"
            strokeWidth="1"
          >
            <title>{item.name}</title>
          </rect>
        );
      })}
      <text
        x="100"
        y={oy + d + 9}
        textAnchor="middle"
        fill="var(--text-tertiary)"
        fontSize="8"
        fontFamily="var(--font-body)"
      >
        {room.width}′ × {room.depth}′
      </text>
    </svg>
  );
}
