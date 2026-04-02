import { Page, expect } from '@playwright/test';

const BASE_URL = 'https://become.redbtn.io';

export interface ProgramConfig {
  id: string;
  name: string;
  firstDay: string;
  trainingDaysCount: number;
}

export const PROGRAMS: ProgramConfig[] = [
  // Fast programs first (4-day or short schedules) — these run within the 5/8m timeout
  { id: 'strength-size-20',                         name: 'Strength & Size 2.0',                       firstDay: 'Day 1', trainingDaysCount: 4 },
  { id: 'no-excuses-at-home-transformation',        name: 'No Excuses',                                firstDay: 'Day 1', trainingDaysCount: 4 },
  { id: 'program_5',                                name: '30-Minute Dumbbell',                        firstDay: 'Day 1', trainingDaysCount: 4 },
  { id: 'program_jon_don_split',                    name: 'Jon Don Split',                             firstDay: 'Day 1', trainingDaysCount: 5 },
  { id: 'db-only-total-transformation',             name: 'DB Only',                                   firstDay: 'Day 1', trainingDaysCount: 4 },
  // Slow: 30-Day Shred creates ~150 scheduled workouts — keep outside slice(0,5)
  { id: 'program_2_30day_shred',                   name: '30-Day Shred',                              firstDay: 'Day 1', trainingDaysCount: 5 },
  { id: 'circuit-superset-shred',                   name: 'Circuit',                                   firstDay: 'Day 1', trainingDaysCount: 3 },
  { id: 'program_1_become',                         name: 'BECOME',                                    firstDay: 'Day 1', trainingDaysCount: 4 },
];

