import type { AccumulationRow, Peril } from '@pnc/shared/domain';
import { ZONES } from '@pnc/shared/domain';

export interface Tile {
  code: string;
  name: string;
  col: number;
  row: number;
  utilization: number | null;
  status: 'ok' | 'watch' | 'breach' | 'none';
  tiv: number;
}

/** Collapses zone x peril rows to one tile per zone for the selected peril (or the worst peril when 'all'). Pure, so it is unit-tested. */
export function buildTiles(rows: readonly AccumulationRow[], peril: Peril | 'all'): Tile[] {
  const rank = { none: 0, ok: 1, watch: 2, breach: 3 } as const;
  return ZONES.map((z) => {
    const zr = rows.filter((r) => r.zone === z.code && (peril === 'all' || r.peril === peril));
    let worst: AccumulationRow | null = null;
    for (const r of zr) if (!worst || r.utilization > worst.utilization) worst = r;
    const status = worst ? worst.status : 'none';
    return {
      code: z.code,
      name: z.name,
      col: z.tile.col,
      row: z.tile.row,
      utilization: worst?.utilization ?? null,
      status,
      tiv: zr.reduce((a, r) => a + r.tiv, 0),
    } satisfies Tile;
  })
    .sort((a, b) => rank[b.status] - rank[a.status] || a.row - b.row || a.col - b.col)
    .sort((a, b) => a.row - b.row || a.col - b.col);
}
