import { MongoClient } from 'mongodb';

const uri = 'mongodb://alpha:redbtnioai@server.georgeanthony.net:27017/become?authSource=admin';
const client = new MongoClient(uri);
await client.connect();
const db = client.db('become');
const programs = await db.collection('programs').find().toArray();

const exerciseMap = new Map();

for (const prog of programs) {
  for (const phase of (prog.phases || [])) {
    const workouts = Array.isArray(phase.workouts) 
      ? phase.workouts 
      : Object.entries(phase.workouts || {}).map(([d, w]) => ({ day: d, ...w }));
    for (const w of workouts) {
      for (const ex of (w.exercises || [])) {
        const name = ex.name?.trim();
        if (!name) continue;
        if (!exerciseMap.has(name)) {
          exerciseMap.set(name, { programs: new Set(), types: new Set(), tips: new Set(), groupTypes: new Set() });
        }
        const e = exerciseMap.get(name);
        e.programs.add(prog.name);
        if (ex.type) e.types.add(ex.type);
        if (ex.tip) e.tips.add(ex.tip);
        if (ex.groupType) e.groupTypes.add(ex.groupType);
      }
    }
  }
}

const sorted = [...exerciseMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
console.log('Total unique exercises:', sorted.length);
console.log('');
for (const [name, data] of sorted) {
  const types = [...data.types].join(',') || 'strength';
  const progs = data.programs.size;
  const tips = [...data.tips].join(' | ');
  console.log(`${name} | type:${types} | in ${progs} program(s)${tips ? ' | tips: ' + tips : ''}`);
}

await client.close();
