import {
  LOBS,
  LOB_PERILS,
  UNDERWRITERS,
  ZONES,
  aggregateCells,
  createRng,
  expectedLoss,
  hazardFor,
  pickWeighted,
  ratingFor,
  riskScore,
} from '@pnc/shared/domain';
import type { AccumulationCell, Exposure, Lob, PolicyStatus, TrendPoint } from '@pnc/shared/domain';

const LOB_WEIGHT: Record<Lob, number> = {
  'Commercial Property': 28,
  Homeowners: 20,
  'Marine Cargo': 8,
  'General Liability': 18,
  Cyber: 10,
  Aviation: 4,
  'Auto Fleet': 12,
};
const STATUSES: readonly { s: PolicyStatus; w: number }[] = [
  { s: 'Bound', w: 55 },
  { s: 'Renewal', w: 20 },
  { s: 'Quoted', w: 10 },
  { s: 'Expired', w: 10 },
  { s: 'Cancelled', w: 5 },
];
const ADJ = [
  'Atlas',
  'Beacon',
  'Cobalt',
  'Delta',
  'Evergreen',
  'Fulcrum',
  'Granite',
  'Harbor',
  'Ironclad',
  'Juniper',
  'Keystone',
  'Lumen',
  'Meridian',
  'Northwind',
  'Orion',
  'Pinnacle',
  'Quantum',
  'Redwood',
  'Summit',
  'Titan',
  'Union',
  'Vertex',
  'Westbridge',
  'Zenith',
];
const NOUN = [
  'Logistics',
  'Foods',
  'Energy',
  'Textiles',
  'Pharma',
  'Realty',
  'Robotics',
  'Shipping',
  'Steel',
  'Retail',
  'Hospitality',
  'Airways',
  'Biotech',
  'Mining',
  'Media',
  'Capital',
  'Motors',
  'Health',
  'Software',
  'Construction',
];
const SUFFIX = ['Inc.', 'LLC', 'Ltd', 'GmbH', 'S.A.', 'PLC', 'Holdings', 'Group', 'Co.'];
const START = Date.UTC(2024, 9, 1);
const DAY = 86_400_000;

export interface Dataset {
  exposures: Exposure[];
  byId: Map<string, Exposure>;
  cells: AccumulationCell[];
  trend: TrendPoint[];
  appetiteScale: number;
}

export function generateDataset(size: number, seed: number): Dataset {
  const rng = createRng(seed);
  const normal = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const exposures: Exposure[] = [];

  for (let i = 0; i < size; i++) {
    let lob: Lob = 'General Liability';
    let zone = ZONES[0]!;
    let perils: readonly string[] = [];
    for (let attempt = 0; attempt < 8 && perils.length === 0; attempt++) {
      lob = pickWeighted(rng, LOBS, (l) => LOB_WEIGHT[l]);
      zone = pickWeighted(rng, ZONES, (z) => z.weight);
      perils = LOB_PERILS[lob].filter((p) => hazardFor(zone.code, p) > 0);
    }
    if (perils.length === 0) {
      lob = 'General Liability';
      perils = ['Liability'];
    }
    const peril = pickWeighted(rng, perils, (p) => hazardFor(zone.code, p as never) || 1) as Exposure['peril'];

    const tiv = Math.round(Math.min(2_000_000_000, Math.max(250_000, Math.exp(Math.log(4_000_000) + 1.1 * normal()))) / 1000) * 1000;
    const limit = Math.round((peril === 'Liability' || peril === 'Cyber Event' ? tiv : tiv * (0.5 + 0.5 * rng())) / 1000) * 1000;
    const deductible = Math.round((limit * (0.005 + 0.03 * rng())) / 500) * 500;
    const hazard = hazardFor(zone.code, peril);
    const el = expectedLoss({ tiv, limit, peril, zone: zone.code });
    const premium = Math.round(Math.max(1500, el * (1.6 + 1.6 * rng()) + tiv * 0.0008));
    const status = pickWeighted(rng, STATUSES, (x) => x.w).s;
    let lossRatio = status === 'Quoted' ? 0 : 0.45 + 0.35 * rng() + (rng() < 0.06 ? 1.5 * rng() : 0);
    lossRatio = Math.round(lossRatio * 1000) / 1000;
    const incurredLoss = Math.round(premium * lossRatio);
    const score = riskScore({ hazard, lossRatio, deductibleRatio: deductible / tiv });
    const inceptionMs = START + Math.floor(rng() * 730) * DAY;
    const inception = new Date(inceptionMs).toISOString().slice(0, 10);
    const expiry = new Date(inceptionMs + 365 * DAY).toISOString().slice(0, 10);
    const year = inception.slice(0, 4);

    exposures.push({
      id: `E${String(i + 1).padStart(7, '0')}`,
      policyNumber: `PNC-${year}-${String(i + 1).padStart(6, '0')}`,
      insured: `${ADJ[Math.floor(rng() * ADJ.length)]} ${NOUN[Math.floor(rng() * NOUN.length)]} ${SUFFIX[Math.floor(rng() * SUFFIX.length)]}`,
      lob,
      peril,
      country: zone.country,
      zone: zone.code,
      tiv,
      limit,
      deductible,
      premium,
      incurredLoss,
      lossRatio,
      riskScore: score,
      rating: ratingFor(score),
      status,
      inception,
      expiry,
      underwriter: UNDERWRITERS[Math.floor(rng() * UNDERWRITERS.length)]!,
    });
  }

  const trendMap = new Map<string, TrendPoint>();
  for (const e of exposures) {
    const month = e.inception.slice(0, 7);
    const t = trendMap.get(month) ?? { month, premium: 0, incurred: 0, policies: 0 };
    t.premium += e.premium;
    t.incurred += e.incurredLoss;
    t.policies += 1;
    trendMap.set(month, t);
  }
  return {
    exposures,
    byId: new Map(exposures.map((e) => [e.id, e])),
    cells: aggregateCells(exposures),
    trend: [...trendMap.values()].sort((a, b) => a.month.localeCompare(b.month)),
    appetiteScale: size / 50_000,
  };
}
