import type { AuthUser, Exposure, Permission, Role } from './types';

/** Least-privilege role matrix. Each role receives the minimum set required for its job. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  viewer: ['exposure:read', 'portfolio:read'],
  underwriter: ['exposure:read', 'exposure:read-pii', 'exposure:export', 'portfolio:read'],
  'risk-manager': ['exposure:read', 'exposure:read-pii', 'exposure:export', 'portfolio:read', 'stress:run'],
  admin: ['exposure:read', 'exposure:read-pii', 'exposure:export', 'portfolio:read', 'stress:run', 'admin:status'],
};

export const DEMO_PERSONAS: readonly AuthUser[] = (
  [
    { sub: 'u-viewer', name: 'Vera Viewer', role: 'viewer' },
    { sub: 'u-uw', name: 'Uma Underwriter', role: 'underwriter' },
    { sub: 'u-rm', name: 'Rami Risk-Manager', role: 'risk-manager' },
    { sub: 'u-admin', name: 'Ada Admin', role: 'admin' },
  ] as const
).map((p) => ({ ...p, permissions: [...ROLE_PERMISSIONS[p.role]] }));

export function can(user: Pick<AuthUser, 'permissions'> | null | undefined, permission: Permission): boolean {
  return !!user && user.permissions.includes(permission);
}

/** Masks the insured (commercially sensitive) for principals without `exposure:read-pii`. */
export function maskInsured(name: string): string {
  let h = 0;
  for (const ch of name) h = (Math.imul(31, h) + ch.charCodeAt(0)) >>> 0;
  return `Insured ••${((h % 9000) + 1000).toString()}`;
}

export function maskExposure<T extends Pick<Exposure, 'insured'>>(row: T, permissions: readonly Permission[]): T {
  return permissions.includes('exposure:read-pii') ? row : { ...row, insured: maskInsured(row.insured) };
}
