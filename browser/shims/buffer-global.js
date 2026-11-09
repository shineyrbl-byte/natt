// Provides the global Buffer that some Natt modules use (injected by esbuild).
// The npm polyfill lacks Node's 'base64url' encoding, used for invite codes
// and member tokens, so it is added here.
import { Buffer } from 'buffer';

const toString = Buffer.prototype.toString;
Buffer.prototype.toString = function (encoding, ...rest) {
  if (encoding === 'base64url') return toString.call(this, 'base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return toString.call(this, encoding, ...rest);
};

export { Buffer };
