// Read-only: rank accounts by mindset progression so captures show real progress.
// Usage: APP_URI=<app mongo uri> NODE_PATH=webapp/node_modules node marketing/scripts/capture/probe-mind.cjs
const mongoose = require('mongoose');
(async () => {
  const conn = await mongoose.createConnection(process.env.APP_URI).asPromise();
  const db = conn.db;
  const one = await db.collection('mindprogresses').findOne({});
  console.log('mindprogress keys:', Object.keys(one || {}).join(','));
  const prog = await db.collection('mindprogresses').find({}).limit(500).toArray();
  const sess = await db.collection('mindsessions').aggregate([{ $group: { _id: '$user', n: { $sum: 1 } } }]).toArray();
  const sessByUser = Object.fromEntries(sess.map((s) => [String(s._id), s.n]));
  const users = await db.collection('users').find({}, { projection: { email: 1, name: 1 } }).toArray();
  const byId = Object.fromEntries(users.map((u) => [String(u._id), u]));
  const rows = prog.map((p) => {
    const uid = String(p.user ?? p.userId);
    const u = byId[uid] || {};
    return { email: u.email, level: p.level, xp: p.xp ?? p.totalXp, chapter: p.chapter ?? p.currentChapter, sessions: sessByUser[uid] || p.sessionsCompleted || 0 };
  }).sort((a, b) => (b.sessions || 0) - (a.sessions || 0)).slice(0, 12);
  for (const r of rows) console.log(JSON.stringify(r));
  const info = await db.collection('users').findOne({ email: 'info@becomeurbest.com' }, { projection: { email: 1, name: 1 } });
  console.log('info@becomeurbest.com user:', info ? 'EXISTS (' + info.name + ')' : 'none');
  await conn.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
