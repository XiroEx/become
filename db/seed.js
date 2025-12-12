#!/usr/bin/env node

/**
 * Database Seed Script
 * 
 * Seeds programs and users data to a target MongoDB database.
 * 
 * Usage:
 *   node seed.js <mongodb-uri>
 * 
 * Examples:
 *   # Seed to local MongoDB
 *   node seed.js "mongodb://admin:admin123@localhost:27017/jondonfitdb?authSource=admin"
 * 
 *   # Seed to MongoDB Atlas (production)
 *   node seed.js "mongodb+srv://user:password@cluster.mongodb.net/dbname"
 * 
 * Options:
 *   --programs-only   Only seed programs
 *   --users-only      Only seed users
 *   --clear           Clear existing data before seeding
 *   --normalized      Use normalized_programs.json instead of backup_programs.json
 */

const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const flags = args.filter(arg => arg.startsWith('--'));
const positionalArgs = args.filter(arg => !arg.startsWith('--'));

const targetUri = positionalArgs[0];
const programsOnly = flags.includes('--programs-only');
const usersOnly = flags.includes('--users-only');
const clearData = flags.includes('--clear');
const useNormalized = flags.includes('--normalized');

if (!targetUri) {
  console.error(`
Usage: node seed.js <mongodb-uri> [options]

Options:
  --programs-only   Only seed programs
  --users-only      Only seed users
  --clear           Clear existing data before seeding
  --normalized      Use normalized_programs.json instead of backup_programs.json

Examples:
  node seed.js "mongodb://admin:admin123@localhost:27017/jondonfitdb?authSource=admin"
  node seed.js "mongodb+srv://user:pass@cluster.mongodb.net/dbname" --clear
  node seed.js "mongodb://localhost:27017/mydb" --programs-only --normalized
`);
  process.exit(1);
}

// Data file paths
const PROGRAMS_FILE = useNormalized 
  ? path.join(__dirname, 'normalized_programs.json')
  : path.join(__dirname, 'backup_programs.json');
const USERS_FILE = path.join(__dirname, 'backup_users.json');

async function loadJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error loading ${filePath}:`, error.message);
    return null;
  }
}

async function seedPrograms(db) {
  console.log(`\n📦 Loading programs from ${path.basename(PROGRAMS_FILE)}...`);
  const programs = await loadJsonFile(PROGRAMS_FILE);
  
  if (!programs || !Array.isArray(programs)) {
    console.error('❌ Failed to load programs data');
    return { inserted: 0, updated: 0, errors: 0 };
  }

  console.log(`   Found ${programs.length} programs`);
  
  const collection = db.collection('programs');
  let inserted = 0;
  let updated = 0;
  let errors = 0;

  if (clearData) {
    console.log('   🗑️  Clearing existing programs...');
    await collection.deleteMany({});
  }

  for (const program of programs) {
    try {
      const { _id, __v, ...programData } = program;
      
      const result = await collection.updateOne(
        { program_id: program.program_id },
        { $set: programData },
        { upsert: true }
      );

      if (result.upsertedCount > 0) {
        inserted++;
        console.log(`   ✅ Inserted: ${program.name}`);
      } else if (result.modifiedCount > 0) {
        updated++;
        console.log(`   🔄 Updated: ${program.name}`);
      } else {
        console.log(`   ⏭️  Unchanged: ${program.name}`);
      }
    } catch (error) {
      errors++;
      console.error(`   ❌ Error with ${program.program_id}:`, error.message);
    }
  }

  return { inserted, updated, errors };
}

async function seedUsers(db) {
  console.log(`\n👥 Loading users from ${path.basename(USERS_FILE)}...`);
  const users = await loadJsonFile(USERS_FILE);
  
  if (!users || !Array.isArray(users)) {
    console.error('❌ Failed to load users data');
    return { inserted: 0, updated: 0, errors: 0 };
  }

  console.log(`   Found ${users.length} users`);
  
  const collection = db.collection('users');
  let inserted = 0;
  let updated = 0;
  let errors = 0;

  if (clearData) {
    console.log('   🗑️  Clearing existing users...');
    await collection.deleteMany({});
  }

  for (const user of users) {
    try {
      const { _id, __v, ...userData } = user;
      
      // Convert date strings back to Date objects
      if (userData.createdAt) userData.createdAt = new Date(userData.createdAt);
      if (userData.updatedAt) userData.updatedAt = new Date(userData.updatedAt);

      const result = await collection.updateOne(
        { email: user.email },
        { $set: userData },
        { upsert: true }
      );

      if (result.upsertedCount > 0) {
        inserted++;
        console.log(`   ✅ Inserted: ${user.email}`);
      } else if (result.modifiedCount > 0) {
        updated++;
        console.log(`   🔄 Updated: ${user.email}`);
      } else {
        console.log(`   ⏭️  Unchanged: ${user.email}`);
      }
    } catch (error) {
      errors++;
      console.error(`   ❌ Error with ${user.email}:`, error.message);
    }
  }

  return { inserted, updated, errors };
}

async function main() {
  console.log('🌱 JonDonFit Database Seeder');
  console.log('════════════════════════════════════════');
  
  // Extract database name from URI or use default
  let dbName = 'jondonfitdb';
  try {
    const url = new URL(targetUri.replace('mongodb+srv://', 'https://').replace('mongodb://', 'https://'));
    const pathDb = url.pathname.replace('/', '');
    if (pathDb && pathDb !== '') {
      dbName = pathDb;
    }
  } catch (e) {
    // Use default db name
  }

  console.log(`\n🔌 Connecting to: ${targetUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
  console.log(`📂 Database: ${dbName}`);

  const client = new MongoClient(targetUri);

  try {
    await client.connect();
    console.log('✅ Connected successfully\n');

    const db = client.db(dbName);
    const results = {
      programs: { inserted: 0, updated: 0, errors: 0 },
      users: { inserted: 0, updated: 0, errors: 0 }
    };

    if (!usersOnly) {
      results.programs = await seedPrograms(db);
    }

    if (!programsOnly) {
      results.users = await seedUsers(db);
    }

    // Summary
    console.log('\n════════════════════════════════════════');
    console.log('📊 Seeding Summary');
    console.log('════════════════════════════════════════');
    
    if (!usersOnly) {
      console.log(`\nPrograms:`);
      console.log(`  ✅ Inserted: ${results.programs.inserted}`);
      console.log(`  🔄 Updated:  ${results.programs.updated}`);
      console.log(`  ❌ Errors:   ${results.programs.errors}`);
    }
    
    if (!programsOnly) {
      console.log(`\nUsers:`);
      console.log(`  ✅ Inserted: ${results.users.inserted}`);
      console.log(`  🔄 Updated:  ${results.users.updated}`);
      console.log(`  ❌ Errors:   ${results.users.errors}`);
    }

    console.log('\n🎉 Seeding complete!\n');

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
