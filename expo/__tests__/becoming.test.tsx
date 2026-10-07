import React from 'react'
import { render, fireEvent, act } from '@testing-library/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { BecomingDoor } from '@/components/dashboard/BecomingDoor'
import { WeekCard, HorizonCard } from '@/components/becoming/WeekCard'
import { BecomingDetails } from '@/components/becoming/BecomingDetails'
import {
  sameWeek,
  localWeekKey,
  checkBecomingUnread,
  markBecomingSeen,
  readBecomingCache,
  writeBecomingCache,
} from '@/lib/becoming/storage'
import { weekSignals, journeySignals } from '@/lib/becoming/signals'
import type { WeekSnapshot, JourneyPayload } from '@/lib/becoming/types'

const MOCK_WEEK: WeekSnapshot = {
  index: 0,
  weekKey: '2026-09-27',
  label: 'Sep 27 – Oct 3',
  isCurrent: true,
  isFirst: false,
  daysElapsed: 5,
  score: 85,
  step: 'up',
  altitude: 1,
  subject: 'training',
  days: [
    { key: '2026-09-27', workout: true, workoutCount: 1, food: true, mind: true, mindSession: true, future: false },
    { key: '2026-09-28', workout: false, workoutCount: 0, food: true, mind: false, mindSession: false, future: false },
    { key: '2026-09-29', workout: true, workoutCount: 1, food: false, mind: true, mindSession: false, future: false },
    { key: '2026-09-30', workout: true, workoutCount: 1, food: true, mind: false, mindSession: false, future: false },
    { key: '2026-10-01', workout: false, workoutCount: 0, food: true, mind: true, mindSession: true, future: false },
    { key: '2026-10-02', workout: false, workoutCount: 0, food: false, mind: false, mindSession: false, future: true },
    { key: '2026-10-03', workout: false, workoutCount: 0, food: false, mind: false, mindSession: false, future: true },
  ],
  uses: {
    training: true,
    fuel: true,
    mind: true,
    mindMode: 'sessions',
  },
  mind: {
    sessions: 2,
    moodDays: 3,
    dominant: 'locked_in',
    wins: ['Kept focus under pressure', 'Hit target sets early'],
    chapterUnlocked: 2,
  },
  nutrition: {
    logDays: 4,
    proteinDays: 3,
    avgCalories: 2100,
    weightStart: 180,
    weightEnd: 179,
    delta: -1.0,
  },
  training: {
    workouts: 3,
    target: 4,
    hit: false,
    prs: [{ name: 'Bench Press', e1RM: 225 }],
    prCount: 1,
  },
  headline: 'Momentum build',
  sub: 'Strong training rhythm with 3 sessions locked in',
  said: [],
  tags: ['training', 'prs'],
  spark: [70, 75, 80, 85],
}

const MOCK_JOURNEY: JourneyPayload = {
  todayKey: '2026-10-02',
  identity: 'Consistent, disciplined builder',
  firstActivity: '2026-01-01',
  unit: 'lbs',
  target: {
    weight: 175,
    direction: 'lose',
    pace: 'on',
    eta: 'Nov 15',
  },
  weeklyTarget: 4,
  weeks: [MOCK_WEEK],
  next: {
    nutrition: {
      key: 'log-dinner',
      title: 'Log your final meal',
      sub: 'Lock in your protein target for the day',
      severity: 'info',
      url: '/dashboard/nutrition',
    },
    training: {
      key: 'finish-week',
      title: 'Complete 1 more workout',
      sub: 'Hit your 4 workouts/week goal',
      severity: 'nudge',
      url: '/dashboard/workout',
    },
  },
  becomingScore: 1250,
  chapter: 2,
  weights: [
    { day: '2026-09-27', value: 180 },
    { day: '2026-09-29', value: 179.5 },
    { day: '2026-10-01', value: 179 },
  ],
}

