// The browser demo keeps no files; these are never reached in normal use.
const unavailable = () => {
  throw new Error('No file system in the browser demo');
};
export const existsSync = () => false;
export const mkdirSync = () => {};
export const readFileSync = unavailable;
export const writeFileSync = unavailable;
export default { existsSync, mkdirSync, readFileSync, writeFileSync };
