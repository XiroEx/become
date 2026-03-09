// Run with: npx tsx scripts/set-roles.ts
// Sets roles for known users and assigns trainer
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || '';

async function main() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI environment variable is required');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db!;
  const users = db.collection('users');

  // Set jondon27500 as trainer
  const jonResult = await users.updateOne(
    { email: 'jondon27500@gmail.com' },
    { $set: { role: 'trainer' } }
  );
  console.log(`Jon (trainer): ${jonResult.modifiedCount ? 'updated' : 'already set or not found'}`);

  // Set george as admin
  const georgeResult = await users.updateOne(
    { email: 'george@redbtn.io' },
    { $set: { role: 'admin' } }
  );
  console.log(`George (admin): ${georgeResult.modifiedCount ? 'updated' : 'already set or not found'}`);

  // Get jon's user ID
  const jon = await users.findOne({ email: 'jondon27500@gmail.com' });
  if (jon) {
    // Assign all non-trainer, non-admin users to jon as trainer
    const usersResult = await users.updateMany(
      { role: { $nin: ['trainer', 'admin'] }, _id: { $ne: jon._id } },
      { $set: { role: 'user', trainerId: jon._id } }
    );
    console.log(`Regular users assigned to Jon: ${usersResult.modifiedCount}`);

    // Also set admin's trainer to jon for testing
    const adminResult = await users.updateOne(
      { email: 'george@redbtn.io' },
      { $set: { trainerId: jon._id } }
    );
    console.log(`George (trainerId set): ${adminResult.modifiedCount ? 'updated' : 'already set'}`);
  } else {
    console.warn('Jon not found — skipping trainer assignment');
  }

  console.log('Roles set successfully');
  await mongoose.disconnect();
}

main().catch(console.error);
