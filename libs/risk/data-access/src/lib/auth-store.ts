import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import type { AuthUser, LoginResponse, Permission } from '@pnc/shared/domain';
import { type Observable, map, tap } from 'rxjs';
import { API_BASE_URL } from './interceptors';

const KEY = 'pnc.session.v1';
interface Persisted {
  token: string;
  user: AuthUser;
  expiresAt: number;
}

/** Session state held in signals. Token lives in sessionStorage only (cleared when the tab closes). */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly _user = signal<AuthUser | null>(null);
  private readonly _token = signal<string | null>(null);

  readonly user = this._user.asReadonly();
  readonly token = this._token.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  private readonly permissionSet = computed(() => new Set<Permission>(this._user()?.permissions ?? []));

  constructor() {
    this.restore();
  }

  can(permission: Permission): boolean {
    return this.permissionSet().has(permission);
  }

  login(persona: string): Observable<AuthUser> {
    return this.http.post<LoginResponse>(`${this.base}/auth/demo-login`, { persona }).pipe(
      tap((r) => {
        this._token.set(r.accessToken);
        this._user.set(r.user);
        this.persist({ token: r.accessToken, user: r.user, expiresAt: Date.now() + r.expiresIn * 1000 });
      }),
      map((r) => r.user),
    );
  }

  logout(): void {
    this._token.set(null);
    this._user.set(null);
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* storage unavailable */
    }
  }

  private persist(p: Persisted): void {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      /* private mode: session is memory-only */
    }
  }

  private restore(): void {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as Persisted;
      if (p.expiresAt <= Date.now()) {
        sessionStorage.removeItem(KEY);
        return;
      }
      this._token.set(p.token);
      this._user.set(p.user);
    } catch {
      /* corrupt entry: ignore and require login */
    }
  }
}
