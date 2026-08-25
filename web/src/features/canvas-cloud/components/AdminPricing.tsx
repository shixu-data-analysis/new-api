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
import { useMutation, useQuery } from '@tanstack/react-query'
import { Calculator } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import {
  approveCanvasPriceDraft,
  approveCanvasPointIssuanceRate,
  createCanvasPointIssuanceRateDraft,
  createCanvasPriceDraft,
  getCanvasPointIssuanceRates,
  publishCanvasPointIssuanceRate,
  publishCanvasPriceVersion,
} from '../api'
import type {
  CanvasAdminWorkspace,
  CanvasPointIssuanceRateVersion,
} from '../types'
import { BusinessTerm } from './BusinessTerm'
import { PriceGroupManagement } from './PriceGroupManagement'

type Price = CanvasAdminWorkspace['prices'][number]

const fieldKeys = [
  'MODEL',
  'PRICE_GROUP',
  'COMBINATION',
  'VERSION',
  'STATUS',
  'POINTS',
  'BASE_RATE',
  'ISSUANCE_RATE',
  'RATE_VERSION',
  'RATE_STATUS',
  'RATE_DECISION',
  'RATE_CREATED',
  'RATE_APPROVED',
  'RATE_EFFECTIVE',
  'APPROVAL_REASON',
  'TARGET_MARGIN_RATE',
  'SUCCESS_PROBABILITY',
  'K_THEORY',
  'SUCCESS_COST',
  'FAILURE_COST',
  'OTHER_COST',
  'K_ACTUAL',
  'K_PRICING',
  'RISK_BUFFER',
  'BREAK_EVEN',
  'TARGET_MARGIN_POINTS',
  'ASSUMPTIONS',
  'DECISION',
  'CREATED',
  'APPROVED',
  'EFFECTIVE',
  'ACTION',
] as const

const editableFieldLabels: Partial<Record<(typeof fieldKeys)[number], string>> =
  {
    POINTS: 'Points',
    SUCCESS_PROBABILITY: 'Success probability',
    SUCCESS_COST: 'Successful task cost',
    FAILURE_COST: 'Failed unrecoverable cost',
    OTHER_COST: 'Other variable cost',
    RISK_BUFFER: 'Risk buffer',
  }

function PricingField(props: { value: (typeof fieldKeys)[number] }) {
  return <BusinessTerm kind='pricingField' value={props.value} />
}

function dateTime(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : '—'
}

function businessDecimal(value: string, maximumFractionDigits = 2): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return value
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
  }).format(numeric)
}

function editableDecimal(value: string): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return value
  return numeric.toFixed(2).replace(/\.?0+$/, '')
}

function visiblePricingAssumptions(
  snapshot: Record<string, unknown>
): Record<string, unknown> {
  const {
    decisionSummary: _decision,
    evidenceRefs: _evidence,
    ...visible
  } = snapshot
  return visible
}

function serverErrorPayload(error: unknown): {
  code: string | null
  message: string | null
} {
  if (!error || typeof error !== 'object' || !('response' in error)) {
    return { code: null, message: null }
  }
  const response = error.response
  if (!response || typeof response !== 'object' || !('data' in response)) {
    return { code: null, message: null }
  }
  const data = response.data
  if (!data || typeof data !== 'object') {
    return { code: null, message: null }
  }
  return {
    code: 'code' in data && typeof data.code === 'string' ? data.code : null,
    message:
      'message' in data && typeof data.message === 'string'
        ? data.message
        : null,
  }
}

function Detail(props: { label: (typeof fieldKeys)[number]; value: string }) {
  return (
    <div className='min-w-0 space-y-1'>
      <div className='text-muted-foreground text-xs font-medium'>
        <PricingField value={props.label} />
      </div>
      <div className='text-sm break-words tabular-nums'>{props.value}</div>
    </div>
  )
}

