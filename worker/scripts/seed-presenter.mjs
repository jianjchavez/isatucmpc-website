#!/usr/bin/env node
// Prints the SQL INSERT for a PMES presenter. The full name is the login identifier (spec §6).
// Usage: node scripts/seed-presenter.mjs "Juan Dela Cruz"   (the password is prompted, never an argument)
// Hashing duplicates worker/src/pmes/auth.ts on purpose: PBKDF2-SHA256, 100000 iterations, 16-byte salt.
import { webcrypto } from 'node:crypto';
import readline from 'node:readline';
import { Writable } from 'node:stream';

const name = (process.argv[2] ?? '').trim();
if (!name) {
  console.error('usage: node scripts/seed-presenter.mjs "<presenter full name>"');
  process.exit(1);
}

const toHex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');

async function hashPassword(password) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const key = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await webcrypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
  return { hash: toHex(bits), salt: toHex(salt) };
}

function readHidden(prompt) {
  process.stdout.write(prompt);
  const muted = new Writable({ write: (_chunk, _enc, cb) => cb() });
  const rl = readline.createInterface({ input: process.stdin, output: muted, terminal: true });
  return new Promise(resolve =>
    rl.question('', answer => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    }),
  );
}

const password = await readHidden(`Password for ${name}: `);
if (password.length < 8) {
  console.error('password must be at least 8 characters');
  process.exit(1);
}
const { hash, salt } = await hashPassword(password);
const q = s => `'${s.replace(/'/g, "''")}'`;
const sql = `INSERT INTO pmes_presenters (username, display_name, password_hash, password_salt, active, created_at) VALUES (${q(name)}, ${q(name)}, '${hash}', '${salt}', 1, '${new Date().toISOString()}');`;

console.log('\nRun this from worker/ (remote D1; drop --remote for local dev):\n');
console.log(`./node_modules/.bin/wrangler d1 execute isatucmpc-pmes --remote --command "${sql}"`);
