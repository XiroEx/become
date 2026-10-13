import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AiAllowanceSchema,
  AiStartEnvelopeSchema,
  AiPollSnapshotSchema,
  StartEnvelopeSchema,
  PollSnapshotSchema,
} from '../src/index';

test('AiAllowanceSchema parses valid allowance payloads', () => {
  const parsed = AiAllowanceSchema.safeParse({
    feature: 'workout-generation',
    limit: 1,
    remaining: 0,
    resetsAt: '2026-10-02T00:00:00.000Z',
    ticket: 'ticket_abc123',
  });
  assert.ok(parsed.success);
  assert.equal(parsed.data.feature, 'workout-generation');
  assert.equal(parsed.data.limit, 1);
  assert.equal(parsed.data.remaining, 0);
  assert.equal(parsed.data.ticket, 'ticket_abc123');

  // nullish fields
  const uncapped = AiAllowanceSchema.safeParse({
    feature: 'custom-sessions',
    limit: null,
    remaining: null,
    resetsAt: null,
  });
  assert.ok(uncapped.success);
  assert.equal(uncapped.data.limit, null);
});

test('AiStartEnvelopeSchema parses async run responses with runId and allowance ticket', () => {
  const raw = {
    ok: true,
    runId: 'run_test_456',
    allowance: {
      feature: 'ai-food-estimate',
      limit: 5,
      remaining: 4,
      resetsAt: '2026-10-02T00:00:00.000Z',
      ticket: 'tkt_seal_123',
    },
  };
  const parsed = AiStartEnvelopeSchema.safeParse(raw);
  assert.ok(parsed.success);
  assert.equal(parsed.data.runId, 'run_test_456');
  assert.equal(parsed.data.allowance?.ticket, 'tkt_seal_123');
});

test('AiStartEnvelopeSchema parses immediate results, fallback, and unavailable', () => {
  const immediate = AiStartEnvelopeSchema.safeParse({
    ok: true,
    result: { calories: 500 },
    text: 'A bowl of oats',
    reply: 'A bowl of oats',
  });
  assert.ok(immediate.success);
  assert.equal(immediate.data.ok, true);
  assert.equal(immediate.data.reply, 'A bowl of oats');

  const fallback = StartEnvelopeSchema.safeParse({
    ok: false,
    fallback: true,
    reply: 'Deterministic fallback session',
  });
  assert.ok(fallback.success);
  assert.equal(fallback.data.ok, false);
  assert.equal(fallback.data.fallback, true);

  const unavailable = StartEnvelopeSchema.safeParse({
    ok: false,
    unavailable: true,
    error: 'Vision service unavailable',
  });
  assert.ok(unavailable.success);
  assert.equal(unavailable.data.unavailable, true);
});

test('AiPollSnapshotSchema parses pending, completed and failed snapshots', () => {
  const pending = AiPollSnapshotSchema.safeParse({
    status: 'pending',
  });
  assert.ok(pending.success);
  assert.equal(pending.data.status, 'pending');

  const completed = PollSnapshotSchema.safeParse({
    status: 'completed',
    ok: true,
    result: { sets: 4, reps: 10 },
    text: 'Workout generated successfully',
  });
  assert.ok(completed.success);
  assert.equal(completed.data.status, 'completed');
  assert.equal(completed.data.ok, true);

  const failed = PollSnapshotSchema.safeParse({
    status: 'failed',
    ok: false,
    error: 'not_found',
  });
  assert.ok(failed.success);
  assert.equal(failed.data.status, 'failed');
  assert.equal(failed.data.error, 'not_found');
});
