#!/usr/bin/env node
/**
 * seed_exercises.mjs
 *
 * Seeds the `exercises` collection with canonical exercise definitions.
 * Merges videoUrl / thumbnailUrl from the existing `exercisevideos` collection.
 *
 * Usage:  node scripts/seed_exercises.mjs
 *         node scripts/seed_exercises.mjs --drop   (drops existing collection first)
 */
import { MongoClient } from 'mongodb';

const MONGO_URI = 'mongodb://alpha:redbtnioai@server.georgeanthony.net:27017/become?authSource=admin';
const DROP = process.argv.includes('--drop');

// ─── Helper ──────────────────────────────────────────────────────────────────

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Compact exercise builder. Short keys → full schema fields.
 * Only specify fields that differ from defaults.
 */
function ex(name, d) {
  return {
    slug: d.slug || slugify(name),
    name,
    aliases: d.aliases || [],
    description: d.desc || '',

    category:         d.cat   || 'strength',
    mechanics:        d.mech  || 'compound',
    role:             d.role  || 'compound',
    movementPatterns: d.pat   || ['n/a'],
    laterality:       d.lat   || 'bilateral',
    difficulty:       d.diff  || 'intermediate',

    primaryMuscles:   d.pri   || [],
    secondaryMuscles: d.sec   || [],
    stabilizers:      d.stab  || [],

    equipment:         d.eq    || ['bodyweight'],
    optionalEquipment: d.optEq || [],

    trackingType: d.track || 'reps_weight',
    cardioMetrics: d.cardio || undefined,

    defaultSets:     d.sets     ?? undefined,
    defaultReps:     d.reps     ?? undefined,
    defaultRest:     d.rest     ?? undefined,
    defaultDuration: d.duration ?? undefined,
    defaultTempo:    d.tempo    ?? undefined,

    instructions:   [],
    cues:           [],
    commonMistakes: [],

    prerequisites: [],
    variations:    d.vars || [],
    alternatives:  d.alts || [],

    tags:       d.tags   || [],
    bodyRegion: d.region || 'full_body',
    isActive: true,
  };
}

// ─── EXERCISE DATA ───────────────────────────────────────────────────────────
//
// Organized by the 10 Fundamental Movement Patterns, then accessories.
// Every exercise that appears in the 8 programs is covered here.
//
// ─────────────────────────────────────────────────────────────────────────────

