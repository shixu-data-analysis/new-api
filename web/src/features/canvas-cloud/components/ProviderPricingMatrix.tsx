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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
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

import {
  getCanvasProviderPricingMatrix,
  publishCanvasProviderRate,
  resolveCanvasProviderRateRisk,
} from '../api'
import { PricingActionConfirmation } from './PricingActionConfirmation'

type RiskDecision = 'REPRICE_SCHEDULED' | 'MANUAL_PAUSE' | 'TEMPORARY_LOSS'

export function ProviderPricingMatrix() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const matrix = useQuery({
    queryKey: ['canvas-cloud', 'provider-pricing-matrix'],
    queryFn: getCanvasProviderPricingMatrix,
  })
  const [selectedId, setSelectedId] = useState('')
  const [form, setForm] = useState({
    nativeAmount: '',
    currency: 'CNY',
    exchangeRate: '1',
    exchangeSource: '',
    normalizedAmountMinor: '',
    decisionSummary: '',
  })
  const [risk, setRisk] = useState({
    decisionType: 'TEMPORARY_LOSS' as RiskDecision,
    lossEndsAt: '',
    maxExpectedLossPoints: '',
    reason: '',
  })
  const [confirming, setConfirming] = useState<'rate' | 'risk' | null>(null)
  const selected = matrix.data?.find((row) => row.combinationId === selectedId)
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ['canvas-cloud', 'provider-pricing-matrix'],
    })
  const publish = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('A model quality must be selected')
      return publishCanvasProviderRate({
        customerModelId: selected.customerModelId,
        parameterCombinationId: selected.combinationId,
        nativeAmount: form.nativeAmount,
        currency: form.currency,
        exchangeRateSnapshot: {
          rate: form.exchangeRate,
          source: form.exchangeSource,
          asOf: new Date().toISOString(),
        },
        normalizedAmountMinor: form.normalizedAmountMinor,
        failureChargePolicy: { mode: 'NONE' },
        decisionSummary: form.decisionSummary,
      })
    },
    onSuccess: async () => {
      setConfirming(null)
      toast.success(t('Provider cost published'))
      await refresh()
    },
    onError: () => toast.error(t('Provider cost could not be published')),
  })
  const resolveRisk = useMutation({
    mutationFn: () => {
      if (!selected?.rateId) {
        throw new Error('A published provider rate must be selected')
      }
      return resolveCanvasProviderRateRisk({
        providerRateVersionId: selected.rateId,
        decisionType: risk.decisionType,
        reason: risk.reason,
        ...(risk.decisionType === 'REPRICE_SCHEDULED'
          ? {
              scheduledPriceVersionIds: selected.prices
                .filter((price) => price.status === 'APPROVED')
                .map((price) => price.id),
            }
          : {}),
        ...(risk.decisionType === 'TEMPORARY_LOSS'
          ? {
              lossEndsAt: new Date(risk.lossEndsAt).toISOString(),
              maxExpectedLossPoints: risk.maxExpectedLossPoints,
            }
          : {}),
      })
    },
    onSuccess: async () => {
      setConfirming(null)
      toast.success(t('Pricing risk decision recorded'))
      await refresh()
    },
    onError: () =>
      toast.error(t('Pricing risk decision could not be recorded')),
  })

  if (matrix.isPending) return <LoadingState />
  if (matrix.isError) {
    return <ErrorState onRetry={() => void matrix.refetch()} />
  }

  const valid = Boolean(
    selected &&
    /^(0|[1-9]\d*)(\.\d{1,8})?$/.test(form.nativeAmount) &&
    /^(0|[1-9]\d*)(\.\d{1,8})?$/.test(form.normalizedAmountMinor) &&
    form.exchangeSource.trim() &&
    form.decisionSummary.trim().length >= 8
  )
  const hasUnsafePrices = selected?.prices.some(
    (price) => price.status === 'PUBLISHED' && price.belowBreakEven
  )
  const validRisk = Boolean(
    selected?.rateId &&
    hasUnsafePrices &&
    risk.reason.trim().length >= 8 &&
    (risk.decisionType !== 'TEMPORARY_LOSS' ||
      (risk.lossEndsAt &&
        new Date(risk.lossEndsAt) > new Date() &&
        /^[1-9]\d*$/.test(risk.maxExpectedLossPoints)))
  )
  const groups = [
    ...new Set(
      matrix.data.flatMap((row) => row.prices.map((price) => price.groupName))
    ),
  ]

  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader>
          <CardTitle>{t('Upstream cost')}</CardTitle>
          <CardDescription>
            {t(
              'Publish a versioned REQUEST × quality cost. Customer point prices remain unchanged.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-5'>
          <form
            className='grid items-start gap-3 lg:grid-cols-[minmax(16rem,1.5fr)_repeat(3,minmax(8rem,0.7fr))_minmax(12rem,1fr)_auto]'
            onSubmit={(event) => {
              event.preventDefault()
              if (valid) setConfirming('rate')
            }}
          >
            <div className='space-y-2'>
              <Label htmlFor='provider-rate-target'>
                {t('Model and quality')}
              </Label>
              <select
                id='provider-rate-target'
                className='border-input bg-background h-9 w-full rounded-md border px-3 text-sm'
                value={selectedId}
                onChange={(event) => {
                  setSelectedId(event.target.value)
                  const row = matrix.data.find(
                    (item) => item.combinationId === event.target.value
                  )
                  setForm({
                    ...form,
                    nativeAmount: row?.nativeAmount ?? '',
                    currency: row?.currency ?? 'CNY',
                    normalizedAmountMinor: row?.normalizedAmountMinor ?? '',
                  })
                }}
              >
                <option value=''>{t('Select')}</option>
                {matrix.data.map((row) => (
                  <option key={row.combinationId} value={row.combinationId}>
                    {row.providerName} · {row.modelName} ·{' '}
                    {String(row.parameters.quality ?? row.combinationKey)}
                  </option>
                ))}
              </select>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='provider-rate-native'>{t('Native amount')}</Label>
              <Input
                id='provider-rate-native'
                inputMode='decimal'
                value={form.nativeAmount}
                onChange={(event) =>
                  setForm({ ...form, nativeAmount: event.target.value })
                }
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='provider-rate-currency'>{t('Currency')}</Label>
              <Input
                id='provider-rate-currency'
                maxLength={3}
                value={form.currency}
                onChange={(event) =>
                  setForm({
                    ...form,
                    currency: event.target.value.toUpperCase(),
                  })
                }
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='provider-rate-cny'>
                {t('Normalized CNY cost')}
              </Label>
              <Input
                id='provider-rate-cny'
                inputMode='decimal'
                value={form.normalizedAmountMinor}
                onChange={(event) =>
                  setForm({
                    ...form,
                    normalizedAmountMinor: event.target.value,
                  })
                }
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='provider-rate-source'>
                {t('Exchange-rate source')}
              </Label>
              <Input
                id='provider-rate-source'
                value={form.exchangeSource}
                onChange={(event) =>
                  setForm({ ...form, exchangeSource: event.target.value })
                }
              />
            </div>
            <Button
              className='w-full lg:mt-7 lg:w-auto'
              type='submit'
              disabled={!valid || publish.isPending}
            >
              {t('Publish cost')}
            </Button>
            <div className='space-y-2 lg:col-span-5'>
              <Label htmlFor='provider-rate-reason'>
                {t('Decision summary')}
              </Label>
              <Input
                id='provider-rate-reason'
                value={form.decisionSummary}
                onChange={(event) =>
                  setForm({ ...form, decisionSummary: event.target.value })
                }
              />
            </div>
          </form>
          {hasUnsafePrices && selected?.rateId ? (
            <form
              className='bg-destructive/5 grid gap-3 rounded-xl border p-4 md:grid-cols-2 xl:grid-cols-4'
              onSubmit={(event) => {
                event.preventDefault()
                if (validRisk) setConfirming('risk')
              }}
            >
              <div className='md:col-span-2 xl:col-span-4'>
                <p className='font-medium'>{t('Below break-even')}</p>
                <p className='text-muted-foreground text-sm'>
                  {t(
                    'Choose a safe scheduled price, manually pause this quality, or approve a limited loss window.'
                  )}
                </p>
              </div>
              <div className='space-y-2'>
                <Label htmlFor='provider-risk-action'>{t('Risk action')}</Label>
                <select
                  id='provider-risk-action'
                  className='border-input bg-background h-9 w-full rounded-md border px-3 text-sm'
                  value={risk.decisionType}
                  onChange={(event) =>
                    setRisk({
                      ...risk,
                      decisionType: event.target.value as RiskDecision,
                    })
                  }
                >
                  <option value='REPRICE_SCHEDULED'>
                    {t('Safe price scheduled')}
                  </option>
                  <option value='MANUAL_PAUSE'>{t('Pause quality')}</option>
                  <option value='TEMPORARY_LOSS'>
                    {t('Limited loss window')}
                  </option>
                </select>
              </div>
              {risk.decisionType === 'TEMPORARY_LOSS' ? (
                <>
                  <div className='space-y-2'>
                    <Label htmlFor='provider-risk-deadline'>
                      {t('Loss deadline')}
                    </Label>
                    <Input
                      id='provider-risk-deadline'
                      type='datetime-local'
                      value={risk.lossEndsAt}
                      onChange={(event) =>
                        setRisk({ ...risk, lossEndsAt: event.target.value })
                      }
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor='provider-risk-budget'>
                      {t('Maximum expected loss points')}
                    </Label>
                    <Input
                      id='provider-risk-budget'
                      inputMode='numeric'
                      value={risk.maxExpectedLossPoints}
                      onChange={(event) =>
                        setRisk({
                          ...risk,
                          maxExpectedLossPoints: event.target.value,
                        })
                      }
                    />
                  </div>
                </>
              ) : null}
              <div className='space-y-2'>
                <Label htmlFor='provider-risk-reason'>{t('Reason')}</Label>
                <Input
                  id='provider-risk-reason'
                  value={risk.reason}
                  onChange={(event) =>
                    setRisk({ ...risk, reason: event.target.value })
                  }
                />
              </div>
              <Button
                type='submit'
                disabled={!validRisk || resolveRisk.isPending}
              >
                {t('Record risk decision')}
              </Button>
              {selected.riskDecision ? (
                <p className='text-muted-foreground self-center text-sm md:col-span-2 xl:col-span-3'>
                  {t('Current decision')}:{' '}
                  {t(selected.riskDecision.decisionType)} ·{' '}
                  {selected.riskDecision.reason}
                </p>
              ) : null}
            </form>
          ) : null}
        </CardContent>
      </Card>
      <div className='overflow-x-auto rounded-xl border'>
        <table className='w-full min-w-[960px] text-left text-sm'>
          <thead className='bg-muted/60'>
            <tr>
              <th className='px-3 py-2'>{t('Provider')}</th>
              <th>{t('Model')}</th>
              <th>{t('Quality')}</th>
              <th>{t('Actual model ID')}</th>
              <th>{t('Current cost')}</th>
              {groups.map((group) => (
                <th key={group}>{group}</th>
              ))}
            </tr>
          </thead>
          <tbody className='divide-y'>
            {matrix.data.map((row) => (
              <tr key={row.combinationId}>
                <td className='px-3 py-2'>{row.providerName}</td>
                <td>{row.modelName}</td>
                <td>{String(row.parameters.quality ?? row.combinationKey)}</td>
                <td className='font-mono'>{row.resolvedProviderModelId}</td>
                <td>
                  {row.nativeAmount && row.currency
                    ? `${row.currency} ${row.nativeAmount}`
                    : t('Not priced')}
                </td>
                {groups.map((group) => {
                  const price = row.prices.find(
                    (item) => item.groupName === group
                  )
                  return (
                    <td key={group}>
                      {price ? (
                        <span
                          className={
                            price.belowBreakEven
                              ? 'text-destructive font-medium'
                              : ''
                          }
                        >
                          {price.points} {t('points')} · v{price.version}
                          {price.newBreakEvenPoints
                            ? ` · ${t('Safe floor')} >${price.newBreakEvenPoints}`
                            : ''}
                        </span>
                      ) : (
                        t('Not priced')
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PricingActionConfirmation
        open={confirming === 'rate'}
        title={t('Publish this provider cost?')}
        description={t(
          'This records the real upstream cost and marks affected customer prices for review without changing them.'
        )}
        confirmLabel={t('Confirm publication')}
        pending={publish.isPending}
        details={[
          {
            label: t('Model and quality'),
            value: selected
              ? `${selected.modelName} · ${String(selected.parameters.quality ?? '')}`
              : '—',
          },
          {
            label: t('Current cost'),
            value: `${form.currency} ${form.nativeAmount}`,
          },
          {
            label: t('Affected price groups'),
            value: String(selected?.prices.length ?? 0),
          },
        ]}
        onOpenChange={(open) => setConfirming(open ? 'rate' : null)}
        onConfirm={() => publish.mutate()}
      />
      <PricingActionConfirmation
        open={confirming === 'risk'}
        title={t('Confirm pricing risk decision?')}
        description={t(
          'The decision is audited. A pause blocks new quotes; a limited loss window blocks them only after its deadline or budget is reached.'
        )}
        confirmLabel={t('Confirm decision')}
        pending={resolveRisk.isPending}
        details={[
          { label: t('Risk action'), value: t(risk.decisionType) },
          { label: t('Reason'), value: risk.reason || '—' },
        ]}
        onOpenChange={(open) => setConfirming(open ? 'risk' : null)}
        onConfirm={() => resolveRisk.mutate()}
      />
    </div>
  )
}
