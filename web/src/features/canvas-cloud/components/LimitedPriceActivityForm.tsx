/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent } from 'react'
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
}

type TokenRateKey = 'input' | 'output' | 'cacheRead' | 'cacheWrite'

const tokenRateKeys: TokenRateKey[] = [
  'input',
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
      if (approvalReason.trim().length < 8) {
        throw new Error(
          'Promotion approval reason must contain 8 to 2000 characters'
        )
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
    <Card>
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
            <Label>{t('Source model')}</Label>
            <Select
              value={modelId}
              onValueChange={(value) => {
                setModelId(value ?? '')
                setSourcePriceVersionId('')
              }}
            >
              <SelectTrigger
                className='h-auto min-h-8 w-full min-w-0 py-1.5 *:data-[slot=select-value]:line-clamp-none *:data-[slot=select-value]:break-words *:data-[slot=select-value]:whitespace-normal'
                aria-label={t('Source model')}
              >
                <CanvasLocalizedSelectValue
                  value={modelId}
                  displayValue={
                    selectedModel
                      ? `${selectedModel.effectiveDisplayName} · ${selectedModel.modelKey}`
                      : undefined
                  }
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
                className='mt-2 grid max-w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-1 text-sm'
              >
                <span className='min-w-0 break-all'>
                  {selectedModel.effectiveDisplayName} ·{' '}
                  <span className='text-muted-foreground font-mono text-xs break-all'>
                    {selectedModel.modelKey}
                  </span>
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
            <Label>{t('Source price version')}</Label>
            <Select
              value={sourcePriceVersionId}
              onValueChange={(value) => {
                setSourcePriceVersionId(value ?? '')
              }}
              disabled={!modelId || model.isPending}
            >
              <SelectTrigger
                className='h-auto min-h-8 w-full min-w-0 py-1.5 *:data-[slot=select-value]:line-clamp-none *:data-[slot=select-value]:break-words *:data-[slot=select-value]:whitespace-normal'
                aria-label={t('Source price version')}
              >
                <CanvasLocalizedSelectValue
                  value={source?.label ?? (model.isPending ? t('Loading') : '')}
                />
              </SelectTrigger>
              <SelectContent>
                {sources.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {source ? (
            <p className='text-muted-foreground text-sm lg:col-span-2'>
              {t('Published base price')}: {source.points} {t('points')} ·{' '}
              {t('Billing unit')}: {t(source.billingUnit)}
            </p>
          ) : null}
          {source ? (
            <LimitedPriceCostReference
              source={source}
              specialPoints={specialPoints}
              specialTokenRates={specialTokenRates}
            />
          ) : null}
          {tokenPriced ? (
            <>
              <LimitedPriceRateInput
                label={t('Special input token rate')}
                value={specialTokenRates.input}
                onChange={(value) => {
                  setSpecialTokenRates((current) => ({
                    ...current,
                    input: value,
                  }))
                }}
              />
              <LimitedPriceRateInput
                label={t('Special output token rate')}
                value={specialTokenRates.output}
                onChange={(value) => {
                  setSpecialTokenRates((current) => ({
                    ...current,
                    output: value,
                  }))
                }}
              />
              {source?.tokenRates?.cacheRead !== undefined ? (
                <LimitedPriceRateInput
                  label={t('Special cache-read token rate')}
                  value={specialTokenRates.cacheRead}
                  onChange={(value) => {
                    setSpecialTokenRates((current) => ({
                      ...current,
                      cacheRead: value,
                    }))
                  }}
                />
              ) : null}
              {source?.tokenRates?.cacheWrite !== undefined ? (
                <LimitedPriceRateInput
                  label={t('Special cache-write token rate')}
                  value={specialTokenRates.cacheWrite}
                  onChange={(value) => {
                    setSpecialTokenRates((current) => ({
                      ...current,
                      cacheWrite: value,
                    }))
                  }}
                />
              ) : null}
            </>
          ) : (
            <div>
              <Label htmlFor='limited-price-special-points'>
                {t('Special price')} ({t('points')})
              </Label>
              <Input
                id='limited-price-special-points'
                value={specialPoints}
                inputMode='numeric'
                onChange={(event) => setSpecialPoints(event.target.value)}
              />
            </div>
          )}
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
            <Label htmlFor='limited-price-reason'>{t('Approval reason')}</Label>
            <Input
              id='limited-price-reason'
              value={approvalReason}
              minLength={8}
              onChange={(event) => setApprovalReason(event.target.value)}
              required
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
            {t('Uses your current time zone')}:{' '}
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
  onChange: (value: string) => void
}) {
  const id = `limited-price-${props.label}`
  return (
    <div>
      <Label htmlFor={id}>{props.label}</Label>
      <Input
        id={id}
        value={props.value}
        inputMode='decimal'
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  )
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
        {t('Converted CNY')}: ¥{fixedDecimalText(props.preview.revenue)} ·{' '}
        {t('Cost reference')}: ¥{fixedDecimalText(props.preview.cost)} ·{' '}
        {t('Difference')}: ¥{fixedDecimalText(props.preview.difference)}
      </p>
      {props.preview.below ? (
        <p className='text-destructive mt-1 font-medium'>
          {t('Special price is below the pricing cost reference.')}
        </p>
      ) : null}
    </div>
  )
}
