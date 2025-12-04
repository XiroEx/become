import mongoose from 'mongoose';
import fs from 'fs/promises';
import path from 'path';
import Program from '../models/Program';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:admin123@localhost:27017/jondonfitdb?authSource=admin';

async function seed() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.');

    const filePath = path.join(__dirname, '../../db/programs.json');
    console.log(`Reading data from ${filePath}...`);
    const fileContents = await fs.readFile(filePath, 'utf8');
    const programsData = JSON.parse(fileContents);

    console.log('Clearing existing programs...');
    await Program.deleteMany({});

    console.log(`Inserting ${programsData.length} programs...`);
    await Program.insertMany(programsData);

    console.log('Database seeded successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
}

seed();
