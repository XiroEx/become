import fs from 'fs'
import { MongoClient, ObjectId } from 'mongodb'

const raw = fs.readFileSync('/tmp/.become_e2e_uri', 'utf8').trim()
  .replace(/^MONGODB_URI=/, '').replace(/^["']|["']$/g, '')
const uri = raw.replace('/jondonfitdb', '/become_e2e_meals')
if (!/become_e2e_meals/.test(uri) || /jondonfitdb/.test(uri)) {
  throw new Error('refusing to run: scratch db name not applied')
}

const FOODS = [
  { name: 'Zeta Burger Patty', cat: 'Protein', cal: 250, p: 22, c: 0, f: 18, unit: 'each' },
  { name: 'Zeta Brioche Bun', cat: 'Grain', cal: 180, p: 5, c: 32, f: 4, unit: 'each' },
  { name: 'Zeta Burger Sauce', cat: 'Condiment', cal: 90, p: 0, c: 3, f: 9, unit: 'tbsp' },
]

const c = new MongoClient(uri, { serverSelectionTimeoutMS: 20000 })
await c.connect()
const db = c.db()

await db.collection('foods').deleteMany({ name: /^Zeta / })
await db.collection('foods').insertMany(FOODS.map(f => ({
  name: f.name,
  slug: f.name.toLowerCase().replace(/\s+/g, '-'),
  category: f.cat,
  aliases: [],
  source: 'manual',
  externalId: `zeta-${f.name.toLowerCase().replace(/\s+/g, '-')}`,
  isFirstClass: true,
  isVerified: true,
  variants: [{
    _id: new ObjectId(),
    name: 'Default',
    isDefault: true,
    servingSize: 1,
    servingUnit: f.unit,
    displayLabel: `1 ${f.unit}`,
    alternateServings: [],
    nutrition: { calories: f.cal, protein: f.p, carbs: f.c, fats: f.f },
    gramsPerServing: 100,
  }],
  createdAt: new Date(),
  updatedAt: new Date(),
})))

// Search 500s without this — the route runs a $text query.
await db.collection('foods').createIndex({ name: 'text', brand: 'text', aliases: 'text' })

const userId = new ObjectId('69ee5d9a0a303c1b8a6f4457')
await db.collection('users').updateOne(
  { _id: userId },
  {
    $set: {
      email: 'e2etest@become.io',
      name: 'E2E Test',
      role: 'user',
      tier: 'plus',
      onboardingCompleted: true,
      profile: {
        fitnessGoal: 'gain_muscle',
        fitnessGoals: ['gain_muscle'],
        experienceLevel: 'intermediate',
        age: 30,
      },
      updatedAt: new Date(),
    },
    $setOnInsert: { createdAt: new Date(Date.now() - 365 * 864e5) },
  },
  { upsert: true },
)

await db.collection('tutorialprogresses').updateOne(
  { userId },
  { $set: { userId, state: { enabled: false, tutorials: {} }, updatedAt: new Date() } },
  { upsert: true },
)

console.log('seeded foods:', await db.collection('foods').countDocuments({ name: /^Zeta / }))
console.log('user tier:', (await db.collection('users').findOne({ _id: userId }))?.tier)
await c.close()
