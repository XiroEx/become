// Run with: npm run test:file tests/unit/nutritionLogSelfHeal.test.ts

// Ensure mock db connection is set BEFORE loading modules that invoke dbConnect
const g = globalThis as unknown as { mongoose?: { conn: unknown; promise: unknown } }
g.mongoose = { conn: { readyState: 1 }, promise: null }
;(process.env as Record<string, string | undefined>).NODE_ENV = 'test'
process.env.JWT_SECRET ||= 'become-unit-test-secret'
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/become-test'

import { test, mock, before } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import DayNutrition from '../../models/DayNutrition'
import NutritionGoal from '../../models/NutritionGoal'
import MealLog from '../../models/MealLog'
import { signToken } from '../../lib/auth'

const USER_ID = '65f00000000000000000ff99'

let getNutritionLog: (req: NextRequest) => Promise<Response>

before(async () => {
  const mod = await import('../../app/api/nutrition/log/route')
  getNutritionLog = mod.GET
})

async function makeAuthToken(userId = USER_ID) {
  return `Bearer ${await signToken({ userId, email: 'nutrition-test@example.com' })}`
}

test('GET /api/nutrition/log awaits DayNutrition.updateOne on legacy self-heal fallback', async () => {
  const fallbackDoc = {
    _id: '65f00000000000000000fa99',
    userId: USER_ID,
    date: new Date('2026-05-12T18:00:00.000Z'),
    water: { current: 32, goal: 64 },
    quickAdds: [],
  }

  let updateResolved = false
  const updateOneMock = mock.method(DayNutrition, 'updateOne', async () => {
    // Artificial small delay to verify that the GET handler awaits completion
    await new Promise((resolve) => setTimeout(resolve, 20))
    updateResolved = true
    return { acknowledged: true, modifiedCount: 1 }
  })

  const findOneDayNutritionMock = mock.method(DayNutrition, 'findOne', () => ({
    lean: async () => null,
  }))

  const findDayNutritionMock = mock.method(DayNutrition, 'find', () => ({
    lean: async () => [fallbackDoc],
  }))

  const findMealLogMock = mock.method(MealLog, 'find', () => ({
    sort: () => ({
      lean: async () => [],
    }),
  }))

  const findOneNutritionGoalMock = mock.method(NutritionGoal, 'findOne', () => ({
    lean: async () => null,
  }))

  try {
    const token = await makeAuthToken()
    const req = new NextRequest('http://localhost:3000/api/nutrition/log?date=2026-05-12&tz=0', {
      headers: { authorization: token },
    })

    const res = await getNutritionLog(req)
    assert.equal(res.status, 200)

    // Verify updateOne was awaited before response was returned
    assert.equal(updateResolved, true, 'DayNutrition.updateOne must be awaited before GET returns')
    assert.equal(updateOneMock.mock.callCount(), 1)
    const call = updateOneMock.mock.calls[0]
    assert.deepEqual(call.arguments[0], { _id: fallbackDoc._id })
    const updateArg = call.arguments[1] as { $set?: { date?: Date } } | undefined
    assert.ok(updateArg?.$set?.date instanceof Date)

    const json = await res.json()
    assert.deepEqual(json.water, { current: 32, goal: 64 })
  } finally {
    updateOneMock.mock.restore()
    findOneDayNutritionMock.mock.restore()
    findDayNutritionMock.mock.restore()
    findMealLogMock.mock.restore()
    findOneNutritionGoalMock.mock.restore()
  }
})

test('GET /api/nutrition/log catches and logs errors from DayNutrition.updateOne self-heal with console.error', async () => {
  const fallbackDoc = {
    _id: '65f00000000000000000fa88',
    userId: USER_ID,
    date: new Date('2026-05-12T19:00:00.000Z'),
    water: { current: 48, goal: 96 },
    quickAdds: [],
  }

  const writeError = new Error('Mongo connection lost during updateOne')
  const updateOneMock = mock.method(DayNutrition, 'updateOne', async () => {
    throw writeError
  })

  const consoleErrorMock = mock.method(console, 'error', () => {})

  const findOneDayNutritionMock = mock.method(DayNutrition, 'findOne', () => ({
    lean: async () => null,
  }))

  const findDayNutritionMock = mock.method(DayNutrition, 'find', () => ({
    lean: async () => [fallbackDoc],
  }))

  const findMealLogMock = mock.method(MealLog, 'find', () => ({
    sort: () => ({
      lean: async () => [],
    }),
  }))

  const findOneNutritionGoalMock = mock.method(NutritionGoal, 'findOne', () => ({
    lean: async () => null,
  }))

  try {
    const token = await makeAuthToken()
    const req = new NextRequest('http://localhost:3000/api/nutrition/log?date=2026-05-12&tz=0', {
      headers: { authorization: token },
    })

    const res = await getNutritionLog(req)
    assert.equal(res.status, 200, 'GET handler should succeed even if self-heal write fails')

    assert.equal(updateOneMock.mock.callCount(), 1)
    assert.ok(consoleErrorMock.mock.callCount() >= 1, 'console.error must be called on self-heal write failure')

    const logged = consoleErrorMock.mock.calls.some((c) =>
      typeof c.arguments[0] === 'string' &&
      c.arguments[0].includes('[nutrition/log] self-heal updateOne failed') &&
      c.arguments[0].includes(fallbackDoc._id) &&
      c.arguments[0].includes('Mongo connection lost during updateOne')
    )
    assert.equal(logged, true, 'console.error must log self-heal error message with fallback _id and error')

    const json = await res.json()
    assert.deepEqual(json.water, { current: 48, goal: 96 })
  } finally {
    updateOneMock.mock.restore()
    consoleErrorMock.mock.restore()
    findOneDayNutritionMock.mock.restore()
    findDayNutritionMock.mock.restore()
    findMealLogMock.mock.restore()
    findOneNutritionGoalMock.mock.restore()
  }
})
