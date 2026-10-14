// Run with: npm run test:file tests/unit/programSearch.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildProgramVisibilityClause,
  buildProgramSearchFilter,
  buildProgramSearchPipeline,
  PROGRAM_SEARCH_PROJECTION,
  escapeRegExp,
} from '../../lib/programSearch';

test('escapeRegExp escapes regex metacharacters properly', () => {
  assert.equal(escapeRegExp('Bench Press (5x5)'), 'Bench Press \\(5x5\\)');
  assert.equal(escapeRegExp('Push/Pull [Advanced]'), 'Push/Pull \\[Advanced\\]');
  assert.equal(escapeRegExp('Strength + Conditioning * 100%'), 'Strength \\+ Conditioning \\* 100%');
  assert.equal(escapeRegExp('Plain Text 123'), 'Plain Text 123');
});

test('buildProgramVisibilityClause returns non-custom filter for anonymous users', () => {
  const clauseAnon = buildProgramVisibilityClause(null);
  assert.deepEqual(clauseAnon, { isCustom: { $ne: true } });

  const clauseUndefined = buildProgramVisibilityClause(undefined);
  assert.deepEqual(clauseUndefined, { isCustom: { $ne: true } });
});

test('buildProgramVisibilityClause includes user custom programs for authenticated users', () => {
  const userId = 'user_6acfabc3';
  const clause = buildProgramVisibilityClause(userId);
  assert.deepEqual(clause, {
    $or: [{ isCustom: { $ne: true } }, { createdBy: userId }],
  });
});

test('buildProgramSearchFilter constructs base visibility filter when no search params given', () => {
  const filter = buildProgramSearchFilter({ authUserId: null });
  assert.deepEqual(filter, { isCustom: { $ne: true } });
});

test('buildProgramSearchFilter builds text search clause across name, tags, description, and goal', () => {
  const filter = buildProgramSearchFilter({
    authUserId: 'user_123',
    query: 'hypertrophy',
  });

  assert.ok(filter.$and, 'filter.$and must exist when query is present');
  assert.equal(filter.$and.length, 2);

  // First element of $and is visibility clause
  assert.deepEqual(filter.$and[0], {
    $or: [{ isCustom: { $ne: true } }, { createdBy: 'user_123' }],
  });

  // Second element of $and is the $or matching 4 fields
  const textOr = filter.$and[1];
  assert.ok(textOr.$or, '$or clause must exist for text matching');
  assert.equal(textOr.$or.length, 4);

  const fields = textOr.$or.map((branch: Record<string, RegExp>) => Object.keys(branch)[0]);
  assert.deepEqual(fields, ['name', 'tags', 'description', 'goal']);

  for (const branch of textOr.$or) {
    const key = Object.keys(branch)[0];
    const regex = branch[key];
    assert.ok(regex instanceof RegExp);
    assert.equal(regex.source, 'hypertrophy');
    assert.equal(regex.flags, 'i');
  }
});

test('buildProgramSearchFilter escapes special characters in query without throwing', () => {
  assert.doesNotThrow(() => {
    const filter = buildProgramSearchFilter({
      authUserId: null,
      query: 'Legs (Day 1) [Hard] *',
    });
    const textOr = filter.$and[1].$or;
    const nameRegex = textOr[0].name;
    assert.ok(nameRegex.test('Legs (Day 1) [Hard] * Special'));
    assert.ok(!nameRegex.test('Legs Day 1 Hard'));
  });
});

test('buildProgramSearchFilter builds tags clause as $in regex array', () => {
  const filter = buildProgramSearchFilter({
    tags: ['strength', 'powerlifting'],
  });

  assert.ok(filter.tags?.$in, 'filter.tags.$in must be present');
  assert.equal(filter.tags.$in.length, 2);
  assert.equal(filter.tags.$in[0].source, 'strength');
  assert.equal(filter.tags.$in[0].flags, 'i');
  assert.equal(filter.tags.$in[1].source, 'powerlifting');
  assert.equal(filter.tags.$in[1].flags, 'i');
});

test('buildProgramSearchFilter builds target_user (level) clause', () => {
  const filter = buildProgramSearchFilter({
    targetUser: 'Intermediate',
  });
  assert.equal(filter.target_user, 'Intermediate');
});

test('buildProgramSearchFilter builds duration_weeks clause with minWeeks and maxWeeks', () => {
  const filterBoth = buildProgramSearchFilter({ minWeeks: '4', maxWeeks: '12' });
  assert.deepEqual(filterBoth.duration_weeks, { $gte: 4, $lte: 12 });

  const filterMin = buildProgramSearchFilter({ minWeeks: 6 });
  assert.deepEqual(filterMin.duration_weeks, { $gte: 6 });

  const filterMax = buildProgramSearchFilter({ maxWeeks: 8 });
  assert.deepEqual(filterMax.duration_weeks, { $lte: 8 });
});

