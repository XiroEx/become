
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import Program from '../models/Program';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const MONGODB_URI = 'mongodb://admin:admin123@localhost:27017/jondonfitdb?authSource=admin';
const DATA_DIR = path.join(__dirname, '../../data');

async function reconcileData() {
  try {
    console.log('Connecting to local MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.');

    const programs = await Program.find({}).lean();
    console.log(`Found ${programs.length} programs in DB.`);

    // Read existing files in data directory to map program_id to filename
    const files = await fs.readdir(DATA_DIR);
    const fileMap = new Map<string, string>();

    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const content = await fs.readFile(path.join(DATA_DIR, file), 'utf8');
          const json = JSON.parse(content);
          if (json.program_id) {
            fileMap.set(json.program_id, file);
          }
        } catch (err) {
          console.warn(`Could not parse ${file}:`, err);
        }
      }
    }

    for (const program of programs) {
      // Remove _id and __v for clean export, or keep them if needed. 
      // Usually for seeding we might want to keep _id if we want to preserve it, 
      // but for "reconcile" and "seed production", maybe relying on program_id is better.
      // The user said "db is true source", so let's keep the data as is.
      // However, MongoDB _id might conflict if we try to insert into another DB if not careful,
      // but usually it's fine if we use the same _id.
      // Let's keep it simple and just dump the object.
      
      // We might want to remove internal mongoose fields if any, but .lean() helps.
      // delete (program as any).__v;

      let filename = fileMap.get(program.program_id);
      if (!filename) {
        filename = `${program.program_id}.json`;
        console.log(`New program found: ${program.program_id}. Creating ${filename}`);
      } else {
        console.log(`Updating ${filename} for program ${program.program_id}`);
      }

      await fs.writeFile(
        path.join(DATA_DIR, filename),
        JSON.stringify(program, null, 2)
      );
    }

    console.log('Reconciliation complete.');
    await mongoose.disconnect();

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

reconcileData();
