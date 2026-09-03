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

import { StaticDataTable } from '@/components/data-table'
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
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import {
  getCanvasProviderPricingMatrix,
  publishCanvasProviderRate,
  resolveCanvasProviderRateRisk,
} from '../api'
import { canvasStaticColumnWidth } from './canvas-table-layout'
import {
  CanvasColumnFilterField,
  CanvasColumnFilterPanel,
} from './CanvasColumnFilterPanel'
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
  const [providerFilter, setProviderFilter] = useState('')
  const [modelFilter, setModelFilter] = useState('')
  const [qualityFilter, setQualityFilter] = useState('')
  const [page, setPage] = useState(1)
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
  const provider = providerFilter.trim().toLocaleLowerCase()
  const model = modelFilter.trim().toLocaleLowerCase()
  const quality = qualityFilter.trim().toLocaleLowerCase()
  const filteredRows = matrix.data.filter(
    (row) =>
      (!provider || row.providerName.toLocaleLowerCase().includes(provider)) &&
      (!model || row.modelName.toLocaleLowerCase().includes(model)) &&
      (!quality ||
        String(row.parameters.quality ?? row.combinationKey)
          .toLocaleLowerCase()
          .includes(quality))
  )
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / 20))
  const currentPage = Math.min(page, pageCount)
  const visibleRows = filteredRows.slice(
    (currentPage - 1) * 20,
    currentPage * 20
  )

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
      <CanvasColumnFilterPanel
        activeCount={
          [providerFilter, modelFilter, qualityFilter].filter(Boolean).length
        }
        onClear={() => {
          setProviderFilter('')
          setModelFilter('')
          setQualityFilter('')
          setPage(1)
        }}
      >
        <CanvasColumnFilterField label={t('Provider')}>
          <Input
            value={providerFilter}
            placeholder={t('Provider')}
            onChange={(event) => {
              setProviderFilter(event.target.value)
              setPage(1)
            }}
          />
        </CanvasColumnFilterField>
        <CanvasColumnFilterField label={t('Model')}>
          <Input
            value={modelFilter}
            placeholder={t('Model')}
            onChange={(event) => {
              setModelFilter(event.target.value)
              setPage(1)
            }}
          />
        </CanvasColumnFilterField>
        <CanvasColumnFilterField label={t('Quality')}>
          <Input
            value={qualityFilter}
            placeholder={t('Quality')}
            onChange={(event) => {
              setQualityFilter(event.target.value)
              setPage(1)
            }}
          />
        </CanvasColumnFilterField>
      </CanvasColumnFilterPanel>
      <StaticDataTable tableClassName='min-w-[1120px] table-fixed'>
        <TableHeader>
          <TableRow>
            <TableHead
              className={`${canvasStaticColumnWidth.standard} h-auto py-2 whitespace-normal`}
            >
              {t('Provider')}
            </TableHead>
            <TableHead
              className={`${canvasStaticColumnWidth.wide} h-auto py-2 whitespace-normal`}
            >
              {t('Model')}
            </TableHead>
            <TableHead
              className={`${canvasStaticColumnWidth.standard} h-auto py-2 whitespace-normal`}
            >
              {t('Quality')}
            </TableHead>
            <TableHead
              className={`${canvasStaticColumnWidth.standard} h-auto py-2 whitespace-normal`}
            >
              {t('Current cost')}
            </TableHead>
            <TableHead
              className={`${canvasStaticColumnWidth.standard} h-auto py-2 whitespace-normal`}
            >
              {t('Pricing risk')}
            </TableHead>
            <TableHead
              className={`${canvasStaticColumnWidth.standard} h-auto py-2 whitespace-normal`}
            >
              {t('Affected price groups')}
            </TableHead>
            <TableHead
              className={`${canvasStaticColumnWidth.detail} h-auto py-2 whitespace-normal`}
            >
              {t('Details')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.map((row) => (
            <TableRow key={row.combinationId} className='align-top'>
              <TableCell className='break-words whitespace-normal'>
                {row.providerName}
              </TableCell>
              <TableCell className='break-words whitespace-normal'>
                {row.modelName}
              </TableCell>
              <TableCell className='break-all whitespace-normal'>
                {String(row.parameters.quality ?? row.combinationKey)}
              </TableCell>
              <TableCell>
                {row.nativeAmount && row.currency
                  ? `${row.currency} ${row.nativeAmount}`
                  : t('Not priced')}
              </TableCell>
              <TableCell className='break-words whitespace-normal'>
                {row.prices.some((price) => price.belowBreakEven)
                  ? t('Below break-even')
                  : t('No active risk')}
              </TableCell>
              <TableCell>{row.prices.length}</TableCell>
              <TableCell>
                <details>
                  <summary className='text-primary cursor-pointer'>
                    {t('View')}
                  </summary>
                  <div className='mt-2 min-w-0 space-y-1 text-xs whitespace-normal'>
                    <div className='font-mono break-all'>
                      {row.resolvedProviderModelId}
                    </div>
                    {row.prices.map((price) => (
                      <div
                        key={price.id}
                        className={
                          price.belowBreakEven
                            ? 'text-destructive break-words'
                            : 'text-muted-foreground break-words'
                        }
                      >
                        {price.groupName}: {price.points} {t('points')} · v
                        {price.version}
                      </div>
                    ))}
                  </div>
                </details>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </StaticDataTable>
      <div className='flex items-center justify-between'>
        <span className='text-muted-foreground text-sm'>
          {filteredRows.length} {t('records')} · {currentPage} / {pageCount}
        </span>
        <div className='flex gap-2'>
          <Button
            variant='outline'
            disabled={currentPage <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            {t('Previous')}
          </Button>
          <Button
            variant='outline'
            disabled={currentPage >= pageCount}
            onClick={() => setPage((value) => value + 1)}
          >
            {t('Next')}
          </Button>
        </div>
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
