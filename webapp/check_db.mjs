import mongoose from 'mongoose';

const prodUri = 'mongodb+srv://george8794:iLmYV8dMSgJoVEwx@jondonfit.ctp0tfj.mongodb.net/?appName=jondonfit';

await mongoose.connect(prodUri);
const adminDb = mongoose.connection.db.admin();

const dbs = await adminDb.listDatabases();
console.log('Databases on Atlas cluster:');
for (const db of dbs.databases) {
  console.log('  -', db.name);
}

// Check each database for programs collection
for (const dbInfo of dbs.databases) {
  if (dbInfo.name.startsWith('admin') || dbInfo.name === 'local') continue;
  
  const db = mongoose.connection.useDb(dbInfo.name);
  const collections = await db.db.listCollections().toArray();
  
  if (collections.find(c => c.name === 'programs')) {
    console.log('\nDatabase', dbInfo.name, 'has programs collection:');
    const programs = await db.db.collection('programs').find().toArray();
    
    for (const program of programs) {
      console.log('  Program:', program.name);
      if (program.phases && program.phases[0]) {
        const workoutsIsArray = Array.isArray(program.phases[0].workouts);
        console.log('    workouts is array:', workoutsIsArray);
        if (!workoutsIsArray) {
          console.log('    !!! FOUND OLD FORMAT !!!');
        }
      }
    }
  }
}

await mongoose.disconnect();
