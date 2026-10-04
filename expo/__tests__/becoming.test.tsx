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
      expect(getByText('In progress')).toBeTruthy()
      expect(getByTestId('week-card-wins')).toBeTruthy()
      expect(getByText('Kept focus under pressure')).toBeTruthy()

      // Press details button
      const detailsBtn = getByTestId('week-card-details-btn')
      fireEvent.press(detailsBtn)
      expect(onDetails).toHaveBeenCalledTimes(1)
    })

    it('renders HorizonCard with unwritten future and next steps', () => {
      const onNavigate = jest.fn()
      const { getByTestId, getByText } = render(
        <HorizonCard
          identity="Consistent, disciplined builder"
          next={MOCK_JOURNEY.next}
          onNavigate={onNavigate}
        />,
      )

      expect(getByTestId('horizon-card')).toBeTruthy()
      expect(getByText('The horizon')).toBeTruthy()
      expect(getByText('Next Sunday · unwritten')).toBeTruthy()
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
  })
})
