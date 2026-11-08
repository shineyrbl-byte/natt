// Tiny strict validator. Unknown fields are rejected, strings are
// trimmed and length-checked, numbers must be integers in range.
import { badRequest } from './errors.js';

export const str = (min, max, { pattern, optional = false, label } = {}) => ({ type: 'string', min, max, pattern, optional, label });
export const int = (min, max, { optional = false, label } = {}) => ({ type: 'int', min, max, optional, label });
export const oneOf = (values, { optional = false, label } = {}) => ({ type: 'enum', values, optional, label });

export function validate(schema, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('Expected a JSON object');
  for (const key of Object.keys(body)) {
    if (!(key in schema)) throw badRequest(`Unknown field: ${key}`);
  }
  const out = {};
  for (const [key, rule] of Object.entries(schema)) {
    const label = rule.label || key;
    let v = body[key];
    if (v === undefined || v === null || v === '') {
      if (rule.optional) continue;
      throw badRequest(`${label} is required`);
    }
    if (rule.type === 'string') {
      if (typeof v !== 'string') throw badRequest(`${label} must be text`);
      v = v.trim().replace(/[\u0000-\u001f\u007f]/g, '');
      if (v.length < rule.min || v.length > rule.max) throw badRequest(`${label} must be ${rule.min}–${rule.max} characters`);
      if (rule.pattern && !rule.pattern.test(v)) throw badRequest(`${label} is not in the right format`);
    } else if (rule.type === 'int') {
      if (typeof v === 'string' && /^\d+$/.test(v)) v = Number(v);
      if (!Number.isInteger(v) || v < rule.min || v > rule.max) throw badRequest(`${label} must be a whole number from ${rule.min} to ${rule.max}`);
    } else if (rule.type === 'enum') {
      if (!rule.values.includes(v)) throw badRequest(`${label} must be one of: ${rule.values.join(', ')}`);
    }
    out[key] = v;
  }
  return out;
}

export const PHONE = /^\+?[0-9 ]{8,19}$/;
