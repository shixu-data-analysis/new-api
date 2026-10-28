/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type {
  CanvasModelPricingDetail,
  CanvasTimeOfDaySchedule,
} from '../types'

// Time-of-day multipliers on the pricing page. Cloud validates the same rules (src/task/time-of-day.ts); the page
// mirrors them so a period is marked before publishing.

export const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const
export const WEEKDAY_KEYS = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
] as const

export const DAY_PRESETS: Array<{ labelKey: string; days: number[] }> = [
  { labelKey: 'Weekdays', days: [1, 2, 3, 4, 5] },
  { labelKey: 'Weekend', days: [6, 7] },
  { labelKey: 'Every day', days: [1, 2, 3, 4, 5, 6, 7] },
]

/** Common Provider time zones by region; the offset shown is today's, so daylight saving time is followed. */
export const TIME_ZONES: Array<{
  zone: string
  regionKey: string
  group: string
}> = [
  { zone: 'Asia/Shanghai', regionKey: 'China (Beijing)', group: 'Asia' },
  { zone: 'Asia/Hong_Kong', regionKey: 'Hong Kong, China', group: 'Asia' },
  { zone: 'Asia/Singapore', regionKey: 'Singapore', group: 'Asia' },
  { zone: 'Asia/Tokyo', regionKey: 'Japan (Tokyo)', group: 'Asia' },
  { zone: 'Asia/Seoul', regionKey: 'South Korea (Seoul)', group: 'Asia' },
  { zone: 'Asia/Kolkata', regionKey: 'India (New Delhi)', group: 'Asia' },
  { zone: 'Asia/Dubai', regionKey: 'UAE (Dubai)', group: 'Asia' },
  {
    zone: 'Europe/London',
    regionKey: 'United Kingdom (London)',
    group: 'Europe',
  },
  { zone: 'Europe/Berlin', regionKey: 'Germany (Berlin)', group: 'Europe' },
  { zone: 'Europe/Paris', regionKey: 'France (Paris)', group: 'Europe' },
  {
    zone: 'America/New_York',
    regionKey: 'US Eastern (New York)',
    group: 'Americas',
  },
  {
    zone: 'America/Chicago',
    regionKey: 'US Central (Chicago)',
    group: 'Americas',
  },
  {
    zone: 'America/Denver',
    regionKey: 'US Mountain (Denver)',
    group: 'Americas',
  },
  {
    zone: 'America/Los_Angeles',
    regionKey: 'US Pacific (Los Angeles)',
    group: 'Americas',
  },
  {
    zone: 'America/Sao_Paulo',
    regionKey: 'Brazil (São Paulo)',
    group: 'Americas',
  },
  {
    zone: 'Australia/Sydney',
    regionKey: 'Australia (Sydney)',
    group: 'Oceania',
  },
  { zone: 'UTC', regionKey: 'Coordinated Universal Time', group: 'Other' },
]

export interface TimeOfDayRuleDraft {
  /** Stable while the rule is edited, for the list; not published. */
  id: string
  days: number[]
  start: string
  end: string
  multiplier: string
  /** A field of the rule was left, so its errors show (shared UI guide 4). */
  touched?: boolean
}

export interface TimeOfDayDraft {
  enabled: boolean
  timeZone: string
  rules: TimeOfDayRuleDraft[]
}

export type TimeOfDayRuleError =
  | { kind: 'days' }
  | { kind: 'start' }
  | { kind: 'end' }
  | { kind: 'sameStartEnd' }
  | { kind: 'multiplier' }
  | {
      kind: 'overlap'
      otherRule: number
      day: number
      start: string
      end: string
    }

const MINUTES_PER_DAY = 1440
const MULTIPLIER = /^(?:0|[1-9]\d?)(?:\.\d{1,2})?$/

