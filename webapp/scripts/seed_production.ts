
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import Program from '../models/Program';

// We don't load .env.local because we want to use the production URI provided explicitly
// or we can just hardcode it for this task as requested.

const PROD_MONGODB_URI = 'mongodb+srv://george8794:iLmYV8dMSgJoVEwx@jondonfit.ctp0tfj.mongodb.net/?appName=jondonfit';
const DATA_DIR = path.join(__dirname, '../../data');

async function seedProduction() {
  try {
    console.log('Connecting to PRODUCTION MongoDB...');
    await mongoose.connect(PROD_MONGODB_URI);
    console.log('Connected.');

    const files = await fs.readdir(DATA_DIR);
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const content = await fs.readFile(path.join(DATA_DIR, file), 'utf8');
      const programData = JSON.parse(content);

      if (!programData.program_id) {
        console.warn(`Skipping ${file}: No program_id found.`);
        continue;
      }

      // Remove _id to avoid conflicts and let Mongo handle it, 
      // or to avoid trying to update immutable field _id if it differs.
      const { _id, __v, ...dataToUpsert } = programData;

      console.log(`Seeding program: ${programData.program_id} from ${file}`);

      await Program.findOneAndUpdate(
        { program_id: programData.program_id },
        dataToUpsert,
        { upsert: true, new: true }
      );
    }

    console.log('Seeding complete.');
    await mongoose.disconnect();

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

seedProduction();
