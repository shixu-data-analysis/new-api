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
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toIntlLocale } from '@/i18n/languages'

import {
  getCanvasProviderPricingMatrix,
  publishCanvasProviderRate,
  resolveCanvasProviderRateRisk,
} from '../api'
import { formatExactRmbReference } from '../point-conversion-types'
import {
  providerBillingUnit,
  providerRiskFormSchema,
  providerRateFormSchema,
  providerRateFormValues,
  providerRateRequest,
  providerTokenCategories,
  providerTokenCategoryLabel,
  type ProviderRateFormValues,
  type ProviderRiskFormValues,
} from '../provider-pricing'
import type { CanvasBillingUnit, CanvasProviderPricingRow } from '../types'
import { canvasStaticColumnWidth } from './canvas-table-layout'
import {
  CanvasColumnFilterField,
  CanvasColumnFilterPanel,
} from './CanvasColumnFilterPanel'
import { CustomerPriceEditor } from './CustomerPriceEditor'
import { PricingActionConfirmation } from './PricingActionConfirmation'

type RateReview = {
  values: ProviderRateFormValues
  row: CanvasProviderPricingRow
  asOf: string
}
type RiskReview = {
  values: ProviderRiskFormValues
  row: CanvasProviderPricingRow
}
type CustomerPriceTarget = {
  row: CanvasProviderPricingRow
  price?: CanvasProviderPricingRow['prices'][number]
}
type RateInputName =
  | 'currency'
  | 'exchangeRate'
  | 'exchangeSource'
  | 'nativeAmount'
  | 'normalizedAmountMinor'
  | 'fixedFailureCost'
  | 'decisionSummary'
  | `tokenRates.${(typeof providerTokenCategories)[number]}`
  | `normalizedTokenRates.${(typeof providerTokenCategories)[number]}`

const billingUnitLabel: Record<CanvasBillingUnit, string> = {
  REQUEST: 'Per request',
  SECOND: 'Per second',
  MILLION_TOKENS: 'Per million tokens',
}
const failureModeLabel = {
  NONE: 'No charge',
  SAME_AS_SUCCESS: 'Same as success',
  FIXED: 'Fixed amount',
} as const

