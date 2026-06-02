/**
 * Live Workout Completability Test
 *
 * Navigates through the live workout UI for the Jon Don Split and BECOME programs,
 * completing full workouts step-by-step and verifying the summary screen appears.
 *
 * Auth: Permanent JWT generated at runtime from JWT_SECRET (no expiry — never needs updating).
 * Requires webapp/.env.local with JWT_SECRET set.
 *
 * Run: cd /home/alpha/code/become && node_modules/.bin/playwright test webapp/tests/e2e/live-workout-completability.spec.ts --headed=false
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { authenticate, BASE_URL, AUTH_TOKEN } from './test-auth';

// ─── Enrollment helper ───────────────────────────────────────────────────────

async function ensureEnrolledAndScheduled(page: Page, programId: string) {
  await page.goto(`${BASE_URL}/dashboard/workout/${programId}`);
  await page.waitForLoadState('domcontentloaded');

  // Wait for any of the key buttons to appear (indicating page loaded)
  await page.waitForSelector(
    'button:has-text("Start Program"), button:has-text("Continue Program"), button:has-text("Abandon program")',
    { timeout: 25_000 }
  ).catch(() => {});

  // Extra wait for React hydration
  await page.waitForTimeout(500);

  const abandonBtn = page.locator('button:has-text("Abandon program")');
  const continueBtn = page.locator('button:has-text("Continue Program")');
  const isEnrolled = (await abandonBtn.isVisible({ timeout: 3_000 }).catch(() => false))
    || (await continueBtn.isVisible({ timeout: 1_000 }).catch(() => false));

  console.log(`[ensureEnrolled] programId=${programId} isEnrolled=${isEnrolled}`);

  if (!isEnrolled) {
    // Enroll
    const startBtn = page.locator('button:has-text("Start Program"), button:has-text("Continue Program")').first();
    await startBtn.waitFor({ timeout: 10_000 });
    await startBtn.click();
    await page.waitForTimeout(300);

    // Handle enrollment dialog
    const enrollDialog = page.locator('.fixed.inset-0.z-50:has(button:has-text("Enroll & Set Up"))');
    if (await enrollDialog.isVisible({ timeout: 4_000 }).catch(() => false)) {
      const dateInput = enrollDialog.locator('input[type="date"]');
      if (await dateInput.isVisible({ timeout: 1_500 }).catch(() => false)) {
        const today = new Date().toISOString().split('T')[0];
        await dateInput.fill(today);
      }
      await enrollDialog.locator('button:has-text("Enroll & Set Up")').click();
      await page.waitForURL(`**/programming/${programId}/schedule`, { timeout: 10_000 }).catch(() => {});
    }

    // Schedule setup
    const scheduleH1 = page.locator('h1:has-text("Set Up Schedule"), h1:has-text("Your Schedule")');
    await scheduleH1.waitFor({ timeout: 10_000 }).catch(() => {});

    const recreateBtn = page.locator('button:has-text("Recreate Schedule")');
    if (await recreateBtn.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await recreateBtn.click();
      await page.waitForTimeout(200);
    }

    const nextBtn = page.locator('button:has-text("Next")');
    if (await nextBtn.isVisible({ timeout: 4_000 }).catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(150);
    }

    const previewBtn = page.locator('button:has-text("Preview Schedule")');
    if (await previewBtn.isVisible({ timeout: 4_000 }).catch(() => false)) {
      const scheduleDateInput = page.locator('input[type="date"]').first();
      if (await scheduleDateInput.isVisible({ timeout: 1_500 }).catch(() => false)) {
        await scheduleDateInput.fill(new Date().toISOString().split('T')[0]);
        await page.waitForTimeout(100);
      }
      await previewBtn.click();
      await page.waitForTimeout(200);
    }

    const confirmBtn = page.locator('button:has-text("Confirm Schedule")');
    if (await confirmBtn.isVisible({ timeout: 6_000 }).catch(() => false)) {
      await confirmBtn.click();
      await page.waitForURL(`**/programming/${programId}`, { timeout: 10_000 }).catch(() => {});
    }
  }
}

// ─── Live workout helper ──────────────────────────────────────────────────────

interface LiveWorkoutResult {
  stepsCompleted: number;
  skipsUsed: number;
  restTimersSkipped: number;
  summaryVisible: boolean;
  errors: string[];
  exercisesEncountered: string[];
  finalButtonText: string;
}

/** Safe click: catches errors and timeouts instead of throwing */
async function safeClick(locator: ReturnType<Page['locator']>, opts: { force?: boolean; timeout?: number } = {}): Promise<boolean> {
  try {
    await locator.click({ force: opts.force ?? false, timeout: opts.timeout ?? 2_000 });
    return true;
  } catch {
    return false;
  }
}

async function runLiveWorkout(page: Page, programId: string, day: string): Promise<LiveWorkoutResult> {
  const result: LiveWorkoutResult = {
    stepsCompleted: 0,
    skipsUsed: 0,
    restTimersSkipped: 0,
    summaryVisible: false,
    errors: [],
    exercisesEncountered: [],
    finalButtonText: '',
  };

  const liveUrl = `${BASE_URL}/dashboard/workout/${programId}/workout/live?day=${encodeURIComponent(day)}`;
  await page.goto(liveUrl);
  await page.waitForLoadState('domcontentloaded');

  // Wait for loading spinner to disappear
  await page.waitForFunction(
    () => !document.querySelector('.animate-spin'),
    { timeout: 15_000 }
  ).catch(() => {});

  // Handle "Restart this day" / incomplete workout modal
  const restartBtn = page.locator('button:has-text("Restart this day")').first();
  if (await restartBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    console.log('[live] Dismissing incomplete workout modal (Restart this day)');
    await safeClick(restartBtn, { force: true, timeout: 3_000 });
    const overlay = page.locator('.fixed.inset-0.z-50:has(button:has-text("Restart this day"))');
    await overlay.waitFor({ state: 'hidden', timeout: 4_000 }).catch(() => {});
    await page.waitForTimeout(300);
    // Wait for workout to reload after restart
    await page.waitForFunction(
      () => !document.querySelector('.animate-spin'),
      { timeout: 8_000 }
    ).catch(() => {});
  }

  // Wait for first exercise/button to appear
  await page.waitForSelector(
    'button:has-text("Complete Set"), button:has-text("Done →"), button:has-text("Finish Workout"), button:has-text("Skip Set")',
    { timeout: 20_000 }
  ).catch(() => {
    result.errors.push('Timed out waiting for workout UI to load');
  });

  // Check if we're already on the summary (shouldn't happen on first load but just in case)
  const earlyDoneBtn = page.locator('button:has-text("I\'ll Be Back"), button:has-text("Find My Next Challenge")');
  if (await earlyDoneBtn.isVisible({ timeout: 500 }).catch(() => false)) {
    result.summaryVisible = true;
    result.finalButtonText = (await earlyDoneBtn.first().textContent())?.trim() ?? '';
    return result;
  }

  const deadline = Date.now() + 240_000; // 4 min max
  let stepLoop = 0;
  const MAX_STEPS = 400;

  while (stepLoop < MAX_STEPS && Date.now() < deadline) {
    stepLoop++;

    try {
      // --- 1. Check summary screen (workout complete) ---
      const summaryDoneBtn = page.locator('button:has-text("I\'ll Be Back"), button:has-text("Find My Next Challenge")');
      if (await summaryDoneBtn.isVisible({ timeout: 200 }).catch(() => false)) {
        result.summaryVisible = true;
        result.finalButtonText = (await summaryDoneBtn.first().textContent())?.trim() ?? '';
        console.log(`[live] Summary reached! Button: "${result.finalButtonText}"`);
        break;
      }

      // Also check by body text (sometimes the button renders with SVG child and has-text may miss)
      const bodyText = await page.textContent('body').catch(() => '');
      if (bodyText?.includes("WORKOUT DONE") || bodyText?.includes("YOU CRUSHED IT") || bodyText?.includes("PROGRAM COMPLETE")) {
        console.log('[live] Summary detected via body text');
        result.summaryVisible = true;
        break;
      }

      // --- 2. Ensure still on live page ---
      const url = page.url();
      if (!url.includes('/workout/live')) {
        console.log(`[live] Navigated away from live page: ${url}`);
        break;
      }

      // --- 3. Handle skip modal (opened by "Skip Set →" OR empty inputs on Finish Workout) ---
      const skipModal = page.locator('.fixed.inset-0.z-50:has(h3:has-text("Skip Set?"))');
      if (await skipModal.isVisible({ timeout: 200 }).catch(() => false)) {
        // If this is on last step, check for "Skip This Set Only" which will complete workout
        const skipThisSet = page.locator('button:has-text("Skip This Set Only")').first();
        if (await skipThisSet.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await safeClick(skipThisSet, { timeout: 2_000 });
          result.skipsUsed++;
          await page.waitForTimeout(300);
          // After skipping last set, summary should appear
          await page.waitForTimeout(500);
          continue;
        }
        const skipAllSets = page.locator('button:has-text("Skip All Sets")').first();
        if (await skipAllSets.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await safeClick(skipAllSets, { timeout: 2_000 });
          result.skipsUsed++;
          await page.waitForTimeout(300);
          continue;
        }
        // Close modal
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        continue;
      }

      // --- 4. Skip rest timer (use short timeout — element detaches as timer expires naturally) ---
      const skipRestBtn = page.locator('button:has-text("Skip Rest")').first();
      if (await skipRestBtn.isVisible({ timeout: 200 }).catch(() => false)) {
        const clicked = await safeClick(skipRestBtn, { force: true, timeout: 800 });
        if (clicked) result.restTimersSkipped++;
        await page.waitForTimeout(100);
        continue;
      }

      // --- 5. Track current exercise name ---
      const exerciseHeader = page.locator('h1.text-2xl, h1.font-bold').first();
      if (await exerciseHeader.isVisible({ timeout: 200 }).catch(() => false)) {
        const name = (await exerciseHeader.textContent())?.trim() ?? '';
        if (name && name.length < 60 && !result.exercisesEncountered.includes(name)) {
          result.exercisesEncountered.push(name);
          console.log(`[live] Exercise: ${name}`);
        }
      }

      // --- 6. Fill inputs ---
      // Use quick weight buttons + type into reps
      // Strategy: always try to fill inputs before clicking any action button
      const weightLabel = page.locator('label:has-text("Weight (lbs)")');
      const hasWeight = await weightLabel.isVisible({ timeout: 200 }).catch(() => false);

      if (hasWeight) {
        // For weighted exercises: use the quick "135" button which directly updates React state
        const quick135 = page.locator('button:has-text("135")').first();
        const hasQuick135 = await quick135.isVisible({ timeout: 200 }).catch(() => false);
        if (hasQuick135) {
          await safeClick(quick135, { timeout: 1_000 });
          await page.waitForTimeout(100);
        }
        // Fill reps input via fill() which fires proper React events
        const repsInput = page.locator('input[type="number"]').last();
        if (await repsInput.isVisible({ timeout: 200 }).catch(() => false)) {
          await repsInput.fill('10').catch(() => {});
          await page.waitForTimeout(100);
        }
      } else {
        // reps_bodyweight, reps_only, or time/intervals
        const anyInput = page.locator('input[type="number"]').first();
        if (await anyInput.isVisible({ timeout: 200 }).catch(() => false)) {
          await anyInput.fill('10').catch(() => {});
          await page.waitForTimeout(100);
        }
      }

      await page.waitForTimeout(300); // Let React process input state change

      // --- 7. Read current button state (text + color) ---
      // The main action button: green = will complete, grey = will skip (inputs empty)
      const actionBtn = page.locator('button.flex-1.rounded-full').first();
      const btnText = await actionBtn.textContent({ timeout: 500 }).catch(() => '');
      const btnClass = await actionBtn.getAttribute('class', { timeout: 500 }).catch(() => '');
      const isGreenBtn = btnClass?.includes('bg-green-500') ?? false;
      const isGreyBtn = btnClass?.includes('bg-zinc-600') ?? false;
      console.log(`[live] Button: "${btnText?.trim()?.slice(0, 30)}" green=${isGreenBtn} grey=${isGreyBtn}`);

      // --- 8. Act based on button text + color ---
      if (btnText?.includes('Finish Workout') && isGreenBtn) {
        // Last step with inputs properly filled (green = will complete not skip)
        console.log('[live] Clicking Finish Workout (green, inputs filled)');
        const clicked = await safeClick(actionBtn, { force: true, timeout: 5_000 });
        if (clicked) result.stepsCompleted++;
        // Wait for summary with generous timeout (API save + animation)
        const summaryBtn = page.locator('button:has-text("I\'ll Be Back"), button:has-text("Find My Next Challenge")');
        if (await summaryBtn.isVisible({ timeout: 12_000 }).catch(() => false)) {
          result.summaryVisible = true;
          result.finalButtonText = (await summaryBtn.first().textContent())?.trim() ?? '';
          console.log(`[live] Summary: "${result.finalButtonText}"`);
        } else {
          // Final body check
          const finalText = await page.textContent('body').catch(() => '');
          if (finalText?.includes("WORKOUT DONE") || finalText?.includes("YOU CRUSHED IT") || finalText?.includes("I'll Be Back")) {
            result.summaryVisible = true;
          }
        }
        break;
      } else if (isGreyBtn || btnText?.includes('Skip Set')) {
        // Grey button = inputs empty — clicking will open skip modal
        console.log('[live] Grey button (skip state) — opening modal');
        await safeClick(actionBtn, { force: true, timeout: 2_000 });
        await page.waitForTimeout(400); // Wait for modal to animate in
        continue; // Next iteration handles the skip modal (step 3 above)
      } else if (btnText?.includes('Complete Set') || btnText?.includes('Done')) {
        // Normal complete
        const clicked = await safeClick(actionBtn, { force: true, timeout: 3_000 });
        if (clicked) {
          result.stepsCompleted++;
          await page.waitForTimeout(100);
          continue;
        }
      } else {
        // Fallback: try specific locators
        const completeBtn = page.locator('button:has-text("Complete Set →"), button:has-text("Complete Set")').first();
        if (await completeBtn.isVisible({ timeout: 300 }).catch(() => false)) {
          const clicked = await safeClick(completeBtn, { force: true, timeout: 3_000 });
          if (clicked) { result.stepsCompleted++; await page.waitForTimeout(100); continue; }
        }
        const doneBtn = page.locator('button:has-text("Done →")').first();
        if (await doneBtn.isVisible({ timeout: 300 }).catch(() => false)) {
          const clicked = await safeClick(doneBtn, { force: true, timeout: 3_000 });
          if (clicked) { result.stepsCompleted++; await page.waitForTimeout(100); continue; }
        }
        const skipSetBtn = page.locator('button:has-text("Skip Set →")').first();
        if (await skipSetBtn.isVisible({ timeout: 300 }).catch(() => false)) {
          await safeClick(skipSetBtn, { force: true, timeout: 2_000 });
          await page.waitForTimeout(400);
          continue;
        }
        // Brief wait and retry
        await page.waitForTimeout(300);
      }

    } catch (err) {
      const errMsg = String(err);
      console.log(`[live] Step ${stepLoop} caught: ${errMsg.slice(0, 120)}`);
      if (errMsg.includes('Target closed') || errMsg.includes('page was closed')) {
        result.errors.push(`Page closed at step ${stepLoop}`);
        break;
      }
      await page.waitForTimeout(100);
    }
  }

  return result;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Live Workout Completability', () => {
  test.beforeEach(async ({ page, context }) => {
    await authenticate(page, context);
  });

  // ─── Auth token for inline API calls ─────────────────────────────────────
  // AUTH_TOKEN is imported from test-auth and is permanent (no expiry)

  // ── Jon Don Split: Day 1 ──────────────────────────────────────────────────
  test('Jon Don Split — Day 1 (Chest, Shoulders, Biceps) completes to summary', async ({ page, context }) => {
    const programId = 'program_jon_don_split';
    const day = 'Day 1';

    console.log(`\n=== Jon Don Split Day 1 ===`);

    // Ensure enrolled
    await ensureEnrolledAndScheduled(page, programId);

    // Run live workout
    const result = await runLiveWorkout(page, programId, day);

    console.log(`Steps completed: ${result.stepsCompleted}`);
    console.log(`Skips used: ${result.skipsUsed}`);
    console.log(`Rest timers skipped: ${result.restTimersSkipped}`);
    console.log(`Exercises: ${result.exercisesEncountered.join(', ')}`);
    console.log(`Summary visible: ${result.summaryVisible}`);
    console.log(`Final button: "${result.finalButtonText}"`);
    if (result.errors.length > 0) {
      console.log(`Errors: ${result.errors.join('; ')}`);
    }

    // Verify summary appeared
    expect(result.summaryVisible, `Summary not shown. Errors: ${result.errors.join('; ')}`).toBe(true);
    expect(result.stepsCompleted + result.skipsUsed, 'No sets were completed or skipped').toBeGreaterThan(0);

    // Verify summary screen elements
    const summaryTrophy = page.locator('h1:has-text("WORKOUT DONE"), h1:has-text("YOU CRUSHED IT"), h1:has-text("PROGRAM COMPLETE")');
    await expect(summaryTrophy).toBeVisible({ timeout: 5_000 });

    // Verify stats are shown
    const statsGrid = page.locator('.grid-cols-3');
    await expect(statsGrid).toBeVisible({ timeout: 3_000 });

    // Verify "I'll Be Back" or "Find My Next Challenge" button
    const doneBtn = page.locator('button:has-text("I\'ll Be Back"), button:has-text("Find My Next Challenge")');
    await expect(doneBtn).toBeVisible({ timeout: 3_000 });
  });

  // ── Jon Don Split: Day 2 ──────────────────────────────────────────────────
  test('Jon Don Split — Day 2 completes to summary', async ({ page, context }) => {
    const programId = 'program_jon_don_split';
    const day = 'Day 2';

    console.log(`\n=== Jon Don Split Day 2 ===`);

    await ensureEnrolledAndScheduled(page, programId);

    const result = await runLiveWorkout(page, programId, day);

    console.log(`Steps completed: ${result.stepsCompleted}`);
    console.log(`Skips used: ${result.skipsUsed}`);
    console.log(`Rest timers skipped: ${result.restTimersSkipped}`);
    console.log(`Exercises: ${result.exercisesEncountered.join(', ')}`);
    console.log(`Summary visible: ${result.summaryVisible}`);
    if (result.errors.length > 0) {
      console.log(`Errors: ${result.errors.join('; ')}`);
    }

    expect(result.summaryVisible, `Summary not shown. Errors: ${result.errors.join('; ')}`).toBe(true);
    expect(result.stepsCompleted + result.skipsUsed).toBeGreaterThan(0);

    const summaryHeading = page.locator('h1:has-text("WORKOUT DONE"), h1:has-text("YOU CRUSHED IT"), h1:has-text("PROGRAM COMPLETE")');
    await expect(summaryHeading).toBeVisible({ timeout: 5_000 });
  });

  // ── Jon Don Split: "Continue Program" navigation ─────────────────────────
  test('Jon Don Split — Continue Program navigates to correct live workout', async ({ page, context }) => {
    const programId = 'program_jon_don_split';

    console.log(`\n=== Jon Don Split: Continue Program navigation ===`);

    await ensureEnrolledAndScheduled(page, programId);

    // Go to program detail
    await page.goto(`${BASE_URL}/dashboard/workout/${programId}`);
    await page.waitForLoadState('domcontentloaded');

    // Wait for Continue Program button
    const continueBtn = page.locator('button:has-text("Continue Program")');
    await expect(continueBtn).toBeVisible({ timeout: 15_000 });

    // Click it and it should navigate to live or workout page
    await continueBtn.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    const url = page.url();
    console.log(`After Continue Program: ${url}`);

    // Should be on some workout-related page (live or workout form)
    expect(url).toContain(programId);
    expect(url).toMatch(/workout|schedule/);

    // If redirected to live, verify it loaded
    if (url.includes('/workout/live')) {
      // Wait for loading to finish
      await page.waitForFunction(
        () => !document.querySelector('.animate-spin'),
        { timeout: 10_000 }
      ).catch(() => {});

      // Dismiss stale modal if present
      const restartBtn = page.locator('button:has-text("Restart this day")').first();
      if (await restartBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await restartBtn.click({ force: true });
        await page.waitForTimeout(300);
      }

      // Should show workout controls or summary
      const workoutVisible = await page.locator(
        'button:has-text("Complete Set"), button:has-text("Done →"), button:has-text("Finish Workout"), button:has-text("I\'ll Be Back")'
      ).isVisible({ timeout: 15_000 }).catch(() => false);

      expect(workoutVisible, 'Live workout UI did not load after Continue Program').toBe(true);
    }
  });

  // ── BECOME program (enroll + Day 1) ──────────────────────────────────────
  test('BECOME program — Day 1 completes to summary', async ({ page, context }) => {
    const programId = 'program_1_become';
    const day = 'Day 1';

    console.log(`\n=== BECOME Program Day 1 ===`);

    // Enroll in BECOME (user may not be enrolled)
    await ensureEnrolledAndScheduled(page, programId);

    const result = await runLiveWorkout(page, programId, day);

    console.log(`Steps completed: ${result.stepsCompleted}`);
    console.log(`Skips used: ${result.skipsUsed}`);
    console.log(`Rest timers skipped: ${result.restTimersSkipped}`);
    console.log(`Exercises: ${result.exercisesEncountered.join(', ')}`);
    console.log(`Summary visible: ${result.summaryVisible}`);
    if (result.errors.length > 0) {
      console.log(`Errors: ${result.errors.join('; ')}`);
    }

    expect(result.summaryVisible, `Summary not shown. Errors: ${result.errors.join('; ')}`).toBe(true);
    expect(result.stepsCompleted + result.skipsUsed).toBeGreaterThan(0);

    const summaryHeading = page.locator('h1:has-text("WORKOUT DONE"), h1:has-text("YOU CRUSHED IT"), h1:has-text("PROGRAM COMPLETE")');
    await expect(summaryHeading).toBeVisible({ timeout: 5_000 });

    // Verify the 3-column stats grid (duration, sets, volume)
    const statsGrid = page.locator('.grid-cols-3');
    await expect(statsGrid).toBeVisible({ timeout: 3_000 });

    console.log('[BECOME Day 1] Summary confirmed');
  });

  // ── Strength & Size 2.0: Day 1 (bonus coverage) ──────────────────────────
  test('Strength & Size 2.0 — Day 1 completes to summary', async ({ page, context }) => {
    const programId = 'strength-size-20';
    const day = 'Day 1';

    console.log(`\n=== Strength & Size 2.0 Day 1 ===`);

    await ensureEnrolledAndScheduled(page, programId);

    const result = await runLiveWorkout(page, programId, day);

    console.log(`Steps completed: ${result.stepsCompleted}`);
    console.log(`Skips used: ${result.skipsUsed}`);
    console.log(`Rest timers skipped: ${result.restTimersSkipped}`);
    console.log(`Exercises: ${result.exercisesEncountered.join(', ')}`);
    console.log(`Summary visible: ${result.summaryVisible}`);
    if (result.errors.length > 0) {
      console.log(`Errors: ${result.errors.join('; ')}`);
    }

    expect(result.summaryVisible, `Summary not shown. Errors: ${result.errors.join('; ')}`).toBe(true);
    expect(result.stepsCompleted + result.skipsUsed).toBeGreaterThan(0);

    const summaryHeading = page.locator('h1:has-text("WORKOUT DONE"), h1:has-text("YOU CRUSHED IT"), h1:has-text("PROGRAM COMPLETE")');
    await expect(summaryHeading).toBeVisible({ timeout: 5_000 });
  });
});
