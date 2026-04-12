#!/usr/bin/env node
/**
 * gen-test-token.mjs
 *
 * Generates a permanent JWT (no expiry) for Playwright e2e tests.
 * The token is valid forever — run this once to preview or debug.
 *
 * Usage:
 *   node scripts/gen-test-token.mjs
 *
 * Reads JWT_SECRET from .env.local in the same directory.
 * The Playwright tests (tests/e2e/test-auth.ts) do this automatically at runtime,
 * so you only need this script for manual inspection or troubleshooting.
 */

import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Load .env.local
const envPath = path.join(__dirname, '../.env.local');
if (!fs.existsSync(envPath)) {
  console.error('Error: .env.local not found at', envPath);
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
for (const line of envContent.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) envVars[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}

const JWT_SECRET = process.env.JWT_SECRET || envVars.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('Error: JWT_SECRET not found in .env.local');
  process.exit(1);
}

const jwt = require('jsonwebtoken');

// Test users — add more as needed
const users = [
  {
    label: 'george8794@gmail.com (primary test user)',
    payload: { userId: '693adca9073978ec812b601a', email: 'george8794@gmail.com', role: 'user' },
  },
];

console.log('\n=== Permanent Test Tokens (no expiry) ===\n');

for (const u of users) {
  const token = jwt.sign(u.payload, JWT_SECRET); // no expiresIn = permanent
  const decoded = jwt.verify(token, JWT_SECRET);
  console.log(`User: ${u.label}`);
  console.log(`Token: [generated — ${token.length} chars]`);
  console.log(`Payload: ${JSON.stringify(decoded)}`);
  console.log(`Has expiry: ${'exp' in decoded ? 'YES (' + new Date(decoded.exp * 1000).toISOString() + ')' : 'NO — permanent'}`);
  console.log();
}

console.log('Playwright tests auto-generate tokens at runtime via tests/e2e/test-auth.ts.');
console.log('No manual token management needed.\n');
