/**
 * Migration script to convert mood values from 3-point scale to 5-point scale.
 * 
 * Old scale: 1 = sad, 2 = neutral, 3 = happy
 * New scale: 1 = bad, 2 = not great, 3 = okay, 4 = pretty good, 5 = great
 * 
 * Mapping:
 *   1 (sad)     -> 2 (not great)
 *   2 (neutral) -> 3 (okay)
 *   3 (happy)   -> 5 (great)
 * 
 * Run with: 
 *   DEV:  npx tsx scripts/migrate_mood_scale.ts
 *   PROD: npx tsx scripts/migrate_mood_scale.ts --prod
 */

import mongoose from 'mongoose'
import * as dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') })

const isProd = process.argv.includes('--prod')

// Production MongoDB URI from environment
const PROD_MONGODB_URI = process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD
const DEV_MONGODB_URI = process.env.MONGODB_URI

const MONGODB_URI = isProd ? PROD_MONGODB_URI : DEV_MONGODB_URI

if (!MONGODB_URI) {
  console.error('MONGODB_URI not found')
  process.exit(1)
}

// Mapping from old 3-point scale to new 5-point scale
const MOOD_MAPPING: Record<number, number> = {
  1: 2, // sad -> not great
  2: 3, // neutral -> okay
  3: 5  // happy -> great
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function migrate() {
  console.log(`\n🔄 Mood Scale Migration (3-point → 5-point)`)
  console.log(`Running on ${isProd ? '🔴 PRODUCTION' : '🟢 DEVELOPMENT'} database\n`)
  
  if (isProd) {
    console.log('⚠️  WARNING: You are about to modify the PRODUCTION database!')
    console.log('Press Ctrl+C within 5 seconds to cancel...')
    await delay(5000)
  }
  
  console.log('Connecting to MongoDB...')
  console.log('URI:', MONGODB_URI?.replace(/\/\/.*:.*@/, '//<credentials>@'))
  
  await mongoose.connect(MONGODB_URI as string)
  console.log('✅ Connected!\n')

  const db = mongoose.connection.db
  if (!db) {
    console.error('Database connection not established')
    process.exit(1)
  }

  const userProgressCollection = db.collection('userprogresses')
  
  // Find all documents with mood data
  const docs = await userProgressCollection.find({
    $or: [
      { 'moodHistory.mood': { $exists: true } },
      { 'moodChangeHistory.previousMood': { $exists: true } },
      { 'moodChangeHistory.newMood': { $exists: true } }
    ]
  }).toArray()
  
  console.log(`Found ${docs.length} documents with mood data to migrate\n`)
  
  let totalMoodHistoryUpdated = 0
  let totalMoodChangeHistoryUpdated = 0
  
  for (const doc of docs) {
    let needsUpdate = false
    
    // Migrate moodHistory entries
    if (doc.moodHistory && Array.isArray(doc.moodHistory)) {
      for (const entry of doc.moodHistory) {
        if (entry.mood && entry.mood <= 3) {
          const oldValue = entry.mood
          entry.mood = MOOD_MAPPING[oldValue] || entry.mood
          if (entry.mood !== oldValue) {
            totalMoodHistoryUpdated++
            needsUpdate = true
          }
        }
      }
    }
    
    // Migrate moodChangeHistory entries
    if (doc.moodChangeHistory && Array.isArray(doc.moodChangeHistory)) {
      for (const entry of doc.moodChangeHistory) {
        if (entry.previousMood && entry.previousMood <= 3) {
          const oldValue = entry.previousMood
          entry.previousMood = MOOD_MAPPING[oldValue] || entry.previousMood
          if (entry.previousMood !== oldValue) {
            totalMoodChangeHistoryUpdated++
            needsUpdate = true
          }
        }
        if (entry.newMood && entry.newMood <= 3) {
          const oldValue = entry.newMood
          entry.newMood = MOOD_MAPPING[oldValue] || entry.newMood
          if (entry.newMood !== oldValue) {
            totalMoodChangeHistoryUpdated++
            needsUpdate = true
          }
        }
      }
    }
    
    // Save the updated document
    if (needsUpdate) {
      await userProgressCollection.updateOne(
        { _id: doc._id },
        { 
          $set: { 
            moodHistory: doc.moodHistory,
            moodChangeHistory: doc.moodChangeHistory
          }
        }
      )
      console.log(`  ✅ Updated document for user: ${doc.userId}`)
    }
  }
  
  console.log(`\n📊 Migration Summary:`)
  console.log(`   • Documents processed: ${docs.length}`)
  console.log(`   • moodHistory entries migrated: ${totalMoodHistoryUpdated}`)
  console.log(`   • moodChangeHistory entries migrated: ${totalMoodChangeHistoryUpdated}`)
  
  await mongoose.disconnect()
  console.log('\n✅ Migration complete! Disconnected from MongoDB.\n')
}

migrate().catch((error) => {
  console.error('Migration failed:', error)
  process.exit(1)
})