export function AdminPricing(props: {
  prices: Price[]
  onChanged: () => Promise<unknown>
}) {
  const { t } = useTranslation()
  const published = useMemo(
    () => props.prices.filter((price) => price.status === 'PUBLISHED'),
    [props.prices]
  )
  const [selectedId, setSelectedId] = useState(published[0]?.id ?? '')
  const selected =
    published.find((price) => price.id === selectedId) ?? published[0]
  const [form, setForm] = useState({
    points: '',
    successProbability: '0.900000',
    successfulTaskCostRmb: '0',
    failedUnrecoverableCostRmb: '0',
    otherVariableCostRmb: '0',
    riskBufferRmb: '0',
    decisionSummary: '',
    approvalReason: '',
  })
  const [priceTouched, setPriceTouched] = useState({
    points: false,
    successProbability: false,
    successfulTaskCostRmb: false,
    failedUnrecoverableCostRmb: false,
    otherVariableCostRmb: false,
    riskBufferRmb: false,
    decisionSummary: false,
  })
  const [priceSubmitted, setPriceSubmitted] = useState(false)
  const [rateForm, setRateForm] = useState({
    pointsPerRmb: '',
    decisionSummary: '',
    approvalReason: '',
  })
  const [rateTouched, setRateTouched] = useState({
    pointsPerRmb: false,
    decisionSummary: false,
  })
  const [rateSubmitted, setRateSubmitted] = useState(false)
  const rates = useQuery({
    queryKey: ['canvas-cloud', 'point-issuance-rates'],
    queryFn: getCanvasPointIssuanceRates,
  })
  const trimmedRate = rateForm.pointsPerRmb.trim()
  const trimmedDecision = rateForm.decisionSummary.trim()
  const rateInputValid =
    /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(trimmedRate) &&
    Number(trimmedRate) > 0
  let rateValueError: string | null = null
  if (trimmedRate.length === 0) {
    rateValueError = t('This field is required')
  } else if (!rateInputValid) {
    rateValueError = t('Enter a positive value with up to 2 decimals')
  }
  let rateDecisionError: string | null = null
  if (trimmedDecision.length > 2000) {
    rateDecisionError = t('Use no more than 2000 characters')
  }
  const rateErrors = {
    pointsPerRmb: rateValueError,
    decisionSummary: rateDecisionError,
  }
  const rateFormValid = Object.values(rateErrors).every(
    (error) => error === null
  )
  const showRateError = (field: keyof typeof rateTouched) =>
    rateSubmitted || rateTouched[field]

  const priceValues = {
    points: form.points.trim(),
    successProbability: form.successProbability.trim(),
    successfulTaskCostRmb: form.successfulTaskCostRmb.trim(),
    failedUnrecoverableCostRmb: form.failedUnrecoverableCostRmb.trim(),
    otherVariableCostRmb: form.otherVariableCostRmb.trim(),
    riskBufferRmb: form.riskBufferRmb.trim(),
    decisionSummary: form.decisionSummary.trim(),
  }
  const decimalUpToTwo = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/
  const requiredPriceError = (
    value: string,
    valid: boolean,
    invalidMessage: string
  ) => {
    if (value.length === 0) return t('This field is required')
    if (!valid) return t(invalidMessage)
    return null
  }
  const priceErrors = {
    points: requiredPriceError(
      priceValues.points,
      /^[1-9]\d*$/.test(priceValues.points),
      'Enter a positive integer'
    ),
    successProbability: requiredPriceError(
      priceValues.successProbability,
      decimalUpToTwo.test(priceValues.successProbability) &&
        Number(priceValues.successProbability) > 0 &&
        Number(priceValues.successProbability) <= 1,
      'Enter a value above 0 and at most 1, with up to 2 decimals'
    ),
    successfulTaskCostRmb: requiredPriceError(
      priceValues.successfulTaskCostRmb,
      decimalUpToTwo.test(priceValues.successfulTaskCostRmb),
      'Enter a non-negative value with up to 2 decimals'
    ),
    failedUnrecoverableCostRmb: requiredPriceError(
      priceValues.failedUnrecoverableCostRmb,
      decimalUpToTwo.test(priceValues.failedUnrecoverableCostRmb),
      'Enter a non-negative value with up to 2 decimals'
    ),
    otherVariableCostRmb: requiredPriceError(
      priceValues.otherVariableCostRmb,
      decimalUpToTwo.test(priceValues.otherVariableCostRmb),
      'Enter a non-negative value with up to 2 decimals'
    ),
    riskBufferRmb: requiredPriceError(
      priceValues.riskBufferRmb,
      decimalUpToTwo.test(priceValues.riskBufferRmb),
      'Enter a non-negative value with up to 2 decimals'
    ),
    decisionSummary:
      priceValues.decisionSummary.length > 2_000
        ? t('Use no more than 2000 characters')
        : null,
  }
  const priceFormValid = Object.values(priceErrors).every(
    (error) => error === null
  )
  const showPriceError = (field: keyof typeof priceTouched) =>
    priceSubmitted || priceTouched[field]

  useEffect(() => {
    const current = rates.data?.find((rate) => rate.status === 'PUBLISHED')
    if (!current) return
    setRateForm((form) =>
      form.pointsPerRmb
        ? form
        : { ...form, pointsPerRmb: businessDecimal(current.pointsPerRmb) }
    )
  }, [rates.data])

  useEffect(() => {
    if (!selected) return
    const assumptions = selected.pricingAssumptionsSnapshot
    setForm((current) => ({
      ...current,
      points: selected.points,
      successProbability: editableDecimal(selected.successProbability),
      successfulTaskCostRmb:
        typeof assumptions.successfulTaskCostRmb === 'string'
          ? editableDecimal(assumptions.successfulTaskCostRmb)
          : editableDecimal(selected.kTheoryRmb),
      failedUnrecoverableCostRmb:
        typeof assumptions.failedUnrecoverableCostRmb === 'string'
          ? editableDecimal(assumptions.failedUnrecoverableCostRmb)
          : '0',
      otherVariableCostRmb:
        typeof assumptions.otherVariableCostRmb === 'string'
          ? editableDecimal(assumptions.otherVariableCostRmb)
          : '0',
      riskBufferRmb: editableDecimal(selected.riskBufferRmb),
    }))
  }, [selected])

  const changed = async () => {
    await props.onChanged()
  }
  const draft = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('No published price selected')
      return createCanvasPriceDraft({
        sourcePriceVersionId: selected.id,
        points: priceValues.points,
        successProbability: priceValues.successProbability,
        successfulTaskCostRmb: priceValues.successfulTaskCostRmb,
        failedUnrecoverableCostRmb: priceValues.failedUnrecoverableCostRmb,
        otherVariableCostRmb: priceValues.otherVariableCostRmb,
        riskBufferRmb: priceValues.riskBufferRmb,
        ...(priceValues.decisionSummary
          ? { decisionSummary: priceValues.decisionSummary }
          : {}),
      })
    },
    onSuccess: async () => {
      toast.success(t('Price draft created'))
      setForm((current) => ({ ...current, decisionSummary: '' }))
      setPriceTouched({
        points: false,
        successProbability: false,
        successfulTaskCostRmb: false,
        failedUnrecoverableCostRmb: false,
        otherVariableCostRmb: false,
        riskBufferRmb: false,
        decisionSummary: false,
      })
      setPriceSubmitted(false)
      await changed()
    },
    onError: () => toast.error(t('Price draft failed')),
  })
  const approve = useMutation({
    mutationFn: (id: string) =>
      approveCanvasPriceDraft(id, form.approvalReason.trim()),
    onSuccess: async () => {
      toast.success(t('Price draft approved'))
      await changed()
    },
    onError: () => toast.error(t('Price approval failed')),
  })
  const publish = useMutation({
    mutationFn: publishCanvasPriceVersion,
    onSuccess: async () => {
      toast.success(t('Price published'))
      await changed()
    },
    onError: () => toast.error(t('Price publication failed')),
  })
  const refreshRates = async () => {
    await Promise.all([rates.refetch(), changed()])
  }
  const createRate = useMutation({
    mutationFn: () =>
      createCanvasPointIssuanceRateDraft({
        pointsPerRmb: trimmedRate,
        ...(trimmedDecision ? { decisionSummary: trimmedDecision } : {}),
      }),
    onSuccess: async () => {
      toast.success(t('Point issuance rate draft created'))
      setRateForm((current) => ({
        ...current,
        decisionSummary: '',
      }))
      setRateTouched({
        pointsPerRmb: false,
        decisionSummary: false,
      })
      setRateSubmitted(false)
      await refreshRates()
    },
    onError: (error) => {
      const failure = serverErrorPayload(error)
      let description: string
      if (failure.code === 'VALIDATION_FAILED') {
        description = t(
          'The submitted rate draft did not pass server validation. Check the field requirements and try again.'
        )
      } else if (failure.code === 'UNAUTHORIZED') {
        description = t(
          'You are not authorized to manage point issuance rates.'
        )
      } else if (failure.code === 'IDEMPOTENCY_CONFLICT') {
        description = t(
          'This request conflicts with an earlier submission. Refresh the page and try again.'
        )
      } else if (failure.code === 'INVALID_STATE_TRANSITION') {
        description = t(
          'The rate workflow state changed. Refresh the page and try again.'
        )
      } else if (failure.message) {
        description = t('Server response: {{reason}}', {
          reason: failure.message,
        })
      } else {
        description = t(
          'The request failed before the server returned a reason.'
        )
      }
      toast.error(t('Point issuance rate draft failed'), {
        description,
        closeButton: false,
      })
    },
  })
  const approveRate = useMutation({
    mutationFn: (id: string) =>
      approveCanvasPointIssuanceRate(id, rateForm.approvalReason.trim()),
    onSuccess: async () => {
      toast.success(t('Point issuance rate approved'))
      await refreshRates()
    },
    onError: () => toast.error(t('Point issuance rate approval failed')),
  })
  const publishRate = useMutation({
    mutationFn: publishCanvasPointIssuanceRate,
    onSuccess: async () => {
      toast.success(t('Point issuance rate published'))
      await refreshRates()
    },
    onError: () => toast.error(t('Point issuance rate publication failed')),
  })

  return (
    <div className='mx-auto w-full max-w-7xl space-y-4'>
      <Card>
        <CardHeader>
          <CardTitle>{t('Point issuance rate')}</CardTitle>
          <CardDescription>
            {t(
              'The published rate applies only to new pricing drafts and new recharge facts. Historical snapshots are never recalculated.'
            )}
          </CardDescription>
          <CardAction>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => {
                const popup = window.open(
                  '/canvas-cloud/pricing-calculator',
                  'canvas-pricing-calculator',
                  'popup=yes,width=760,height=900,resizable=yes,scrollbars=yes'
                )
                popup?.focus()
              }}
            >
              <Calculator />
              {t('Open pricing calculator')}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className='space-y-4'>
          <form
            aria-label={t('Create point issuance rate draft')}
            className='bg-muted/20 max-w-5xl overflow-hidden rounded-xl border'
            onSubmit={(event) => {
              event.preventDefault()
              setRateSubmitted(true)
              if (!rateFormValid) return
              createRate.mutate()
            }}
          >
            <div className='border-b px-4 py-3'>
              <div className='text-sm font-medium'>
                {t('Create point issuance rate draft')}
              </div>
            </div>
            <div className='space-y-4 p-4'>
              <div className='grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]'>
                <div className='space-y-1'>
                  <Label htmlFor='issuance-rate-value'>
                    <PricingField value='ISSUANCE_RATE' />
                    <span className='text-destructive ml-1' aria-hidden='true'>
                      *
                    </span>
                  </Label>
                  <Input
                    id='issuance-rate-value'
                    inputMode='decimal'
                    value={rateForm.pointsPerRmb}
                    onChange={(event) =>
                      setRateForm((current) => ({
                        ...current,
                        pointsPerRmb: event.target.value,
                      }))
                    }
                    onBlur={() =>
                      setRateTouched((current) => ({
                        ...current,
                        pointsPerRmb: true,
                      }))
                    }
                    aria-required='true'
                    aria-describedby={`issuance-rate-unit${showRateError('pointsPerRmb') && rateErrors.pointsPerRmb ? ' issuance-rate-error' : ''}`}
                    aria-invalid={
                      showRateError('pointsPerRmb') &&
                      Boolean(rateErrors.pointsPerRmb)
                    }
                  />
                  <div
                    id='issuance-rate-unit'
                    className='text-muted-foreground text-xs'
                  >
                    {t('points per RMB, up to 2 decimals')}
                  </div>
                  {showRateError('pointsPerRmb') && rateErrors.pointsPerRmb && (
                    <div
                      id='issuance-rate-error'
                      className='text-destructive text-xs'
                      role='alert'
                    >
                      {rateErrors.pointsPerRmb}
                    </div>
                  )}
                </div>
                <div className='space-y-1'>
                  <Label htmlFor='issuance-rate-decision'>
                    <PricingField value='RATE_DECISION' />
                  </Label>
                  <Input
                    id='issuance-rate-decision'
                    value={rateForm.decisionSummary}
                    onChange={(event) =>
                      setRateForm((current) => ({
                        ...current,
                        decisionSummary: event.target.value,
                      }))
                    }
                    onBlur={() =>
                      setRateTouched((current) => ({
                        ...current,
                        decisionSummary: true,
                      }))
                    }
                    aria-describedby={
                      showRateError('decisionSummary') &&
                      rateErrors.decisionSummary
                        ? 'issuance-rate-decision-help issuance-rate-decision-error'
                        : 'issuance-rate-decision-help'
                    }
                    aria-invalid={
                      showRateError('decisionSummary') &&
                      Boolean(rateErrors.decisionSummary)
                    }
                  />
                  <div
                    id='issuance-rate-decision-help'
                    className='text-muted-foreground text-xs'
                  >
                    {t('Optional, up to 2000 characters')}
                  </div>
                  {showRateError('decisionSummary') &&
                    rateErrors.decisionSummary && (
                      <div
                        id='issuance-rate-decision-error'
                        className='text-destructive text-xs'
                        role='alert'
                      >
                        {rateErrors.decisionSummary}
                      </div>
                    )}
                </div>
              </div>
              <div className='flex justify-end border-t pt-4'>
                <Button
                  type='submit'
                  className='w-full sm:w-auto'
                  disabled={createRate.isPending}
                >
                  {t('Create rate draft')}
                </Button>
              </div>
            </div>
          </form>
          {(rates.data ?? []).some((rate) => rate.status === 'DRAFT') && (
            <div className='max-w-2xl space-y-1'>
              <Label htmlFor='issuance-rate-approval-reason'>
                <PricingField value='APPROVAL_REASON' />
              </Label>
              <Input
                id='issuance-rate-approval-reason'
                value={rateForm.approvalReason}
                onChange={(event) =>
                  setRateForm((current) => ({
                    ...current,
                    approvalReason: event.target.value,
                  }))
                }
              />
            </div>
          )}
          {rates.isPending && (
            <div className='text-muted-foreground text-sm'>{t('Loading')}</div>
          )}
          {rates.isError && (
            <Button variant='outline' onClick={() => void rates.refetch()}>
              {t('Retry')}
            </Button>
          )}
          <div className='space-y-3'>
            {(rates.data ?? []).map((rate: CanvasPointIssuanceRateVersion) => (
              <div key={rate.id} className='rounded-xl border p-3 sm:p-4'>
                <div className='flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between'>
                  <div className='grid min-w-0 flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6'>
                    <Detail label='RATE_VERSION' value={`v${rate.version}`} />
                    <Detail label='RATE_STATUS' value={t(rate.status)} />
                    <Detail
                      label='ISSUANCE_RATE'
                      value={`${businessDecimal(rate.pointsPerRmb)} ${t('points per RMB')}`}
                    />
                    <Detail
                      label='RATE_EFFECTIVE'
                      value={dateTime(rate.effectiveAt)}
                    />
                    <Detail
                      label='RATE_CREATED'
                      value={dateTime(rate.createdAt)}
                    />
                    <Detail
                      label='RATE_APPROVED'
                      value={rate.approvedAt ? dateTime(rate.approvedAt) : '—'}
                    />
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    {rate.status === 'DRAFT' && (
                      <Button
                        size='sm'
                        variant='outline'
                        disabled={
                          approveRate.isPending ||
                          rateForm.approvalReason.trim().length < 8
                        }
                        onClick={() => approveRate.mutate(rate.id)}
                      >
                        {t('Approve')}
                      </Button>
                    )}
                    {rate.status === 'APPROVED' && (
                      <Button
                        size='sm'
                        disabled={publishRate.isPending}
                        onClick={() => publishRate.mutate(rate.id)}
                      >
                        {t('Publish')}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <PriceGroupManagement />

      <Card>
        <CardHeader>
          <CardTitle>{t('Create price version draft')}</CardTitle>
          <CardDescription>
            {t(
              'Only administrator inputs are editable. Submission creates a new DRAFT and never changes the selected published version.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            aria-label={t('Create price version draft')}
            className='space-y-4'
            onSubmit={(event) => {
              event.preventDefault()
              setPriceSubmitted(true)
              if (!priceFormValid) return
              draft.mutate()
            }}
          >
            <div className='space-y-1'>
              <Label htmlFor='pricing-source'>
                {t('Published price source')}
              </Label>
              <select
                id='pricing-source'
                className='border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3'
                value={selected?.id ?? ''}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                {published.map((price) => (
                  <option key={price.id} value={price.id}>
                    {price.modelName} · {price.priceGroup} ·{' '}
                    {price.combinationKey} · v{price.version}
                  </option>
                ))}
              </select>
            </div>
            <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
              {[
                ['pricing-points', 'POINTS', 'points', 'numeric'],
                [
                  'pricing-q',
                  'SUCCESS_PROBABILITY',
                  'successProbability',
                  'decimal',
                ],
                [
                  'pricing-success-cost',
                  'SUCCESS_COST',
                  'successfulTaskCostRmb',
                  'decimal',
                ],
                [
                  'pricing-failure-cost',
                  'FAILURE_COST',
                  'failedUnrecoverableCostRmb',
                  'decimal',
                ],
                [
                  'pricing-other-cost',
                  'OTHER_COST',
                  'otherVariableCostRmb',
                  'decimal',
                ],
                ['pricing-buffer', 'RISK_BUFFER', 'riskBufferRmb', 'decimal'],
              ].map(([id, label, key, inputMode]) => {
                const field = key as keyof typeof priceTouched
                let unit = t('RMB per successful chargeable result')
                if (key === 'points') {
                  unit = t('Integer points')
                } else if (key === 'successProbability') {
                  unit = t('Decimal from 0 to 1')
                }
                return (
                  <div key={id} className='space-y-1'>
                    <Label htmlFor={id}>
                      <PricingField
                        value={label as (typeof fieldKeys)[number]}
                      />
                      <span
                        className='text-destructive ml-1'
                        aria-hidden='true'
                      >
                        *
                      </span>
                    </Label>
                    <Input
                      id={id}
                      aria-label={t(
                        editableFieldLabels[
                          label as (typeof fieldKeys)[number]
                        ] ?? label
                      )}
                      inputMode={inputMode as 'numeric' | 'decimal'}
                      value={form[key as keyof typeof form]}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                      onBlur={() =>
                        setPriceTouched((current) => ({
                          ...current,
                          [field]: true,
                        }))
                      }
                      aria-required='true'
                      aria-describedby={`${id}-unit${showPriceError(field) && priceErrors[field] ? ` ${id}-error` : ''}`}
                      aria-invalid={
                        showPriceError(field) && Boolean(priceErrors[field])
                      }
                    />
                    <div
                      id={`${id}-unit`}
                      className='text-muted-foreground text-xs'
                    >
                      {unit}
                    </div>
                    {showPriceError(field) && priceErrors[field] && (
                      <div
                        id={`${id}-error`}
                        className='text-destructive text-xs'
                        role='alert'
                      >
                        {priceErrors[field]}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <div className='max-w-3xl space-y-1'>
              <Label htmlFor='pricing-decision'>
                <PricingField value='DECISION' />
              </Label>
              <Textarea
                id='pricing-decision'
                aria-label={t('Decision summary')}
                value={form.decisionSummary}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    decisionSummary: event.target.value,
                  }))
                }
                onBlur={() =>
                  setPriceTouched((current) => ({
                    ...current,
                    decisionSummary: true,
                  }))
                }
                aria-describedby={`pricing-decision-help${showPriceError('decisionSummary') && priceErrors.decisionSummary ? ' pricing-decision-error' : ''}`}
                aria-invalid={
                  showPriceError('decisionSummary') &&
                  Boolean(priceErrors.decisionSummary)
                }
              />
              <div
                id='pricing-decision-help'
                className='text-muted-foreground text-xs'
              >
                {t('Optional, up to 2000 characters')}
              </div>
              {showPriceError('decisionSummary') &&
                priceErrors.decisionSummary && (
                  <div
                    id='pricing-decision-error'
                    className='text-destructive text-xs'
                    role='alert'
                  >
                    {priceErrors.decisionSummary}
                  </div>
                )}
            </div>
            <Button
              type='submit'
              className='w-full sm:w-auto'
              disabled={!selected || draft.isPending}
            >
              {t('Create calculated draft')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('Price versions')}</CardTitle>
          <CardDescription>
            {t(
              'All pricing inputs, derived values, snapshots, audit facts, and workflow states are shown below.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          <div className='space-y-1'>
            <Label htmlFor='pricing-approval-reason'>
              <PricingField value='APPROVAL_REASON' />
            </Label>
            <Input
              id='pricing-approval-reason'
              value={form.approvalReason}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  approvalReason: event.target.value,
                }))
              }
            />
          </div>
          {props.prices.map((price) => (
            <div key={price.id} className='rounded-xl border p-3 sm:p-4'>
              <div className='flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between'>
                <div>
                  <div className='font-medium'>{price.modelName}</div>
                  <div className='text-muted-foreground text-sm'>
                    {price.priceGroup} · {price.combinationKey} · v
                    {price.version} · {t(price.status)}
                  </div>
                </div>
                <div className='flex flex-wrap gap-2'>
                  {price.status === 'DRAFT' && (
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={
                        approve.isPending ||
                        form.approvalReason.trim().length < 8
                      }
                      onClick={() => approve.mutate(price.id)}
                    >
                      {t('Approve')}
                    </Button>
                  )}
                  {price.status === 'APPROVED' && (
                    <Button
                      size='sm'
                      disabled={publish.isPending}
                      onClick={() => publish.mutate(price.id)}
                    >
                      {t('Publish')}
                    </Button>
                  )}
                </div>
              </div>
              <div className='mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5'>
                <Detail
                  label='MODEL'
                  value={`${price.modelName} (${price.modelKey})`}
                />
                <Detail
                  label='PRICE_GROUP'
                  value={`${price.priceGroup} (${price.priceGroupCode})`}
                />
                <Detail label='COMBINATION' value={price.combinationKey} />
                <Detail label='VERSION' value={String(price.version)} />
                <Detail label='STATUS' value={t(price.status)} />
              </div>
              <div className='mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5'>
                <Detail
                  label='POINTS'
                  value={`${price.points} ${t('points')}`}
                />
                <Detail
                  label='BASE_RATE'
                  value={`${businessDecimal(price.baseRatePointsPerRmb)} ${t('points per RMB')}`}
                />
                <Detail
                  label='TARGET_MARGIN_RATE'
                  value={`${Number(price.targetMarginRate) * 100}%`}
                />
                <Detail
                  label='SUCCESS_PROBABILITY'
                  value={businessDecimal(price.successProbability)}
                />
                <Detail
                  label='K_THEORY'
                  value={`${businessDecimal(price.kTheoryRmb)} ${t('RMB')}`}
                />
                <Detail
                  label='K_ACTUAL'
                  value={
                    price.kActualRmb === null
                      ? t('Not eligible or unavailable')
                      : `${businessDecimal(price.kActualRmb)} ${t('RMB')}`
                  }
                />
                <Detail
                  label='K_PRICING'
                  value={`${businessDecimal(price.kPricingRmb)} ${t('RMB')}`}
                />
                <Detail
                  label='RISK_BUFFER'
                  value={`${businessDecimal(price.riskBufferRmb)} ${t('RMB')}`}
                />
                <Detail
                  label='BREAK_EVEN'
                  value={`${price.breakEvenPoints} ${t('points')}`}
                />
                <Detail
                  label='TARGET_MARGIN_POINTS'
                  value={`${price.targetMarginPoints} ${t('points')}`}
                />
                <Detail label='CREATED' value={dateTime(price.createdAt)} />
                <Detail
                  label='APPROVED'
                  value={price.approvedAt ? dateTime(price.approvedAt) : '—'}
                />
                <Detail label='EFFECTIVE' value={dateTime(price.effectiveAt)} />
                <div className='space-y-1 sm:col-span-2 lg:col-span-4 xl:col-span-2'>
                  <div className='text-muted-foreground text-xs font-medium'>
                    <PricingField value='ASSUMPTIONS' />
                  </div>
                  <pre className='bg-muted/40 max-h-40 overflow-auto rounded-lg p-2 text-xs break-words whitespace-pre-wrap'>
                    {JSON.stringify(
                      visiblePricingAssumptions(
                        price.pricingAssumptionsSnapshot
                      ),
                      null,
                      2
                    )}
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