export function minutesOf(
  value: string,
  allowMidnightEnd: boolean
): number | null {
  if (allowMidnightEnd && value === '24:00') return MINUTES_PER_DAY
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

export function clockText(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/** Typed digits as a time: "0930" reads "09:30", the colon is added. */
export function typedClock(value: string): string {
  const digits = value.replaceAll(/\D/g, '').slice(0, 4)
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits
}

export function validMultiplier(value: string): boolean {
  if (!MULTIPLIER.test(value)) return false
  const number = Number(value)
  return number >= 0.01 && number <= 10
}

/** Normalized multiplier text: "2.00" → "2", "0.80" → "0.8". */
export function multiplierText(value: string): string {
  return String(Number(value))
}

export type DayPiece = { rule: number; day: number; from: number; to: number }

// A rule as half-open minute ranges on ISO weekdays; the part after midnight lands on the next day.
export function rulePieces(
  rule: TimeOfDayRuleDraft,
  index: number
): DayPiece[] {
  const from = minutesOf(rule.start, false)
  const to = minutesOf(rule.end, true)
  if (from === null || to === null || from === to) return []
  return rule.days.flatMap((day) =>
    to > from
      ? [{ rule: index, day, from, to }]
      : [
          { rule: index, day, from, to: MINUTES_PER_DAY },
          ...(to > 0
            ? [{ rule: index, day: day === 7 ? 1 : day + 1, from: 0, to }]
            : []),
        ]
  )
}

export function ruleErrors(
  rule: TimeOfDayRuleDraft,
  index: number,
  rules: TimeOfDayRuleDraft[]
): TimeOfDayRuleError[] {
  const errors: TimeOfDayRuleError[] = []
  if (!rule.days.length) errors.push({ kind: 'days' })
  const from = minutesOf(rule.start, false)
  const to = minutesOf(rule.end, true)
  if (from === null) errors.push({ kind: 'start' })
  if (to === null) errors.push({ kind: 'end' })
  if (from !== null && to !== null && from === to) {
    errors.push({ kind: 'sameStartEnd' })
  }
  if (!validMultiplier(rule.multiplier)) errors.push({ kind: 'multiplier' })
  if (errors.length) return errors
  const mine = rulePieces(rule, index)
  for (let other = 0; other < index; other += 1) {
    for (const piece of mine) {
      const hit = rulePieces(rules[other] as TimeOfDayRuleDraft, other).find(
        (candidate) =>
          candidate.day === piece.day &&
          piece.from < candidate.to &&
          candidate.from < piece.to
      )
      if (hit) {
        return [
          {
            kind: 'overlap',
            otherRule: other,
            day: piece.day,
            start: clockText(Math.max(piece.from, hit.from)),
            end: clockText(Math.min(piece.to, hit.to)),
          },
        ]
      }
    }
  }
  return []
}

/** Errors of an enabled schedule: per rule, or that it has no rule. */
export function draftErrors(draft: TimeOfDayDraft): {
  empty: boolean
  rules: TimeOfDayRuleError[][]
} {
  if (!draft.enabled) return { empty: false, rules: [] }
  return {
    empty: draft.rules.length === 0,
    rules: draft.rules.map((rule, index) =>
      ruleErrors(rule, index, draft.rules)
    ),
  }
}

export function draftHasErrors(draft: TimeOfDayDraft): boolean {
  const errors = draftErrors(draft)
  return errors.empty || errors.rules.some((rule) => rule.length > 0)
}

export function draftFromSchedule(
  schedule: CanvasTimeOfDaySchedule | null | undefined
): TimeOfDayDraft {
  if (!schedule) return { enabled: false, timeZone: 'Asia/Shanghai', rules: [] }
  return {
    enabled: true,
    timeZone: schedule.timeZone,
    rules: schedule.rules.map((rule) => ({
      ...rule,
      id: newRuleId(),
      days: [...rule.days],
    })),
  }
}

/** The schedule a valid draft publishes; null when it is off. */
export function scheduleFromDraft(
  draft: TimeOfDayDraft
): CanvasTimeOfDaySchedule | null {
  if (!draft.enabled) return null
  return {
    schemaVersion: 1,
    timeZone: draft.timeZone,
    rules: draft.rules.map((rule) => ({
      days: [...rule.days].sort((a, b) => a - b),
      start: rule.start,
      end: rule.end,
      multiplier: multiplierText(rule.multiplier),
    })),
  }
}

function canonical(schedule: CanvasTimeOfDaySchedule | null): string {
  if (!schedule) return 'null'
  return JSON.stringify([
    schedule.timeZone,
    schedule.rules.map((rule) => [
      [...rule.days].sort((a, b) => a - b),
      rule.start,
      rule.end,
      multiplierText(rule.multiplier),
    ]),
  ])
}

export function sameSchedule(
  left: CanvasTimeOfDaySchedule | null,
  right: CanvasTimeOfDaySchedule | null
): boolean {
  return canonical(left) === canonical(right)
}

/** "UTC+8", "UTC−4", "UTC±0": the zone's offset today. */
export function utcOffsetLabel(zone: string, at = new Date()): string {
  const name =
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'shortOffset',
    })
      .formatToParts(at)
      .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT'
  return name === 'GMT' || name === 'GMT+0'
    ? 'UTC±0'
    : name.replace('GMT', 'UTC').replace('-', '−')
}

/** The ISO weekday and minute of a moment in a zone. */
export function zonedClock(
  zone: string,
  at: Date
): { day: number; minute: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value])
  )
  return {
    day:
      WEEKDAY_KEYS.indexOf(parts.weekday as (typeof WEEKDAY_KEYS)[number]) + 1,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

/** The multiplier in force at a moment, from the valid rules of a draft, and when its period ends. */
export function multiplierNow(
  draft: TimeOfDayDraft,
  at = new Date()
): { day: number; minute: number; multiplier: string; until: string | null } {
  const { day, minute } = zonedClock(draft.timeZone, at)
  const valid = draft.enabled
    ? draft.rules.filter(
        (rule, index) => ruleErrors(rule, index, draft.rules).length === 0
      )
    : []
  const piece = valid
    .flatMap((rule, index) =>
      rulePieces(rule, index).map((item) => ({
        ...item,
        multiplier: rule.multiplier,
      }))
    )
    .find((item) => item.day === day && item.from <= minute && minute < item.to)
  return piece
    ? {
        day,
        minute,
        multiplier: multiplierText(piece.multiplier),
        until: clockText(piece.to),
      }
    : { day, minute, multiplier: '1', until: null }
}

/** The model's published schedule: every spec of a Token model shares it, so the first one that has a cost tells. */
export function publishedTimeOfDaySchedule(
  detail: CanvasModelPricingDetail
): CanvasTimeOfDaySchedule | null {
  return (
    detail.pricingScopes.find((scope) => scope.currentProviderRate)
      ?.currentProviderRate?.timeOfDaySchedule ?? null
  )
}

let ruleSequence = 0
export function newRuleId(): string {
  ruleSequence += 1
  return `time-of-day-rule-${ruleSequence}`
}