export function ProviderPricingMatrix() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const queryClient = useQueryClient()
  const matrix = useQuery({
    queryKey: ['canvas-cloud', 'provider-pricing-matrix'],
    queryFn: getCanvasProviderPricingMatrix,
  })
  const rateForm = useForm<ProviderRateFormValues>({
    resolver: zodResolver(providerRateFormSchema),
    defaultValues: providerRateFormValues(),
  })
  const riskForm = useForm<ProviderRiskFormValues>({
    resolver: zodResolver(providerRiskFormSchema),
    defaultValues: {
      decisionType: 'TEMPORARY_LOSS',
      lossEndsAt: '',
      maxExpectedLossPoints: '',
      reason: '',
    },
  })
  const [rateReview, setRateReview] = useState<RateReview | null>(null)
  const [riskReview, setRiskReview] = useState<RiskReview | null>(null)
  const [customerPriceTarget, setCustomerPriceTarget] =
    useState<CustomerPriceTarget | null>(null)
  const [providerFilter, setProviderFilter] = useState('')
  const [modelFilter, setModelFilter] = useState('')
  const [qualityFilter, setQualityFilter] = useState('')
  const [page, setPage] = useState(1)
  const selectedId = rateForm.watch('targetId')
  const billingUnit = rateForm.watch('billingUnit')
  const failureMode = rateForm.watch('failureMode')
  const selected = matrix.data?.find((row) => row.combinationId === selectedId)
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ['canvas-cloud', 'provider-pricing-matrix'],
    })
  const publish = useMutation({
    mutationFn: () => {
      if (!rateReview) throw new Error('A provider rate review is required')
      return publishCanvasProviderRate(
        providerRateRequest(rateReview.values, rateReview.row, rateReview.asOf)
      )
    },
    onSuccess: async () => {
      setRateReview(null)
      toast.success(t('Provider cost published'))
      await refresh()
    },
    onError: () => toast.error(t('Provider cost could not be published')),
  })
  const resolveRisk = useMutation({
    mutationFn: () => {
      if (!riskReview) {
        throw new Error('A published provider rate must be selected')
      }
      const { row, values } = riskReview
      const providerRateVersionId = row.rateId
      if (!providerRateVersionId) {
        throw new Error('A published provider rate must be selected')
      }
      return resolveCanvasProviderRateRisk({
        providerRateVersionId,
        decisionType: values.decisionType,
        reason: values.reason,
        ...(values.decisionType === 'REPRICE_SCHEDULED'
          ? {
              scheduledPriceVersionIds: row.prices
                .filter((price) => price.status === 'APPROVED')
                .map((price) => price.id),
            }
          : {}),
        ...(values.decisionType === 'TEMPORARY_LOSS'
          ? {
              lossEndsAt: new Date(values.lossEndsAt).toISOString(),
              maxExpectedLossPoints: values.maxExpectedLossPoints,
            }
          : {}),
      })
    },
    onSuccess: async () => {
      setRiskReview(null)
      toast.success(t('Pricing risk decision recorded'))
      await refresh()
    },
    onError: () =>
      toast.error(t('Pricing risk decision could not be recorded')),
  })

  const filteredRows = useMemo(() => {
    const provider = providerFilter.trim().toLocaleLowerCase()
    const model = modelFilter.trim().toLocaleLowerCase()
    const quality = qualityFilter.trim().toLocaleLowerCase()
    return (matrix.data ?? []).filter(
      (row) =>
        (!provider ||
          row.providerName.toLocaleLowerCase().includes(provider)) &&
        (!model || row.modelName.toLocaleLowerCase().includes(model)) &&
        (!quality ||
          String(row.parameters.quality ?? row.combinationKey)
            .toLocaleLowerCase()
            .includes(quality))
    )
  }, [matrix.data, modelFilter, providerFilter, qualityFilter])

  if (matrix.isPending) return <LoadingState />
  if (matrix.isError) {
    return <ErrorState onRetry={() => void matrix.refetch()} />
  }

  const hasUnsafePrices = selected?.prices.some(
    (price) => price.status === 'PUBLISHED' && price.belowBreakEven
  )
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / 20))
  const currentPage = Math.min(page, pageCount)
  const visibleRows = filteredRows.slice(
    (currentPage - 1) * 20,
    currentPage * 20
  )
  const exact = (value: string | null) =>
    value ? formatExactRmbReference(value, locale) : '—'
  let reviewCost = '—'
  if (rateReview?.values.billingUnit === 'MILLION_TOKENS') {
    reviewCost = providerTokenCategories
      .map(
        (category) =>
          `${t(providerTokenCategoryLabel[category])}: ${exact(rateReview.values.tokenRates[category])}`
      )
      .join(' · ')
  } else if (rateReview) {
    reviewCost = `${rateReview.values.currency} ${exact(rateReview.values.nativeAmount)}`
  }

  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader>
          <CardTitle>{t('Upstream cost')}</CardTitle>
          <CardDescription>
            {t(
              'Publish a versioned upstream cost for the frozen billing unit. Customer point prices remain unchanged.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-5'>
          <Form {...rateForm}>
            <form
              noValidate
              className='space-y-5'
              onSubmit={rateForm.handleSubmit((values) => {
                const row = matrix.data.find(
                  (item) => item.combinationId === values.targetId
                )
                if (!row) return
                setRateReview({ values, row, asOf: new Date().toISOString() })
              })}
            >
              <div className='grid items-start gap-3 lg:grid-cols-[minmax(16rem,1.5fr)_repeat(2,minmax(8rem,0.7fr))_minmax(12rem,1fr)]'>
                <FormField
                  control={rateForm.control}
                  name='targetId'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Model and quality')} *</FormLabel>
                      <FormControl>
                        <NativeSelect
                          {...field}
                          className='w-full'
                          onChange={(event) => {
                            const row = matrix.data.find(
                              (item) =>
                                item.combinationId === event.target.value
                            )
                            rateForm.reset(providerRateFormValues(row))
                          }}
                        >
                          <NativeSelectOption value=''>
                            {t('Select')}
                          </NativeSelectOption>
                          {matrix.data.map((row) => (
                            <NativeSelectOption
                              key={row.combinationId}
                              value={row.combinationId}
                            >
                              {row.providerName} · {row.modelName} ·{' '}
                              {String(
                                row.parameters.quality ?? row.combinationKey
                              )}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={rateForm.control}
                  name='billingUnit'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Billing unit')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={t(billingUnitLabel[field.value])}
                          disabled
                        />
                      </FormControl>
                      <FormDescription>
                        {t('Defined by the selected model quality')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <RateInput
                  control={rateForm.control}
                  name='currency'
                  label={t('Currency')}
                  maxLength={3}
                  onChange={(value) => value.toUpperCase()}
                />
                <RateInput
                  control={rateForm.control}
                  name='exchangeRate'
                  label={t('Exchange rate to CNY')}
                />
              </div>

              {billingUnit === 'MILLION_TOKENS' ? (
                <div className='overflow-x-auto rounded-xl border'>
                  <Table className='w-full min-w-[640px] text-sm'>
                    <TableHeader className='bg-muted/40 text-muted-foreground'>
                      <TableRow>
                        <TableHead className='p-3 text-left font-medium'>
                          {t('Token category')}
                        </TableHead>
                        <TableHead className='p-3 text-left font-medium'>
                          {t('Native amount per million tokens')}
                        </TableHead>
                        <TableHead className='p-3 text-left font-medium'>
                          {t('Normalized CNY cost per million tokens')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {providerTokenCategories.map((category) => (
                        <TableRow key={category} className='border-t'>
                          <TableHead className='p-3 text-left font-medium'>
                            {t(providerTokenCategoryLabel[category])}
                          </TableHead>
                          <TableCell className='p-3'>
                            <RateInput
                              control={rateForm.control}
                              name={`tokenRates.${category}`}
                              label=''
                              ariaLabel={`${t(providerTokenCategoryLabel[category])} ${t('Native amount')}`}
                            />
                          </TableCell>
                          <TableCell className='p-3'>
                            <RateInput
                              control={rateForm.control}
                              name={`normalizedTokenRates.${category}`}
                              label=''
                              ariaLabel={`${t(providerTokenCategoryLabel[category])} ${t('Normalized CNY cost')}`}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className='grid items-start gap-3 sm:grid-cols-2'>
                  <RateInput
                    control={rateForm.control}
                    name='nativeAmount'
                    label={t(
                      billingUnit === 'SECOND'
                        ? 'Native amount per second'
                        : 'Native amount per request'
                    )}
                  />
                  <RateInput
                    control={rateForm.control}
                    name='normalizedAmountMinor'
                    label={t(
                      billingUnit === 'SECOND'
                        ? 'Normalized CNY cost per second'
                        : 'Normalized CNY cost per request'
                    )}
                  />
                </div>
              )}

              <div className='grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-4'>
                <RateInput
                  control={rateForm.control}
                  name='exchangeSource'
                  label={t('Exchange-rate source')}
                  maxLength={191}
                />
                <FormField
                  control={rateForm.control}
                  name='effectiveAt'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Effective at')}</FormLabel>
                      <FormControl>
                        <Input {...field} type='datetime-local' />
                      </FormControl>
                      <FormDescription>
                        {t('Leave blank to publish now')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={rateForm.control}
                  name='failureMode'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Failure charge')}</FormLabel>
                      <FormControl>
                        <NativeSelect {...field} className='w-full'>
                          <NativeSelectOption value='NONE'>
                            {t('No charge')}
                          </NativeSelectOption>
                          <NativeSelectOption value='SAME_AS_SUCCESS'>
                            {t('Same as success')}
                          </NativeSelectOption>
                          {billingUnit !== 'MILLION_TOKENS' ? (
                            <NativeSelectOption value='FIXED'>
                              {t('Fixed amount')}
                            </NativeSelectOption>
                          ) : null}
                        </NativeSelect>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {failureMode === 'FIXED' ? (
                  <RateInput
                    control={rateForm.control}
                    name='fixedFailureCost'
                    label={t('Fixed failure CNY cost')}
                    description={t('Per actual upstream attempt')}
                  />
                ) : null}
              </div>
              <div className='flex flex-col items-start gap-3 sm:flex-row sm:items-end'>
                <RateInput
                  control={rateForm.control}
                  name='decisionSummary'
                  label={t('Decision summary')}
                  maxLength={2000}
                  className='w-full'
                />
                <Button type='submit' disabled={publish.isPending}>
                  {t('Review publication')}
                </Button>
              </div>
            </form>
          </Form>

          {hasUnsafePrices && selected?.rateId ? (
            <RiskForm
              form={riskForm}
              pending={resolveRisk.isPending}
              current={selected.riskDecision}
              onReview={(values) => setRiskReview({ values, row: selected })}
            />
          ) : null}
        </CardContent>
      </Card>

      {customerPriceTarget ? (
        <CustomerPriceEditor
          key={
            customerPriceTarget.price?.id ??
            `initial:${customerPriceTarget.row.combinationId}`
          }
          row={customerPriceTarget.row}
          price={customerPriceTarget.price}
          onClose={() => setCustomerPriceTarget(null)}
          onChanged={refresh}
        />
      ) : null}

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
        <FilterInput
          label={t('Provider')}
          value={providerFilter}
          setValue={setProviderFilter}
          resetPage={() => setPage(1)}
        />
        <FilterInput
          label={t('Model')}
          value={modelFilter}
          setValue={setModelFilter}
          resetPage={() => setPage(1)}
        />
        <FilterInput
          label={t('Quality')}
          value={qualityFilter}
          setValue={setQualityFilter}
          resetPage={() => setPage(1)}
        />
      </CanvasColumnFilterPanel>

      <PricingTable
        rows={visibleRows}
        exact={exact}
        onCreate={(row) => setCustomerPriceTarget({ row })}
        onEdit={(row, price) => setCustomerPriceTarget({ row, price })}
      />
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
        open={Boolean(rateReview)}
        title={t('Publish this provider cost?')}
        description={t(
          'This records the real upstream cost and marks affected customer prices for review without changing them.'
        )}
        confirmLabel={t('Confirm publication')}
        pending={publish.isPending}
        details={[
          {
            label: t('Model and quality'),
            value: rateReview
              ? `${rateReview.row.modelName} · ${String(
                  rateReview.row.parameters.quality ??
                    rateReview.row.combinationKey
                )}`
              : '—',
          },
          {
            label: t('Billing unit'),
            value: rateReview
              ? t(billingUnitLabel[rateReview.values.billingUnit])
              : '—',
          },
          { label: t('Upstream cost'), value: reviewCost },
          {
            label: t('Failure charge'),
            value: rateReview
              ? t(failureModeLabel[rateReview.values.failureMode])
              : '—',
          },
          {
            label: t('Effective at'),
            value: rateReview?.values.effectiveAt
              ? new Intl.DateTimeFormat(locale, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(rateReview.values.effectiveAt))
              : t('Immediately'),
          },
          {
            label: t('Affected price groups'),
            value: String(rateReview?.row.prices.length ?? 0),
          },
        ]}
        onOpenChange={(open) => {
          if (!open) setRateReview(null)
        }}
        onConfirm={() => publish.mutate()}
      />
      <PricingActionConfirmation
        open={Boolean(riskReview)}
        title={t('Confirm pricing risk decision?')}
        description={t(
          'The decision is audited. A pause blocks new quotes; a limited loss window blocks them only after its deadline or budget is reached.'
        )}
        confirmLabel={t('Confirm decision')}
        pending={resolveRisk.isPending}
        details={[
          {
            label: t('Risk action'),
            value: riskReview ? t(riskReview.values.decisionType) : '—',
          },
          { label: t('Reason'), value: riskReview?.values.reason || '—' },
        ]}
        onOpenChange={(open) => {
          if (!open) setRiskReview(null)
        }}
        onConfirm={() => resolveRisk.mutate()}
      />
    </div>
  )
}

function RateInput(props: {
  control: ReturnType<typeof useForm<ProviderRateFormValues>>['control']
  name: RateInputName
  label: string
  ariaLabel?: string
  maxLength?: number
  onChange?: (value: string) => string
  className?: string
  description?: string
}) {
  return (
    <FormField
      control={props.control}
      name={props.name}
      render={({ field }) => (
        <FormItem className={props.className}>
          {props.label ? <FormLabel>{props.label} *</FormLabel> : null}
          <FormControl>
            <Input
              {...field}
              aria-label={props.ariaLabel}
              inputMode={
                props.name === 'currency' ||
                props.name === 'exchangeSource' ||
                props.name === 'decisionSummary'
                  ? undefined
                  : 'decimal'
              }
              maxLength={props.maxLength}
              onChange={(event) =>
                field.onChange(
                  props.onChange
                    ? props.onChange(event.target.value)
                    : event.target.value
                )
              }
            />
          </FormControl>
          <FormMessage />
          {props.description ? (
            <FormDescription>{props.description}</FormDescription>
          ) : null}
        </FormItem>
      )}
    />
  )
}

function FilterInput(props: {
  label: string
  value: string
  setValue: (value: string) => void
  resetPage: () => void
}) {
  return (
    <CanvasColumnFilterField label={props.label}>
      <Input
        value={props.value}
        placeholder={props.label}
        onChange={(event) => {
          props.setValue(event.target.value)
          props.resetPage()
        }}
      />
    </CanvasColumnFilterField>
  )
}

function RiskForm(props: {
  form: ReturnType<typeof useForm<ProviderRiskFormValues>>
  pending: boolean
  current: CanvasProviderPricingRow['riskDecision']
  onReview: (values: ProviderRiskFormValues) => void
}) {
  const { t } = useTranslation()
  const decisionType = props.form.watch('decisionType')
  return (
    <Form {...props.form}>
      <form
        noValidate
        className='bg-destructive/5 grid gap-3 rounded-xl border p-4 md:grid-cols-2 xl:grid-cols-4'
        onSubmit={props.form.handleSubmit(props.onReview)}
      >
        <div className='md:col-span-2 xl:col-span-4'>
          <p className='font-medium'>{t('Below break-even')}</p>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Choose a safe scheduled price, manually pause this quality, or approve a limited loss window.'
            )}
          </p>
        </div>
        <FormField
          control={props.form.control}
          name='decisionType'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Risk action')}</FormLabel>
              <FormControl>
                <NativeSelect {...field} className='w-full'>
                  <NativeSelectOption value='REPRICE_SCHEDULED'>
                    {t('Safe price scheduled')}
                  </NativeSelectOption>
                  <NativeSelectOption value='MANUAL_PAUSE'>
                    {t('Pause quality')}
                  </NativeSelectOption>
                  <NativeSelectOption value='TEMPORARY_LOSS'>
                    {t('Limited loss window')}
                  </NativeSelectOption>
                </NativeSelect>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {decisionType === 'TEMPORARY_LOSS' ? (
          <>
            <FormField
              control={props.form.control}
              name='lossEndsAt'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Loss deadline')}</FormLabel>
                  <FormControl>
                    <Input {...field} type='datetime-local' />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={props.form.control}
              name='maxExpectedLossPoints'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Maximum expected loss points')}</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode='numeric' />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        ) : null}
        <FormField
          control={props.form.control}
          name='reason'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Reason')}</FormLabel>
              <FormControl>
                <Input {...field} maxLength={2000} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type='submit' disabled={props.pending}>
          {t('Record risk decision')}
        </Button>
        {props.current ? (
          <p className='text-muted-foreground self-center text-sm md:col-span-2 xl:col-span-3'>
            {t('Current decision')}: {t(props.current.decisionType)} ·{' '}
            {props.current.reason}
          </p>
        ) : null}
      </form>
    </Form>
  )
}

function PricingTable(props: {
  rows: CanvasProviderPricingRow[]
  exact: (value: string | null) => string
  onCreate: (row: CanvasProviderPricingRow) => void
  onEdit: (
    row: CanvasProviderPricingRow,
    price: CanvasProviderPricingRow['prices'][number]
  ) => void
}) {
  const { t } = useTranslation()
  const headings: Array<[string, string]> = [
    ['Provider', canvasStaticColumnWidth.standard],
    ['Model', canvasStaticColumnWidth.wide],
    ['Quality', canvasStaticColumnWidth.standard],
    ['Billing unit', canvasStaticColumnWidth.standard],
    ['Provider rate version', canvasStaticColumnWidth.standard],
    ['Current cost', canvasStaticColumnWidth.detail],
    ['Pricing risk', canvasStaticColumnWidth.standard],
    ['Customer price comparison', canvasStaticColumnWidth.detail],
  ]
  return (
    <StaticDataTable tableClassName='min-w-[1240px] table-fixed'>
      <TableHeader>
        <TableRow>
          {headings.map(([label, width]) => (
            <TableHead
              key={label}
              className={`${width} h-auto py-2 whitespace-normal`}
            >
              {t(label)}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.rows.map((row) => {
          const unit = providerBillingUnit(row)
          let currentCost: ReactNode = t('Not priced')
          if (unit === 'MILLION_TOKENS' && row.tokenRates) {
            currentCost = providerTokenCategories.map((category) => (
              <div key={category}>
                <span className='text-muted-foreground'>
                  {t(providerTokenCategoryLabel[category])}:
                </span>{' '}
                {row.currency} {props.exact(row.tokenRates?.[category] ?? null)}
              </div>
            ))
          } else if (row.nativeAmount && row.currency) {
            currentCost = `${row.currency} ${props.exact(row.nativeAmount)}`
          }
          return (
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
              <TableCell>{t(billingUnitLabel[unit])}</TableCell>
              <TableCell>
                {row.rateVersion
                  ? `v${row.rateVersion} · ${row.rateStatus}`
                  : t('Not priced')}
              </TableCell>
              <TableCell className='break-words whitespace-normal'>
                {currentCost}
              </TableCell>
              <TableCell className='break-words whitespace-normal'>
                {row.prices.some((price) => price.belowBreakEven)
                  ? t('Below break-even')
                  : t('No active risk')}
              </TableCell>
              <TableCell>
                <details>
                  <summary className='text-primary cursor-pointer'>
                    {t('View')} ({row.prices.length})
                  </summary>
                  <div className='mt-2 min-w-0 space-y-2 text-xs whitespace-normal'>
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      onClick={() => props.onCreate(row)}
                    >
                      {t('Add customer price')}
                    </Button>
                    {row.prices.map((price) => (
                      <div
                        key={price.id}
                        className={
                          price.belowBreakEven
                            ? 'text-destructive break-words'
                            : 'text-muted-foreground break-words'
                        }
                      >
                        <div className='font-medium'>
                          {price.groupName} · v{price.version} ·{' '}
                          {t(billingUnitLabel[price.billingUnit])}
                        </div>
                        {price.billingUnit === 'MILLION_TOKENS' &&
                        price.tokenRates ? (
                          providerTokenCategories.map((category) => {
                            const categoryRisk = price.categoryRisks.find(
                              (item) => item.category === category
                            )
                            return (
                              <div key={category}>
                                {t(providerTokenCategoryLabel[category])}:{' '}
                                {props.exact(
                                  price.tokenRates?.[category] ?? null
                                )}{' '}
                                {t('points')} ·{' '}
                                {categoryRisk?.belowBreakEven
                                  ? t('Below break-even')
                                  : t('Safe')}
                              </div>
                            )
                          })
                        ) : (
                          <div>
                            {props.exact(price.points)} {t('points')} ·{' '}
                            {price.belowBreakEven
                              ? t('Below break-even')
                              : t('Safe')}
                          </div>
                        )}
                        {price.status === 'PUBLISHED' ? (
                          <Button
                            type='button'
                            size='sm'
                            variant='ghost'
                            className='mt-1'
                            onClick={() => props.onEdit(row, price)}
                          >
                            {t('Edit customer price')}
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </details>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </StaticDataTable>
  )
}
