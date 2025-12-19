
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import Program from '../models/Program';
import User from '../models/User';
import UserProgress from '../models/UserProgress';
import { mockUserProgress } from '../lib/data/userProgress';

// We don't load .env.local because we want to use the production URI provided explicitly
// or we can just hardcode it for this task as requested.

const PROD_MONGODB_URI = 'mongodb+srv://george8794:iLmYV8dMSgJoVEwx@jondonfit.ctp0tfj.mongodb.net/?appName=jondonfit';
const PROGRAMS_FILE = path.join(__dirname, '../../db/normalized_programs.json');

async function seedProduction() {
  try {
    console.log('Connecting to PRODUCTION MongoDB...');
    await mongoose.connect(PROD_MONGODB_URI);
    console.log('Connected.');

    // Seed Programs from normalized_programs.json
    console.log('Reading programs from normalized_programs.json...');
    const content = await fs.readFile(PROGRAMS_FILE, 'utf8');
    const programsData = JSON.parse(content);

    for (const programData of programsData) {
      if (!programData.program_id) {
        console.warn(`Skipping program without program_id`);
        continue;
      }

      // Remove _id to avoid conflicts and let Mongo handle it
      const { _id, __v, ...dataToUpsert } = programData;

      console.log(`Seeding program: ${programData.program_id}`);

      await Program.findOneAndUpdate(
        { program_id: programData.program_id },
        dataToUpsert,
        { upsert: true, new: true }
      );
    }

    // Seed Demo User and Progress
    console.log('Creating demo user for production...');
    
    let demoUser = await User.findOne({ email: 'demo@jondonfit.com' });
    
    if (!demoUser) {
      demoUser = await User.create({
        email: 'demo@jondonfit.com',
        password: 'demo2024!',
        name: 'Demo User'
      });
      console.log('Demo user created.');
    } else {
      console.log('Demo user already exists.');
    }

    // Seed Demo User Progress
    console.log('Seeding demo user progress data...');
    await UserProgress.findOneAndUpdate(
      { userId: demoUser._id },
      {
        userId: demoUser._id,
        ...mockUserProgress
      },
      { upsert: true, new: true }
    );
    console.log('Demo user progress data seeded.');

    console.log('Production seeding complete.');
    await mongoose.disconnect();

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

seedProduction();
