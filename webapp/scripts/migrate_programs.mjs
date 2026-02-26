#!/usr/bin/env node
/**
 * migrate_programs.mjs
 *
 * Migrates all programs from old schema:
 *   { name: "Barbell Back Squat", type: "strength", sets: 4, reps: "5", ... }
 *
 * To new schema:
 *   { exerciseSlug: "barbell-back-squat", sets: 4, reps: "5", ... }
 *
 * Protocol entries (AMRAP, EMOM, Tabata, circuits, Full Rest) that don't map
 * to a real exercise are preserved with a protocol slug and their details
 * moved into the `details` field.
 *
 * Usage:
 *   node scripts/migrate_programs.mjs              # dry run (preview only)
 *   node scripts/migrate_programs.mjs --apply      # write changes to DB
 */
import { MongoClient } from 'mongodb';

const MONGO_URI = 'mongodb://alpha:redbtnioai@server.georgeanthony.net:27017/become?authSource=admin';
const DRY_RUN = !process.argv.includes('--apply');

// ─── Build name→slug map from exercises collection ───────────────────────────

async function buildNameToSlugMap(db) {
  const exercises = await db.collection('exercises').find({}).toArray();
  const map = {};

  for (const ex of exercises) {
    // Canonical name
    map[ex.name.toLowerCase()] = ex.slug;

    // All aliases
    for (const alias of (ex.aliases || [])) {
      map[alias.toLowerCase()] = ex.slug;
      // Also try stripping " × 20", " × 30 sec" etc.
      const clean = alias.replace(/\s*×.*$/, '').trim();
      if (clean.toLowerCase() !== alias.toLowerCase()) {
        map[clean.toLowerCase()] = ex.slug;
      }
    }
  }

  return map;
}

// ─── Protocol slug generator ─────────────────────────────────────────────────

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n📦 Program Migration Script`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (preview only — use --apply to write)' : '⚡ APPLYING CHANGES'}\n`);

  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db();

    const nameMap = await buildNameToSlugMap(db);
    console.log(`  Loaded ${Object.keys(nameMap).length} name→slug mappings from exercises collection.\n`);

    const programs = await db.collection('programs').find({}).toArray();
    console.log(`  Programs to migrate: ${programs.length}\n`);

    let totalExercises = 0;
    let mapped = 0;
    let protocols = 0;
    let alreadyMigrated = 0;
    const protocolLog = [];

    for (const program of programs) {
      console.log(`  ── ${program.name} ──`);
      let progChanges = 0;
      let progProtocols = 0;

      for (const phase of (program.phases || [])) {
        for (const workout of (phase.workouts || [])) {
          for (let i = 0; i < (workout.exercises || []).length; i++) {
            const ex = workout.exercises[i];
            totalExercises++;

            // Already migrated?
            if (ex.exerciseSlug) {
              alreadyMigrated++;
              continue;
            }

            const key = (ex.name || '').toLowerCase();
            const slug = nameMap[key];

            if (slug) {
              // ── Mapped exercise ──
              const migrated = {
                exerciseSlug: slug,
              };

              // Preserve programming fields
              if (ex.sets != null) migrated.sets = ex.sets;
              if (ex.reps != null) migrated.reps = ex.reps;
              if (ex.rest != null) migrated.rest = ex.rest;
              if (ex.details != null) migrated.details = ex.details;

              // Preserve grouping fields
              if (ex.groupId != null) migrated.groupId = ex.groupId;
              if (ex.groupType != null) migrated.groupType = ex.groupType;
              if (ex.groupLabel != null) migrated.groupLabel = ex.groupLabel;
              if (ex.groupRest != null) migrated.groupRest = ex.groupRest;
              if (ex.groupRounds != null) migrated.groupRounds = ex.groupRounds;

              workout.exercises[i] = migrated;
              progChanges++;
              mapped++;
            } else {
              // ── Unmapped (protocol / rest) ──
              // Generate a protocol slug but mark it clearly
              const protocolSlug = `__protocol__${slugify(ex.name)}`;

              const migrated = {
                exerciseSlug: protocolSlug,
                details: ex.details || ex.name,
              };

              // Preserve grouping fields
              if (ex.sets != null) migrated.sets = ex.sets;
              if (ex.reps != null) migrated.reps = ex.reps;
              if (ex.rest != null) migrated.rest = ex.rest;
              if (ex.groupId != null) migrated.groupId = ex.groupId;
              if (ex.groupType != null) migrated.groupType = ex.groupType;
              if (ex.groupLabel != null) migrated.groupLabel = ex.groupLabel;
              if (ex.groupRest != null) migrated.groupRest = ex.groupRest;
              if (ex.groupRounds != null) migrated.groupRounds = ex.groupRounds;

              workout.exercises[i] = migrated;
              progProtocols++;
              protocols++;
              protocolLog.push({
                program: program.name,
                day: workout.day,
                original: ex.name,
                slug: protocolSlug,
                details: ex.details,
              });
            }
          }
        }
      }

      console.log(`     ${progChanges} exercises migrated, ${progProtocols} protocols flagged`);

      // ── Write to DB ──
      if (!DRY_RUN && (progChanges > 0 || progProtocols > 0)) {
        await db.collection('programs').updateOne(
          { _id: program._id },
          { $set: { phases: program.phases } }
        );
        console.log(`     ✅ Written to DB`);
      }
    }

    // ── Summary ──
    console.log(`\n  ═══════════════════════════════════════`);
    console.log(`  Total exercise entries:  ${totalExercises}`);
    console.log(`  Already migrated:       ${alreadyMigrated}`);
    console.log(`  Mapped to slug:         ${mapped}`);
    console.log(`  Protocols (flagged):    ${protocols}`);
    console.log(`  ═══════════════════════════════════════\n`);

    if (protocolLog.length > 0) {
      console.log(`  ⚠️  Protocol entries (need manual curation):`);
      for (const p of protocolLog) {
        console.log(`     [${p.program}] ${p.day}: "${p.original}" → ${p.slug}`);
        if (p.details) console.log(`       details: ${p.details}`);
      }
      console.log('');
    }

    if (DRY_RUN) {
      console.log(`  💡 This was a dry run. Use --apply to write changes.\n`);
    } else {
      console.log(`  ✅ Migration complete. All programs updated.\n`);
    }

  } finally {
    await client.close();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
