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
import { ChevronRight, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

import {
  DAY_PRESETS,
  draftErrors,
  ISO_WEEKDAYS,
  multiplierNow,
  newRuleId,
  multiplierText,
  rulePieces,
  ruleErrors,
  TIME_ZONES,
  typedClock,
  utcOffsetLabel,
  validMultiplier,
  clockText,
  type TimeOfDayDraft,
  type TimeOfDayRuleDraft,
  type TimeOfDayRuleError,
} from '../lib/time-of-day'
import { rateAtMultiplier } from '../lib/time-of-day-display'
import type { CanvasTimeOfDaySchedule } from '../types'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { timeOfDayScheduleText, weekdayName } from './time-of-day-text'

/**
 * A row of the "prices by period" table: a Token category of one price plan, from the table's drafts. Amounts are set
 * only while their drafts are valid; points are Cloud's base rate per million, set while its calculation is valid.
 */
export interface TimeOfDayPriceRow {
  id: string
  label: string
  priced: boolean
  customerCny: string | null
  points: string | null
  costCny: string | null
}

const SHORT_DAY_KEYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const GROUPS = ['Asia', 'Europe', 'Americas', 'Oceania', 'Other']
const FIELD_ERROR_KEYS: Record<
  Exclude<TimeOfDayRuleError['kind'], 'overlap'>,
  string
> = {
  days: 'Choose the days of the period',
  start: 'Enter a start time from 00:00 to 23:59',
  end: 'Enter an end time from 00:00 to 24:00',
  sameStartEnd: 'The start and end must differ',
  multiplier: 'Enter a multiplier from 0.01 to 10 with up to 2 decimals',
}
const NEW_RULE: Omit<TimeOfDayRuleDraft, 'id'> = {
  days: [1, 2, 3, 4, 5],
  start: '',
  end: '',
  multiplier: '',
}

/**
 * "时段倍率" on the current-pricing tab of a Token model (time-of-day prototype admin.html): turn it on, choose the
 * Provider's time zone, list periods with their days and multiplier, and see the week and the prices by period. The
 * schedule is published with the prices through the page's publish bar.
 */
export function TimeOfDayMultiplierSection(props: {
  draft: TimeOfDayDraft
  changed: boolean
  attempted: boolean
  scheduled: {
    schedule: CanvasTimeOfDaySchedule | null
    effectiveAt: string
  } | null
  priceRows: TimeOfDayPriceRow[]
  onChange: (draft: TimeOfDayDraft) => void
}) {
  const { t, i18n } = useTranslation()
  const { draft } = props
  const [previewOpen, setPreviewOpen] = useState(false)
  const rulesRef = useRef<HTMLDivElement>(null)
  const errors = draftErrors(draft)
  const visibleErrors = draft.rules.map((rule, index) =>
    props.attempted || rule.touched ? (errors.rules[index] ?? []) : []
  )
  const update = (rules: TimeOfDayRuleDraft[]) =>
    props.onChange({ ...draft, rules })
  const updateRule = (index: number, change: Partial<TimeOfDayRuleDraft>) =>
    update(
      draft.rules.map((rule, current) =>
        current === index ? { ...rule, ...change } : rule
      )
    )

  const errorText = (error: TimeOfDayRuleError) => {
    if (error.kind !== 'overlap') return t(FIELD_ERROR_KEYS[error.kind])
    return t('Overlaps period {{index}} on {{day}} {{start}}–{{end}}', {
      index: error.otherRule + 1,
      day: weekdayName(error.day, t),
      start: error.start,
      end: error.end,
    })
  }

  return (
    <section
      aria-labelledby='time-of-day-title'
      data-time-of-day
      className='bg-card grid gap-3 rounded-xl border p-4 text-sm'
    >
      <div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-2'>
        <div className='inline-flex items-center gap-2'>
          <strong id='time-of-day-title' className='font-medium'>
            {t('Time-of-day multipliers')}
          </strong>
          {props.changed ? (
            <span className='bg-primary/10 text-primary inline-flex h-5 items-center rounded-full px-2 text-xs font-medium'>
              {t('Unpublished')}
            </span>
          ) : null}
        </div>
        <label className='inline-flex cursor-pointer items-center gap-2 font-medium'>
          <Switch
            checked={draft.enabled}
            onCheckedChange={(enabled) =>
              props.onChange({
                ...draft,
                enabled,
                rules:
                  enabled && draft.rules.length === 0
                    ? [
                        {
                          id: newRuleId(),
                          days: [1, 2, 3, 4, 5],
                          start: '09:00',
                          end: '12:00',
                          multiplier: '2',
                        },
                      ]
                    : draft.rules,
              })
            }
          />
          <span>{t('Adjust prices by time of day')}</span>
        </label>
      </div>
      <p className='text-muted-foreground text-xs'>
        {t(
          'Actual price = the price in the table × the multiplier at the time. Provider cost, agent display price and customer price use the same multiplier; the customer’s multiplier is fixed when the price is quoted.'
        )}
      </p>
      {props.scheduled ? (
        <p
          role='status'
          className='rounded-lg border border-amber-500/40 bg-amber-500/10 p-3'
        >
          {t(
            'Time-of-day multipliers scheduled for {{time}}: {{description}}',
            {
              time: new Date(props.scheduled.effectiveAt).toLocaleString(
                i18n.language
              ),
              description: timeOfDayScheduleText(
                props.scheduled.schedule,
                t,
                i18n.language
              ),
            }
          )}
        </p>
      ) : null}
      {!draft.enabled ? (
        <p className='text-muted-foreground'>
          {t('Off: priced at ×1 all day.')}
        </p>
      ) : (
        <>
          <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
            <Label htmlFor='time-of-day-zone'>{t('Time zone')}</Label>
            <Select
              value={draft.timeZone}
              onValueChange={(zone) =>
                zone && props.onChange({ ...draft, timeZone: zone })
              }
            >
              <SelectTrigger
                id='time-of-day-zone'
                className='w-[340px] max-w-full'
              >
                <CanvasLocalizedSelectValue
                  value={draft.timeZone}
                  displayValue={zoneLabel(draft.timeZone, t)}
                />
              </SelectTrigger>
              <SelectContent>
                {GROUPS.map((group) => (
                  <SelectGroup key={group}>
                    <SelectLabel>{t(group)}</SelectLabel>
                    {TIME_ZONES.filter((zone) => zone.group === group).map(
                      (zone) => (
                        <SelectItem key={zone.zone} value={zone.zone}>
                          {zoneLabel(zone.zone, t)}
                        </SelectItem>
                      )
                    )}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <span className='text-muted-foreground text-xs'>
              {t(
                'Use the time zone the API provider publishes its prices in; regions with daylight saving time follow their local time.'
              )}
            </span>
          </div>
          <div ref={rulesRef} className='grid gap-2'>
            <div
              aria-hidden='true'
              className='text-muted-foreground hidden grid-cols-[20px_260px_84px_12px_84px_92px_32px] gap-x-3 text-xs md:grid'
            >
              <span />
              <span>{t('Days')}</span>
              <span>{t('Start')}</span>
              <span />
              <span>{t('End')}</span>
              <span>{t('Multiplier')}</span>
              <span />
            </div>
            {draft.rules.map((rule, index) => {
              const shown = visibleErrors[index] ?? []
              const has = (kind: TimeOfDayRuleError['kind']) =>
                shown.some((error) => error.kind === kind)
              const touch = (event: React.FocusEvent) => {
                // A rule is checked once focus leaves it, not while moving between its own fields.
                const next = event.relatedTarget as HTMLElement | null
                if (next?.closest(`[data-time-of-day-rule="${index}"]`)) return
                updateRule(index, { touched: true })
              }
              return (
                <div
                  key={rule.id}
                  role='group'
                  aria-label={t('Period {{index}}', { index: index + 1 })}
                  data-time-of-day-rule={index}
                  onBlur={touch}
                  className='grid grid-cols-[20px_1fr_1fr_32px] items-start gap-x-3 gap-y-2 border-t py-2 md:grid-cols-[20px_260px_84px_12px_84px_92px_32px]'
                >
                  <span className='text-muted-foreground pt-2 tabular-nums'>
                    {index + 1}
                  </span>
                  <div className='col-span-3 grid gap-1 md:col-span-1'>
                    <div
                      role='group'
                      aria-label={t('Days')}
                      aria-invalid={has('days') || undefined}
                      className={cn(
                        'flex flex-wrap gap-1 rounded-lg',
                        has('days') &&
                          'outline-destructive outline outline-offset-2'
                      )}
                    >
                      {ISO_WEEKDAYS.map((day) => {
                        const on = rule.days.includes(day)
                        return (
                          <button
                            key={day}
                            type='button'
                            aria-pressed={on}
                            aria-label={weekdayName(day, t)}
                            className={cn(
                              'bg-background focus-visible:ring-ring h-8 w-8 rounded-lg border text-[13px] focus-visible:ring-2 focus-visible:outline-none',
                              on &&
                                'border-primary bg-primary/10 text-primary font-semibold'
                            )}
                            onClick={() =>
                              updateRule(index, {
                                days: on
                                  ? rule.days.filter((item) => item !== day)
                                  : [...rule.days, day].sort((a, b) => a - b),
                                touched: true,
                              })
                            }
                          >
                            {t(SHORT_DAY_KEYS[day - 1] as string)}
                          </button>
                        )
                      })}
                    </div>
                    <div className='flex gap-3 text-xs'>
                      {DAY_PRESETS.map((preset) => (
                        <button
                          key={preset.labelKey}
                          type='button'
                          className='text-primary hover:underline'
                          onClick={() =>
                            updateRule(index, {
                              days: preset.days,
                              touched: true,
                            })
                          }
                        >
                          {t(preset.labelKey)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Input
                    inputMode='numeric'
                    placeholder={t('hh:mm')}
                    value={rule.start}
                    aria-label={t('Start time of period {{index}}', {
                      index: index + 1,
                    })}
                    aria-invalid={has('start') || undefined}
                    className='tabular-nums'
                    onChange={(event) =>
                      updateRule(index, {
                        start: typedClock(event.target.value),
                      })
                    }
                  />
                  <span className='text-muted-foreground hidden pt-2 text-center md:block'>
                    –
                  </span>
                  <Input
                    inputMode='numeric'
                    placeholder={t('hh:mm')}
                    value={rule.end}
                    aria-label={t('End time of period {{index}}', {
                      index: index + 1,
                    })}
                    aria-invalid={
                      has('end') || has('sameStartEnd') || undefined
                    }
                    className='tabular-nums'
                    onChange={(event) =>
                      updateRule(index, { end: typedClock(event.target.value) })
                    }
                  />
                  <label className='col-span-2 inline-flex items-center gap-1 md:col-span-1'>
                    <span className='text-muted-foreground'>×</span>
                    <Input
                      inputMode='decimal'
                      placeholder={t('e.g. 1.5')}
                      value={rule.multiplier}
                      aria-label={t('Multiplier of period {{index}}', {
                        index: index + 1,
                      })}
                      aria-invalid={has('multiplier') || undefined}
                      className='tabular-nums'
                      onChange={(event) =>
                        updateRule(index, {
                          multiplier: event.target.value.trim(),
                        })
                      }
                    />
                  </label>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    aria-label={t('Remove period {{index}}', {
                      index: index + 1,
                    })}
                    className='text-muted-foreground hover:text-destructive'
                    onClick={() =>
                      update(
                        draft.rules.filter((_, current) => current !== index)
                      )
                    }
                  >
                    <Trash2 className='size-4' />
                  </Button>
                  {shown.length ? (
                    <p
                      role='alert'
                      className='text-destructive col-span-full text-xs md:col-start-2'
                    >
                      {shown.map(errorText).join(t('; '))}
                    </p>
                  ) : null}
                </div>
              )
            })}
            {props.attempted && errors.empty ? (
              <p role='alert' className='text-destructive text-xs'>
                {t(
                  'Add at least one period, or turn off "Adjust prices by time of day"'
                )}
              </p>
            ) : null}
            <div className='flex flex-wrap items-center gap-x-3 gap-y-2 pt-1'>
              <Button
                type='button'
                variant='outline'
                onClick={() => {
                  update([...draft.rules, { ...NEW_RULE, id: newRuleId() }])
                  requestAnimationFrame(() =>
                    rulesRef.current
                      ?.querySelector<HTMLInputElement>(
                        `[data-time-of-day-rule="${draft.rules.length}"] input`
                      )
                      ?.focus()
                  )
                }}
              >
                {t('Add period')}
              </Button>
              <span className='text-muted-foreground text-xs'>
                {t(
                  'Periods not set are priced at ×1. An end earlier than the start runs into the next day, such as 22:00–02:00.'
                )}
              </span>
            </div>
          </div>
          <TimeOfDayWeek draft={draft} />
          <TimeOfDayPrices
            draft={draft}
            rows={props.priceRows}
            open={previewOpen}
            onOpenChange={setPreviewOpen}
          />
        </>
      )}
    </section>
  )
}

// Higher multipliers in amber, discounts in green.
function segmentTone(multiplier: number) {
  if (multiplier > 1) return 'bg-amber-500/30'
  if (multiplier < 1) return 'bg-emerald-500/25'
  return 'bg-primary/20'
}

function zoneLabel(
  zone: string,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  const known = TIME_ZONES.find((item) => item.zone === zone)
  return t('{{region}} · {{zone}} · now {{offset}}', {
    region: known ? t(known.regionKey) : zone,
    zone,
    offset: utcOffsetLabel(zone),
  })
}

// Seven rows of 24 hours; only periods without errors are drawn, with the moment now marked.
function TimeOfDayWeek({ draft }: { draft: TimeOfDayDraft }) {
  const { t } = useTranslation()
  const valid = draft.rules.filter(
    (rule, index) => ruleErrors(rule, index, draft.rules).length === 0
  )
  const pieces = valid.flatMap((rule, index) =>
    rulePieces(rule, index).map((piece) => ({
      ...piece,
      multiplier: rule.multiplier,
    }))
  )
  const now = multiplierNow(draft)
  const nowText = t(
    'Now ({{zone}} {{offset}}) {{day}} {{time}}: priced at ×{{multiplier}}',
    {
      zone: draft.timeZone,
      offset: utcOffsetLabel(draft.timeZone),
      day: weekdayName(now.day, t),
      time: clockText(now.minute),
      multiplier: now.multiplier,
    }
  )
  return (
    <div aria-label={t('Week preview')} className='grid gap-1.5 border-t pt-3'>
      <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1'>
        <strong className='font-medium'>{t('Week preview')}</strong>
        <span className='text-muted-foreground text-xs'>
          {now.until
            ? t('{{text}}, until {{until}}', {
                text: nowText,
                until: now.until,
              })
            : nowText}
        </span>
      </div>
      {ISO_WEEKDAYS.map((day) => (
        <div key={day} className='grid grid-cols-[40px_1fr] items-center gap-2'>
          <span className='text-muted-foreground text-xs'>
            {weekdayName(day, t)}
          </span>
          <div className='bg-muted relative h-[22px] overflow-hidden rounded-md'>
            {pieces
              .filter((piece) => piece.day === day)
              .map((piece) => {
                const multiplier = Number(piece.multiplier)
                return (
                  <span
                    key={`${piece.rule}-${piece.from}`}
                    className={cn(
                      'absolute inset-y-0 grid place-items-center text-[11px] font-semibold tabular-nums',
                      segmentTone(multiplier)
                    )}
                    style={{
                      left: `${(piece.from / 1440) * 100}%`,
                      width: `${((piece.to - piece.from) / 1440) * 100}%`,
                    }}
                  >
                    {piece.to - piece.from >= 120
                      ? `×${multiplierText(piece.multiplier)}`
                      : ''}
                  </span>
                )
              })}
            {day === now.day ? (
              <span
                aria-hidden='true'
                className='bg-destructive absolute -inset-y-0.5 -ml-px w-0.5'
                style={{ left: `${(now.minute / 1440) * 100}%` }}
              />
            ) : null}
          </div>
        </div>
      ))}
      <div aria-hidden='true' className='grid grid-cols-[40px_1fr] gap-2'>
        <span />
        <div className='text-muted-foreground flex justify-between text-[11px] tabular-nums'>
          {[0, 6, 12, 18, 24].map((hour) => (
            <span key={hour}>{hour}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

// Each Token category · price plan at each multiplier: customer price, its points and the provider cost.
function TimeOfDayPrices(props: {
  draft: TimeOfDayDraft
  rows: TimeOfDayPriceRow[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const multipliers = [
    ...new Set([
      '1',
      ...props.draft.rules
        .filter((rule) => validMultiplier(rule.multiplier))
        .map((rule) => multiplierText(rule.multiplier)),
    ]),
  ].sort((left, right) => Number(left) - Number(right))
  if (multipliers.length < 2) return null
  return (
    <div className='grid gap-1.5 border-t pt-3'>
      <button
        type='button'
        aria-expanded={props.open}
        className='flex flex-wrap items-baseline gap-x-3 gap-y-1 text-left'
        onClick={() => props.onOpenChange(!props.open)}
      >
        <ChevronRight
          className={cn(
            'text-muted-foreground size-4 self-center transition-transform',
            props.open && 'rotate-90'
          )}
        />
        <strong className='font-medium'>{t('Prices by period')}</strong>
        <span className='text-muted-foreground text-xs'>
          {t(
            'Per million Tokens, from the prices in the table including unpublished changes.'
          )}
        </span>
      </button>
      {props.open ? (
        <div className='overflow-x-auto'>
          <Table className='text-[13px]'>
            <TableHeader>
              <TableRow className='text-muted-foreground text-xs'>
                <TableHead scope='col'>
                  {t('Token category · price plan')}
                </TableHead>
                {multipliers.map((multiplier) => (
                  <TableHead
                    key={multiplier}
                    scope='col'
                    className='text-right'
                  >
                    {multiplier === '1'
                      ? t('Other periods ×1')
                      : `×${multiplier}`}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableHead
                    scope='row'
                    className='font-normal whitespace-nowrap'
                  >
                    {row.label}
                  </TableHead>
                  {multipliers.map((multiplier) => {
                    if (!row.priced || row.customerCny === null) {
                      return (
                        <TableCell
                          key={multiplier}
                          className='text-muted-foreground text-right'
                        >
                          {row.priced ? '—' : t('Not priced')}
                        </TableCell>
                      )
                    }
                    const customer = rateAtMultiplier(
                      row.customerCny,
                      multiplier
                    )
                    return (
                      <TableCell
                        key={multiplier}
                        className='text-right whitespace-nowrap tabular-nums'
                      >
                        <span className='block font-medium'>
                          {t('{{amount}} yuan', { amount: customer })}
                        </span>
                        <span className='text-muted-foreground block text-xs'>
                          {t('{{points}} points · cost {{cost}} yuan', {
                            points:
                              row.points === null
                                ? '—'
                                : rateAtMultiplier(row.points, multiplier),
                            cost:
                              row.costCny === null
                                ? '—'
                                : rateAtMultiplier(row.costCny, multiplier),
                          })}
                        </span>
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  )
}