const exercises = [

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. SQUAT PATTERN
  // ═══════════════════════════════════════════════════════════════════════════

  ex('Barbell Back Squat', {
    aliases: ['Back Squat', 'Barbell or Dumbbell Squat', 'Squat to Tempo (3-1-1)'],
    pat: ['squat'], role: 'compound', mech: 'compound',
    pri: ['quads'], sec: ['glutes', 'adductors'], stab: ['abs', 'erector_spinae'],
    eq: ['barbell', 'squat_rack'],
    sets: 4, reps: '5', rest: '3-5 min',
    vars: ['front-squat', 'goblet-squat'], alts: ['leg-press', 'hack-squat'],
    tags: ['powerlifting', 'big_3', 'squat'], region: 'lower_body',
  }),

  ex('Front Squat', {
    aliases: ['Dumbbell Front Squat'],
    pat: ['squat'], role: 'compound', mech: 'compound',
    pri: ['quads'], sec: ['glutes', 'abs'], stab: ['upper_back', 'erector_spinae'],
    eq: ['barbell', 'squat_rack'], optEq: ['dumbbell'],
    sets: 4, reps: '5', rest: '3 min',
    vars: ['barbell-back-squat', 'goblet-squat'],
    tags: ['squat', 'olympic'], region: 'lower_body',
  }),

  ex('Goblet Squat', {
    aliases: ['DB Goblet Squat'],
    pat: ['squat'], role: 'secondary', mech: 'compound',
    pri: ['quads'], sec: ['glutes'], stab: ['abs'],
    eq: ['dumbbell'], optEq: ['kettlebell'],
    diff: 'beginner', sets: 3, reps: '10-12', rest: '90 sec',
    vars: ['front-squat'], alts: ['leg-press'],
    tags: ['squat', 'beginner_friendly'], region: 'lower_body',
  }),

  ex('Hack Squat', {
    pat: ['squat'], role: 'secondary', mech: 'compound',
    pri: ['quads'], sec: ['glutes'], stab: [],
    eq: ['hack_squat'],
    sets: 3, reps: '8-12', rest: '2 min',
    alts: ['leg-press', 'barbell-back-squat'],
    tags: ['squat', 'machine'], region: 'lower_body',
  }),

  ex('Leg Press', {
    pat: ['squat'], role: 'secondary', mech: 'compound',
    pri: ['quads'], sec: ['glutes'], stab: [],
    eq: ['leg_press'],
    sets: 3, reps: '10-12', rest: '2 min',
    alts: ['hack-squat', 'barbell-back-squat'],
    tags: ['squat', 'machine'], region: 'lower_body',
  }),

  ex('Belt Squat', {
    aliases: ['Belt Squat Machine'],
    pat: ['squat'], role: 'secondary', mech: 'compound',
    pri: ['quads'], sec: ['glutes'], stab: [],
    eq: ['belt_squat_machine'],
    sets: 3, reps: '10-12', rest: '2 min',
    alts: ['pendulum-squat', 'leg-press', 'hack-squat'],
    tags: ['squat', 'machine', 'spine_friendly'], region: 'lower_body',
  }),

  ex('Pendulum Squat', {
    aliases: ['Pendulum Squat Machine'],
    pat: ['squat'], role: 'secondary', mech: 'compound',
    pri: ['quads'], sec: ['glutes'], stab: [],
    eq: ['hack_squat'],
    sets: 3, reps: '10-12', rest: '2 min',
    alts: ['belt-squat', 'hack-squat', 'leg-press'],
    tags: ['squat', 'machine', 'spine_friendly'], region: 'lower_body',
  }),

  ex('Leg Extension', {
    aliases: ['Leg Extension Machine'],
    pat: ['knee_extension'], role: 'accessory', mech: 'isolation',
    pri: ['quads'], sec: [], stab: [],
    eq: ['leg_extension'],
    sets: 3, reps: '12-15', rest: '60 sec',
    tags: ['squat_accessory', 'isolation', 'machine'], region: 'lower_body',
  }),

  ex('Bodyweight Squat', {
    aliases: ['Bodyweight Squats × 20', 'Bodyweight Squats & Leg Swings'],
    pat: ['squat'], role: 'secondary', mech: 'compound',
    cat: 'calisthenics',
    pri: ['quads'], sec: ['glutes'], stab: ['abs'],
    eq: ['bodyweight'], diff: 'beginner',
    track: 'reps_bodyweight', sets: 2, reps: '15-20',
    tags: ['warmup', 'bodyweight', 'beginner_friendly'], region: 'lower_body',
  }),

  ex('Wall Sit', {
    aliases: ['Quad Wall Sit', 'Squat Hold × 20 sec'],
    pat: ['squat'], role: 'accessory', mech: 'n/a',
    cat: 'strength',
    pri: ['quads'], sec: ['glutes'], stab: ['abs'],
    eq: ['bodyweight'], diff: 'beginner',
    track: 'time', duration: '30-60 sec',
    tags: ['isometric', 'squat_accessory'], region: 'lower_body',
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. HINGE PATTERN
  // ═══════════════════════════════════════════════════════════════════════════

  ex('Deadlift', {
    aliases: ['Conventional Deadlift'],
    pat: ['hinge'], role: 'compound', mech: 'compound',
    pri: ['glutes', 'hamstrings'], sec: ['lower_back', 'quads'], stab: ['abs', 'grip', 'upper_back'],
    eq: ['barbell'],
    sets: 4, reps: '5', rest: '3-5 min',
    vars: ['romanian-deadlift', 'trap-bar-deadlift'],
    tags: ['powerlifting', 'big_3', 'hinge'], region: 'lower_body',
  }),

  ex('Romanian Deadlift', {
    aliases: ['RDL', 'RDL (Barbell or Dumbbell)', 'Dumbbell RDL', 'DB Romanian Deadlift', 'Dumbbell Romanian Deadlift'],
    pat: ['hinge'], role: 'compound', mech: 'compound',
    pri: ['hamstrings'], sec: ['glutes', 'lower_back'], stab: ['abs', 'grip'],
    eq: ['barbell'], optEq: ['dumbbell', 'kettlebell'],
    sets: 3, reps: '8-10', rest: '2 min',
    vars: ['stiff-leg-deadlift', 'single-leg-rdl'],
    tags: ['hinge', 'posterior_chain'], region: 'lower_body',
  }),

  ex('Stiff-Leg Deadlift', {
    aliases: ['Dumbbell Stiff-Leg Deadlift'],
    pat: ['hinge'], role: 'secondary', mech: 'compound',
    pri: ['hamstrings'], sec: ['glutes', 'lower_back'], stab: ['abs'],
    eq: ['barbell'], optEq: ['dumbbell'],
    sets: 3, reps: '10-12', rest: '90 sec',
    vars: ['romanian-deadlift'],
    tags: ['hinge', 'posterior_chain'], region: 'lower_body',
  }),

  ex('Dumbbell Deadlift', {
    aliases: ['DB Deadlift'],
    pat: ['hinge'], role: 'secondary', mech: 'compound',
    pri: ['glutes', 'hamstrings'], sec: ['quads', 'lower_back'], stab: ['abs', 'grip'],
    eq: ['dumbbell'], diff: 'beginner',
    sets: 3, reps: '10-12', rest: '90 sec',
    alts: ['deadlift', 'kettlebell-deadlift'],
    tags: ['hinge', 'beginner_friendly'], region: 'lower_body',
  }),

  ex('Kettlebell Deadlift', {
    pat: ['hinge'], role: 'secondary', mech: 'compound',
    pri: ['glutes', 'hamstrings'], sec: ['quads'], stab: ['abs', 'grip'],
    eq: ['kettlebell'], diff: 'beginner',
    sets: 3, reps: '10-12', rest: '90 sec',
    alts: ['dumbbell-deadlift', 'deadlift'],
    tags: ['hinge', 'beginner_friendly'], region: 'lower_body',
  }),

  ex('Trap Bar Deadlift', {
    aliases: ['Hex Bar Deadlift'],
    pat: ['hinge', 'squat'], role: 'compound', mech: 'compound',
    pri: ['quads', 'glutes'], sec: ['hamstrings', 'traps'], stab: ['abs', 'erector_spinae', 'grip'],
    eq: ['trap_bar'],
    sets: 4, reps: '5', rest: '3-5 min',
    vars: ['deadlift'],
    tags: ['hinge', 'hybrid', 'power'], region: 'lower_body',
  }),

  ex('Hip Thrust', {
    aliases: ['Barbell Hip Thrust', 'DB Hip Thrust', 'Dumbbell Hip Thrust'],
    pat: ['hinge'], role: 'secondary', mech: 'compound',
    pri: ['glutes'], sec: ['hamstrings'], stab: ['abs'],
    eq: ['barbell', 'flat_bench'], optEq: ['dumbbell'],
    sets: 3, reps: '8-12', rest: '2 min',
    vars: ['glute-bridge'],
    tags: ['glute_builder', 'hinge'], region: 'lower_body',
  }),

  ex('Glute Bridge', {
    aliases: ['Glute Bridge × 20'],
    pat: ['hinge'], role: 'secondary', mech: 'compound',
    pri: ['glutes'], sec: ['hamstrings'], stab: ['abs'],
    eq: ['bodyweight'], optEq: ['dumbbell', 'resistance_band'],
    diff: 'beginner', track: 'reps_bodyweight',
    sets: 3, reps: '15-20', rest: '60 sec',
    vars: ['single-leg-glute-bridge', 'hip-thrust'],
    tags: ['glute_builder', 'bodyweight', 'beginner_friendly'], region: 'lower_body',
  }),

  ex('Single-Leg Glute Bridge', {
    pat: ['hinge'], role: 'secondary', mech: 'compound',
    lat: 'unilateral',
    pri: ['glutes'], sec: ['hamstrings'], stab: ['abs', 'hip_flexors'],
    eq: ['bodyweight'], diff: 'beginner', track: 'reps_bodyweight',
    sets: 3, reps: '10-12 per side', rest: '60 sec',
    vars: ['glute-bridge'],
    tags: ['glute_builder', 'unilateral', 'bodyweight'], region: 'lower_body',
  }),

  ex('Good Morning', {
    aliases: ['Bodyweight Good Mornings × 15'],
    pat: ['hinge'], role: 'secondary', mech: 'compound',
    pri: ['hamstrings'], sec: ['glutes', 'erector_spinae'], stab: ['abs'],
    eq: ['barbell'], optEq: ['bodyweight'],
    sets: 3, reps: '10-12', rest: '90 sec',
    tags: ['hinge', 'posterior_chain'], region: 'lower_body',
  }),

  ex('Single-Leg RDL', {
    aliases: ['Single-Leg RDL Balance'],
    pat: ['hinge'], role: 'secondary', mech: 'compound',
    lat: 'unilateral',
    pri: ['hamstrings', 'glutes'], sec: ['lower_back'], stab: ['abs', 'calves'],
    eq: ['dumbbell'], optEq: ['kettlebell', 'bodyweight'],
    sets: 3, reps: '8-10 per side', rest: '60 sec',
    vars: ['romanian-deadlift'],
    tags: ['hinge', 'unilateral', 'balance'], region: 'lower_body',
  }),

  ex('Lying Leg Curl', {
    pat: ['knee_flexion'], role: 'accessory', mech: 'isolation',
    pri: ['hamstrings'], sec: [], stab: [],
    eq: ['leg_curl'],
    sets: 3, reps: '10-15', rest: '60 sec',
    vars: ['seated-leg-curl'],
    tags: ['hinge_accessory', 'isolation', 'machine'], region: 'lower_body',
  }),

  ex('Seated Leg Curl', {
    aliases: ['Leg Curl Machine'],
    pat: ['knee_flexion'], role: 'accessory', mech: 'isolation',
    pri: ['hamstrings'], sec: [], stab: [],
    eq: ['leg_curl'],
    sets: 3, reps: '10-15', rest: '60 sec',
    vars: ['lying-leg-curl'],
    tags: ['hinge_accessory', 'isolation', 'machine'], region: 'lower_body',
  }),

  ex('Glute Cable Kickback', {
    pat: ['hip_extension'], role: 'accessory', mech: 'isolation',
    lat: 'unilateral',
    pri: ['glutes'], sec: ['hamstrings'], stab: ['abs'],
    eq: ['cable'],
    sets: 3, reps: '12-15 per side', rest: '60 sec',
    tags: ['glute_builder', 'isolation', 'cable'], region: 'lower_body',
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. LUNGE / SPLIT STANCE
  // ═══════════════════════════════════════════════════════════════════════════

  ex('Bulgarian Split Squat', {
    aliases: ['DB Bulgarian Split Squat'],
    pat: ['lunge'], role: 'compound', mech: 'compound',
    lat: 'unilateral',
    pri: ['quads', 'glutes'], sec: ['hamstrings'], stab: ['abs', 'adductors'],
    eq: ['dumbbell'], optEq: ['barbell', 'bodyweight', 'flat_bench'],
    sets: 3, reps: '8-10 per side', rest: '90 sec',
    vars: ['split-squat'],
    tags: ['lunge', 'unilateral'], region: 'lower_body',
  }),

  ex('Split Squat', {
    aliases: ['DB Split Squat', 'Dumbbell Split Squat'],
    pat: ['lunge'], role: 'secondary', mech: 'compound',
    lat: 'unilateral',
    pri: ['quads', 'glutes'], sec: ['hamstrings'], stab: ['abs'],
    eq: ['dumbbell'], optEq: ['barbell', 'bodyweight'],
    diff: 'beginner', sets: 3, reps: '10-12 per side', rest: '90 sec',
    vars: ['bulgarian-split-squat'],
    tags: ['lunge', 'unilateral', 'beginner_friendly'], region: 'lower_body',
  }),

  ex('Walking Lunge', {
    aliases: ['Walking Lunges', 'Dumbbell Walking Lunge', 'Dumbbell Walking Lunges', 'Walking Lunges × 20'],
    pat: ['lunge'], role: 'compound', mech: 'compound',
    lat: 'alternating',
    pri: ['quads', 'glutes'], sec: ['hamstrings'], stab: ['abs'],
    eq: ['dumbbell'], optEq: ['barbell', 'bodyweight'],
    sets: 3, reps: '10-12 per side', rest: '90 sec',
    vars: ['reverse-lunge'],
    tags: ['lunge', 'locomotion'], region: 'lower_body',
  }),

  ex('Reverse Lunge', {
    aliases: ['DB Reverse Lunge', 'Dumbbell Reverse Lunge', 'Reverse Lunges × 20'],
    pat: ['lunge'], role: 'compound', mech: 'compound',
    lat: 'alternating',
    pri: ['quads', 'glutes'], sec: ['hamstrings'], stab: ['abs'],
    eq: ['dumbbell'], optEq: ['barbell', 'bodyweight'],
    sets: 3, reps: '10-12 per side', rest: '90 sec',
    vars: ['walking-lunge'],
    tags: ['lunge', 'knee_friendly'], region: 'lower_body',
  }),

  ex('Step-Up', {
    aliases: ['Step Ups', 'DB Step-Ups', 'Box Step-Ups'],
    pat: ['lunge'], role: 'compound', mech: 'compound',
    lat: 'unilateral',
    pri: ['quads', 'glutes'], sec: ['hamstrings'], stab: ['abs', 'calves'],
    eq: ['box'], optEq: ['dumbbell', 'barbell', 'bodyweight'],
    sets: 3, reps: '10-12 per side', rest: '90 sec',
    tags: ['lunge', 'unilateral', 'functional'], region: 'lower_body',
  }),

  ex('Lateral Lunge', {
    aliases: ['DB Lateral Lunge'],
    pat: ['lunge'], role: 'secondary', mech: 'compound',
    lat: 'alternating',
    pri: ['quads', 'adductors'], sec: ['glutes'], stab: ['abs'],
    eq: ['dumbbell'], optEq: ['bodyweight'],
    sets: 3, reps: '10-12 per side', rest: '60 sec',
    tags: ['lunge', 'frontal_plane', 'adductor'], region: 'lower_body',
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. HORIZONTAL PUSH
  // ═══════════════════════════════════════════════════════════════════════════

  ex('Barbell Bench Press', {
    aliases: ['Bench Press', 'Bench Press (DB/bar)'],
    pat: ['horizontal_push'], role: 'compound', mech: 'compound',
    pri: ['chest'], sec: ['triceps', 'front_delts'], stab: ['abs', 'rotator_cuff'],
    eq: ['barbell', 'flat_bench'],
    sets: 4, reps: '5-8', rest: '3 min',
    vars: ['incline-bench-press', 'dumbbell-bench-press'],
    tags: ['powerlifting', 'big_3', 'push'], region: 'upper_body',
  }),

  ex('Dumbbell Bench Press', {
    aliases: ['DB Bench Press'],
    pat: ['horizontal_push'], role: 'compound', mech: 'compound',
    pri: ['chest'], sec: ['triceps', 'front_delts'], stab: ['abs', 'rotator_cuff'],
    eq: ['dumbbell', 'flat_bench'],
    sets: 3, reps: '8-12', rest: '2 min',
    vars: ['barbell-bench-press', 'dumbbell-floor-press'],
    tags: ['push', 'dumbbell'], region: 'upper_body',
  }),

  ex('Dumbbell Floor Press', {
    aliases: ['DB Floor Press or Bench Press', 'Dumbbell Floor Press'],
    pat: ['horizontal_push'], role: 'secondary', mech: 'compound',
    pri: ['chest', 'triceps'], sec: ['front_delts'], stab: ['abs'],
    eq: ['dumbbell'],
    sets: 3, reps: '10-12', rest: '90 sec',
    vars: ['dumbbell-bench-press'],
    tags: ['push', 'no_bench', 'tricep_emphasis'], region: 'upper_body',
  }),

  ex('Incline Bench Press', {
    pat: ['horizontal_push'], role: 'secondary', mech: 'compound',
    pri: ['upper_chest'], sec: ['triceps', 'front_delts'], stab: ['abs', 'rotator_cuff'],
    eq: ['barbell', 'incline_bench'],
    sets: 3, reps: '8-10', rest: '2 min',
    vars: ['incline-dumbbell-press'],
    tags: ['push', 'upper_chest'], region: 'upper_body',
  }),

  ex('Incline Dumbbell Press', {
    aliases: ['Incline DB Press'],
    pat: ['horizontal_push'], role: 'secondary', mech: 'compound',
    pri: ['upper_chest'], sec: ['triceps', 'front_delts'], stab: ['abs', 'rotator_cuff'],
    eq: ['dumbbell', 'incline_bench'],
    sets: 3, reps: '8-12', rest: '90 sec',
    vars: ['incline-bench-press'],
    tags: ['push', 'upper_chest', 'dumbbell'], region: 'upper_body',
  }),

  ex('Close-Grip Dumbbell Press', {
    aliases: ['Close Grip DB Press'],
    pat: ['horizontal_push'], role: 'secondary', mech: 'compound',
    pri: ['triceps', 'chest'], sec: ['front_delts'], stab: ['abs'],
    eq: ['dumbbell', 'flat_bench'],
    sets: 3, reps: '10-12', rest: '90 sec',
    tags: ['push', 'tricep_emphasis'], region: 'upper_body',
  }),

  ex('Incline Close-Grip Dumbbell Press', {
    aliases: ['Incline Close Grip DB Press'],
    pat: ['horizontal_push'], role: 'secondary', mech: 'compound',
    pri: ['upper_chest', 'triceps'], sec: ['front_delts'], stab: ['abs'],
    eq: ['dumbbell', 'incline_bench'],
    sets: 3, reps: '10-12', rest: '90 sec',
    tags: ['push', 'upper_chest', 'tricep_emphasis'], region: 'upper_body',
  }),

  ex('Push-Up', {
    aliases: ['Push-Ups', 'Push-ups', 'Slow Push-Ups × 10', 'Push-Ups × 10'],
    pat: ['horizontal_push'], role: 'secondary', mech: 'compound',
    cat: 'calisthenics',
    pri: ['chest'], sec: ['triceps', 'front_delts'], stab: ['abs', 'erector_spinae'],
    eq: ['bodyweight'], diff: 'beginner',
    track: 'reps_bodyweight', sets: 3, reps: '10-20', rest: '60 sec',
    vars: ['decline-push-up', 'hand-release-push-up'],
    tags: ['push', 'bodyweight', 'beginner_friendly'], region: 'upper_body',
  }),

  ex('Decline Push-Up', {
    aliases: ['Decline Push-Ups (Feet on Chair)'],
    pat: ['horizontal_push'], role: 'secondary', mech: 'compound',
    cat: 'calisthenics',
    pri: ['upper_chest'], sec: ['triceps', 'front_delts'], stab: ['abs'],
    eq: ['bodyweight', 'chair'],
    track: 'reps_bodyweight', sets: 3, reps: '10-15', rest: '60 sec',
    vars: ['push-up'],
    tags: ['push', 'bodyweight', 'upper_chest'], region: 'upper_body',
  }),

  ex('Hand-Release Push-Up', {
    aliases: ['Hand-Release Push-Ups'],
    pat: ['horizontal_push'], role: 'secondary', mech: 'compound',
    cat: 'calisthenics',
    pri: ['chest'], sec: ['triceps', 'front_delts', 'upper_back'], stab: ['abs'],
    eq: ['bodyweight'],
    track: 'reps_bodyweight', sets: 3, reps: '10-15', rest: '60 sec',
    vars: ['push-up'],
    tags: ['push', 'bodyweight', 'full_rom'], region: 'upper_body',
  }),

  ex('Machine Chest Press', {
    aliases: ['Chest Press Machine'],
    pat: ['horizontal_push'], role: 'secondary', mech: 'compound',
    pri: ['chest'], sec: ['triceps', 'front_delts'], stab: [],
    eq: ['chest_press_machine'],
    sets: 3, reps: '10-12', rest: '90 sec',
    alts: ['barbell-bench-press', 'dumbbell-bench-press'],
    tags: ['push', 'machine', 'beginner_friendly'], region: 'upper_body',
  }),

  ex('Dumbbell Chest Fly', {
    aliases: ['Chest Fly (Cable or Dumbbell)', 'DB Chest Fly (Floor or Bench)', 'Dumbbell Chest Fly on Floor'],
    pat: ['horizontal_adduction'], role: 'accessory', mech: 'isolation',
    pri: ['chest'], sec: ['front_delts'], stab: ['rotator_cuff'],
    eq: ['dumbbell'], optEq: ['flat_bench', 'incline_bench'],
    sets: 3, reps: '12-15', rest: '60 sec',
    vars: ['cable-chest-fly', 'machine-fly'],
    tags: ['push_accessory', 'isolation', 'chest'], region: 'upper_body',
  }),

  ex('Cable Chest Fly', {
    aliases: ['Decline Cable Chest Fly'],
    pat: ['horizontal_adduction'], role: 'accessory', mech: 'isolation',
    pri: ['chest'], sec: ['front_delts'], stab: ['abs'],
    eq: ['cable'],
    sets: 3, reps: '12-15', rest: '60 sec',
    vars: ['dumbbell-chest-fly', 'machine-fly'],
    tags: ['push_accessory', 'isolation', 'cable'], region: 'upper_body',
  }),

  ex('Machine Fly', {
    aliases: ['Pec Deck'],
    pat: ['horizontal_adduction'], role: 'accessory', mech: 'isolation',
    pri: ['chest'], sec: ['front_delts'], stab: [],
    eq: ['pec_deck'],
    sets: 3, reps: '12-15', rest: '60 sec',
    vars: ['dumbbell-chest-fly', 'cable-chest-fly'],
    tags: ['push_accessory', 'isolation', 'machine'], region: 'upper_body',
  }),

  ex('Inchworm to Push-Up', {
    pat: ['horizontal_push'], role: 'secondary', mech: 'compound',
    cat: 'calisthenics',
    pri: ['chest', 'abs'], sec: ['triceps', 'front_delts', 'hamstrings'], stab: ['erector_spinae'],
    eq: ['bodyweight'], diff: 'beginner',
    track: 'reps_bodyweight', sets: 2, reps: '8-10', rest: '60 sec',
    tags: ['warmup', 'full_body', 'bodyweight'], region: 'full_body',
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. HORIZONTAL PULL
  // ═══════════════════════════════════════════════════════════════════════════

  ex('Barbell Row', {
    aliases: ['Bent Over Barbell Row', 'Bent-Over Barbell Row'],
    pat: ['horizontal_pull'], role: 'compound', mech: 'compound',
    pri: ['lats', 'mid_back'], sec: ['biceps', 'rear_delts'], stab: ['abs', 'erector_spinae', 'grip'],
    eq: ['barbell'],
    sets: 4, reps: '6-8', rest: '2-3 min',
    vars: ['dumbbell-row', 'cable-row'],
    tags: ['pull', 'back', 'barbell'], region: 'upper_body',
  }),

  ex('Cable Row', {
    aliases: ['Seated Cable Row', 'Seated Row'],
    pat: ['horizontal_pull'], role: 'compound', mech: 'compound',
    pri: ['lats', 'mid_back'], sec: ['biceps', 'rear_delts'], stab: ['abs'],
    eq: ['cable'],
    sets: 3, reps: '10-12', rest: '90 sec',
    vars: ['barbell-row'],
    tags: ['pull', 'back', 'cable'], region: 'upper_body',
  }),

  ex('Chest-Supported Row', {
    aliases: ['Chest Supported Row', 'Machine Row / Chest-Supported Row', 'Incline DB Row or Cable Row'],
    pat: ['horizontal_pull'], role: 'secondary', mech: 'compound',
    pri: ['lats', 'mid_back'], sec: ['biceps', 'rear_delts'], stab: [],
    eq: ['dumbbell', 'incline_bench'], optEq: ['seated_row_machine'],
    sets: 3, reps: '10-12', rest: '90 sec',
    tags: ['pull', 'back', 'spine_friendly'], region: 'upper_body',
  }),

  ex('Dumbbell Row', {
    aliases: ['DB Bent-Over Row', 'Dumbbell Bent Over Row', 'Dumbbell Bent-Over Row',
             'DB Single-Arm Row', 'Dumbbell Single-Arm Row', 'Single-Arm Row', 'Dumbbell Row'],
    pat: ['horizontal_pull'], role: 'compound', mech: 'compound',
    lat: 'unilateral',
    pri: ['lats', 'mid_back'], sec: ['biceps', 'rear_delts'], stab: ['abs', 'grip'],
    eq: ['dumbbell'], optEq: ['flat_bench'],
    sets: 3, reps: '8-12 per side', rest: '90 sec',
    vars: ['barbell-row'],
    tags: ['pull', 'back', 'unilateral', 'dumbbell'], region: 'upper_body',
  }),

  ex('Dumbbell Underhand Row', {
    aliases: ['DB Underhand Row'],
    pat: ['horizontal_pull'], role: 'secondary', mech: 'compound',
    pri: ['lats', 'biceps'], sec: ['mid_back'], stab: ['abs'],
    eq: ['dumbbell'],
    sets: 3, reps: '10-12', rest: '90 sec',
    tags: ['pull', 'back', 'bicep_emphasis'], region: 'upper_body',
  }),

  ex('Single-Arm Cable Row', {
    aliases: ['Single Arm Cable Row'],
    pat: ['horizontal_pull'], role: 'secondary', mech: 'compound',
    lat: 'unilateral',
    pri: ['lats', 'mid_back'], sec: ['biceps', 'rear_delts'], stab: ['abs', 'obliques'],
    eq: ['cable'],
    sets: 3, reps: '10-12 per side', rest: '60 sec',
    tags: ['pull', 'back', 'unilateral', 'cable'], region: 'upper_body',
  }),

  ex('Low Row Machine', {
    pat: ['horizontal_pull'], role: 'secondary', mech: 'compound',
    pri: ['lats', 'mid_back'], sec: ['biceps'], stab: [],
    eq: ['low_row_machine'],
    sets: 3, reps: '10-12', rest: '90 sec',
    tags: ['pull', 'back', 'machine'], region: 'upper_body',
  }),

  ex('Backpack Row', {
    aliases: ['Backpack Bent-Over Row', 'Backpack or Towel Row'],
    pat: ['horizontal_pull'], role: 'secondary', mech: 'compound',
    pri: ['lats', 'mid_back'], sec: ['biceps'], stab: ['abs'],
    eq: ['backpack'], diff: 'beginner',
    sets: 3, reps: '12-15', rest: '60 sec',
    tags: ['pull', 'back', 'home_workout', 'beginner_friendly'], region: 'upper_body',
  }),

  ex('Renegade Row', {
    aliases: ['Dumbbell Push-ups to Renegade Row'],
    pat: ['horizontal_pull', 'anti_rotation'], role: 'secondary', mech: 'compound',
    lat: 'alternating',
    pri: ['lats', 'mid_back'], sec: ['biceps', 'chest', 'triceps'], stab: ['abs', 'obliques'],
    eq: ['dumbbell'],
    sets: 3, reps: '8-10 per side', rest: '90 sec',
    tags: ['pull', 'core', 'hybrid'], region: 'upper_body',
  }),

  ex('Face Pull', {
    aliases: ['Face Pulls', 'Cable Face Pull', 'Rope Face Pull'],
    pat: ['scapular_retraction'], role: 'accessory', mech: 'isolation',
    pri: ['rear_delts'], sec: ['rhomboids', 'rotator_cuff', 'mid_back'], stab: [],
    eq: ['cable'], optEq: ['resistance_band'],
    sets: 3, reps: '15-20', rest: '60 sec',
    tags: ['pull_accessory', 'shoulder_health', 'posture'], region: 'upper_body',
  }),

  ex('Rear Delt Fly', {
    aliases: ['Dumbbell Rear Delt Fly'],
    pat: ['scapular_retraction'], role: 'accessory', mech: 'isolation',
    pri: ['rear_delts'], sec: ['rhomboids', 'mid_back'], stab: [],
    eq: ['dumbbell'], optEq: ['cable'],
    sets: 3, reps: '12-15', rest: '60 sec',
    vars: ['rear-delt-fly-machine'],
    tags: ['pull_accessory', 'isolation'], region: 'upper_body',
  }),

  ex('Rear Delt Fly Machine', {
    pat: ['scapular_retraction'], role: 'accessory', mech: 'isolation',
    pri: ['rear_delts'], sec: ['rhomboids'], stab: [],
    eq: ['rear_delt_machine'],
    sets: 3, reps: '12-15', rest: '60 sec',
    vars: ['rear-delt-fly'],
    tags: ['pull_accessory', 'isolation', 'machine'], region: 'upper_body',
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. VERTICAL PUSH
  // ═══════════════════════════════════════════════════════════════════════════

  ex('Overhead Press', {
    aliases: ['Shoulder Press'],
    pat: ['vertical_push'], role: 'compound', mech: 'compound',
    pri: ['front_delts', 'side_delts'], sec: ['triceps'], stab: ['abs', 'upper_back'],
    eq: ['barbell', 'squat_rack'],
    sets: 4, reps: '5-8', rest: '2-3 min',
    vars: ['dumbbell-shoulder-press', 'push-press'],
    tags: ['press', 'overhead', 'barbell'], region: 'upper_body',
  }),

  ex('Dumbbell Shoulder Press', {
    aliases: ['DB Shoulder Press', 'Seated Dumbbell Shoulder Press'],
    pat: ['vertical_push'], role: 'compound', mech: 'compound',
    pri: ['front_delts', 'side_delts'], sec: ['triceps'], stab: ['abs', 'rotator_cuff'],
    eq: ['dumbbell'], optEq: ['flat_bench'],
    sets: 3, reps: '8-12', rest: '2 min',
    vars: ['overhead-press', 'arnold-press'],
    tags: ['press', 'overhead', 'dumbbell'], region: 'upper_body',
  }),

  ex('Arnold Press', {
    aliases: ['DB Arnold Press'],
    pat: ['vertical_push'], role: 'compound', mech: 'compound',
    pri: ['front_delts', 'side_delts'], sec: ['triceps'], stab: ['abs', 'rotator_cuff'],
    eq: ['dumbbell'],
    sets: 3, reps: '8-12', rest: '90 sec',
    vars: ['dumbbell-shoulder-press'],
    tags: ['press', 'overhead', 'rotation'], region: 'upper_body',
  }),

  ex('Push Press', {
    aliases: ['Push-Press', 'Dumbbell Push Press'],
    pat: ['vertical_push'], role: 'compound', mech: 'compound',
    pri: ['front_delts', 'side_delts'], sec: ['triceps', 'quads', 'glutes'], stab: ['abs'],
    eq: ['barbell'], optEq: ['dumbbell'],
    sets: 4, reps: '5-6', rest: '2-3 min',
    vars: ['overhead-press'],
    tags: ['press', 'overhead', 'power', 'explosive'], region: 'upper_body',
  }),

  ex('Machine Shoulder Press', {
    pat: ['vertical_push'], role: 'secondary', mech: 'compound',
    pri: ['front_delts', 'side_delts'], sec: ['triceps'], stab: [],
    eq: ['shoulder_press_machine'],
    sets: 3, reps: '10-12', rest: '90 sec',
    alts: ['dumbbell-shoulder-press'],
    tags: ['press', 'overhead', 'machine'], region: 'upper_body',
  }),

  ex('Pike Shoulder Press', {
    pat: ['vertical_push'], role: 'secondary', mech: 'compound',
    cat: 'calisthenics',
    pri: ['front_delts', 'side_delts'], sec: ['triceps'], stab: ['abs'],
    eq: ['bodyweight'], diff: 'beginner',
    track: 'reps_bodyweight', sets: 3, reps: '8-12', rest: '90 sec',
    alts: ['dumbbell-shoulder-press'],
    tags: ['press', 'overhead', 'bodyweight'], region: 'upper_body',
  }),

  ex('Dumbbell Lateral Raise', {
    aliases: ['DB Lateral Raises', 'Cable Lateral Raise', 'Side Lateral Raises', 'Dumbbell Lateral Raise'],
    pat: ['shoulder_abduction'], role: 'accessory', mech: 'isolation',
    pri: ['side_delts'], sec: ['traps'], stab: ['rotator_cuff'],
    eq: ['dumbbell'], optEq: ['cable'],
    sets: 3, reps: '12-20', rest: '60 sec',
    vars: ['lateral-raise-machine'],
    tags: ['shoulder', 'isolation', 'accessory'], region: 'upper_body',
  }),

  ex('Lateral Raise Machine', {
    pat: ['shoulder_abduction'], role: 'accessory', mech: 'isolation',
    pri: ['side_delts'], sec: ['traps'], stab: [],
    eq: ['lateral_raise_machine'],
    sets: 3, reps: '12-15', rest: '60 sec',
    vars: ['dumbbell-lateral-raise'],
    tags: ['shoulder', 'isolation', 'machine'], region: 'upper_body',
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. VERTICAL PULL
  // ═══════════════════════════════════════════════════════════════════════════

  ex('Pull-Up', {
    aliases: ['Pull-ups (or Assisted)', 'Pull-ups (or Lat Pulldown)', 'Weighted Pull-Up or Pulldown'],
    pat: ['vertical_pull'], role: 'compound', mech: 'compound',
    pri: ['lats'], sec: ['biceps', 'rear_delts', 'mid_back'], stab: ['abs', 'grip'],
    eq: ['pull_up_bar'], optEq: ['resistance_band'],
    track: 'reps_bodyweight', sets: 3, reps: '6-10', rest: '2 min',
    vars: ['lat-pulldown'],
    tags: ['pull', 'vertical', 'bodyweight'], region: 'upper_body',
  }),

  ex('Lat Pulldown', {
    aliases: ['Lat Pulldowns', 'Close Grip Lat Pulldown'],
    pat: ['vertical_pull'], role: 'secondary', mech: 'compound',
    pri: ['lats'], sec: ['biceps', 'rear_delts', 'mid_back'], stab: ['abs'],
    eq: ['lat_pulldown'],
    sets: 3, reps: '10-12', rest: '90 sec',
    vars: ['pull-up'],
    tags: ['pull', 'vertical', 'machine'], region: 'upper_body',
  }),

  ex('Cable Pullover', {
    aliases: ['Cable Pullovers'],
    pat: ['vertical_pull'], role: 'accessory', mech: 'isolation',
    pri: ['lats'], sec: ['chest', 'triceps'], stab: ['abs'],
    eq: ['cable'],
    sets: 3, reps: '12-15', rest: '60 sec',
    tags: ['pull_accessory', 'isolation', 'cable'], region: 'upper_body',
  }),

  ex('Diagonal Cable Pulldown', {
    aliases: ['Diagonal Single Arm Cable Pull Downs'],
    pat: ['vertical_pull'], role: 'accessory', mech: 'compound',
    lat: 'unilateral',
    pri: ['lats'], sec: ['biceps', 'rear_delts'], stab: ['abs', 'obliques'],
    eq: ['cable'],
    sets: 3, reps: '10-12 per side', rest: '60 sec',
    tags: ['pull', 'unilateral', 'cable'], region: 'upper_body',
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. CARRY (Loaded Locomotion)
  // ═══════════════════════════════════════════════════════════════════════════

  ex('Suitcase Carry', {
    aliases: ['Dumbbell Suitcase Carry'],
    pat: ['carry', 'anti_lateral_flexion'], role: 'compound', mech: 'compound',
    lat: 'unilateral',
    pri: ['grip', 'obliques'], sec: ['traps', 'forearms'], stab: ['abs', 'erector_spinae'],
    eq: ['dumbbell'], optEq: ['kettlebell'],
    track: 'time', duration: '30-60 sec per side',
    sets: 3, rest: '60 sec',
    tags: ['carry', 'core', 'grip_strength', 'functional'], region: 'full_body',
  }),

  ex('Farmer Carry', {
    aliases: ['Farmer Walk', 'Kettlebell Carry Circuit'],
    pat: ['carry'], role: 'compound', mech: 'compound',
    pri: ['grip', 'traps'], sec: ['forearms', 'abs'], stab: ['erector_spinae', 'glutes'],
    eq: ['dumbbell'], optEq: ['kettlebell', 'trap_bar'],
    track: 'time', duration: '30-60 sec',
    sets: 3, rest: '90 sec',
    vars: ['suitcase-carry'],
    tags: ['carry', 'grip_strength', 'full_body', 'functional'], region: 'full_body',
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. ROTATION
  // ═══════════════════════════════════════════════════════════════════════════

  ex('Cable Woodchopper', {
    aliases: ['DB Woodchoppers × 15 per side'],
    pat: ['rotation'], role: 'accessory', mech: 'compound',
    lat: 'unilateral',
    pri: ['obliques'], sec: ['abs', 'front_delts'], stab: ['hip_flexors', 'glutes'],
    eq: ['cable'], optEq: ['dumbbell', 'medicine_ball'],
    sets: 3, reps: '12-15 per side', rest: '60 sec',
    tags: ['core', 'rotation', 'functional'], region: 'core',
  }),

  ex('Russian Twist', {
    aliases: ['Russian Twists', 'Russian Twists × 40', 'Russian Twists (with DB) × 40', 'Dumbbell Russian Twist'],
    pat: ['rotation'], role: 'accessory', mech: 'compound',
    lat: 'alternating',
    pri: ['obliques'], sec: ['abs', 'hip_flexors'], stab: [],
    eq: ['bodyweight'], optEq: ['dumbbell', 'medicine_ball'],
    track: 'reps_bodyweight', sets: 3, reps: '20 per side', rest: '60 sec',
    tags: ['core', 'rotation'], region: 'core',
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. CORE STABILITY (Anti-Movement)
  // ═══════════════════════════════════════════════════════════════════════════

  ex('Plank', {
    aliases: ['Plank × 45 sec', 'Plank × 60 sec'],
    pat: ['anti_extension'], role: 'accessory', mech: 'n/a',
    pri: ['abs', 'transverse_abdominis'], sec: ['obliques'], stab: ['erector_spinae', 'glutes', 'front_delts'],
    eq: ['bodyweight'], diff: 'beginner',
    track: 'time', duration: '30-60 sec',
    sets: 3, rest: '45 sec',
    tags: ['core', 'stability', 'isometric', 'beginner_friendly'], region: 'core',
  }),

  ex('Side Plank', {
    aliases: ['Side Plank × 30 sec per side'],
    pat: ['anti_lateral_flexion'], role: 'accessory', mech: 'n/a',
    lat: 'unilateral',
    pri: ['obliques'], sec: ['abs', 'glutes'], stab: ['erector_spinae'],
    eq: ['bodyweight'], diff: 'beginner',
    track: 'time', duration: '30 sec per side',
    sets: 3, rest: '30 sec',
    tags: ['core', 'stability', 'isometric'], region: 'core',
  }),

  ex('Dead Bug', {
    aliases: ['Deadbug × 20'],
    pat: ['anti_extension'], role: 'accessory', mech: 'n/a',
    lat: 'alternating',
    pri: ['abs', 'transverse_abdominis'], sec: ['hip_flexors'], stab: ['obliques'],
    eq: ['bodyweight'], diff: 'beginner',
    track: 'reps_bodyweight', sets: 3, reps: '10-12 per side', rest: '45 sec',
    tags: ['core', 'stability', 'beginner_friendly'], region: 'core',
  }),

  ex('Hollow Hold', {
    aliases: ['Hollow Hold × 30 sec'],
    pat: ['anti_extension'], role: 'accessory', mech: 'n/a',
    pri: ['abs', 'transverse_abdominis'], sec: ['hip_flexors'], stab: ['obliques'],
    eq: ['bodyweight'],
    track: 'time', duration: '20-30 sec',
    sets: 3, rest: '30 sec',
    tags: ['core', 'stability', 'gymnastics'], region: 'core',
  }),

  // ── Direct Core Work (not strictly anti-movement but essential) ────────

  ex('Cable Crunch', {
    pat: ['n/a'], role: 'accessory', mech: 'isolation',
    pri: ['abs'], sec: ['obliques'], stab: [],
    eq: ['cable'],
    sets: 3, reps: '12-15', rest: '60 sec',
    tags: ['core', 'isolation', 'cable'], region: 'core',
  }),

  ex('Cable Side Bend', {
    pat: ['n/a'], role: 'accessory', mech: 'isolation',
    lat: 'unilateral',
    pri: ['obliques'], sec: ['abs'], stab: [],
    eq: ['cable'],
    sets: 3, reps: '12-15 per side', rest: '60 sec',
    tags: ['core', 'isolation', 'cable'], region: 'core',
  }),

  ex('Hanging Knee Raise', {
    pat: ['n/a'], role: 'accessory', mech: 'isolation',
    pri: ['abs', 'hip_flexors'], sec: ['obliques'], stab: ['grip', 'forearms'],
    eq: ['pull_up_bar'],
    sets: 3, reps: '10-15', rest: '60 sec',
    tags: ['core', 'hanging'], region: 'core',
  }),

  ex('Bicycle Crunch', {
    aliases: ['Bicycle Crunches', 'Bicycle Crunches × 40'],
    pat: ['rotation'], role: 'accessory', mech: 'isolation',
    lat: 'alternating',
    pri: ['obliques', 'abs'], sec: ['hip_flexors'], stab: [],
    eq: ['bodyweight'], diff: 'beginner',
    track: 'reps_bodyweight', sets: 3, reps: '20 per side', rest: '45 sec',
    tags: ['core', 'bodyweight'], region: 'core',
  }),

  ex('Leg Raise', {
    aliases: ['Leg Raises × 15'],
    pat: ['n/a'], role: 'accessory', mech: 'isolation',
    pri: ['abs', 'hip_flexors'], sec: ['obliques'], stab: [],
    eq: ['bodyweight'], optEq: ['exercise_mat'],
    track: 'reps_bodyweight', sets: 3, reps: '12-15', rest: '45 sec',
    tags: ['core', 'bodyweight'], region: 'core',
  }),

  ex('Toe Touch', {
    aliases: ['Toe Touches', 'Toe Touches × 20'],
    pat: ['n/a'], role: 'accessory', mech: 'isolation',
    pri: ['abs'], sec: [], stab: [],
    eq: ['bodyweight'], diff: 'beginner',
    track: 'reps_bodyweight', sets: 3, reps: '15-20', rest: '30 sec',
    tags: ['core', 'bodyweight', 'beginner_friendly'], region: 'core',
  }),

  ex('V-Up', {
    aliases: ['V-Ups', 'V-Ups × 12'],
    pat: ['n/a'], role: 'accessory', mech: 'isolation',
    pri: ['abs', 'hip_flexors'], sec: ['obliques'], stab: [],
    eq: ['bodyweight'],
    track: 'reps_bodyweight', sets: 3, reps: '10-15', rest: '45 sec',
    tags: ['core', 'bodyweight'], region: 'core',
  }),

  ex('Reverse Crunch', {
    pat: ['n/a'], role: 'accessory', mech: 'isolation',
    pri: ['abs'], sec: ['hip_flexors'], stab: [],
    eq: ['bodyweight'], diff: 'beginner',
    track: 'reps_bodyweight', sets: 3, reps: '12-15', rest: '45 sec',
    tags: ['core', 'bodyweight', 'beginner_friendly'], region: 'core',
  }),

  ex('Flutter Kick', {
    aliases: ['Flutter Kicks × 40'],
    pat: ['n/a'], role: 'accessory', mech: 'isolation',
    lat: 'alternating',
    pri: ['abs', 'hip_flexors'], sec: [], stab: [],
    eq: ['bodyweight'], diff: 'beginner',
    track: 'reps_bodyweight', sets: 3, reps: '20 per side', rest: '30 sec',
    tags: ['core', 'bodyweight'], region: 'core',
  }),

  ex('Heel Tap', {
    aliases: ['Heel Taps × 30'],
    pat: ['n/a'], role: 'accessory', mech: 'isolation',
    lat: 'alternating',
    pri: ['obliques'], sec: ['abs'], stab: [],
    eq: ['bodyweight'], diff: 'beginner',
    track: 'reps_bodyweight', sets: 3, reps: '15 per side', rest: '30 sec',
    tags: ['core', 'bodyweight', 'beginner_friendly'], region: 'core',
  }),

  ex('Mountain Climber', {
    aliases: ['Mountain Climbers'],
    pat: ['anti_extension'], role: 'accessory', mech: 'compound',
    lat: 'alternating', cat: 'conditioning',
    pri: ['abs', 'hip_flexors'], sec: ['quads', 'front_delts'], stab: ['obliques'],
    eq: ['bodyweight'], diff: 'beginner',
    track: 'reps_bodyweight', sets: 3, reps: '20 per side', rest: '30 sec',
    tags: ['core', 'conditioning', 'bodyweight'], region: 'core',
  }),

  ex('Crunch', {
    aliases: ['DB Crunch × 20'],
    pat: ['n/a'], role: 'accessory', mech: 'isolation',
    pri: ['abs'], sec: [], stab: [],
    eq: ['bodyweight'], optEq: ['dumbbell'], diff: 'beginner',
    track: 'reps_bodyweight', sets: 3, reps: '15-20', rest: '30 sec',
    tags: ['core', 'bodyweight', 'beginner_friendly'], region: 'core',
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // ELBOW FLEXION (Biceps Accessories)
  // ═══════════════════════════════════════════════════════════════════════════

  ex('Barbell Curl', {
    pat: ['elbow_flexion'], role: 'accessory', mech: 'isolation',
    pri: ['biceps'], sec: ['brachialis', 'forearms'], stab: [],
    eq: ['barbell'],
    sets: 3, reps: '10-12', rest: '60 sec',
    vars: ['ez-bar-curl', 'dumbbell-curl'],
    tags: ['arms', 'biceps', 'isolation'], region: 'upper_body',
  }),

  ex('Dumbbell Curl', {
    aliases: ['DB Curls', 'Dumbbell Bicep Curl', 'Dumbbell Biceps Curl', 'DB Biceps Burnout'],
    pat: ['elbow_flexion'], role: 'accessory', mech: 'isolation',
    pri: ['biceps'], sec: ['brachialis'], stab: [],
    eq: ['dumbbell'],
    sets: 3, reps: '10-12', rest: '60 sec',
    vars: ['hammer-curl', 'barbell-curl'],
    tags: ['arms', 'biceps', 'isolation', 'dumbbell'], region: 'upper_body',
  }),

  ex('Hammer Curl', {
    aliases: ['Hammer Curls', 'DB Hammer Curls'],
    pat: ['elbow_flexion'], role: 'accessory', mech: 'isolation',
    pri: ['brachialis', 'biceps'], sec: ['forearms'], stab: [],
    eq: ['dumbbell'],
    sets: 3, reps: '10-12', rest: '60 sec',
    vars: ['dumbbell-curl'],
    tags: ['arms', 'biceps', 'brachialis', 'isolation'], region: 'upper_body',
  }),

  ex('Cable Curl', {
    aliases: ['Bicep Cable Curl'],
    pat: ['elbow_flexion'], role: 'accessory', mech: 'isolation',
    pri: ['biceps'], sec: ['brachialis'], stab: [],
    eq: ['cable'],
    sets: 3, reps: '12-15', rest: '60 sec',
    tags: ['arms', 'biceps', 'isolation', 'cable'], region: 'upper_body',
  }),

  ex('EZ-Bar Curl', {
    aliases: ['EZ Bar Curl'],
    pat: ['elbow_flexion'], role: 'accessory', mech: 'isolation',
    pri: ['biceps'], sec: ['brachialis', 'forearms'], stab: [],
    eq: ['ez_bar'],
    sets: 3, reps: '10-12', rest: '60 sec',
    vars: ['barbell-curl'],
    tags: ['arms', 'biceps', 'isolation'], region: 'upper_body',
  }),

  ex('Preacher Curl', {
    aliases: ['Preacher Curl Machine'],
    pat: ['elbow_flexion'], role: 'accessory', mech: 'isolation',
    pri: ['biceps'], sec: ['brachialis'], stab: [],
    eq: ['preacher_curl_machine'], optEq: ['ez_bar', 'dumbbell'],
    sets: 3, reps: '10-12', rest: '60 sec',
    tags: ['arms', 'biceps', 'isolation', 'machine'], region: 'upper_body',
  }),

  ex('Reverse Curl', {
    pat: ['elbow_flexion'], role: 'accessory', mech: 'isolation',
    pri: ['brachialis', 'forearms'], sec: ['biceps'], stab: [],
    eq: ['barbell'], optEq: ['ez_bar', 'dumbbell'],
    sets: 3, reps: '12-15', rest: '60 sec',
    tags: ['arms', 'forearms', 'isolation'], region: 'upper_body',
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // ELBOW EXTENSION (Triceps Accessories)
  // ═══════════════════════════════════════════════════════════════════════════

  ex('Cable Tricep Pushdown', {
    aliases: ['Cable Tricep Pushdown', 'Cable Triceps Pressdown', 'Tricep Cable Pushdowns',
             'Tricep Pushdowns', 'Tricep Rope Pressdown'],
    pat: ['elbow_extension'], role: 'accessory', mech: 'isolation',
    pri: ['triceps'], sec: [], stab: [],
    eq: ['cable'],
    sets: 3, reps: '12-15', rest: '60 sec',
    vars: ['overhead-tricep-extension', 'skull-crusher'],
    tags: ['arms', 'triceps', 'isolation', 'cable'], region: 'upper_body',
  }),

  ex('Overhead Tricep Extension', {
    aliases: ['Overhead Triceps Extension', 'DB Overhead Tricep Extension', 'Dumbbell Triceps Overhead Extension'],
    pat: ['elbow_extension'], role: 'accessory', mech: 'isolation',
    pri: ['triceps'], sec: [], stab: ['abs'],
    eq: ['dumbbell'], optEq: ['cable', 'ez_bar'],
    sets: 3, reps: '10-12', rest: '60 sec',
    vars: ['cable-tricep-pushdown'],
    tags: ['arms', 'triceps', 'isolation', 'long_head'], region: 'upper_body',
  }),

  ex('Skull Crusher', {
    aliases: ['Skull Crushers', 'DB Skull Crushers'],
    pat: ['elbow_extension'], role: 'accessory', mech: 'isolation',
    pri: ['triceps'], sec: [], stab: ['front_delts'],
    eq: ['ez_bar', 'flat_bench'], optEq: ['dumbbell', 'barbell'],
    sets: 3, reps: '10-12', rest: '60 sec',
    vars: ['cable-tricep-pushdown', 'overhead-tricep-extension'],
    tags: ['arms', 'triceps', 'isolation'], region: 'upper_body',
  }),

  ex('Tricep Dip', {
    aliases: ['Chair Tricep Dips'],
    pat: ['elbow_extension', 'horizontal_push'], role: 'secondary', mech: 'compound',
    pri: ['triceps'], sec: ['chest', 'front_delts'], stab: ['abs'],
    eq: ['dip_station'], optEq: ['chair'],
    track: 'reps_bodyweight', sets: 3, reps: '8-12', rest: '90 sec',
    tags: ['arms', 'triceps', 'bodyweight', 'push'], region: 'upper_body',
  }),

  ex('Tricep Cable Kickback', {
    aliases: ['Single Arm Cable Kickbacks', 'Tricep Cable Kickbacks'],
    pat: ['elbow_extension'], role: 'accessory', mech: 'isolation',
    lat: 'unilateral',
    pri: ['triceps'], sec: [], stab: ['rear_delts'],
    eq: ['cable'],
    sets: 3, reps: '12-15 per side', rest: '60 sec',
    tags: ['arms', 'triceps', 'isolation', 'cable'], region: 'upper_body',
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // ANKLE FLEXION (Calves)
  // ═══════════════════════════════════════════════════════════════════════════

  ex('Standing Calf Raise', {
    aliases: ['Standing Calf Raise (with DBs)', 'Standing or Seated Calf Raise', 'DB Calf Raises'],
    pat: ['ankle_flexion'], role: 'accessory', mech: 'isolation',
    pri: ['calves'], sec: [], stab: [],
    eq: ['calf_raise_machine'], optEq: ['dumbbell', 'bodyweight', 'smith_machine'],
    sets: 3, reps: '12-20', rest: '60 sec',
    vars: ['seated-calf-raise'],
    tags: ['calves', 'isolation'], region: 'lower_body',
  }),

  ex('Seated Calf Raise', {
    aliases: ['Seated Calf Raise Machine'],
    pat: ['ankle_flexion'], role: 'accessory', mech: 'isolation',
    pri: ['calves'], sec: [], stab: [],
    eq: ['calf_raise_machine'],
    sets: 3, reps: '15-20', rest: '60 sec',
    vars: ['standing-calf-raise'],
    tags: ['calves', 'isolation', 'machine'], region: 'lower_body',
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // HIP ACCESSORIES
  // ═══════════════════════════════════════════════════════════════════════════

  ex('Hip Abduction Machine', {
    pat: ['n/a'], role: 'accessory', mech: 'isolation',
    pri: ['abductors', 'glutes'], sec: [], stab: [],
    eq: ['hip_abduction_machine'],
    sets: 3, reps: '15-20', rest: '60 sec',
    tags: ['hip', 'isolation', 'machine'], region: 'lower_body',
  }),

  ex('Hip Adduction Machine', {
    aliases: ['Hip Adductor Machine'],
    pat: ['n/a'], role: 'accessory', mech: 'isolation',
    pri: ['adductors'], sec: [], stab: [],
    eq: ['hip_adduction_machine'],
    sets: 3, reps: '15-20', rest: '60 sec',
    tags: ['hip', 'isolation', 'machine'], region: 'lower_body',
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // MISC UPPER BODY
  // ═══════════════════════════════════════════════════════════════════════════

  ex('Dumbbell Shrug', {
    aliases: ['DB Shrugs'],
    pat: ['n/a'], role: 'accessory', mech: 'isolation',
    pri: ['traps'], sec: ['forearms'], stab: [],
    eq: ['dumbbell'], optEq: ['barbell'],
    sets: 3, reps: '12-15', rest: '60 sec',
    tags: ['traps', 'isolation'], region: 'upper_body',
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // POWER / EXPLOSIVE
  // ═══════════════════════════════════════════════════════════════════════════

  ex('Dumbbell Snatch', {
    pat: ['triple_extension'], role: 'compound', mech: 'compound',
    cat: 'power', lat: 'unilateral',
    pri: ['glutes', 'hamstrings', 'front_delts'], sec: ['quads', 'traps', 'triceps'], stab: ['abs', 'grip'],
    eq: ['dumbbell'],
    sets: 4, reps: '5 per side', rest: '90 sec',
    tags: ['power', 'explosive', 'full_body', 'olympic'], region: 'full_body',
  }),

  ex('Dumbbell Thruster', {
    aliases: ['Dumbbell Thrusters'],
    pat: ['squat', 'vertical_push'], role: 'compound', mech: 'compound',
    cat: 'strength',
    pri: ['quads', 'front_delts'], sec: ['glutes', 'triceps'], stab: ['abs'],
    eq: ['dumbbell'], optEq: ['barbell'],
    sets: 3, reps: '10-12', rest: '90 sec',
    tags: ['hybrid', 'functional', 'conditioning'], region: 'full_body',
  }),

  ex('Kettlebell Swing', {
    aliases: ['Kettlebell Swings'],
    pat: ['hinge'], role: 'compound', mech: 'compound',
    cat: 'power',
    pri: ['glutes', 'hamstrings'], sec: ['abs', 'front_delts'], stab: ['grip', 'erector_spinae'],
    eq: ['kettlebell'],
    sets: 4, reps: '15-20', rest: '60 sec',
    tags: ['power', 'explosive', 'hinge', 'conditioning'], region: 'full_body',
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // CONDITIONING / CARDIO
  // ═══════════════════════════════════════════════════════════════════════════

  ex('Assault Bike Intervals', {
    aliases: ['Intervals'],
    pat: ['gait'], role: 'compound', mech: 'compound',
    cat: 'conditioning',
    pri: ['quads', 'hamstrings', 'glutes'], sec: ['calves', 'front_delts', 'biceps'], stab: ['abs'],
    eq: ['assault_bike'],
    track: 'intervals',
    tags: ['conditioning', 'hiit', 'cardio'], region: 'full_body',
  }),

  ex('Bike Sprint', {
    aliases: ['Bike Sprint Pyramid', '8-10 min steady bike'],
    pat: ['gait'], role: 'secondary', mech: 'compound',
    cat: 'cardio',
    pri: ['quads', 'hamstrings', 'glutes'], sec: ['calves'], stab: [],
    eq: ['stationary_bike'],
    track: 'time_distance',
    cardio: { trackDistance: true, trackPace: true, trackCalories: true, trackHeartRate: true, trackIncline: false, trackResistance: true, trackCadence: true },
    tags: ['cardio', 'conditioning', 'bike'], region: 'lower_body',
  }),

  ex('Incline Treadmill Walk', {
    aliases: ['10 min incline walk or bike', '10-12 min incline treadmill walk',
             '8-10 min incline treadmill walk', 'Treadmill Incline Power Walk'],
    pat: ['gait'], role: 'secondary', mech: 'compound',
    cat: 'cardio',
    pri: ['glutes', 'hamstrings', 'calves'], sec: ['quads'], stab: ['abs'],
    eq: ['treadmill'],
    track: 'time_distance',
    cardio: { trackDistance: true, trackPace: true, trackCalories: true, trackHeartRate: true, trackIncline: true, trackResistance: false, trackCadence: false },
    tags: ['cardio', 'low_impact', 'glute_builder'], region: 'lower_body',
  }),

  ex('Rowing Machine Sprint', {
    aliases: ['Rowing Machine Sprints'],
    pat: ['horizontal_pull', 'hinge'], role: 'compound', mech: 'compound',
    cat: 'conditioning',
    pri: ['lats', 'quads', 'glutes'], sec: ['biceps', 'hamstrings', 'abs'], stab: ['grip'],
    eq: ['rowing_machine'],
    track: 'time_distance',
    cardio: { trackDistance: true, trackPace: true, trackCalories: true, trackHeartRate: true, trackIncline: false, trackResistance: true, trackCadence: false },
    tags: ['conditioning', 'hiit', 'full_body'], region: 'full_body',
  }),

  ex('Stair Climber', {
    aliases: ['Stairmaster', 'Stair Master', 'StairMaster', 'Stepmill', 'Stair Mill'],
    pat: ['gait'], role: 'secondary', mech: 'compound',
    cat: 'cardio',
    pri: ['quads', 'glutes', 'calves'], sec: ['hamstrings'], stab: ['abs'],
    eq: ['stair_climber'],
    track: 'time_distance',
    cardio: { trackDistance: true, trackPace: false, trackCalories: true, trackHeartRate: true, trackIncline: false, trackResistance: true, trackCadence: true },
    tags: ['cardio', 'low_impact', 'glute_builder', 'stairs'], region: 'lower_body',
  }),

  ex('Elliptical', {
    aliases: ['Elliptical Trainer', 'Cross Trainer'],
    pat: ['gait'], role: 'secondary', mech: 'compound',
    cat: 'cardio', diff: 'beginner',
    pri: ['quads', 'glutes', 'hamstrings'], sec: ['calves', 'front_delts'], stab: ['abs'],
    eq: ['elliptical'],
    track: 'time_distance',
    cardio: { trackDistance: true, trackPace: true, trackCalories: true, trackHeartRate: true, trackIncline: false, trackResistance: true, trackCadence: true },
    tags: ['cardio', 'low_impact', 'full_body'], region: 'full_body',
  }),

  ex('Burpee', {
    aliases: ['Burpees'],
    pat: ['squat', 'horizontal_push'], role: 'compound', mech: 'compound',
    cat: 'conditioning', diff: 'beginner',
    pri: ['full_body'], sec: [], stab: ['abs'],
    eq: ['bodyweight'],
    track: 'reps_bodyweight', sets: 3, reps: '10-15', rest: '60 sec',
    tags: ['conditioning', 'bodyweight', 'full_body'], region: 'full_body',
  }),

  ex('Squat Jump', {
    aliases: ['Jump Squat', 'Squat Jumps'],
    pat: ['squat'], role: 'secondary', mech: 'compound',
    cat: 'plyometric', diff: 'beginner',
    pri: ['quads', 'glutes'], sec: ['calves', 'hamstrings'], stab: ['abs'],
    eq: ['bodyweight'],
    track: 'reps_bodyweight', sets: 3, reps: '10-12', rest: '60 sec',
    tags: ['plyometric', 'explosive', 'bodyweight'], region: 'lower_body',
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // WARMUP EXERCISES
  // ═══════════════════════════════════════════════════════════════════════════

  ex('Arm Circle', {
    aliases: ['Arm Circles & Band Pull-Aparts', 'Arm Circles × 30 sec'],
    pat: ['n/a'], role: 'accessory', mech: 'n/a',
    cat: 'warmup', diff: 'beginner',
    pri: ['rotator_cuff', 'front_delts'], sec: ['side_delts'], stab: [],
    eq: ['bodyweight'],
    track: 'time', duration: '30 sec',
    tags: ['warmup', 'mobility', 'shoulder'], region: 'upper_body',
  }),

  ex('Scap Push-Up', {
    aliases: ['Scap Push-Ups × 12', 'Scap Push-Ups × 15'],
    pat: ['scapular_retraction'], role: 'accessory', mech: 'isolation',
    cat: 'warmup', diff: 'beginner',
    pri: ['rhomboids', 'mid_back'], sec: ['front_delts'], stab: ['abs'],
    eq: ['bodyweight'],
    track: 'reps_bodyweight', sets: 2, reps: '12-15',
    tags: ['warmup', 'shoulder_health', 'scapular'], region: 'upper_body',
  }),

  ex('High Knee', {
    aliases: ['High Knees × 30 sec'],
    pat: ['gait'], role: 'accessory', mech: 'compound',
    cat: 'warmup', diff: 'beginner',
    pri: ['hip_flexors', 'quads'], sec: ['calves', 'abs'], stab: [],
    eq: ['bodyweight'],
    track: 'time', duration: '30 sec',
    tags: ['warmup', 'cardio', 'bodyweight'], region: 'lower_body',
  }),

  ex('Jumping Jack', {
    aliases: ['Jumping Jacks', 'Jumping Jacks × 30'],
    pat: ['n/a'], role: 'accessory', mech: 'compound',
    cat: 'warmup', diff: 'beginner',
    pri: ['calves', 'front_delts'], sec: ['quads', 'side_delts'], stab: [],
    eq: ['bodyweight'],
    track: 'reps_bodyweight', reps: '30',
    tags: ['warmup', 'cardio', 'bodyweight'], region: 'full_body',
  }),

  ex('Jump Rope', {
    aliases: ['Light Jog or Jump Rope'],
    pat: ['gait'], role: 'accessory', mech: 'compound',
    cat: 'warmup', diff: 'beginner',
    pri: ['calves'], sec: ['quads', 'forearms'], stab: ['abs'],
    eq: ['jump_rope'],
    track: 'time', duration: '3-5 min',
    tags: ['warmup', 'cardio', 'coordination'], region: 'full_body',
  }),

  ex('Dynamic Stretch', {
    aliases: ['Dynamic Stretching', 'Dynamic Warm-up', 'Mobility Flow', 'Mobility Flow × 1 minute'],
    pat: ['n/a'], role: 'accessory', mech: 'n/a',
    cat: 'warmup', diff: 'beginner',
    pri: ['full_body'], sec: [], stab: [],
    eq: ['bodyweight'],
    track: 'time', duration: '3-5 min',
    tags: ['warmup', 'mobility', 'flexibility'], region: 'full_body',
  }),

  ex('Hip Circle', {
    aliases: ['Hip CARs & Bodyweight Lunges', 'Hip Airplanes × 20', 'Hip Mobility × 20 sec each',
             'Hip Mobility Flow × 30 sec each', 'Hip Hinge Flow × 30 sec'],
    pat: ['n/a'], role: 'accessory', mech: 'n/a',
    cat: 'mobility', diff: 'beginner',
    pri: ['hip_flexors', 'glutes'], sec: ['adductors', 'abductors'], stab: [],
    eq: ['bodyweight'],
    track: 'time', duration: '30-60 sec',
    tags: ['warmup', 'mobility', 'hip'], region: 'lower_body',
  }),

  ex('Band Pull-Apart', {
    aliases: ['Band Dislocates & Push-ups'],
    pat: ['scapular_retraction'], role: 'accessory', mech: 'isolation',
    cat: 'warmup', diff: 'beginner',
    pri: ['rear_delts', 'rhomboids'], sec: ['mid_back', 'rotator_cuff'], stab: [],
    eq: ['resistance_band'],
    track: 'reps_bodyweight', reps: '15-20',
    tags: ['warmup', 'shoulder_health', 'posture'], region: 'upper_body',
  }),

  ex('Shoulder Opener', {
    aliases: ['DB Shoulder Openers × 20'],
    pat: ['n/a'], role: 'accessory', mech: 'n/a',
    cat: 'warmup', diff: 'beginner',
    pri: ['rotator_cuff', 'front_delts'], sec: ['side_delts'], stab: [],
    eq: ['dumbbell'], optEq: ['bodyweight'],
    track: 'reps_bodyweight', reps: '15-20',
    tags: ['warmup', 'mobility', 'shoulder'], region: 'upper_body',
  }),

  ex('Light Dumbbell Floor Press', {
    aliases: ['Light DB Floor Press × 15'],
    pat: ['horizontal_push'], role: 'accessory', mech: 'compound',
    cat: 'warmup', diff: 'beginner',
    pri: ['chest', 'triceps'], sec: ['front_delts'], stab: ['abs'],
    eq: ['dumbbell'],
    track: 'reps_weight', reps: '15',
    tags: ['warmup', 'activation'], region: 'upper_body',
  }),

  ex('Light Dumbbell RDL to Upright Row', {
    aliases: ['Light DB RDL → Upright Row × 15'],
    pat: ['hinge', 'vertical_pull'], role: 'accessory', mech: 'compound',
    cat: 'warmup', diff: 'beginner',
    pri: ['hamstrings', 'traps'], sec: ['glutes', 'side_delts'], stab: ['abs'],
    eq: ['dumbbell'],
    track: 'reps_weight', reps: '15',
    tags: ['warmup', 'activation', 'combo'], region: 'full_body',
  }),

  ex('Bike Warmup', {
    aliases: ['Bike or Rower'],
    pat: ['gait'], role: 'accessory', mech: 'compound',
    cat: 'warmup', diff: 'beginner',
    pri: ['quads', 'hamstrings'], sec: ['calves'], stab: [],
    eq: ['stationary_bike'], optEq: ['rowing_machine'],
    track: 'time', duration: '5 min',
    tags: ['warmup', 'cardio', 'low_impact'], region: 'lower_body',
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // COOLDOWN
  // ═══════════════════════════════════════════════════════════════════════════

  ex('Foam Rolling', {
    aliases: ['Foam Roll & Stretch', 'Foam Rolling & Stretching'],
    pat: ['n/a'], role: 'accessory', mech: 'n/a',
    cat: 'cooldown', diff: 'beginner',
    pri: ['full_body'], sec: [], stab: [],
    eq: ['foam_roller'],
    track: 'time', duration: '5-10 min',
    tags: ['cooldown', 'recovery', 'flexibility'], region: 'full_body',
  }),

  ex('Static Stretch', {
    aliases: ['Static Stretching', 'Light Stretching', 'Cool Down', 'Cool Down Stretching'],
    pat: ['n/a'], role: 'accessory', mech: 'n/a',
    cat: 'cooldown', diff: 'beginner',
    pri: ['full_body'], sec: [], stab: [],
    eq: ['bodyweight'], optEq: ['exercise_mat'],
    track: 'time', duration: '5-10 min',
    tags: ['cooldown', 'recovery', 'flexibility'], region: 'full_body',
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // CONDITIONING / CARDIO continued
  // ═══════════════════════════════════════════════════════════════════════════

  ex('Walk', {
    aliases: ['Walk or Easy Bike'],
    pat: ['gait'], role: 'accessory', mech: 'compound',
    cat: 'cardio', diff: 'beginner',
    pri: ['quads', 'hamstrings', 'calves'], sec: ['glutes'], stab: [],
    eq: ['bodyweight'], optEq: ['treadmill'],
    track: 'time_distance',
    tags: ['cardio', 'low_impact', 'recovery'], region: 'lower_body',
  }),

];


// ─── Name → Slug lookup (for migration script) ──────────────────────────────
// Build a complete map of every raw name (including aliases) → canonical slug.

function buildNameToSlugMap(exercises) {
  const map = {};
  for (const ex of exercises) {
    // Canonical name
    map[ex.name.toLowerCase()] = ex.slug;
    // All aliases
    for (const alias of ex.aliases) {
      // Strip trailing rep/time suffixes like " × 20", " × 30 sec"
      const cleanAlias = alias.replace(/\s*×.*$/, '').trim();
      map[alias.toLowerCase()] = ex.slug;
      if (cleanAlias.toLowerCase() !== alias.toLowerCase()) {
        map[cleanAlias.toLowerCase()] = ex.slug;
      }
    }
  }
  return map;
}


// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🏋️ Exercise Seed Script`);
  console.log(`  Exercises to seed: ${exercises.length}`);
  console.log(`  Drop existing: ${DROP}\n`);

  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db();

    // ── Merge video URLs from exercisevideos collection ──
    const videos = await db.collection('exercisevideos').find({}).toArray();
    console.log(`  Found ${videos.length} exercise videos to merge.`);

    // Build video lookup: lowercase name → { videoUrl, thumbnailUrl }
    const videoMap = {};
    for (const v of videos) {
      videoMap[v.exerciseName.toLowerCase()] = {
        videoUrl: v.videoUrl || null,
        thumbnailUrl: v.thumbnailUrl || null,
      };
    }

    // Merge: match by exercise name or aliases
    let videoMerged = 0;
    for (const ex of exercises) {
      const match = videoMap[ex.name.toLowerCase()]
        || ex.aliases.reduce((found, alias) => found || videoMap[alias.toLowerCase()], null);
      if (match) {
        ex.videoUrl = match.videoUrl;
        ex.thumbnailUrl = match.thumbnailUrl;
        videoMerged++;
      }
    }
    console.log(`  Merged video data for ${videoMerged} exercises.\n`);

    // ── Drop if requested ──
    if (DROP) {
      await db.collection('exercises').drop().catch(() => {});
      console.log('  Dropped existing exercises collection.');
    }

    // ── Upsert each exercise by slug ──
    let inserted = 0, updated = 0, errors = 0;
    for (const exercise of exercises) {
      try {
        const result = await db.collection('exercises').updateOne(
          { slug: exercise.slug },
          { $set: exercise, $setOnInsert: { createdAt: new Date() } },
          { upsert: true }
        );
        if (result.upsertedCount) inserted++;
        else if (result.modifiedCount) updated++;
      } catch (err) {
        console.error(`  ❌ Error seeding ${exercise.slug}: ${err.message}`);
        errors++;
      }
    }

    console.log(`\n  ✅ Done: ${inserted} inserted, ${updated} updated, ${errors} errors`);
    console.log(`  Total exercises in collection: ${await db.collection('exercises').countDocuments()}`);

    // ── Print name→slug map for migration reference ──
    const nameMap = buildNameToSlugMap(exercises);
    console.log(`\n  Name→Slug map covers ${Object.keys(nameMap).length} name variants.`);

    // ── Verify coverage against programs ──
    const programs = await db.collection('programs').find({}).toArray();
    const unmapped = new Set();
    for (const prog of programs) {
      for (const phase of (prog.phases || [])) {
        for (const workout of (phase.workouts || [])) {
          for (const ex of (workout.exercises || [])) {
            const key = (ex.name || '').toLowerCase();
            if (key && !nameMap[key]) {
              unmapped.add(ex.name);
            }
          }
        }
      }
    }
    if (unmapped.size > 0) {
      console.log(`\n  ⚠️  ${unmapped.size} program exercise names NOT mapped to a slug:`);
      for (const name of [...unmapped].sort()) {
        console.log(`     - "${name}"`);
      }
    } else {
      console.log(`\n  ✅ All program exercise names map to a slug!`);
    }

  } finally {
    await client.close();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
