/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DateTimePicker } from '@/components/datetime-picker'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectItem, SelectTrigger } from '@/components/ui/select'

import { createCanvasLimitedPriceActivity } from '../activity-api'
import {
  getCanvasModelPricingModel,
  getCanvasModelPricingWorkspace,
} from '../api'
import { formatCanvasDateTime } from '../formatters'
import { isTextInput, tokenCategoryLabelKey } from '../lib/token-rate-summary'
import { pricingScopeLabel } from '../pricing-scope-label'
import type {
  CanvasModelPricingPriceSnapshot,
  CanvasTokenCategoryRisk,
} from '../types'
import {
  SelectContent,
  TokenCategoryCostReferences,
  type TokenCategoryCostReferenceDisplay,
} from './ActivityShared'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { ModelIdentityTooltip } from './ModelIdentityTooltip'

function activityDetailHref(activityId: string): string {
  return `/canvas-cloud/point-campaigns?${new URLSearchParams({
    activityId,
  }).toString()}`
}

type LimitedPriceConflict = {
  id: string
  name: string
  startsAt: string
  endsAt: string
}

function limitedPriceConflictFromError(
  error: unknown
): LimitedPriceConflict | undefined {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return undefined
  }
  const response = error.response as {
    status?: unknown
    data?: { conflictActivity?: unknown }
  }
  const conflictActivity = response.data?.conflictActivity
  if (
    response.status !== 409 ||
    typeof conflictActivity !== 'object' ||
    conflictActivity === null
  ) {
    return undefined
  }
  const activity = conflictActivity as Record<string, unknown>
  if (
    typeof activity.id !== 'string' ||
    typeof activity.name !== 'string' ||
    typeof activity.startsAt !== 'string' ||
    typeof activity.endsAt !== 'string'
  ) {
    return undefined
  }
  return {
    id: activity.id,
    name: activity.name,
    startsAt: activity.startsAt,
    endsAt: activity.endsAt,
  }
}

type PublishedPriceSource = {
  id: string
  label: string
  billingUnit: CanvasModelPricingPriceSnapshot['billingUnit']
  points: string
  tokenRates: CanvasModelPricingPriceSnapshot['tokenRates']
  calculation: CanvasModelPricingPriceSnapshot['calculation']
  tokenCategoryRisks: CanvasTokenCategoryRisk[]
  /** A disabled specification stays listed but cannot get a new special. */
  specificationDisabled: boolean
}

type TokenRateKey =
  | 'input'
  | 'imageInput'
  | 'output'
  | 'cacheRead'
  | 'cacheWrite'

const tokenRateKeys: TokenRateKey[] = [
  'input',
  'imageInput',
  'output',
  'cacheRead',
  'cacheWrite',
]

function fixedDecimal(value: string): bigint | undefined {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,8}))?$/u.exec(value)
  if (!match) return undefined
  return (
    BigInt(match[1]) * 100_000_000n + BigInt((match[2] ?? '').padEnd(8, '0'))
  )
}

function fixedDecimalText(value: bigint): string {
  const sign = value < 0n ? '-' : ''
  const magnitude = value < 0n ? -value : value
  const fraction = (magnitude % 100_000_000n)
    .toString()
    .padStart(8, '0')
    .replace(/0+$/u, '')
  return `${sign}${magnitude / 100_000_000n}${fraction ? `.${fraction}` : ''}`
}

function specialRevenueFromPoints(
  points: string,
  baseRatePointsPerRmb: string
): bigint | undefined {
  if (!/^[1-9]\d*$/u.test(points)) return undefined
  const baseRate = fixedDecimal(baseRatePointsPerRmb)
  if (!baseRate || baseRate <= 0n) return undefined
  return (BigInt(points) * 100_000_000n * 100_000_000n) / baseRate
}

function specialPricePreview(
  revenue: bigint | undefined,
  cost: string | undefined
) {
  const costReference = cost === undefined ? undefined : fixedDecimal(cost)
  if (revenue === undefined || costReference === undefined) return undefined
  const difference = revenue - costReference
  return { revenue, cost: costReference, difference, below: difference < 0n }
}

