// Find the magic-link doc the app just created (by the public sessionId that
// POST /api/auth/send-link returns), redeem it via the app's verify endpoint, save the JWT.
// Usage: APP_URI=<app mongo uri> NODE_PATH=webapp/node_modules node marketing/scripts/capture/redeem-session.cjs <sessionId> <outfile>
// Magic links live in the APP database (MONGODB_URI), not become_auth. Token value never printed.
const mongoose = require('mongoose');
const fs = require('fs');
const [sessionId, outfile] = process.argv.slice(2);
if (!sessionId || !outfile || !process.env.APP_URI) { console.error('usage: redeem-session.cjs <sessionId> <outfile> (APP_URI env)'); process.exit(1); }
(async () => {
  const conn = await mongoose.createConnection(process.env.APP_URI).asPromise();
  const doc = await conn.db.collection('magiclinks').findOne({ sessionId });
  await conn.close();
  if (!doc) { console.error('no magic link for that sessionId'); process.exit(2); }
  const res = await fetch('https://become.redbtn.io/api/auth/verify-link', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: doc.token }),
  });
  const j = await res.json();
  if (!res.ok || !j.token) { console.error('verify failed', res.status); process.exit(3); }
  fs.writeFileSync(outfile, j.token, { mode: 0o600 });
  console.log('JWT saved to', outfile, 'user:', j.user?.name);
})().catch((e) => { console.error(e.message); process.exit(1); });