test('buildProgramSearchFilter builds training_days_per_week clause', () => {
  const filterNum = buildProgramSearchFilter({ daysPerWeek: 4 });
  assert.equal(filterNum.training_days_per_week, 4);

  const filterStr = buildProgramSearchFilter({ daysPerWeek: '5' });
  assert.equal(filterStr.training_days_per_week, 5);
});

test('buildProgramSearchFilter combines tag, level, weeks, days, and query simultaneously', () => {
  const filter = buildProgramSearchFilter({
    authUserId: 'user_456',
    query: 'muscle',
    tags: ['hypertrophy'],
    targetUser: 'Advanced',
    minWeeks: 8,
    maxWeeks: 16,
    daysPerWeek: 5,
  });

  assert.ok(filter.$and, 'text search and visibility in $and');
  assert.deepEqual(filter.target_user, 'Advanced');
  assert.deepEqual(filter.duration_weeks, { $gte: 8, $lte: 16 });
  assert.equal(filter.training_days_per_week, 5);
  assert.equal(filter.tags.$in.length, 1);
  assert.equal(filter.tags.$in[0].source, 'hypertrophy');
});

test('buildProgramSearchPipeline applies correct paging maths (skip from page/limit)', () => {
  // Page 1, limit 20 -> skip 0
  const p1 = buildProgramSearchPipeline({ page: 1, limit: 20 });
  const skip1 = p1.find((s) => '$skip' in s);
  const limit1 = p1.find((s) => '$limit' in s);
  assert.deepEqual(skip1, { $skip: 0 });
  assert.deepEqual(limit1, { $limit: 20 });

  // Page 2, limit 20 -> skip 20
  const p2 = buildProgramSearchPipeline({ page: 2, limit: 20 });
  const skip2 = p2.find((s) => '$skip' in s);
  const limit2 = p2.find((s) => '$limit' in s);
  assert.deepEqual(skip2, { $skip: 20 });
  assert.deepEqual(limit2, { $limit: 20 });

  // Page 3, limit 15 -> skip 30
  const p3 = buildProgramSearchPipeline({ page: '3', limit: '15' });
  const skip3 = p3.find((s) => '$skip' in s);
  const limit3 = p3.find((s) => '$limit' in s);
  assert.deepEqual(skip3, { $skip: 30 });
  assert.deepEqual(limit3, { $limit: 15 });

  // Page defaults (omitted or invalid values fall back to page 1, limit 20)
  const pDef = buildProgramSearchPipeline({});
  const skipDef = pDef.find((s) => '$skip' in s);
  const limitDef = pDef.find((s) => '$limit' in s);
  assert.deepEqual(skipDef, { $skip: 0 });
  assert.deepEqual(limitDef, { $limit: 20 });
});

test('buildProgramSearchPipeline enforces total, deterministic sort before skip and limit without query', () => {
  const pipeline = buildProgramSearchPipeline({ page: 1, limit: 20 });

  const sortIndex = pipeline.findIndex((s) => '$sort' in s);
  const skipIndex = pipeline.findIndex((s) => '$skip' in s);
  const limitIndex = pipeline.findIndex((s) => '$limit' in s);

  assert.ok(sortIndex !== -1, 'a sort stage exists in the pipeline');
  assert.ok(sortIndex < skipIndex, 'sort stage must precede skip');
  assert.ok(skipIndex < limitIndex, 'skip stage must precede limit');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sortStage = pipeline[sortIndex] as any;
  assert.deepEqual(sortStage.$sort, { name: 1, _id: 1 });
  assert.ok(sortStage.$sort._id !== undefined, 'sort includes unique _id tiebreaker to guarantee total order');
});

