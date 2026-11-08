// Small logger that redacts anything that looks like PII or a secret
// before writing it. See docs/THREAT_MODEL.md (T8).

const PATTERNS = [
  [/ln(bc|tb|bcrt)[0-9a-z]{20,}/gi, '[invoice]'],
  [/nsec1[0-9a-z]{20,}/gi, '[nsec]'],
  [/\b[0-9a-f]{32,}\b/gi, '[hex]'],
  [/\+?\d[\d\s-]{7,}\d/g, '[phone]'],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]'],
];

export function redact(value) {
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  for (const [re, replacement] of PATTERNS) text = text.replace(re, replacement);
  return text;
}

function write(level, msg, extra) {
  if (process.env.NODE_ENV === 'test' && level !== 'error') return;
  const line = { t: new Date().toISOString(), level, msg: redact(msg) };
  if (extra !== undefined) line.extra = redact(extra);
  (level === 'error' ? console.error : console.log)(JSON.stringify(line));
}

export const log = {
  info: (msg, extra) => write('info', msg, extra),
  warn: (msg, extra) => write('warn', msg, extra),
  error: (msg, extra) => write('error', msg, extra),
};
