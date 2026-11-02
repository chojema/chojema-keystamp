export type Vec3 = [number, number, number];

/** World size of one key unit. */
export const UNIT = 100;
const GAP = 5;

export type Profile = "sculpted" | "low";

interface Ring {
  inset: number;
  z: number;
}

const PROFILES: Record<Profile, { rings: Ring[]; radius: number; travel: number; rim: number }> = {
  sculpted: {
    radius: 11,
    travel: 16,
    rim: 18,
    rings: [
      { inset: 0, z: 0 },
      { inset: 8, z: 50 },
      { inset: 9.5, z: 54 },
      { inset: 11.5, z: 56.5 },
      { inset: 14, z: 57.5 },
      { inset: 20, z: 56.3 },
      { inset: 27, z: 55 },
      { inset: 35, z: 54.3 },
    ],
  },
  low: {
    radius: 9,
    travel: 7,
    rim: 7,
    rings: [
      { inset: 0, z: 0 },
      { inset: 0.5, z: 15 },
      { inset: 1.2, z: 18 },
      { inset: 2.6, z: 20 },
      { inset: 4.5, z: 20.6 },
    ],
  },
};

export function keyTravel(profile: Profile): number {
  return PROFILES[profile].travel;
}

/** Rounded rectangle outline, clockwise on screen when y points down. */
function outline(cx: number, cy: number, w: number, d: number, r: number, cornerSteps: number): [number, number][] {
  const pts: [number, number][] = [];
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - d / 2;
  const y1 = cy + d / 2;
  const corners: [number, number, number][] = [
    [x1 - r, y0 + r, -Math.PI / 2],
    [x1 - r, y1 - r, 0],
    [x0 + r, y1 - r, Math.PI / 2],
    [x0 + r, y0 + r, Math.PI],
  ];
  for (const [ccx, ccy, start] of corners) {
    for (let i = 0; i <= cornerSteps; i++) {
      const a = start + (i / cornerSteps) * (Math.PI / 2);
      pts.push([ccx + r * Math.cos(a), ccy + r * Math.sin(a)]);
    }
  }
  return pts;
}

export interface CapMesh {
  /** Footprint centre in world units. */
  cx: number;
  cy: number;
  w: number;
  d: number;
  height: number;
  /** Outline where the cap meets the ground. */
  base: Vec3[];
  quads: Vec3[][];
  /** Central polygon of the top surface. */
  top: Vec3[];
  /** Surface height at a world position on the top of the cap. */
  surfaceZ(x: number, y: number): number;
  /** Usable legend area on the top surface. */
  legendW: number;
  legendD: number;
}

/**
 * Builds a keycap by lofting rounded rectangles along a side profile.
 * Lower detail keeps blurred surrounding keys small in the exported file.
 */
export function buildCap(cx: number, cy: number, wUnits: number, hUnits: number, profile: Profile, detail: "full" | "lite"): CapMesh {
  const spec = PROFILES[profile];
  const w = wUnits * UNIT - GAP;
  const d = hUnits * UNIT - GAP;
  const steps = detail === "full" ? 6 : 3;
  const limit = Math.min(w, d) / 2 - 4;
  const source = detail === "full" ? spec.rings : spec.rings.filter((_, i) => i % 2 === 0 || i === spec.rings.length - 1);
  const rings = source.filter((r) => r.inset < limit);

  const loops = rings.map((ring) => {
    const r = Math.max(2.5, spec.radius - ring.inset * 0.28);
    return outline(cx, cy, w - ring.inset * 2, d - ring.inset * 2, r, steps).map(([x, y]): Vec3 => [x, y, ring.z]);
  });

  const quads: Vec3[][] = [];
  for (let i = 0; i < loops.length - 1; i++) {
    const a = loops[i];
    const b = loops[i + 1];
    for (let j = 0; j < a.length; j++) {
      const n = (j + 1) % a.length;
      quads.push([a[j], a[n], b[n], b[j]]);
    }
  }

  const surfaceZ = (x: number, y: number): number => {
    const inset = Math.min(w / 2 - Math.abs(x - cx), d / 2 - Math.abs(y - cy));
    for (let i = rings.length - 1; i >= 0; i--) {
      if (inset >= rings[i].inset) {
        const next = rings[i + 1];
        if (!next) return rings[i].z;
        const t = (inset - rings[i].inset) / (next.inset - rings[i].inset);
        return rings[i].z + (next.z - rings[i].z) * t;
      }
    }
    return rings[0].z;
  };

  return {
    cx, cy, w, d,
    height: Math.max(...rings.map((r) => r.z)),
    base: loops[0],
    quads,
    top: loops[loops.length - 1],
    surfaceZ,
    legendW: w - spec.rim * 2,
    legendD: d - spec.rim * 2,
  };
}
