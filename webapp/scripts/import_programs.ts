
import mongoose from 'mongoose';
import fs from 'fs/promises';
import path from 'path';
import Program, { IProgram } from '../models/Program';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:admin123@localhost:27017/jondonfitdb?authSource=admin';

async function importPrograms() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.');

    const dataDir = path.join(__dirname, '../../data');
    const files = ['program3.json', 'program4.json', 'program5.json', 'program6.json'];

    for (const file of files) {
      console.log(`Processing ${file}...`);
      const filePath = path.join(dataDir, file);
      const content = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(content);

      // Handle array of programs (like program4.json might be)
      const programsToImport = Array.isArray(data) ? data : [data];

      for (const programData of programsToImport) {
          // Ensure it has the required fields
          if (!programData.program_id || !programData.name) {
              console.warn(`Skipping invalid program data in ${file}:`, programData);
              continue;
          }

          // Upsert
          await Program.findOneAndUpdate(
              { program_id: programData.program_id },
              programData,
              { upsert: true, new: true }
          );
          console.log(`Imported/Updated ${programData.name}`);
      }
    }

    console.log('All programs imported.');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

importPrograms();
