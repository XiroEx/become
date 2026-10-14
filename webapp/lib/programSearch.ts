/**
 * Program search filtering, deterministic sorting, and pipeline construction.
 *
 * Extracted from app/api/programs/search/route.ts as a pure module so filter,
 * relevance ranking, and total deterministic pagination can be unit-tested
 * without requiring a live MongoDB instance.
 */

import type { PipelineStage } from 'mongoose';

export interface ProgramSearchParams {
  authUserId?: string | null;
  query?: string | null;
  tags?: string[] | null;
  targetUser?: string | null;
  minWeeks?: string | number | null;
  maxWeeks?: string | number | null;
  daysPerWeek?: string | number | null;
}

export interface BuildProgramSearchPipelineParams extends ProgramSearchParams {
  page?: string | number | null;
  limit?: string | number | null;
}

/** Escapes regex metacharacters so user-typed search text can safely be used
 *  inside Mongo $regex or $regexMatch expressions without syntax errors. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Visibility clause: hide customs created by other users from the catalog.
 * Anonymous viewers see only non-custom programs.
 */
export function buildProgramVisibilityClause(authUserId?: string | null) {
  return authUserId
    ? { $or: [{ isCustom: { $ne: true } }, { createdBy: authUserId }] }
    : { isCustom: { $ne: true } };
}

/**
 * Projected fields for program search results.
 * Excludes full phase details (e.g. workouts) for listing cards.
 */
export const PROGRAM_SEARCH_PROJECTION = {
  program_id: 1,
  name: 1,
  description: 1,
  duration_weeks: 1,
  training_days_per_week: 1,
  goal: 1,
  target_user: 1,
  equipment: 1,
  tags: 1,
  'phases.phase': 1,
  'phases.weeks': 1,
  'phases.focus': 1,
} as const;

/**
 * Builds the MongoDB query filter for program search.
 * Used both for countDocuments (pagination total) and the pipeline $match stage.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildProgramSearchFilter(params: ProgramSearchParams): Record<string, any> {
  const { authUserId, query, tags, targetUser, minWeeks, maxWeeks, daysPerWeek } = params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: any = {};

  const visibilityClause = buildProgramVisibilityClause(authUserId);

  const trimmedQuery = typeof query === 'string' ? query.trim() : '';

  if (trimmedQuery) {
    const searchRegex = new RegExp(escapeRegExp(trimmedQuery), 'i');
    filter.$and = [
      visibilityClause,
      {
        $or: [
          { name: searchRegex },
          { tags: searchRegex },
          { description: searchRegex },
          { goal: searchRegex },
        ],
      },
    ];
  } else {
    Object.assign(filter, visibilityClause);
  }

  // Tag filtering (match any of the provided tags)
  if (tags && tags.length > 0) {
    filter.tags = { $in: tags.map(t => new RegExp(escapeRegExp(t), 'i')) };
  }

  // Target user level
  if (targetUser) {
    filter.target_user = targetUser;
  }

  // Duration filtering
  const parsedMinWeeks = minWeeks != null && minWeeks !== '' ? parseInt(String(minWeeks), 10) : undefined;
  const parsedMaxWeeks = maxWeeks != null && maxWeeks !== '' ? parseInt(String(maxWeeks), 10) : undefined;
  if (
    (parsedMinWeeks !== undefined && !Number.isNaN(parsedMinWeeks)) ||
    (parsedMaxWeeks !== undefined && !Number.isNaN(parsedMaxWeeks))
  ) {
    filter.duration_weeks = {};
    if (parsedMinWeeks !== undefined && !Number.isNaN(parsedMinWeeks)) {
      filter.duration_weeks.$gte = parsedMinWeeks;
    }
    if (parsedMaxWeeks !== undefined && !Number.isNaN(parsedMaxWeeks)) {
      filter.duration_weeks.$lte = parsedMaxWeeks;
    }
  }

  // Days per week filtering
  if (daysPerWeek != null && daysPerWeek !== '') {
    const parsedDays = parseInt(String(daysPerWeek), 10);
    if (!Number.isNaN(parsedDays)) {
      filter.training_days_per_week = parsedDays;
    }
  }

  return filter;
}

/**
 * Builds the MongoDB aggregation pipeline for searching programs.
 * Applies total deterministic ordering before skip/limit pagination.
 *
 * When `q` is present:
 * 1. Computes relevance tier in the database:
 *    - Tier 0: name match (highest relevance)
 *    - Tier 1: tag match
 *    - Tier 2: description or goal match
 * 2. Total sort order: { relevance: 1, name: 1, _id: 1 }
 *
 * When `q` is absent:
 * Total sort order: { name: 1, _id: 1 }
 *
 * Because _id is unique on every document, the sort order is total:
 * no two documents can tie, guaranteeing that programs never shuffle
 * between requests or appear on multiple pages.
 */
export function buildProgramSearchPipeline(params: BuildProgramSearchPipelineParams): PipelineStage[] {
  const { page, limit, query } = params;

  const pageNum = Math.max(1, typeof page === 'number' ? page : parseInt(String(page || '1'), 10) || 1);
  const limitNum = Math.max(1, typeof limit === 'number' ? limit : parseInt(String(limit || '20'), 10) || 20);
  const skipNum = (pageNum - 1) * limitNum;

  const filter = buildProgramSearchFilter(params);
  const trimmedQuery = typeof query === 'string' ? query.trim() : '';

  const pipeline: PipelineStage[] = [
    { $match: filter },
  ];

  if (trimmedQuery) {
    const escapedPattern = escapeRegExp(trimmedQuery);
    pipeline.push({
      $addFields: {
        relevance: {
          $switch: {
            branches: [
              {
                case: {
                  $regexMatch: {
                    input: { $ifNull: ['$name', ''] },
                    regex: escapedPattern,
                    options: 'i',
                  },
                },
                then: 0,
              },
              {
                case: {
                  $gt: [
                    {
                      $size: {
                        $filter: {
                          input: { $ifNull: ['$tags', []] },
                          as: 'tag',
                          cond: {
                            $regexMatch: {
                              input: { $ifNull: ['$$tag', ''] },
                              regex: escapedPattern,
                              options: 'i',
                            },
                          },
                        },
                      },
                    },
                    0,
                  ],
                },
                then: 1,
              },
            ],
            default: 2,
          },
        },
      },
    });

    pipeline.push({
      $sort: {
        relevance: 1,
        name: 1,
        _id: 1,
      },
    });
  } else {
    pipeline.push({
      $sort: {
        name: 1,
        _id: 1,
      },
    });
  }

  pipeline.push({ $skip: skipNum });
  pipeline.push({ $limit: limitNum });
  pipeline.push({ $project: PROGRAM_SEARCH_PROJECTION });

  return pipeline;
}