test('buildProgramSearchPipeline places relevance ahead of tiebreaker when query is present', () => {
  const pipeline = buildProgramSearchPipeline({
    query: 'bench',
    page: 2,
    limit: 10,
  });

  const matchIndex = pipeline.findIndex((s) => '$match' in s);
  const addFieldsIndex = pipeline.findIndex((s) => '$addFields' in s);
  const sortIndex = pipeline.findIndex((s) => '$sort' in s);
  const skipIndex = pipeline.findIndex((s) => '$skip' in s);
  const limitIndex = pipeline.findIndex((s) => '$limit' in s);
  const projectIndex = pipeline.findIndex((s) => '$project' in s);

  assert.ok(matchIndex !== -1, '$match stage exists');
  assert.ok(addFieldsIndex !== -1, '$addFields stage exists for relevance scoring');
  assert.ok(sortIndex !== -1, '$sort stage exists');
  assert.ok(skipIndex !== -1, '$skip stage exists');
  assert.ok(limitIndex !== -1, '$limit stage exists');
  assert.ok(projectIndex !== -1, '$project stage exists');

  // Order of stages
  assert.ok(matchIndex < addFieldsIndex, '$match precedes $addFields');
  assert.ok(addFieldsIndex < sortIndex, '$addFields precedes $sort');
  assert.ok(sortIndex < skipIndex, '$sort precedes $skip');
  assert.ok(skipIndex < limitIndex, '$skip precedes $limit');
  assert.ok(limitIndex < projectIndex, '$limit precedes $project');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sortStage = pipeline[sortIndex] as any;
  const sortKeys = Object.keys(sortStage.$sort);

  assert.equal(sortKeys[0], 'relevance', 'relevance must precede the tiebreaker');
  assert.equal(sortKeys[1], 'name', 'name is secondary tiebreaker');
  assert.equal(sortKeys[2], '_id', '_id is final unique tiebreaker guaranteeing total order');
  assert.deepEqual(sortStage.$sort, { relevance: 1, name: 1, _id: 1 });
});

test('buildProgramSearchPipeline relevance scoring prioritizes name match (0), then tag match (1), then rest (2)', () => {
  const pipeline = buildProgramSearchPipeline({ query: 'push' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addFieldsStage = pipeline.find((s) => '$addFields' in s) as any;
  assert.ok(addFieldsStage, '$addFields stage must exist');

  const relevanceSwitch = addFieldsStage.$addFields.relevance.$switch;
  assert.ok(relevanceSwitch, '$switch expression computes relevance');
  assert.equal(relevanceSwitch.branches.length, 2);

  // Branch 0: Name match -> then 0
  const branch0 = relevanceSwitch.branches[0];
  assert.equal(branch0.then, 0);
  assert.deepEqual(branch0.case.$regexMatch, {
    input: { $ifNull: ['$name', ''] },
    regex: 'push',
    options: 'i',
  });

  // Branch 1: Tag match -> then 1
  const branch1 = relevanceSwitch.branches[1];
  assert.equal(branch1.then, 1);
  assert.ok(branch1.case.$gt, 'branch 1 checks size > 0');
  assert.equal(branch1.case.$gt[1], 0);

  const filterExpr = branch1.case.$gt[0].$size.$filter;
  assert.deepEqual(filterExpr.input, { $ifNull: ['$tags', []] });
  assert.equal(filterExpr.as, 'tag');
  assert.deepEqual(filterExpr.cond.$regexMatch, {
    input: { $ifNull: ['$$tag', ''] },
    regex: 'push',
    options: 'i',
  });

  // Default: Rest (description / goal) -> 2
  assert.equal(relevanceSwitch.default, 2);
});

test('buildProgramSearchPipeline projects exactly PROGRAM_SEARCH_PROJECTION and omits relevance', () => {
  const pipeline = buildProgramSearchPipeline({ query: 'strength' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projectStage = pipeline.find((s) => '$project' in s) as any;
  assert.ok(projectStage, '$project stage must exist');
  assert.deepEqual(projectStage.$project, PROGRAM_SEARCH_PROJECTION);

  // Verify relevance is NOT projected to the client
  assert.equal(projectStage.$project.relevance, undefined);

  // Verify phase workout details are excluded (phases.phase, weeks, focus only)
  assert.equal(projectStage.$project['phases.phase'], 1);
  assert.equal(projectStage.$project['phases.weeks'], 1);
  assert.equal(projectStage.$project['phases.focus'], 1);
  assert.equal(projectStage.$project['phases.workouts'], undefined);
});

test('route implementation verifies no JS post-sort remains and uses aggregate pipeline', () => {
  const routePath = join(__dirname, '../../app/api/programs/search/route.ts');
  const routeCode = readFileSync(routePath, 'utf8');

  // Verify the JS post-pagination sort is gone
  assert.ok(
    !routeCode.includes('programs.sort('),
    'JS post-pagination sort (programs.sort) must be completely removed from the route',
  );

  // Verify Program.aggregate is called with the pipeline
  assert.ok(
    routeCode.includes('Program.aggregate(pipeline)'),
    'The route must query the database via Program.aggregate(pipeline)',
  );

  // Verify availableTags distinct call remains intact
  assert.ok(
    routeCode.includes("Program.distinct('tags', visibilityClause)"),
    'availableTags must remain scoped to visible tags via Program.distinct',
  );

  // Verify countDocuments is still used for total
  assert.ok(
    routeCode.includes('Program.countDocuments(filter)'),
    'countDocuments(filter) must still provide total for honest pagination metadata',
  );
});