function tokenSpecialPriceRmb(
  specialPoints: string,
  baseRatePointsPerRmb: string
): bigint | undefined {
  const special = fixedDecimal(specialPoints)
  const baseRate = fixedDecimal(baseRatePointsPerRmb)
  if (special === undefined || baseRate === undefined || baseRate <= 0n) {
    return undefined
  }
  return (special * 100_000_000n) / baseRate
}

function tokenCategoryCostReference(
  category: TokenRateKey,
  risk: CanvasTokenCategoryRisk | undefined,
  baseRatePointsPerRmb: string | undefined,
  specialPoints: string
): TokenCategoryCostReferenceDisplay {
  if (!risk) {
    return {
      category,
      basePoints: null,
      specialPoints: null,
      baseRatePointsPerRmb: null,
      kPricingRmb: null,
      specialPriceRmb: null,
      differenceRmb: null,
      belowCostReference: null,
    }
  }
  const normalizedSpecial = fixedDecimal(specialPoints)
  const normalizedBaseRate =
    baseRatePointsPerRmb === undefined
      ? undefined
      : fixedDecimal(baseRatePointsPerRmb)
  const normalizedCost =
    risk.kPricingRmb === undefined ? undefined : fixedDecimal(risk.kPricingRmb)
  const convertedSpecial =
    normalizedSpecial === undefined || normalizedBaseRate === undefined
      ? undefined
      : tokenSpecialPriceRmb(specialPoints, baseRatePointsPerRmb ?? '')
  const difference =
    convertedSpecial === undefined || normalizedCost === undefined
      ? undefined
      : convertedSpecial - normalizedCost
  return {
    category,
    basePoints: risk.customerRatePoints,
    specialPoints:
      normalizedSpecial === undefined
        ? null
        : fixedDecimalText(normalizedSpecial),
    baseRatePointsPerRmb:
      normalizedBaseRate === undefined ? null : (baseRatePointsPerRmb ?? null),
    kPricingRmb:
      normalizedCost === undefined ? null : (risk.kPricingRmb ?? null),
    specialPriceRmb:
      convertedSpecial === undefined
        ? null
        : fixedDecimalText(convertedSpecial),
    differenceRmb:
      difference === undefined ? null : fixedDecimalText(difference),
    belowCostReference: difference === undefined ? null : difference < 0n,
  }
}

