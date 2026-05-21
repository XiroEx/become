'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import PageTransition from '@/components/PageTransition'
import VideosEditor from './VideosEditor'
import AdminVideoPreview from './AdminVideoPreview'
import VideoFramingEditor from '@/components/admin/VideoFramingEditor'
import type { VideoFramingOverride } from '@/lib/videoFraming'
import {
  CATEGORIES,
  MECHANICS,
  ROLES,
  MOVEMENT_PATTERNS,
  LATERALITY,
  DIFFICULTY,
  TRACKING_TYPES,
  BODY_REGIONS,
  MUSCLES,
  EQUIPMENT,
} from './constants'

export interface ExerciseFormValue {
  slug: string
  name: string
  aliases: string[]
  description: string
  category: (typeof CATEGORIES)[number]
  mechanics: (typeof MECHANICS)[number]
  role: (typeof ROLES)[number]
  movementPatterns: (typeof MOVEMENT_PATTERNS)[number][]
  laterality: (typeof LATERALITY)[number]
  difficulty: (typeof DIFFICULTY)[number]
  primaryMuscles: (typeof MUSCLES)[number][]
  secondaryMuscles: (typeof MUSCLES)[number][]
  stabilizers: (typeof MUSCLES)[number][]
  equipment: (typeof EQUIPMENT)[number][]
  optionalEquipment: (typeof EQUIPMENT)[number][]
  trackingType: (typeof TRACKING_TYPES)[number]
  defaultSets?: number
  defaultReps?: string
  defaultRest?: string
  defaultDuration?: string
  defaultTempo?: string
  instructions: string[]
  cues: string[]
  commonMistakes: string[]
  prerequisites: string[]
  variations: string[]
  alternatives: string[]
  videoUrl?: string
  thumbnailUrl?: string
  videoWidth?: number | null
  videoHeight?: number | null
  videoFraming?: VideoFramingOverride | null
  tags: string[]
  bodyRegion: (typeof BODY_REGIONS)[number]
  isActive: boolean
}

export const EMPTY_EXERCISE: ExerciseFormValue = {
  slug: '',
  name: '',
  aliases: [],
  description: '',
  category: 'strength',
  mechanics: 'compound',
  role: 'compound',
  movementPatterns: [],
  laterality: 'bilateral',
  difficulty: 'intermediate',
  primaryMuscles: [],
  secondaryMuscles: [],
  stabilizers: [],
  equipment: [],
  optionalEquipment: [],
  trackingType: 'reps_weight',
  defaultSets: undefined,
  defaultReps: undefined,
  defaultRest: undefined,
  defaultDuration: undefined,
  defaultTempo: undefined,
  instructions: [],
  cues: [],
  commonMistakes: [],
  prerequisites: [],
  variations: [],
  alternatives: [],
  videoUrl: undefined,
  thumbnailUrl: undefined,
  videoWidth: null,
  videoHeight: null,
  videoFraming: null,
  tags: [],
  bodyRegion: 'full_body',
  isActive: true,
}

interface Props {
  mode: 'create' | 'edit'
  /** Required when mode === 'edit' — the existing slug used for routing API calls. */
  originalSlug?: string
  initialValue?: Partial<ExerciseFormValue>
}

