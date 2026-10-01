import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | 'system';
const KEY = 'pnc.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>(this.read());
  constructor() {
    this.apply(this.mode());
  }
  cycle(): void {
    const next: ThemeMode = this.mode() === 'system' ? 'light' : this.mode() === 'light' ? 'dark' : 'system';
    this.mode.set(next);
    this.apply(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
  }
  private read(): ThemeMode {
    try {
      const v = localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : 'system';
    } catch {
      return 'system';
    }
  }
  private apply(m: ThemeMode): void {
    const el = document.documentElement;
    if (m === 'system') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', m);
  }
}