export function LimitedPriceActivityForm(props: {
  onBack: () => void
  onSaved: (activityId: string) => Promise<void> | void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [modelId, setModelId] = useState('')
  const [sourcePriceVersionId, setSourcePriceVersionId] = useState('')
  const [specialPoints, setSpecialPoints] = useState('')
  const [specialTokenRates, setSpecialTokenRates] = useState({
    input: '',
    imageInput: '',
    output: '',
    cacheRead: '',
    cacheWrite: '',
  })
  const [startsAt, setStartsAt] = useState<Date>()
  const [endsAt, setEndsAt] = useState<Date>()
  const [approvalReason, setApprovalReason] = useState('')
  const [error, setError] = useState<string>()
  const [conflictActivity, setConflictActivity] =
    useState<LimitedPriceConflict>()
  const workspace = useQuery({
    queryKey: ['canvas-cloud', 'model-pricing-workspace'],
    queryFn: getCanvasModelPricingWorkspace,
  })
  const model = useQuery({
    queryKey: ['canvas-cloud', 'model-pricing-model', modelId],
    queryFn: () => getCanvasModelPricingModel(modelId),
    enabled: Boolean(modelId),
  })
  const sources = useMemo<PublishedPriceSource[]>(() => {
    if (!model.data) return []
    return model.data.pricingScopes.flatMap((scope) =>
      scope.prices.flatMap((price) => {
        const current = price.current
        if (!current?.id || current.status !== 'PUBLISHED') return []
        return [
          {
            id: current.id,
            label: `${price.priceGroupName} · ${pricingScopeLabel(
              { key: scope.combinationKey, parameters: scope.parameters },
              t
            )}`,
            billingUnit: current.billingUnit,
            points: current.points,
            tokenRates: current.tokenRates,
            calculation: current.calculation,
            tokenCategoryRisks: current.assumptions?.tokenCategoryRisks ?? [],
            specificationDisabled: scope.controlEnabled === false,
          },
        ]
      })
    )
  }, [model.data, t])
  const source = sources.find((item) => item.id === sourcePriceVersionId)
  const selectedModel = workspace.data?.models.find(
    (item) => item.id === modelId
  )
  const tokenPriced = source?.billingUnit === 'MILLION_TOKENS'
  const requiredTokenCategories = tokenRateKeys.filter(
    (category) => source?.tokenRates?.[category] !== undefined
  )
  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !source || !startsAt) {
        throw new Error('Complete all required fields')
      }
      if (startsAt <= new Date() || !endsAt || endsAt <= startsAt) {
        throw new Error(
          'Limited-price Promotion requires a future start and a later end'
        )
      }
      if (!approvalReason.trim()) throw new Error('Enter a reason')
      if (approvalReason.trim().length > 255) {
        throw new Error('Reason cannot exceed 255 characters')
      }
      if (tokenPriced) {
        if (
          !requiredTokenCategories.every(
            (category) =>
              fixedDecimal(specialTokenRates[category].trim()) !== undefined
          )
        ) {
          throw new Error('Enter special token rates')
        }
        if (
          !requiredTokenCategories.every((category) => {
            const special = fixedDecimal(specialTokenRates[category].trim())
            const base = fixedDecimal(source.tokenRates?.[category] ?? '')
            return (
              special !== undefined && base !== undefined && special <= base
            )
          })
        ) {
          throw new Error('Special token rates cannot exceed the base rates')
        }
        if (
          !requiredTokenCategories.some((category) => {
            const special = fixedDecimal(specialTokenRates[category].trim())
            const base = fixedDecimal(source.tokenRates?.[category] ?? '')
            return special !== undefined && base !== undefined && special < base
          })
        ) {
          throw new Error('Reduce at least one token rate')
        }
        return createCanvasLimitedPriceActivity({
          name: name.trim(),
          sourcePriceVersionId: source.id,
          specialTokenRates: {
            input: specialTokenRates.input.trim(),
            output: specialTokenRates.output.trim(),
            ...(specialTokenRates.cacheRead.trim()
              ? { cacheRead: specialTokenRates.cacheRead.trim() }
              : {}),
            ...(specialTokenRates.cacheWrite.trim()
              ? { cacheWrite: specialTokenRates.cacheWrite.trim() }
              : {}),
            ...(specialTokenRates.imageInput.trim()
              ? { imageInput: specialTokenRates.imageInput.trim() }
              : {}),
          },
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          approvalReason: approvalReason.trim(),
        })
      }
      if (!/^\d+$/u.test(specialPoints.trim())) {
        throw new Error('Enter a valid special price')
      }
      return createCanvasLimitedPriceActivity({
        name: name.trim(),
        sourcePriceVersionId: source.id,
        specialPoints: specialPoints.trim(),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        approvalReason: approvalReason.trim(),
      })
    },
    onSuccess: (activity) => {
      toast.success(t('Limited-time special scheduled'))
      void queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'activities'],
      })
      void props.onSaved(activity.id)
    },
    onError: (reason) => {
      const conflict = limitedPriceConflictFromError(reason)
      setConflictActivity(conflict)
      if (conflict) return
      const message = reason instanceof Error ? reason.message : undefined
      setError(
        message ? t(message) : t('Unable to schedule limited-time special')
      )
    },
  })
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(undefined)
    setConflictActivity(undefined)
    save.mutate()
  }
  return (
    <Card className='max-w-3xl'>
      <CardHeader>
        <CardTitle>{t('TASK_PRICE_SPECIAL')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className='grid gap-4 lg:grid-cols-2' onSubmit={submit}>
          <div className='lg:col-span-2'>
            <Label htmlFor='limited-price-name'>{t('Activity name')}</Label>
            <Input
              id='limited-price-name'
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
          <div>
            <Label>{t('Model')}</Label>
            <Select
              value={modelId}
              onValueChange={(value) => {
                setModelId(value ?? '')
                setSourcePriceVersionId('')
              }}
            >
              <SelectTrigger
                className='w-full min-w-0'
                aria-label={t('Model')}
                title={selectedModel?.effectiveDisplayName}
              >
                <CanvasLocalizedSelectValue
                  value={modelId}
                  placeholderKey='Choose a model'
                  displayValue={selectedModel?.effectiveDisplayName}
                />
              </SelectTrigger>
              <SelectContent>
                {workspace.data?.models
                  .filter((item) => item.hasPublishedPricing)
                  .map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.effectiveDisplayName} · {item.modelKey}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {selectedModel ? (
              <div
                data-model-identity='activity-source-model'
                className='mt-1 flex max-w-full min-w-0 items-center gap-1'
              >
                <span className='text-muted-foreground min-w-0 font-mono text-xs [overflow-wrap:anywhere]'>
                  {selectedModel.modelKey}
                </span>
                <span className='shrink-0'>
                  <ModelIdentityTooltip
                    effectiveDisplayName={selectedModel.effectiveDisplayName}
                    catalogDefaultName={selectedModel.catalogDefaultName}
                    modelKey={selectedModel.modelKey}
                    modelKeyShown
                  />
                </span>
              </div>
            ) : null}
          </div>
          <div>
            <Label>{t('Applicable price')}</Label>
            <Select
              value={sourcePriceVersionId}
              onValueChange={(value) => {
                setSourcePriceVersionId(value ?? '')
              }}
              disabled={!modelId || model.isLoading}
            >
              <SelectTrigger
                className='h-auto min-h-8 w-full min-w-0 py-1.5 *:data-[slot=select-value]:line-clamp-none *:data-[slot=select-value]:break-words *:data-[slot=select-value]:whitespace-normal'
                aria-label={t('Applicable price')}
              >
                <CanvasLocalizedSelectValue
                  value={source?.label ?? (model.isLoading ? t('Loading') : '')}
                  placeholderKey={
                    modelId
                      ? 'Choose an applicable price'
                      : 'Choose a model first'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {sources.map((item) => (
                  <SelectItem
                    key={item.id}
                    value={item.id}
                    disabled={item.specificationDisabled}
                  >
                    {item.label}
                    {item.specificationDisabled && (
                      <span className='text-muted-foreground ml-2'>
                        {t('Specification disabled')}
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {tokenPriced && source ? (
            <>
              <div className='lg:col-span-2'>
                <p className='text-sm font-medium'>
                  {t('{{label}} ({{detail}})', {
                    label: t('Current regular price'),
                    detail: t(billingUnitPointsKey[source.billingUnit]),
                  })}
                </p>
                <p className='mt-1 text-sm tabular-nums'>
                  {requiredTokenCategories
                    .map(
                      (category) =>
                        `${t(tokenCategoryLabelKey(category, requiredTokenCategories))} ${source.tokenRates?.[category] ?? ''}`
                    )
                    .join(' · ')}
                </p>
              </div>
              {requiredTokenCategories.map((category) => (
                <LimitedPriceRateInput
                  key={category}
                  label={t('{{label}} ({{detail}})', {
                    label: t(
                      isTextInput(category, requiredTokenCategories)
                        ? 'Special text-input token rate'
                        : specialRateLabelKey[category]
                    ),
                    detail: t('points per million tokens'),
                  })}
                  value={specialTokenRates[category]}
                  comparison={regularPriceComparison(
                    source.tokenRates?.[category] ?? '',
                    specialTokenRates[category],
                    'MILLION_TOKENS',
                    t
                  )}
                  onChange={(value) => {
                    setSpecialTokenRates((current) => ({
                      ...current,
                      [category]: value,
                    }))
                  }}
                />
              ))}
            </>
          ) : (
            <>
              <div>
                <p className='text-sm font-medium'>
                  {t('Current regular price')}
                </p>
                <p className='mt-2 text-sm tabular-nums'>
                  {source
                    ? `${source.points} ${t(billingUnitPointsKey[source.billingUnit])}`
                    : '—'}
                </p>
              </div>
              <LimitedPriceRateInput
                label={t('{{label}} ({{detail}})', {
                  label: t('Special price'),
                  detail: t(
                    source ? billingUnitPointsKey[source.billingUnit] : 'points'
                  ),
                })}
                value={specialPoints}
                inputMode='numeric'
                comparison={
                  source
                    ? regularPriceComparison(
                        source.points ?? '',
                        specialPoints,
                        source.billingUnit,
                        t
                      )
                    : null
                }
                onChange={setSpecialPoints}
              />
            </>
          )}
          {source ? (
            <LimitedPriceCostReference
              source={source}
              specialPoints={specialPoints}
              specialTokenRates={specialTokenRates}
            />
          ) : null}
          <div>
            <Label>{t('Start time')}</Label>
            <DateTimePicker
              value={startsAt}
              onChange={(value) => {
                setStartsAt(value)
              }}
              futureOnly
              placeholder={t('Start time')}
            />
          </div>
          <div>
            <Label>{t('End time')}</Label>
            <DateTimePicker
              value={endsAt}
              onChange={(value) => {
                setEndsAt(value)
              }}
              futureOnly
              placeholder={t('End time')}
            />
          </div>
          <div className='lg:col-span-2'>
            <Label htmlFor='limited-price-reason'>{t('Reason')}</Label>
            <Input
              id='limited-price-reason'
              value={approvalReason}
              onChange={(event) => setApprovalReason(event.target.value)}
            />
          </div>
          {error ? (
            <p className='text-destructive text-sm lg:col-span-2' role='alert'>
              {error}
            </p>
          ) : null}
          {conflictActivity ? (
            <div
              className='border-destructive text-destructive rounded-md border p-3 text-sm lg:col-span-2'
              role='alert'
            >
              <p>
                {t(
                  'An overlapping activity already applies to this source and period.'
                )}
              </p>
              <p className='mt-1'>
                {conflictActivity.name} ·{' '}
                {formatCanvasDateTime(conflictActivity.startsAt)} —{' '}
                {formatCanvasDateTime(conflictActivity.endsAt)}
              </p>
              <a
                className='mt-2 inline-block font-medium underline'
                href={activityDetailHref(conflictActivity.id)}
                target='_blank'
                rel='noreferrer'
              >
                {t('View conflicting activity')}
              </a>
            </div>
          ) : null}
          <p className='text-muted-foreground text-sm lg:col-span-2'>
            {t('{{label}}: ', { label: t('Uses your current time zone') })}
            {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </p>
          <div className='flex justify-end gap-2 lg:col-span-2'>
            <Button type='button' variant='outline' onClick={props.onBack}>
              {t('Cancel')}
            </Button>
            <Button type='submit' disabled={save.isPending}>
              {t('Confirm publish')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function LimitedPriceRateInput(props: {
  label: string
  value: string
  comparison: string | null
  inputMode?: 'numeric' | 'decimal'
  onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <div>
      <Label htmlFor={id}>{props.label}</Label>
      <Input
        id={id}
        value={props.value}
        inputMode={props.inputMode ?? 'decimal'}
        aria-describedby={props.comparison ? `${id}-comparison` : undefined}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {props.comparison ? (
        <p
          id={`${id}-comparison`}
          className='text-muted-foreground mt-1 text-xs'
        >
          {props.comparison}
        </p>
      ) : null}
    </div>
  )
}

const billingUnitPointsKey = {
  REQUEST: 'points per request',
  SECOND: 'points per second',
  MILLION_TOKENS: 'points per million tokens',
} as const

const specialRateLabelKey: Record<TokenRateKey, string> = {
  input: 'Special input token rate',
  imageInput: 'Special image-input token rate',
  output: 'Special output token rate',
  cacheRead: 'Special cache-read token rate',
  cacheWrite: 'Special cache-write token rate',
}

// A hint only: how the entered special price compares with the current regular price. It sets no price bounds.
function regularPriceComparison(
  regular: string,
  special: string,
  billingUnit: 'REQUEST' | 'SECOND' | 'MILLION_TOKENS',
  t: (key: string, values?: Record<string, unknown>) => string
): string | null {
  const regularValue = fixedDecimal(regular)
  const specialValue = fixedDecimal(special.trim())
  const validSpecial =
    billingUnit === 'MILLION_TOKENS'
      ? specialValue !== undefined && specialValue > 0n
      : /^[1-9]\d*$/u.test(special.trim())
  if (!validSpecial || regularValue === undefined || regularValue <= 0n) {
    return null
  }
  const specialAmount = specialValue as bigint
  if (specialAmount === regularValue) return t('Same as the regular price')
  const percent = Math.round(
    (Number(specialAmount) / Number(regularValue)) * 100
  )
  if (billingUnit === 'MILLION_TOKENS') {
    return t('{{percent}}% of the regular price', { percent })
  }
  const less = specialAmount < regularValue
  const difference = fixedDecimalText(
    less ? regularValue - specialAmount : specialAmount - regularValue
  )
  const perSecond = billingUnit === 'SECOND'
  let key =
    '{{percent}}% of the regular price, {{points}} points more per request'
  if (less && perSecond) {
    key = '{{percent}}% of the regular price, {{points}} points less per second'
  } else if (less) {
    key =
      '{{percent}}% of the regular price, {{points}} points less per request'
  } else if (perSecond) {
    key = '{{percent}}% of the regular price, {{points}} points more per second'
  }
  return t(key, { percent, points: difference })
}

function LimitedPriceCostReference(props: {
  source: PublishedPriceSource
  specialPoints: string
  specialTokenRates: Record<TokenRateKey, string>
}) {
  const { t } = useTranslation()
  if (props.source.billingUnit === 'MILLION_TOKENS') {
    const references = tokenRateKeys
      .filter((category) => props.source.tokenRates?.[category] !== undefined)
      .map((category) =>
        tokenCategoryCostReference(
          category,
          props.source.tokenCategoryRisks.find(
            (risk) => risk.category === category
          ),
          props.source.calculation?.baseRatePointsPerRmb,
          props.specialTokenRates[category].trim()
        )
      )
    return <TokenCategoryCostReferences references={references} />
  }
  if (!props.source.calculation) {
    return (
      <p className='text-muted-foreground text-sm lg:col-span-2'>
        {t('Pricing reference is temporarily unavailable.')}
      </p>
    )
  }
  const preview = specialPricePreview(
    specialRevenueFromPoints(
      props.specialPoints.trim(),
      props.source.calculation.baseRatePointsPerRmb
    ),
    props.source.calculation.kPricingRmb
  )
  return <SpecialPriceReference preview={preview} />
}

function SpecialPriceReference(props: {
  preview: ReturnType<typeof specialPricePreview> | undefined
}) {
  const { t } = useTranslation()
  if (!props.preview) {
    return (
      <p className='text-muted-foreground text-sm'>
        {t('Pricing reference is temporarily unavailable.')}
      </p>
    )
  }
  return (
    <div className='rounded-md border p-3 text-sm lg:col-span-2'>
      <p className='font-medium'>{t('Pricing cost reference')}</p>
      <p>
        {t('{{label}}: ', { label: t('Converted CNY') })}¥
        {fixedDecimalText(props.preview.revenue)} ·{' '}
        {t('{{label}}: ', { label: t('Cost reference') })}¥
        {fixedDecimalText(props.preview.cost)} ·{' '}
        {t('{{label}}: ', { label: t('Difference') })}¥
        {fixedDecimalText(props.preview.difference)}
      </p>
      {props.preview.below ? (
        <p className='text-destructive mt-1 font-medium'>
          {t('Special price is below the pricing cost reference.')}
        </p>
      ) : null}
    </div>
  )
}
