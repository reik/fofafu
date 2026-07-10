/**
 * Hand-rolled logging seam. No new runtime dependency — wraps `console.*`.
 *
 * API: `logger.info({ msg, ...fields })` — a single record object, not
 * `(msg, fields)`. Every call site passes one plain object whose `msg` field
 * is the human-readable message and any remaining keys are structured
 * context.
 *
 * Format: JSON in production (grep-friendly, shipper-friendly), single-line
 * text in development (human-friendly under `npm run dev`). Toggled by
 * NODE_ENV, matching the rest of the backend's env-driven config.
 *
 * Field values are NOT deep-stringified. Only primitive values (string,
 * number, boolean, null/undefined) are emitted as-is; any object or array
 * value is replaced with a shallow `[object]` / `[array]` marker instead of
 * being recursively walked. This means a caller can never accidentally leak
 * an entire request body, user record, or circular structure into the log
 * by nesting it under a field — and it also means `JSON.stringify` never
 * throws on circular references. Callers should log only the specific
 * primitive fields they intend to (see
 * `.claude/agents/engineering/backend-dev.md` — never log raw passwords,
 * tokens, or PII).
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

type LogRecord = { msg: string; [field: string]: unknown };

const LEVEL_ORDER: Record<Exclude<LogLevel, 'silent'>, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function defaultLevel(): LogLevel {
  const env = process.env.NODE_ENV;
  if (env === 'test') return 'silent';
  if (env === 'production') return 'info';
  return 'debug';
}

function currentLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL as LogLevel | undefined;
  if (configured && (configured === 'silent' || configured in LEVEL_ORDER)) {
    return configured;
  }
  return defaultLevel();
}

function shouldLog(level: Exclude<LogLevel, 'silent'>): boolean {
  const active = currentLevel();
  if (active === 'silent') return false;
  return LEVEL_ORDER[level] >= LEVEL_ORDER[active];
}

function isJsonFormat(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** Shallow-safe field: primitives pass through, anything else becomes a marker. */
function shallowField(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return value;
  if (Array.isArray(value)) return '[array]';
  return '[object]';
}

function safeFields(record: LogRecord): Record<string, unknown> {
  const { msg: _msg, ...rest } = record;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(rest)) {
    out[key] = shallowField(rest[key]);
  }
  return out;
}

function write(level: Exclude<LogLevel, 'silent'>, record: LogRecord): void {
  if (!shouldLog(level)) return;

  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  const fields = safeFields(record);

  if (isJsonFormat()) {
    sink(JSON.stringify({ level, msg: record.msg, ...fields, time: new Date().toISOString() }));
    return;
  }

  const rest = Object.keys(fields).length > 0 ? ' ' + JSON.stringify(fields) : '';
  sink(`[${level}] ${record.msg}${rest}`);
}

export const logger = {
  debug(record: LogRecord): void {
    write('debug', record);
  },
  info(record: LogRecord): void {
    write('info', record);
  },
  warn(record: LogRecord): void {
    write('warn', record);
  },
  error(record: LogRecord): void {
    write('error', record);
  },
};