describe('NP-192 / NP-012: The Becoming door, story, and details', () => {
  beforeEach(async () => {
    await AsyncStorage.clear()
  })

  describe('Storage & Cache helpers', () => {
    it('computes sameWeek correctly for today and current week Sunday', () => {
      const current = localWeekKey()
      expect(sameWeek(current)).toBe(true)
    })

    it('reads and writes Becoming payload cache for a member', async () => {
      const memberId = 'member-123'
      const cachedBefore = await readBecomingCache(memberId)
      expect(cachedBefore).toBeNull()

      // readBecomingCache only returns a payload whose todayKey is in the
      // current local week, so stamp it with today rather than a fixed date.
      const now = new Date()
      const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      await writeBecomingCache(memberId, { ...MOCK_JOURNEY, todayKey })
      const cachedAfter = await readBecomingCache(memberId)
      expect(cachedAfter).not.toBeNull()
      expect(cachedAfter?.becomingScore).toBe(1250)
      expect(cachedAfter?.weeks.length).toBe(1)
    })

    it('manages seen status across weeks', async () => {
      // With history ever seen
      await AsyncStorage.setItem('becoming.everSeen', 'true')
      const unreadInitially = await checkBecomingUnread()
      expect(unreadInitially).toBe(true)

      await markBecomingSeen()
      const unreadAfterSeen = await checkBecomingUnread()
      expect(unreadAfterSeen).toBe(false)
    })
  })

  describe('Signal generation', () => {
    it('generates highlights with priority for workouts, prs, and logging', () => {
      const sigs = weekSignals([MOCK_WEEK], 0, { unit: 'lbs', direction: 'lose' })
      expect(sigs.active).toContain('training')
      expect(sigs.active).toContain('fuel')
      expect(sigs.active).toContain('mind')
      expect(sigs.highlights.length).toBeGreaterThan(0)

      // PR should be highest weighted highlight
      const prHighlight = sigs.highlights.find((h) => h.kind === 'prs')
      expect(prHighlight).toBeDefined()
      expect(prHighlight?.value).toBe('225')
    })

    it('maps journeySignals across all weeks', () => {
      const allSigs = journeySignals([MOCK_WEEK])
      expect(allSigs.length).toBe(1)
      expect(allSigs[0]?.active.length).toBe(3)
    })
  })

  describe('BecomingDoor component', () => {
    it('renders the Becoming door with chips and title', async () => {
      const { getByTestId, getByText } = render(
        <BecomingDoor
          testID="becoming-door"
          onPress={jest.fn()}
        />,
      )

      expect(getByTestId('becoming-door')).toBeTruthy()
      expect(getByText('The Becoming')).toBeTruthy()
      expect(getByText('Then → now → next, across all three')).toBeTruthy()
      expect(getByText('Mind')).toBeTruthy()
      expect(getByText('Nutrition')).toBeTruthy()
      expect(getByText('Training')).toBeTruthy()
    })

    it('navigates when pressed', async () => {
      const onPress = jest.fn()
      const { getByTestId } = render(
        <BecomingDoor
          testID="becoming-door"
          onPress={onPress}
        />,
      )

      await act(async () => {
        fireEvent.press(getByTestId('becoming-door'))
      })

      expect(onPress).toHaveBeenCalledTimes(1)
    })
  })

  describe('WeekCard & HorizonCard components', () => {
    it('renders week card details faithfully matching web parity', () => {
      const signals = weekSignals([MOCK_WEEK], 0)
      const onDetails = jest.fn()
      const onNavigate = jest.fn()

      const { getByTestId, getByText } = render(
        <WeekCard
          week={MOCK_WEEK}
          signals={signals}
          identity="Consistent, disciplined builder"
          next={MOCK_JOURNEY.next}
          onDetails={onDetails}
          onNavigate={onNavigate}
        />,
      )

      expect(getByTestId('week-card-2026-09-27')).toBeTruthy()
      expect(getByTestId('week-card-headline')).toBeTruthy()
      expect(getByText('Momentum build')).toBeTruthy()
      expect(getByTestId('week-card-sub')).toBeTruthy()
      expect(getByText('live')).toBeTruthy()
      expect(getByText('What to work on')).toBeTruthy()
      expect(getByTestId('week-card-wins')).toBeTruthy()
      expect(getByText('Kept focus under pressure')).toBeTruthy()

      // Press details button
      const detailsBtn = getByTestId('week-card-details-btn')
      fireEvent.press(detailsBtn)
      expect(onDetails).toHaveBeenCalledTimes(1)
    })

    it('renders peak chip as new high and deltas label', () => {
      const signals = {
        ...weekSignals([MOCK_WEEK], 0),
        hasDeltas: true,
      }
      const { getByText } = render(
        <WeekCard
          week={{ ...MOCK_WEEK, isCurrent: false, step: 'up' }}
          signals={signals}
          isPeak={true}
        />,
      )
      expect(getByText('new high')).toBeTruthy()
      expect(getByText('Changes vs the week before')).toBeTruthy()
    })

    it('renders HorizonCard with unwritten future and next steps', () => {
      const onNavigate = jest.fn()
      const { getByTestId, getByText } = render(
        <HorizonCard
          identity="Consistent, disciplined builder"
          next={MOCK_JOURNEY.next}
          trend="up"
          onNavigate={onNavigate}
        />,
      )

      expect(getByTestId('horizon-card')).toBeTruthy()
      expect(getByText('Next Sunday')).toBeTruthy()
      expect(getByText('Horizon lifting')).toBeTruthy()
      expect(getByText('Who am I becoming?')).toBeTruthy()
      expect(getByText('“Consistent, disciplined builder”')).toBeTruthy()
      expect(getByTestId('horizon-writes')).toBeTruthy()
    })
  })

  describe('BecomingDetails component', () => {
    it('renders 4 tabs: Story, Training, Fuel, Mind and switches between them', () => {
      const onClose = jest.fn()
      const { getByTestId, getByText } = render(
        <SafeAreaProvider
          initialMetrics={{
            insets: { top: 0, left: 0, right: 0, bottom: 0 },
            frame: { x: 0, y: 0, width: 375, height: 812 },
          }}
        >
          <BecomingDetails
            open={true}
            onClose={onClose}
            weeks={[MOCK_WEEK]}
            weighIns={MOCK_JOURNEY.weights}
            todayKey={MOCK_JOURNEY.todayKey}
            unit="lbs"
            identity="Consistent, disciplined builder"
            chapter={2}
            becomingScore={1250}
          />
        </SafeAreaProvider>,
      )

      expect(getByTestId('details-tab-story')).toBeTruthy()
      expect(getByTestId('details-tab-training')).toBeTruthy()
      expect(getByTestId('details-tab-fuel')).toBeTruthy()
      expect(getByTestId('details-tab-mind')).toBeTruthy()

      // Switch to Training tab
      fireEvent.press(getByTestId('details-tab-training'))
      expect(getByTestId('details-screen-training')).toBeTruthy()
      expect(getByText('This week')).toBeTruthy()

      // Switch to Fuel tab
      fireEvent.press(getByTestId('details-tab-fuel'))
      expect(getByTestId('details-screen-fuel')).toBeTruthy()

      // Switch to Mind tab
      fireEvent.press(getByTestId('details-tab-mind'))
      expect(getByTestId('details-screen-mind')).toBeTruthy()
      expect(getByText('Becoming score')).toBeTruthy()
      expect(getByText('1,250')).toBeTruthy()
    })

    it('renders Training tab with Then/Now/Next, What you moved, suggestions, and Est. max sheet', () => {
      const mockGoals = {
        training: {
          status: 'active' as const,
          unit: 'lbs' as const,
          target: { daysPerWeek: 3 },
          thisWeek: { done: 1, remaining: 2, weekLost: false },
          baseline: { prs: [], date: '2026-09-30' },
          startedAt: '2026-09-30',
          avgLast4: 2,
          hasLiftTargets: false,
          lifts: [
            { slug: 'bench', name: 'Bench Press', then: 200, now: 225, delta: 25, target: 250, reached: false },
          ],
          suggestedLifts: [],
          week: {
            sessions: 1,
            sets: 6,
            reps: 30,
            volume: 7800,
            workSeconds: 0,
            hasWeightedWork: true,
            topSet: { name: 'Bench Press', weight: 225, reps: 5, e1RM: 260 },
            exercises: 1,
          },
          suggestion: {
            key: 't-more',
            title: '2 more by Saturday',
            sub: 'Keep momentum going',
            url: '/dashboard/workout',
            severity: 'nudge' as const,
          },
        },
        nutrition: null,
      }

      const { getByTestId, getByText } = render(
        <SafeAreaProvider
          initialMetrics={{
            insets: { top: 0, left: 0, right: 0, bottom: 0 },
            frame: { x: 0, y: 0, width: 375, height: 812 },
          }}
        >
          <BecomingDetails
            open={true}
            onClose={jest.fn()}
            initialTab="training"
            goals={mockGoals as any}
          />
        </SafeAreaProvider>,
      )

      expect(getByText('This week 1/3')).toBeTruthy()
      expect(getByText('Sep 30')).toBeTruthy()
      expect(getByText('PRs on Sep 30')).toBeTruthy()
      expect(getByText('2/wk')).toBeTruthy()
      expect(getByText('avg, last 4 weeks')).toBeTruthy()
      expect(getByText('3/wk')).toBeTruthy()

      // What you moved
      expect(getByText('What you moved')).toBeTruthy()
      expect(getByText('Sessions')).toBeTruthy()
      expect(getByText('1')).toBeTruthy()
      expect(getByText('Sets')).toBeTruthy()
      expect(getByText('6')).toBeTruthy()
      expect(getByText('Load moved')).toBeTruthy()
      expect(getByText('7.8k lbs')).toBeTruthy()
      expect(getByText(/Best set:.*Bench Press.*225 lbs × 5/)).toBeTruthy()

      // Suggestion
      expect(getByText('2 more by Saturday')).toBeTruthy()

      // Switch to Strength view
      fireEvent.press(getByTestId('training-subswitch-strength'))
      expect(getByText('Est. max?')).toBeTruthy()
      fireEvent.press(getByTestId('details-what-is-est-max'))
      expect(getByText('What is an estimated max?')).toBeTruthy()
      expect(getByText(/Weight × \(36 \/ \(37 − Reps\)\)/)).toBeTruthy()
    })

    it('renders Fuel tab with weight plan, adherence aim, first weigh-in, and macros link', () => {
      const mockGoals = {
        nutrition: {
          status: 'active' as const,
          direction: 'lose' as const,
          unit: 'lbs' as const,
          pace: {
            status: 'on' as const,
            behindByKg: 0,
            aheadByKg: 0,
            eta: '~12 wks',
            etaDate: null,
          },
          baseline: { weight: 175, date: '2026-09-30' },
          now: { weight: 175, date: '2026-10-06', fourWeeksAgo: 175 },
          target: { weight: 181, pacePerWeek: 0.5 },
          journeyStart: { weight: 173, date: '2026-09-09' },
          adherence: {
            logDays: 7,
            totalDays: 7,
            logTarget: 5,
            logOk: true,
            proteinJudged: true,
            proteinOk: true,
            proteinDays: 6,
            proteinTarget: 5,
          },
          suggestion: {
            key: 'on-pace',
            title: 'On pace',
            sub: 'Hold the habits',
            url: '/dashboard/nutrition',
            severity: 'good' as const,
          },
        },
        training: null,
      }

      const { getByTestId, getByText, getAllByText } = render(
        <SafeAreaProvider
          initialMetrics={{
            insets: { top: 0, left: 0, right: 0, bottom: 0 },
            frame: { x: 0, y: 0, width: 375, height: 812 },
          }}
        >
          <BecomingDetails
            open={true}
            onClose={jest.fn()}
            initialTab="fuel"
            goals={mockGoals as any}
            weighIns={[
              { day: '2026-10-05', value: 175 },
              { day: '2026-10-06', value: 175 },
            ]}
          />
        </SafeAreaProvider>,
      )

      expect(getByTestId('weight-plan')).toBeTruthy()
      expect(getAllByText('On pace').length).toBe(2)
      expect(getByText('plan from Sep 30')).toBeTruthy()
      expect(getByText('181 lbs')).toBeTruthy()
      expect(getByText('First weigh-in 173 lbs on Sep 9.')).toBeTruthy()
      expect(getByText(/Logged 7\/7 days/)).toBeTruthy()
      expect(getAllByText('(aim 5)').length).toBeGreaterThanOrEqual(1)
      expect(getByText('Pace, targets and macros')).toBeTruthy()
    })

    it('renders Mind tab with streak tile, arc progress %, how you shown up, and next chapter', async () => {
      const mockProgress = {
        chapter: 2,
        xp: 150,
        xpBank: 1250,
        vision: { identityStatement: 'Disciplined builder' },
        chapterHistory: [{ chapter: 1, unlockedAt: '2026-09-01' }],
      }
      const mockWins = [{ _id: '1', win: 'Kept calm under pressure', date: '2026-10-01' }]
      const mockLogs = [
        { state: 'stressed', timestamp: '2026-10-02' },
        { state: 'locked_in', timestamp: '2026-10-01' },
      ]

      const originalFetch = global.fetch
      global.fetch = jest.fn((url: string) => {
        if (url.includes('/api/mind/progress')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockProgress) })
        }
        if (url.includes('/api/mind/wins')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ wins: mockWins }) })
        }
        if (url.includes('/api/mind/state')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ logs: mockLogs }) })
        }
        if (url.includes('/api/mind/session')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ streak: 1 }) })
        }
        if (url.includes('/api/goals')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
        }
        if (url.includes('/api/progress')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
        }
        return Promise.reject(new Error(`Unknown url: ${url}`))
      }) as any

      try {
        const { getByTestId, getByText, getAllByText, findByText } = render(
          <SafeAreaProvider
            initialMetrics={{
              insets: { top: 0, left: 0, right: 0, bottom: 0 },
              frame: { x: 0, y: 0, width: 375, height: 812 },
            }}
          >
            <BecomingDetails
              open={true}
              onClose={jest.fn()}
              initialTab="mind"
              token="test-token"
            />
          </SafeAreaProvider>,
        )

        await findByText('1 DAY STREAK')

        expect(getByTestId('mind-streak-tile')).toBeTruthy()
        expect(getByText('where you started')).toBeTruthy()
        expect(getByText('Ch 2 · Foundation')).toBeTruthy()
        expect(getAllByText('Edge').length).toBeGreaterThanOrEqual(1)

        // 150 XP on Chapter 2 is 100% of chapter 2 (50 to 150)
        expect(getByText('100%')).toBeTruthy()

        // How you've shown up: 1 of 2 is locked_in -> 50%
        expect(getByText('50% locked in')).toBeTruthy()
        expect(getByText('Locked in')).toBeTruthy()
        expect(getByText('Stressed')).toBeTruthy()

        // Dominant is stressed / focus action
        expect(getByText('Calm the storm')).toBeTruthy()

        // Next chapter
        expect(getByText('Next: Edge')).toBeTruthy()
        expect(getByText('Unlocks Discipline')).toBeTruthy()
      } finally {
        global.fetch = originalFetch
      }
    })

    it('renders Story tab with training metrics, mostly stressed, 1-day streak, and empty evidence wall copy', () => {
      const mockWeekWithMetrics: WeekSnapshot = {
        ...MOCK_WEEK,
        mind: {
          sessions: 1,
          moodDays: 2,
          dominant: 'stressed',
          wins: [],
          chapterUnlocked: null,
        },
        training: {
          workouts: 1,
          target: 3,
          hit: false,
          prs: [],
          prCount: 0,
        },
      }

      const mockGoals = {
        training: {
          unit: 'lbs' as const,
          target: { daysPerWeek: 3 },
          week: {
            sessions: 1,
            sets: 6,
            volume: 7800,
            hasWeightedWork: true,
          },
          suggestion: {
            key: 'train-sug',
            title: '2 more by Saturday',
            sub: 'On track',
            url: '/workout',
            severity: 'nudge' as const,
          },
        },
        nutrition: {
          suggestion: {
            key: 'fuel-sug',
            title: 'On pace',
            sub: 'Hold the habits',
            url: '/nutrition',
            severity: 'good' as const,
          },
        },
      }

      const { getByTestId, getByText } = render(
        <SafeAreaProvider
          initialMetrics={{
            insets: { top: 0, left: 0, right: 0, bottom: 0 },
            frame: { x: 0, y: 0, width: 375, height: 812 },
          }}
        >
          <BecomingDetails
            open={true}
            onClose={jest.fn()}
            initialTab="story"
            weeks={[mockWeekWithMetrics]}
            goals={mockGoals as any}
            streak={1}
          />
        </SafeAreaProvider>,
      )

      expect(getByTestId('story-summary')).toBeTruthy()
      expect(getByText('1 of 3 workouts · 6 sets · 7.8k lbs moved')).toBeTruthy()
      expect(getByText(/mostly stressed/)).toBeTruthy()
      expect(getByText('1-day streak')).toBeTruthy()

      // What to do next
      expect(getByText('What to do next')).toBeTruthy()
      expect(getByText('2 more by Saturday')).toBeTruthy()
      expect(getByText('Calm the storm')).toBeTruthy()
      expect(getByText('On pace')).toBeTruthy()

      // Evidence wall empty copy
      expect(getByText('Evidence wall')).toBeTruthy()
      expect(getByText('No wins banked yet. Bank one in a session — the proof that you’re changing builds here.')).toBeTruthy()
    })
  })
})
