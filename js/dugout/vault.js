// Password-locked storage for the GitHub key.
//
// A login is a small file in data/access/. It holds the GitHub key encrypted
// with a key stretched from the user's password (PBKDF2 then AES-GCM, both
// built into the browser). The file is public, so the password is the only
// thing protecting it: that is why the Dugout insists on long passwords.

const ITERATIONS = 600000;
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function keyFrom(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function seal(secret, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(password, salt, ITERATIONS);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(secret));
  return { v: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(data) };
}

export async function unseal(box, password) {
  try {
    const key = await keyFrom(password, unb64(box.salt), box.iterations);
    return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.data)));
  } catch {
    throw new Error('That password is not right.');
  }
}