export default function ExerciseForm({ mode, originalSlug, initialValue }: Props) {
  const router = useRouter()
  const isEdit = mode === 'edit'

  const [value, setValue] = useState<ExerciseFormValue>({
    ...EMPTY_EXERCISE,
    ...initialValue,
  } as ExerciseFormValue)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slugTouched, setSlugTouched] = useState(isEdit)
  // Unsaved-changes indicator: flips true on the first value change after mount.
  const [isDirty, setIsDirty] = useState(false)
  const firstValuePass = useRef(true)
  useEffect(() => {
    if (firstValuePass.current) {
      firstValuePass.current = false
      return
    }
    setIsDirty(true)
  }, [value])

  // Auto-derive slug from name in create mode until user touches it
  useEffect(() => {
    if (slugTouched) return
    const derived = value.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    setValue((v) => ({ ...v, slug: derived }))
  }, [value.name, slugTouched])

  function update<K extends keyof ExerciseFormValue>(key: K, v: ExerciseFormValue[K]) {
    setValue((prev) => ({ ...prev, [key]: v }))
  }

  function toggleArray<T>(key: keyof ExerciseFormValue, item: T) {
    setValue((prev) => {
      const arr = (prev[key] as unknown as T[]) ?? []
      const next = arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item]
      return { ...prev, [key]: next as unknown as ExerciseFormValue[typeof key] }
    })
  }

  async function handleSubmit() {
    setSaving(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const url = isEdit
        ? `/api/exercises/${encodeURIComponent(originalSlug ?? value.slug)}`
        : '/api/exercises'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(value),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'Failed to save exercise')
      }
      setIsDirty(false)
      router.push('/dashboard/admin/exercises')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save exercise')
    } finally {
      setSaving(false)
    }
  }

  const canSubmit = useMemo(() => {
    return value.name.trim().length > 0 && value.slug.trim().length > 0
  }, [value])

  return (
    <PageTransition className="pb-12">
      <div className="mx-auto max-w-4xl">
        <button
          onClick={() => router.back()}
          className="mb-3 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
          {isEdit ? 'Edit Exercise' : 'New Exercise'}
        </h1>
        <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          Programs reference exercises by slug — changing the slug breaks any program that uses it.
        </p>

        {/* Identity */}
        <Section title="Identity">
          <Field label="Name *">
            <input
              type="text"
              value={value.name}
              onChange={(e) => update('name', e.target.value)}
              className={inputCls}
              placeholder="Bench Press"
            />
          </Field>
          <Field label="Slug *">
            <input
              type="text"
              value={value.slug}
              onChange={(e) => {
                setSlugTouched(true)
                update('slug', e.target.value.toLowerCase().trim())
              }}
              className={inputCls}
              placeholder="bench-press"
            />
          </Field>
          <Field label="Aliases (comma-separated)">
            <input
              type="text"
              value={value.aliases.join(', ')}
              onChange={(e) =>
                update(
                  'aliases',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                )
              }
              className={inputCls}
              placeholder="flat bench, barbell bench"
            />
          </Field>
          <Field label="Description" full>
            <textarea
              value={value.description}
              onChange={(e) => update('description', e.target.value)}
              rows={3}
              className={inputCls}
            />
          </Field>
          <Field label="Tags (comma-separated)" full>
            <input
              type="text"
              value={value.tags.join(', ')}
              onChange={(e) =>
                update(
                  'tags',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                )
              }
              className={inputCls}
              placeholder="upper, push, hypertrophy"
            />
          </Field>
        </Section>

        {/* Classification */}
        <Section title="Classification">
          <Field label="Category *">
            <select
              value={value.category}
              onChange={(e) => update('category', e.target.value as ExerciseFormValue['category'])}
              className={inputCls}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mechanics">
            <select
              value={value.mechanics}
              onChange={(e) => update('mechanics', e.target.value as ExerciseFormValue['mechanics'])}
              className={inputCls}
            >
              {MECHANICS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Role">
            <select
              value={value.role}
              onChange={(e) => update('role', e.target.value as ExerciseFormValue['role'])}
              className={inputCls}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Body Region *">
            <select
              value={value.bodyRegion}
              onChange={(e) =>
                update('bodyRegion', e.target.value as ExerciseFormValue['bodyRegion'])
              }
              className={inputCls}
            >
              {BODY_REGIONS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Laterality">
            <select
              value={value.laterality}
              onChange={(e) =>
                update('laterality', e.target.value as ExerciseFormValue['laterality'])
              }
              className={inputCls}
            >
              {LATERALITY.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Difficulty">
            <select
              value={value.difficulty}
              onChange={(e) =>
                update('difficulty', e.target.value as ExerciseFormValue['difficulty'])
              }
              className={inputCls}
            >
              {DIFFICULTY.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Movement Patterns" full>
            <ChipPicker
              options={MOVEMENT_PATTERNS}
              selected={value.movementPatterns}
              onToggle={(item) => toggleArray('movementPatterns', item)}
            />
          </Field>
        </Section>

        {/* Muscles */}
        <Section title="Muscles">
          <Field label="Primary Muscles" full>
            <ChipPicker
              options={MUSCLES}
              selected={value.primaryMuscles}
              onToggle={(item) => toggleArray('primaryMuscles', item)}
            />
          </Field>
          <Field label="Secondary Muscles" full>
            <ChipPicker
              options={MUSCLES}
              selected={value.secondaryMuscles}
              onToggle={(item) => toggleArray('secondaryMuscles', item)}
            />
          </Field>
          <Field label="Stabilizers" full>
            <ChipPicker
              options={MUSCLES}
              selected={value.stabilizers}
              onToggle={(item) => toggleArray('stabilizers', item)}
            />
          </Field>
        </Section>

        {/* Equipment */}
        <Section title="Equipment">
          <Field label="Required Equipment" full>
            <ChipPicker
              options={EQUIPMENT}
              selected={value.equipment}
              onToggle={(item) => toggleArray('equipment', item)}
            />
          </Field>
          <Field label="Optional Equipment" full>
            <ChipPicker
              options={EQUIPMENT}
              selected={value.optionalEquipment}
              onToggle={(item) => toggleArray('optionalEquipment', item)}
            />
          </Field>
        </Section>

        {/* Tracking & defaults */}
        <Section title="Tracking & Defaults">
          <Field label="Tracking Type *">
            <select
              value={value.trackingType}
              onChange={(e) =>
                update('trackingType', e.target.value as ExerciseFormValue['trackingType'])
              }
              className={inputCls}
            >
              {TRACKING_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Default Sets">
            <input
              type="number"
              value={value.defaultSets ?? ''}
              onChange={(e) =>
                update('defaultSets', e.target.value ? parseInt(e.target.value) : undefined)
              }
              className={inputCls}
            />
          </Field>
          <Field label="Default Reps">
            <input
              type="text"
              value={value.defaultReps ?? ''}
              onChange={(e) => update('defaultReps', e.target.value || undefined)}
              className={inputCls}
              placeholder="8-10"
            />
          </Field>
          <Field label="Default Rest">
            <input
              type="text"
              value={value.defaultRest ?? ''}
              onChange={(e) => update('defaultRest', e.target.value || undefined)}
              className={inputCls}
              placeholder="90s"
            />
          </Field>
          <Field label="Default Duration">
            <input
              type="text"
              value={value.defaultDuration ?? ''}
              onChange={(e) => update('defaultDuration', e.target.value || undefined)}
              className={inputCls}
              placeholder="30s"
            />
          </Field>
          <Field label="Default Tempo">
            <input
              type="text"
              value={value.defaultTempo ?? ''}
              onChange={(e) => update('defaultTempo', e.target.value || undefined)}
              className={inputCls}
              placeholder="3-1-1-0"
            />
          </Field>
        </Section>

        {/* Coaching content */}
        <Section title="Coaching Content">
          <Field label="Instructions (one per line)" full>
            <ListInput
              value={value.instructions}
              onChange={(v) => update('instructions', v)}
              placeholder="Set up under the bar with grip just outside shoulder width…"
            />
          </Field>
          <Field label="Cues (one per line)" full>
            <ListInput
              value={value.cues}
              onChange={(v) => update('cues', v)}
              placeholder="Drive feet through the floor"
            />
          </Field>
          <Field label="Common Mistakes (one per line)" full>
            <ListInput
              value={value.commonMistakes}
              onChange={(v) => update('commonMistakes', v)}
              placeholder="Flaring elbows out"
            />
          </Field>
        </Section>

        {/* Relationships */}
        <Section title="Relationships (slugs, comma-separated)">
          <Field label="Prerequisites" full>
            <input
              type="text"
              value={value.prerequisites.join(', ')}
              onChange={(e) =>
                update(
                  'prerequisites',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                )
              }
              className={inputCls}
              placeholder="push-up, dumbbell-bench-press"
            />
          </Field>
          <Field label="Variations" full>
            <input
              type="text"
              value={value.variations.join(', ')}
              onChange={(e) =>
                update(
                  'variations',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                )
              }
              className={inputCls}
              placeholder="incline-bench-press, decline-bench-press"
            />
          </Field>
          <Field label="Alternatives" full>
            <input
              type="text"
              value={value.alternatives.join(', ')}
              onChange={(e) =>
                update(
                  'alternatives',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                )
              }
              className={inputCls}
              placeholder="dumbbell-bench-press, machine-chest-press"
            />
          </Field>
        </Section>

        {/* Primary media */}
        <Section title="Primary Media (denormalized on the exercise itself)">
          <Field label="Video URL" full>
            <input
              type="text"
              value={value.videoUrl ?? ''}
              onChange={(e) => update('videoUrl', e.target.value || undefined)}
              className={inputCls}
              placeholder="https://… or /videos/bench-press.mp4"
            />
            {value.videoUrl && (
              <div className="mt-2 space-y-2">
                <AdminVideoPreview
                  url={value.videoUrl}
                  size="md"
                  videoWidth={value.videoWidth}
                  videoHeight={value.videoHeight}
                  videoFraming={value.videoFraming}
                  onDimensions={(w, h) => {
                    // Mirror locally so the framing editor sees the new dims
                    // immediately; the back-write is fire-and-forget. Skip if
                    // we already have dims persisted.
                    if (value.videoWidth && value.videoHeight) return
                    update('videoWidth', w)
                    update('videoHeight', h)
                    // Auto-persist dims to BOTH Exercise and ExerciseVideo rows.
                    if (!isEdit || !(originalSlug ?? value.slug)) return
                    const token = localStorage.getItem('token')
                    void fetch(
                      `/api/exercises/${encodeURIComponent(originalSlug ?? value.slug)}/video/dimensions`,
                      {
                        method: 'PATCH',
                        headers: {
                          'Content-Type': 'application/json',
                          ...(token ? { Authorization: `Bearer ${token}` } : {}),
                        },
                        body: JSON.stringify({ width: w, height: h }),
                      }
                    ).catch(() => {})
                  }}
                />
                {/* Fine-tune framing — only meaningful once the exercise has been saved (we need a slug). */}
                {isEdit && (originalSlug ?? value.slug) && (
                  <VideoFramingEditor
                    slug={originalSlug ?? value.slug}
                    videoUrl={value.videoUrl}
                    videoWidth={value.videoWidth}
                    videoHeight={value.videoHeight}
                    videoFraming={value.videoFraming}
                    onSaved={(next) => update('videoFraming', next)}
                    onDimensions={(w, h) => {
                      if (value.videoWidth && value.videoHeight) return
                      update('videoWidth', w)
                      update('videoHeight', h)
                    }}
                  />
                )}
              </div>
            )}
          </Field>
          <Field label="Thumbnail URL" full>
            <input
              type="text"
              value={value.thumbnailUrl ?? ''}
              onChange={(e) => update('thumbnailUrl', e.target.value || undefined)}
              className={inputCls}
            />
            {value.thumbnailUrl && (
              <div className="mt-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={value.thumbnailUrl}
                  alt="Thumbnail preview"
                  className="h-32 w-auto rounded-lg object-contain bg-black ring-1 ring-zinc-200 dark:ring-zinc-800"
                />
              </div>
            )}
          </Field>
        </Section>

        {/* Linked ExerciseVideos (only meaningful in edit mode where the name is stable) */}
        {isEdit && (
          <Section title="Linked ExerciseVideos">
            <div className="sm:col-span-2">
              <VideosEditor exerciseName={value.name} exerciseSlug={originalSlug ?? value.slug} />
            </div>
          </Section>
        )}

        {/* Status */}
        <Section title="Status">
          <Field label="Active">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={value.isActive}
                onChange={(e) => update('isActive', e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300"
              />
              Visible / usable in programs
            </label>
          </Field>
        </Section>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {saving ? 'Saving…' : isEdit ? 'Update Exercise' : 'Create Exercise'}
          </button>
        </div>
      </div>

      {/* Floating Save — long form, always reachable. Sits above the bottom nav.
          - dirty + valid     → amber w/ pulse dot ("Save changes")
          - clean (edit mode) → gray "Saved"
          - saving / invalid  → gray disabled */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit || saving || (isEdit && !isDirty)}
        aria-label={isEdit ? 'Update exercise' : 'Create exercise'}
        className={`fixed right-4 z-30 flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold shadow-lg transition-all ${
          !canSubmit || saving || (isEdit && !isDirty)
            ? 'cursor-not-allowed bg-zinc-300 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'
            : isDirty
            ? 'bg-amber-500 text-white hover:bg-amber-600 active:scale-95'
            : 'bg-green-600 text-white hover:bg-green-700 active:scale-95'
        }`}
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)' }}
      >
        {saving ? (
          <>
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Saving…
          </>
        ) : (
          <>
            {isDirty && (
              <span aria-hidden className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
              </span>
            )}
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {isEdit
              ? (isDirty ? 'Save changes' : 'Saved')
              : (isDirty ? 'Save changes' : 'Save')}
          </>
        )}
      </button>
    </PageTransition>
  )
}

const inputCls =
  'w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 border-b border-zinc-200 pb-6 dark:border-zinc-800 sm:rounded-xl sm:border sm:border-zinc-200 sm:bg-white sm:p-4 sm:pb-4 dark:sm:border-zinc-800 dark:sm:bg-zinc-900">
      <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function Field({
  label,
  full,
  children,
}: {
  label: string
  full?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {label}
      </label>
      {children}
    </div>
  )
}

function ChipPicker<T extends string>({
  options,
  selected,
  onToggle,
}: {
  options: readonly T[]
  selected: T[]
  onToggle: (item: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = selected.includes(opt)
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              active
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
            }`}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}

function ListInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
}) {
  return (
    <textarea
      rows={4}
      value={value.join('\n')}
      onChange={(e) =>
        onChange(
          e.target.value
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
        )
      }
      className={inputCls}
      placeholder={placeholder}
    />
  )
}
