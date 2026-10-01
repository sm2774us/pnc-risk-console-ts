const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const formatUsd = (v: number | null | undefined): string => (v == null || Number.isNaN(v) ? '—' : usd.format(v));
export const formatUsdCompact = (v: number | null | undefined): string => (v == null || Number.isNaN(v) ? '—' : `$${compact.format(v)}`);
export const formatPct = (v: number | null | undefined): string => (v == null || Number.isNaN(v) ? '—' : pct.format(v));
export const formatInt = (v: number | null | undefined): string => (v == null ? '—' : new Intl.NumberFormat('en-US').format(v));
