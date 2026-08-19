import { createRequire } from 'module'
import { readFileSync } from 'fs'
const require = createRequire(import.meta.url)
const mongoose = require('mongoose')
const { ObjectId } = mongoose.Types

const uri = readFileSync('/tmp/prod_uri.txt', 'utf8').trim()
await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 })
const db = mongoose.connection.db

const JON = new ObjectId('69324119a28a8ac3b78750b9')
const sched = await db.collection('schedules').findOne({ userId: JON })
const prog = await db.collection('programs').findOne({ program_id: sched.programId })

console.log('settings.trainingDays =', JSON.stringify(sched.settings?.trainingDays))
console.log('program phases =', (prog.phases || []).length)
for (const ph of (prog.phases || [])) {
  const ws = Array.isArray(ph.workouts) ? ph.workouts : Object.entries(ph.workouts || {}).map(([day, w]) => ({ day, ...w }))
  console.log('  phase "' + (ph.phase||ph.name) + '" weeks="' + (ph.weeks) + '" workouts=' + ws.length + ' [' + ws.map(w=>w.day).join(', ') + ']')
}

// ---- replicate reflowStuckSchedule ----
function parsePhaseWeeks(s){const m=String(s||'1').match(/(\d+)\s*[-–]\s*(\d+)/);if(m)return +m[2]-+m[1]+1;return 1}
function normalize(ws){if(!ws)return[];return Array.isArray(ws)?ws:Object.entries(ws).map(([day,w])=>({day,...w}))}
const slots = sched.scheduledWorkouts || []
const completedPast = slots.filter(w=>w.status==='completed')
const completedCounts = new Map()
for(const w of completedPast){const k=`${w.phase}-${w.dayLabel}`;completedCounts.set(k,(completedCounts.get(k)||0)+1)}
const remaining=[]; const used=new Map()
const phases = prog.phases||[]
for(let i=0;i<phases.length;i++){
  const ws=normalize(phases[i].workouts); const nw=parsePhaseWeeks(phases[i].weeks||'1')
  for(let wk=0;wk<nw;wk++) for(const w of ws){
    const k=`${i+1}-${w.day}`; const u=used.get(k)||0; const c=completedCounts.get(k)||0
    if(u<c) used.set(k,u+1); else remaining.push({phase:i+1,dayLabel:w.day,title:w.title})
  }
}
const td = (Array.isArray(sched.settings?.trainingDays)&&sched.settings.trainingDays.length)
  ? sched.settings.trainingDays
  : [...new Set(slots.map(s=>new Date(s.date).getUTCDay()))].sort((a,b)=>a-b)
const sorted=[...td].sort((a,b)=>a-b)
const now=new Date(); now.setUTCHours(0,0,0,0)
const future=[]; const cur=new Date(now); let wi=0
const max=new Date(now); max.setFullYear(max.getFullYear()+1)
while(wi<remaining.length&&cur<max){ if(sorted.includes(cur.getUTCDay())){const w=remaining[wi];future.push({date:new Date(cur),phase:w.phase,dayLabel:w.dayLabel,status:'scheduled'});wi++} cur.setUTCDate(cur.getUTCDate()+1)}

const result=[...completedPast,...future]
console.log('\n=== REFLOW RESULT ===')
console.log('completed kept: '+completedPast.length)
console.log('remaining reflowed: '+future.length)
console.log('TOTAL slots after: '+result.length+'  (expect completed+remaining = program length)')
const byStatus={}; for(const w of result) byStatus[w.status]=(byStatus[w.status]||0)+1
console.log('by status: '+JSON.stringify(byStatus))
console.log('\nfirst 6 upcoming:')
for(const w of future.slice(0,6)) console.log('  '+new Date(w.date).toISOString().split('T')[0]+' "'+w.dayLabel+'" phase:'+w.phase)

await mongoose.disconnect()
