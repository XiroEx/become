#!/usr/bin/env node
/**
 * Vendor script to copy pure nutrition modules from webapp/lib to shared/core/src
 * with module imports rewritten.
 *
 * Implements NP-017 / NP-061: the web file remains the source of truth,
 * this script writes the copy, and a drift test in webapp CI fails if
 * any copy diverges from its web source.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

export const MODULE_MAPPINGS = [
  {
    source: 'webapp/lib/units.ts',
    target: 'shared/core/src/units.ts',
    rewrite: (content) => content,
  },
  {
    source: 'webapp/lib/foodMath.ts',
    target: 'shared/core/src/foodMath.ts',
    rewrite: (content) =>
      content
        .replace(
          "import type { IFoodNutrition, IFoodVariant } from '@/models/Food'",
          "import type { IFoodNutrition, IFoodVariant } from './nutrition/types'"
        )
        .replace("from '@/lib/units'", "from './units'"),
  },
  {
    source: 'webapp/lib/mealPlanTimes.ts',
    target: 'shared/core/src/mealPlanTimes.ts',
    rewrite: (content) => content,
  },
  {
    source: 'webapp/lib/mealPlanDates.ts',
    target: 'shared/core/src/mealPlanDates.ts',
    rewrite: (content) => content,
  },
  {
    source: 'webapp/lib/nutrition/servingOptions.ts',
    target: 'shared/core/src/nutrition/servingOptions.ts',
    rewrite: (content) =>
      content
        .replace("from '@/lib/units'", "from '../units'")
        .replace(
          "import type { IFoodVariant } from '@/models/Food'",
          "import type { IFoodVariant } from './types'"
        )
        .replace("from '@/lib/foodMath'", "from '../foodMath'"),
  },
  {
    source: 'webapp/lib/nutrition/servingQuantityStep.ts',
    target: 'shared/core/src/nutrition/servingQuantityStep.ts',
    rewrite: (content) =>
      content.replace("import type { Unit } from '@/lib/units'", "import type { Unit } from '../units'"),
  },
  {
    source: 'webapp/lib/nutrition/dayOrder.ts',
    target: 'shared/core/src/nutrition/dayOrder.ts',
    rewrite: (content) =>
      content.replaceAll("from '@/lib/nutrition/mealSchedule'", "from './mealSchedule'"),
  },
  {
    source: 'webapp/lib/nutrition/mealSchedule.ts',
    target: 'shared/core/src/nutrition/mealSchedule.ts',
    rewrite: (content) =>
      content.replace("from '@/lib/mealPlanTimes'", "from '../mealPlanTimes'"),
  },
  {
    source: 'webapp/lib/nutrition/logTagMatch.ts',
    target: 'shared/core/src/nutrition/logTagMatch.ts',
    rewrite: (content) => content,
  },
  {
    source: 'webapp/lib/nutrition/goalLine.ts',
    target: 'shared/core/src/nutrition/goalLine.ts',
    rewrite: (content) => content,
  },
  {
    source: 'webapp/lib/nutrition/plateReview.ts',
    target: 'shared/core/src/nutrition/plateReview.ts',
    rewrite: (content) =>
      content
        .replace("from '@/lib/units'", "from '../units'")
        .replace("from '@/lib/foodMath'", "from '../foodMath'")
        .replace("from '@/lib/nutrition/servingOptions'", "from './servingOptions'")
        .replace(
          "import type { ServingUnit } from '@/models/Food'",
          "import type { ServingUnit } from './types'"
        )
        .replace(
          "import type { PlateEstimate, EstimatedPlateItem } from '@/lib/nutrition/aiSeams'",
          "import type { PlateEstimate, EstimatedPlateItem } from './types'"
        )
        .replace(
          "import type { IFoodEntry } from '@/lib/nutritionTypes'",
          "import type { IFoodEntry } from './types'"
        )
        .replace(
          "import type { QuantityPickerVariant } from '@/components/nutrition/QuantityPicker'",
          "import type { QuantityPickerVariant } from './types'"
        ),
  },
  {
    source: 'webapp/lib/dashboard/nutritionTrend.ts',
    target: 'shared/core/src/nutrition/nutritionTrend.ts',
    rewrite: (content) => content,
  },
];

export function vendorNutrition() {
  console.log('Vendoring nutrition modules from webapp/lib to shared/core/src...');
  for (const { source, target, rewrite } of MODULE_MAPPINGS) {
    const sourcePath = path.join(REPO_ROOT, source);
    const targetPath = path.join(REPO_ROOT, target);

    const sourceContent = fs.readFileSync(sourcePath, 'utf8');
    const targetContent = rewrite(sourceContent);

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, targetContent, 'utf8');
    console.log(`  ${source} -> ${target}`);
  }
  console.log('Done.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  vendorNutrition();
}
