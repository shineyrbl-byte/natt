export const dirname = (p) => p.replace(/\/[^/]*$/, '') || '.';
export const join = (...parts) => parts.join('/');
export default { dirname, join };
