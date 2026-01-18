/**
 * Migration script to ensure moodChangeHistory field exists on all UserProgress documents.
 * This adds the moodChangeHistory array field if it doesn't exist.
 * 
 * Run with: 
 *   DEV:  npx tsx scripts/migrate_mood_history.ts
 *   PROD: npx tsx scripts/migrate_mood_history.ts --prod
 */

import mongoose from 'mongoose'
import * as dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') })

const isProd = process.argv.includes('--prod')

// Production MongoDB URI from environment or fallback to reading from .env.local comments
const PROD_MONGODB_URI = process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD
const DEV_MONGODB_URI = process.env.MONGODB_URI

const MONGODB_URI = isProd ? PROD_MONGODB_URI : DEV_MONGODB_URI

if (!MONGODB_URI) {
  console.error('MONGODB_URI not found')
  process.exit(1)
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function migrate() {
  console.log(`Running migration on ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'} database`)
  if (isProd) {
    console.log('⚠️  WARNING: You are about to modify the PRODUCTION database!')
    console.log('Press Ctrl+C within 3 seconds to cancel...')
    await delay(3000)
  }
  
  console.log('Connecting to MongoDB...')
  console.log('URI:', MONGODB_URI?.replace(/\/\/.*:.*@/, '//<credentials>@'))
  
  await mongoose.connect(MONGODB_URI as string)
  console.log('Connected!')

  const db = mongoose.connection.db
  if (!db) {
    console.error('Database connection not established')
    process.exit(1)
  }

  // Add moodChangeHistory field to all UserProgress documents that don't have it
  const userProgressCollection = db.collection('userprogresses')
  
  // Count documents without moodChangeHistory
  const countWithout = await userProgressCollection.countDocuments({
    moodChangeHistory: { $exists: false }
  })
  
  console.log(`Found ${countWithout} documents without moodChangeHistory field`)
  
  if (countWithout > 0) {
    const result = await userProgressCollection.updateMany(
      { moodChangeHistory: { $exists: false } },
      { $set: { moodChangeHistory: [] } }
    )
    console.log(`Updated ${result.modifiedCount} documents`)
  }

  // Also ensure moodHistory exists on all documents
  const countWithoutMoodHistory = await userProgressCollection.countDocuments({
    moodHistory: { $exists: false }
  })
  
  console.log(`Found ${countWithoutMoodHistory} documents without moodHistory field`)
  
  if (countWithoutMoodHistory > 0) {
    const result = await userProgressCollection.updateMany(
      { moodHistory: { $exists: false } },
      { $set: { moodHistory: [] } }
    )
    console.log(`Updated ${result.modifiedCount} documents`)
  }

  // Verify the schema
  console.log('\nVerifying schema...')
  const sampleDoc = await userProgressCollection.findOne()
  if (sampleDoc) {
    console.log('Sample document fields:', Object.keys(sampleDoc))
    console.log('moodHistory exists:', 'moodHistory' in sampleDoc)
    console.log('moodChangeHistory exists:', 'moodChangeHistory' in sampleDoc)
  } else {
    console.log('No documents found in userprogresses collection')
  }

  await mongoose.disconnect()
  console.log('\nMigration complete!')
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
