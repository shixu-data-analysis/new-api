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
import { useMutation } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Card,
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
  createCanvasPriceDraft,
  publishCanvasPriceVersion,
} from '../api'
import type { CanvasAdminWorkspace } from '../types'
import { BusinessTerm } from './BusinessTerm'

type Price = CanvasAdminWorkspace['prices'][number]

const fieldKeys = [
  'MODEL',
  'PRICE_GROUP',
  'COMBINATION',
  'VERSION',
  'STATUS',
  'POINTS',
  'BASE_RATE',
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
  'EVIDENCE',
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
    evidenceRefs: '',
    approvalReason: '',
  })

  useEffect(() => {
    if (!selected) return
    const assumptions = selected.pricingAssumptionsSnapshot
    setForm((current) => ({
      ...current,
      points: selected.points,
      successProbability: selected.successProbability,
      successfulTaskCostRmb:
        typeof assumptions.successfulTaskCostRmb === 'string'
          ? assumptions.successfulTaskCostRmb
          : selected.kTheoryRmb,
      failedUnrecoverableCostRmb:
        typeof assumptions.failedUnrecoverableCostRmb === 'string'
          ? assumptions.failedUnrecoverableCostRmb
          : '0',
      otherVariableCostRmb:
        typeof assumptions.otherVariableCostRmb === 'string'
          ? assumptions.otherVariableCostRmb
          : '0',
      riskBufferRmb: selected.riskBufferRmb,
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
        points: form.points.trim(),
        successProbability: form.successProbability.trim(),
        successfulTaskCostRmb: form.successfulTaskCostRmb.trim(),
        failedUnrecoverableCostRmb: form.failedUnrecoverableCostRmb.trim(),
        otherVariableCostRmb: form.otherVariableCostRmb.trim(),
        riskBufferRmb: form.riskBufferRmb.trim(),
        decisionSummary: form.decisionSummary.trim(),
        evidenceRefs: form.evidenceRefs
          .split('\n')
          .map((value) => value.trim())
          .filter(Boolean),
      })
    },
    onSuccess: async () => {
      toast.success(t('Price draft created'))
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

  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader>
          <CardTitle>{t('Break-even calculation')}</CardTitle>
          <CardDescription>
            {t(
              'Pricing floors are calculated by the server with fixed-point arithmetic and are never editable.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-3 text-sm'>
          <div className='bg-muted/50 rounded-lg border p-3 font-mono text-xs leading-6 sm:text-sm'>
            <div>{t('K_theory formula')}</div>
            <div>{t('K_pricing formula')}</div>
            <div>{t('Break-even formula')}</div>
            <div>{t('Target margin formula')}</div>
          </div>
          <p className='text-muted-foreground'>
            {t('Pricing formula example')}
          </p>
          <p className='text-muted-foreground'>
            {t(
              'Published points must be strictly greater than the break-even ceiling. Friendly rounding may only increase the result.'
            )}
          </p>
        </CardContent>
      </Card>

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
                      aria-describedby={`${id}-unit`}
                    />
                    <div
                      id={`${id}-unit`}
                      className='text-muted-foreground text-xs'
                    >
                      {unit}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className='grid gap-3 lg:grid-cols-2'>
              <div className='space-y-1'>
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
                />
              </div>
              <div className='space-y-1'>
                <Label htmlFor='pricing-evidence'>
                  <PricingField value='EVIDENCE' />
                </Label>
                <Textarea
                  id='pricing-evidence'
                  aria-label={t('Evidence references')}
                  value={form.evidenceRefs}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      evidenceRefs: event.target.value,
                    }))
                  }
                  placeholder={t('One evidence reference per line')}
                />
              </div>
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
              {t('Approval reason')}
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
                  value={`${price.baseRatePointsPerRmb} ${t('points per RMB')}`}
                />
                <Detail
                  label='TARGET_MARGIN_RATE'
                  value={`${Number(price.targetMarginRate) * 100}%`}
                />
                <Detail
                  label='SUCCESS_PROBABILITY'
                  value={price.successProbability}
                />
                <Detail
                  label='K_THEORY'
                  value={`${price.kTheoryRmb} ${t('RMB')}`}
                />
                <Detail
                  label='K_ACTUAL'
                  value={
                    price.kActualRmb === null
                      ? t('Not eligible or unavailable')
                      : `${price.kActualRmb} ${t('RMB')}`
                  }
                />
                <Detail
                  label='K_PRICING'
                  value={`${price.kPricingRmb} ${t('RMB')}`}
                />
                <Detail
                  label='RISK_BUFFER'
                  value={`${price.riskBufferRmb} ${t('RMB')}`}
                />
                <Detail
                  label='BREAK_EVEN'
                  value={`${price.breakEvenPoints} ${t('points')}`}
                />
                <Detail
                  label='TARGET_MARGIN_POINTS'
                  value={`${price.targetMarginPoints} ${t('points')}`}
                />
                <Detail
                  label='CREATED'
                  value={`${dateTime(price.createdAt)} · ${price.createdByPrincipalId}`}
                />
                <Detail
                  label='APPROVED'
                  value={
                    price.approvedAt
                      ? `${dateTime(price.approvedAt)} · ${price.approvedByPrincipalId}`
                      : '—'
                  }
                />
                <Detail label='EFFECTIVE' value={dateTime(price.effectiveAt)} />
                <div className='space-y-1 sm:col-span-2 lg:col-span-4 xl:col-span-2'>
                  <div className='text-muted-foreground text-xs font-medium'>
                    <PricingField value='ASSUMPTIONS' />
                  </div>
                  <pre className='bg-muted/40 max-h-40 overflow-auto rounded-lg p-2 text-xs break-words whitespace-pre-wrap'>
                    {JSON.stringify(price.pricingAssumptionsSnapshot, null, 2)}
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