/** Abandon current program if enrolled (clears state for fresh run) */
export async function abandonIfEnrolled(page: Page, programId: string) {
  await page.goto(`${BASE_URL}/dashboard/programming/${programId}`);
  await page.waitForLoadState('domcontentloaded');
  // Wait for the page to render — check for abandon button or start button
  await page.waitForSelector(
    'button:has-text("Abandon program"), button:has-text("Start Program"), button:has-text("Continue Program")',
    { timeout: 20_000 }
  ).catch(() => {});

  const abandonBtn = page.locator('button:has-text("Abandon program")');
  if (!(await abandonBtn.isVisible({ timeout: 3_000 }).catch(() => false))) return;

  await abandonBtn.click();
  await page.waitForTimeout(300);

  // Fill "abandon" confirmation if required (has progress)
  const confirmInput = page.locator('input[placeholder*="abandon"]');
  if (await confirmInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await confirmInput.fill('abandon');
    await page.waitForTimeout(200);
  }

  // Click the red Abandon button
  const dialogConfirmBtn = page.locator('.fixed button.bg-red-600:has-text("Abandon")');
  if (await dialogConfirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await dialogConfirmBtn.click();
  } else {
    const fallbackBtn = page.locator('button:has-text("Abandon")').last();
    if (await fallbackBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await fallbackBtn.click();
    }
  }
  // Wait for redirect to /dashboard/programming
  await page.waitForURL('**/dashboard/programming', { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(300);
}

/** Enroll in a program and create a schedule */
export async function enrollAndSchedule(page: Page, programId: string) {
  await page.goto(`${BASE_URL}/dashboard/programming/${programId}`);
  await page.waitForLoadState('domcontentloaded');

  // Wait for either Start or Continue Program button
  const enrollBtn = page.locator('button:has-text("Start Program"), button:has-text("Continue Program")').first();
  await enrollBtn.waitFor({ timeout: 20_000 });
  await enrollBtn.click();
  await page.waitForTimeout(300);

  // Handle enrollment dialog (appears only if NOT already enrolled)
  const enrollDialog = page.locator('.fixed.inset-0.z-50');
  if (await enrollDialog.isVisible({ timeout: 5_000 }).catch(() => false)) {
    // Set start date to today
    const dateInput = enrollDialog.locator('input[type="date"]');
    if (await dateInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const today = new Date().toISOString().split('T')[0];
      await dateInput.fill(today);
      await page.waitForTimeout(100);
    }
    const confirmBtn = enrollDialog.locator('button:has-text("Enroll & Set Up")');
    await confirmBtn.waitFor({ timeout: 5_000 });
    await confirmBtn.click();
    // Wait for navigation to schedule setup page
    await page.waitForURL(`**/programming/${programId}/schedule`, { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(300);
  }

  // --- Schedule setup page ---
  // Wait for h1 to confirm we're on the schedule page
  const scheduleH1 = page.locator('h1:has-text("Set Up Schedule"), h1:has-text("Your Schedule")');
  await scheduleH1.waitFor({ timeout: 15_000 }).catch(() => {});

  // If in "view" mode (existing schedule), recreate it
  const recreateBtn = page.locator('button:has-text("Recreate Schedule")');
  if (await recreateBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await recreateBtn.click();
    await page.waitForTimeout(300);
  }

  // Step 1: Training days — click Next
  const nextBtn = page.locator('button:has-text("Next")');
  if (await nextBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await nextBtn.click();
    await page.waitForTimeout(200);
  }

  // Step 2: Start date — set to today and click Preview Schedule
  const previewBtn = page.locator('button:has-text("Preview Schedule")');
  if (await previewBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    const scheduleDateInput = page.locator('input[type="date"]').first();
    if (await scheduleDateInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const today = new Date().toISOString().split('T')[0];
      await scheduleDateInput.fill(today);
      await page.waitForTimeout(150);
    }
    await previewBtn.click();
    await page.waitForTimeout(300);
  }

  // Step 3: Confirm Schedule
  const confirmScheduleBtn = page.locator('button:has-text("Confirm Schedule")');
  if (await confirmScheduleBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await confirmScheduleBtn.click();
    // Wait for redirect back to program detail
    await page.waitForURL(`**/programming/${programId}`, { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
}

/** Do a workout via the standard form view, completing some sets */
export async function doWorkoutFormView(page: Page, programId: string, day: string): Promise<number> {
  const targetUrl = `${BASE_URL}/dashboard/programming/${programId}/workout?day=${encodeURIComponent(day)}`;
  await page.goto(targetUrl).catch(async () => {
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.goto(targetUrl);
  });
  await page.waitForLoadState('domcontentloaded');

  // Wait for loading spinner to disappear
  await page.waitForFunction(
    () => !document.querySelector('.animate-spin'),
    { timeout: 30_000 }
  ).catch(() => {});

  // Dismiss incomplete workout modal if it appears
  await dismissIncompleteModal(page);

  // Wait for exercise content to appear
  await page.waitForSelector('button:has-text("sets"), [title="Swap exercise"]', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(300);

  let setsCompleted = 0;

  // Expand exercise headers (click collapsed ones)
  const exerciseHeaders = page.locator('button:has-text("sets")');
  const headerCount = await exerciseHeaders.count();
  for (let i = 1; i < Math.min(headerCount, 3); i++) {
    await exerciseHeaders.nth(i).click().catch(() => {});
    await page.waitForTimeout(150);
  }

  // Find set completion toggle buttons
  const toggleBtns = page.locator('.grid-cols-12 button.border-2:not([title])');
  const toggleCount = await toggleBtns.count();

  for (let i = 0; i < Math.min(toggleCount, 6); i++) {
    const btn = toggleBtns.nth(i);
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {});
      setsCompleted++;
      await page.waitForTimeout(100);
    }
  }

  await page.waitForTimeout(200);
  return setsCompleted;
}

/** Dismiss the incomplete workout modal if it appears (click "Restart this day" to stay on requested day) */
async function dismissIncompleteModal(page: Page) {
  try {
    const restartBtn = page.locator('button:has-text("Restart this day")').first();
    // Short timeout — if modal isn't there within 800ms, move on
    if (await restartBtn.isVisible({ timeout: 800 }).catch(() => false)) {
      await restartBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(500).catch(() => {});
    }
  } catch {
    // Modal not present — ignore
  }
}

/** Dismiss the rest timer overlay by clicking "Skip Rest" */
async function dismissRestTimer(page: Page) {
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const skipRestBtn = page.locator('button:has-text("Skip Rest")').first();
      if (await skipRestBtn.isVisible({ timeout: 600 }).catch(() => false)) {
        await skipRestBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(200).catch(() => {});
      } else {
        break;
      }
    }
  } catch {
    // Page may have closed or navigated — ignore
  }
}

/** Do a workout via the live view, stepping through exercises */
export async function doWorkoutLiveView(page: Page, programId: string, day: string) {
  await page.goto(`${BASE_URL}/dashboard/programming/${programId}/workout/live?day=${encodeURIComponent(day)}`);
  await page.waitForLoadState('domcontentloaded');

  // Wait for loading spinner to disappear
  await page.waitForFunction(
    () => !document.querySelector('.animate-spin'),
    { timeout: 30_000 }
  ).catch(() => {});

  // Dismiss incomplete workout modal if it appears
  await dismissIncompleteModal(page);

  await page.waitForSelector(
    'button:has-text("Complete Set"), button:has-text("Finish Workout"), button:has-text("Skip Set")',
    { timeout: 20_000 }
  ).catch(() => {});

  const deadline = Date.now() + 60_000;
  for (let step = 0; step < 30 && Date.now() < deadline; step++) {
    try {
      const skipRest = page.locator('button:has-text("Skip Rest")').first();
      if (await skipRest.isVisible({ timeout: 300 }).catch(() => false)) {
        await skipRest.click({ force: true }).catch(() => {});
        await page.waitForTimeout(150).catch(() => {});
      }

      const url = page.url();
      if (!url.includes('/workout/live')) break;

      const finishBtnMid = page.locator('button:has-text("Finish Workout")').first();
      if (await finishBtnMid.isVisible({ timeout: 300 }).catch(() => false)) {
        await finishBtnMid.click({ force: true });
        await page.waitForTimeout(300).catch(() => {});
        break;
      }

      let inputsFilled = false;

      const quickWeight = page.locator('button:has-text("135")').first();
      if (await quickWeight.isVisible({ timeout: 300 }).catch(() => false)) {
        await quickWeight.click().catch(() => {});
        inputsFilled = true;
      }

      const repsInput = page.locator('input[type="number"]').last();
      if (await repsInput.isVisible({ timeout: 300 }).catch(() => false)) {
        await repsInput.click().catch(() => {});
        await repsInput.fill('10').catch(() => {});
        inputsFilled = true;
      }

      const weightInput = page.locator('input[type="number"]').first();
      if (await weightInput.isVisible({ timeout: 200 }).catch(() => false)) {
        const weightVal = await weightInput.inputValue().catch(() => '');
        if (!weightVal) {
          await weightInput.click().catch(() => {});
          await weightInput.fill('135').catch(() => {});
        }
      }

      await page.waitForTimeout(150).catch(() => {});

      const completeBtn = page.locator('button:has-text("Complete Set")').first();
      if (await completeBtn.isVisible({ timeout: 800 }).catch(() => false)) {
        await completeBtn.click({ force: true });
        await page.waitForTimeout(150).catch(() => {});
        continue;
      }

      const skipSetBtn = page.locator('button:has-text("Skip Set")').first();
      if (await skipSetBtn.isVisible({ timeout: 300 }).catch(() => false)) {
        await skipSetBtn.click({ force: true });
        await page.waitForTimeout(200).catch(() => {});

        const skipAllBtn = page.locator('button:has-text("Skip All Sets")');
        if (await skipAllBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await skipAllBtn.click();
          await page.waitForTimeout(200).catch(() => {});
          continue;
        }
        const skipThisSetBtn = page.locator('button:has-text("Skip This Set Only")');
        if (await skipThisSetBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await skipThisSetBtn.click();
          await page.waitForTimeout(150).catch(() => {});
          continue;
        }
      }

      if (!inputsFilled) break;
    } catch {
      break;
    }
  }

  try {
    const skipRest = page.locator('button:has-text("Skip Rest")').first();
    if (await skipRest.isVisible({ timeout: 500 }).catch(() => false)) {
      await skipRest.click({ force: true }).catch(() => {});
      await page.waitForTimeout(200).catch(() => {});
    }

    const finishBtn = page.locator('button:has-text("Finish Workout")');
    if (await finishBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await finishBtn.click({ force: true });
      await page.waitForTimeout(500).catch(() => {});
    }

    const doneBtn = page.locator('button:has-text("Done")');
    if (await doneBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await doneBtn.click();
      await page.waitForLoadState('domcontentloaded').catch(() => {});
    }
  } catch {
    // Page closed — ignore
  }
}

/** Perform an exercise swap from the workout form view.
 *  Uses a cycling index so repeated calls target different exercises. */
let _swapClickIndex = 0;
export async function swapExercise(page: Page, programId: string, day: string, scope: 'single' | 'program' = 'single'): Promise<boolean> {
  const targetUrl = `${BASE_URL}/dashboard/programming/${programId}/workout?day=${encodeURIComponent(day)}`;
  await page.goto(targetUrl).catch(async () => {
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.goto(targetUrl);
  });
  await page.waitForLoadState('domcontentloaded');

  // Wait for loading spinner to disappear (API response received)
  await page.waitForFunction(
    () => !document.querySelector('.animate-spin'),
    { timeout: 30_000 }
  ).catch(() => {});

  // Dismiss incomplete workout modal if it appears before swap buttons
  await dismissIncompleteModal(page);

  // Wait specifically for swap buttons to appear in the DOM (up to 30s for slow API)
  await page.waitForFunction(
    () => document.querySelectorAll('[title="Swap exercise"]').length > 0,
    { timeout: 30_000 }
  ).catch(() => {});

  await page.waitForTimeout(200);

  const swapBtns = page.locator('[title="Swap exercise"]');
  const swapCount = await swapBtns.count();
  console.log(`[swapExercise] ${programId} ${day}: found ${swapCount} swap buttons`);
  if (swapCount === 0) return false;

  const targetIndex = _swapClickIndex % swapCount;
  _swapClickIndex++;

  const btn = swapBtns.nth(targetIndex);
  if (!(await btn.isVisible().catch(() => false))) {
    console.log(`[swapExercise] btn at index ${targetIndex} not visible`);
    return false;
  }
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await btn.click({ force: true });

  // Wait for swap modal to appear (z-50 overlay)
  const modal = page.locator('.fixed.inset-0.z-50');
  await modal.waitFor({ timeout: 8_000 }).catch(() => {});
  if (!(await modal.isVisible().catch(() => false))) {
    console.log(`[swapExercise] modal did not appear`);
    return false;
  }

  // Wait for alternatives to load: spinner gone AND cards appear (or empty state)
  await page.waitForFunction(() => {
    const m = document.querySelector('.fixed.inset-0.z-50');
    if (!m) return false;
    if (m.querySelector('.animate-spin')) return false;
    const cards = m.querySelectorAll('button.w-full');
    return cards.length > 0 || (m.textContent || '').includes('No alternatives');
  }, { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(200);

  // Click the first alternative card
  const altCards = modal.locator('button.w-full.text-left');
  const altCount = await altCards.count();
  console.log(`[swapExercise] found ${altCount} alternative cards`);
  if (altCount === 0) {
    await closeSwapModal(page, modal);
    return false;
  }

  await altCards.first().click();
  await page.waitForTimeout(600); // Wait for Framer Motion expand

  // Click the appropriate scope button
  if (scope === 'program') {
    const programSwapBtn = modal.locator('button:has-text("Swap for All Future Workouts")');
    if (await programSwapBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await programSwapBtn.click();
      await page.waitForTimeout(300);
      console.log(`[swapExercise] program-level swap done`);
      return true;
    }
  } else {
    const sessionSwapBtn = modal.locator('button:has-text("Just This Session")');
    if (await sessionSwapBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await sessionSwapBtn.click();
      await page.waitForTimeout(300);
      console.log(`[swapExercise] session swap done`);
      return true;
    }
  }

  // Fallback: try either scope button
  const anySwapBtn = modal.locator('button:has-text("Swap for All Future"), button:has-text("Just This Session")').first();
  if (await anySwapBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await anySwapBtn.click();
    await page.waitForTimeout(300);
    console.log(`[swapExercise] fallback swap done`);
    return true;
  }

  console.log(`[swapExercise] no scope button found`);
  await closeSwapModal(page, modal);
  return false;
}

/** Helper to close the swap modal reliably */
async function closeSwapModal(page: Page, modal: ReturnType<Page['locator']>) {
  const closeBtn = modal.locator('button.rounded-full.h-8.w-8, button[aria-label*="close"], button[aria-label*="Close"]').first();
  if (await closeBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await closeBtn.click().catch(() => {});
    await page.waitForTimeout(300);
    return;
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

/** Helper: click a calendar date cell that has a "scheduled" workout dot.
 *  Returns true if a "Manage" button became visible in the detail panel. */
async function clickScheduledWorkoutDate(page: Page): Promise<boolean> {
  // Strategy 1: find date cells with colored dots (program colors or any status)
  // The dots are: div.h-1.5.w-1.5.rounded-full inside a button date cell
  // Exclude completed (bg-green-500) to avoid trying to manage completed workouts
  const dotSelectors = [
    'button:has(div.h-1\\.5.w-1\\.5.rounded-full.bg-blue-500)',
    'button:has(div.h-1\\.5.w-1\\.5.rounded-full.bg-purple-500)',
    'button:has(div.h-1\\.5.w-1\\.5.rounded-full.bg-emerald-500)',
    'button:has(div.h-1\\.5.w-1\\.5.rounded-full.bg-amber-500)',
    // Fallback: any dot
    'button:has(div.h-1\\.5.w-1\\.5.rounded-full)',
  ];

  for (const selector of dotSelectors) {
    const dateCells = page.locator(selector);
    const count = await dateCells.count();
    for (let i = 0; i < count; i++) {
      const cell = dateCells.nth(i);
      if (!(await cell.isVisible().catch(() => false))) continue;
      await cell.click();
      await page.waitForTimeout(400); // Wait for detail panel animation (200ms)
      const manage = page.locator('button:has-text("Manage")').first();
      if (await manage.isVisible({ timeout: 2_000 }).catch(() => false)) {
        return true;
      }
    }
  }

  return false;
}

/** Navigate to next month in the calendar */
async function navigateCalendarNextMonth(page: Page) {
  // The "next" chevron button in the calendar header (flex h-8 w-8, last of the pair)
  const nextBtn = page.locator('button.flex.h-8.w-8').last();
  if (await nextBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await nextBtn.click().catch(() => {});
    await page.waitForTimeout(500);
  }
}

/** Wait for calendar to finish loading schedules */
async function waitForCalendarLoaded(page: Page) {
  // Calendar shows loading skeleton or "No schedules" or the actual grid
  await page.waitForFunction(
    () => {
      // Loading skeleton gone
      const hasSkeleton = !!document.querySelector('.animate-pulse');
      if (hasSkeleton) return false;
      // Either has a calendar grid OR the "no schedules" empty state
      return !!(
        document.querySelector('[class*="grid-cols-7"]') ||
        document.querySelector('h3') // empty state heading
      );
    },
    { timeout: 20_000 }
  ).catch(() => {});
  await page.waitForTimeout(200);
}

/** Skip a workout from the calendar page */
export async function skipWorkout(page: Page, programId: string): Promise<boolean> {
  await page.goto(`${BASE_URL}/dashboard/calendar`);
  await page.waitForLoadState('domcontentloaded');
  await waitForCalendarLoaded(page);

  // Try current month first, then next 2 months
  for (let monthAttempt = 0; monthAttempt < 3; monthAttempt++) {
    if (monthAttempt > 0) {
      await navigateCalendarNextMonth(page);
    }

    // If "Manage" already visible (unlikely on fresh load), use it
    const existingManage = page.locator('button:has-text("Manage")').first();
    if (await existingManage.isVisible({ timeout: 500 }).catch(() => false)) {
      await existingManage.click();
      await page.waitForTimeout(300);
      const skipBtn = page.locator('button:has-text("Skip This Workout")');
      if (await skipBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await skipBtn.click();
        await page.waitForTimeout(300);
        console.log(`[skipWorkout] skipped workout (month attempt ${monthAttempt})`);
        return true;
      }
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(200);
      continue;
    }

    // Find and click a scheduled workout date cell
    const found = await clickScheduledWorkoutDate(page);
    if (!found) {
      console.log(`[skipWorkout] no workout dots found in month attempt ${monthAttempt}`);
      continue;
    }

    // Click "Manage"
    const manageBtn = page.locator('button:has-text("Manage")').first();
    if (!(await manageBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      console.log(`[skipWorkout] Manage button not found after clicking date`);
      continue;
    }
    await manageBtn.click();
    await page.waitForTimeout(300);

    // Click "Skip This Workout"
    const skipBtn = page.locator('button:has-text("Skip This Workout")');
    if (await skipBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await skipBtn.click();
      await page.waitForTimeout(300);
      console.log(`[skipWorkout] skipped workout`);
      return true;
    }

    // Modal opened but no Skip button — close it
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(200);
  }

  console.log(`[skipWorkout] failed — no scheduled workouts found`);
  return false;
}

/** Reschedule a workout from the calendar page (Move to Tomorrow) */
export async function rescheduleWorkout(page: Page): Promise<boolean> {
  await page.goto(`${BASE_URL}/dashboard/calendar`);
  await page.waitForLoadState('domcontentloaded');
  await waitForCalendarLoaded(page);

  // Try current month first, then next 2 months
  for (let monthAttempt = 0; monthAttempt < 3; monthAttempt++) {
    if (monthAttempt > 0) {
      await navigateCalendarNextMonth(page);
    }

    // If "Manage" already visible, use it
    const existingManage = page.locator('button:has-text("Manage")').first();
    if (await existingManage.isVisible({ timeout: 500 }).catch(() => false)) {
      await existingManage.click();
      await page.waitForTimeout(300);
      const moveBtn = page.locator('button:has-text("Move to Tomorrow")');
      if (await moveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await moveBtn.click();
        await page.waitForTimeout(300);
        console.log(`[rescheduleWorkout] rescheduled workout (month attempt ${monthAttempt})`);
        return true;
      }
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(200);
      continue;
    }

    // Find and click a scheduled workout date cell
    const found = await clickScheduledWorkoutDate(page);
    if (!found) {
      console.log(`[rescheduleWorkout] no workout dots found in month attempt ${monthAttempt}`);
      continue;
    }

    // Click "Manage"
    const manageBtn = page.locator('button:has-text("Manage")').first();
    if (!(await manageBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      console.log(`[rescheduleWorkout] Manage button not found after clicking date`);
      continue;
    }
    await manageBtn.click();
    await page.waitForTimeout(300);

    // Click "Move to Tomorrow"
    const moveBtn = page.locator('button:has-text("Move to Tomorrow")');
    if (await moveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await moveBtn.click();
      await page.waitForTimeout(300);
      console.log(`[rescheduleWorkout] rescheduled workout`);
      return true;
    }

    // Modal opened but no Move button — close it
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(200);
  }

  console.log(`[rescheduleWorkout] failed — no scheduled workouts found`);
  return false;
}
