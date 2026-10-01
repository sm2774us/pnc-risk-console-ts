import type { LoggerService, LogLevel } from '@nestjs/common';

const ORDER = ['debug', 'info', 'warn', 'error', 'silent'] as const;
type Level = (typeof ORDER)[number];

/** Structured JSON logger (one line per event) suitable for GCP Cloud Logging / AWS CloudWatch Insights. */
export class JsonLogger implements LoggerService {
  constructor(
    private readonly level: Level = 'info',
    private readonly sink: (line: string) => void = (l) => process.stdout.write(`${l}\n`),
  ) {}

  private emit(level: Exclude<Level, 'silent'>, message: unknown, context?: string, extra?: Record<string, unknown>): void {
    if (ORDER.indexOf(level) < ORDER.indexOf(this.level)) return;
    const base = typeof message === 'object' && message !== null ? message : { msg: String(message) };
    this.sink(JSON.stringify({ time: new Date().toISOString(), severity: level.toUpperCase(), context, ...base, ...extra }));
  }
  log(message: unknown, context?: string): void {
    this.emit('info', message, context);
  }
  error(message: unknown, trace?: string, context?: string): void {
    this.emit('error', message, context, trace ? { trace } : undefined);
  }
  warn(message: unknown, context?: string): void {
    this.emit('warn', message, context);
  }
  debug(message: unknown, context?: string): void {
    this.emit('debug', message, context);
  }
  verbose(message: unknown, context?: string): void {
    this.emit('debug', message, context);
  }
  setLogLevels?(_levels: LogLevel[]): void {
    /* level is fixed at construction */
  }
}
