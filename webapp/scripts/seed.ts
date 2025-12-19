import mongoose from 'mongoose';
import fs from 'fs/promises';
import path from 'path';
import Program from '../models/Program';
import User from '../models/User';
import UserProgress from '../models/UserProgress';
import { mockUserProgress } from '../lib/data/userProgress';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:admin123@localhost:27017/jondonfitdb?authSource=admin';

async function seed() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.');

    // Seed Programs
    const filePath = path.join(__dirname, '../../db/normalized_programs.json');
    console.log(`Reading programs from ${filePath}...`);
    const fileContents = await fs.readFile(filePath, 'utf8');
    const programsData = JSON.parse(fileContents);

    console.log('Clearing existing programs...');
    await Program.deleteMany({});

    console.log(`Inserting ${programsData.length} programs...`);
    await Program.insertMany(programsData);

    // Seed Test User and Progress
    console.log('Creating test user...');
    
    // Check if test user exists
    let testUser = await User.findOne({ email: 'test@example.com' });
    
    if (!testUser) {
      testUser = await User.create({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User'
      });
      console.log('Test user created.');
    } else {
      console.log('Test user already exists.');
    }

    // Seed User Progress
    console.log('Seeding user progress data...');
    await UserProgress.findOneAndUpdate(
      { userId: testUser._id },
      {
        userId: testUser._id,
        ...mockUserProgress
      },
      { upsert: true, new: true }
    );
    console.log('User progress data seeded.');

    console.log('Database seeded successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
}

seed();
