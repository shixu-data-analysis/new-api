/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

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
import { toIntlLocale } from '@/i18n/languages'

import {
  getCanvasPointIssuanceRates,
  publishConfirmedCanvasPointIssuanceRate,
} from '../api'
import { getCanvasBusinessTermLabelKey } from '../business-terms'
import type { CanvasPointIssuanceRateVersion } from '../types'
import { BusinessTerm } from './BusinessTerm'
import { PricingActionConfirmation } from './PricingActionConfirmation'
import { PricingRecordsTable } from './PricingRecordsTable'
import { PricingTableColumnHeader } from './PricingTableColumnHeader'

const pointIssuanceRateSchema = z.object({
  pointsPerRmb: z
    .string()
    .trim()
    .min(1, 'This field is required')
    .regex(
      /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/,
      'Enter a positive value with up to 2 decimals'
    )
    .refine(
      (value) => Number(value) > 0,
      'Enter a positive value with up to 2 decimals'
    ),
  decisionSummary: z
    .string()
    .trim()
    .max(2000, 'Use no more than 2000 characters'),
})

type PointIssuanceRateFormValues = z.infer<typeof pointIssuanceRateSchema>

function dateTime(value: string | null, locale: string | undefined): string {
  return value
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : '—'
}

function canonicalRateInput(value: string): string {
  const [integer, fraction] = value.split('.')
  if (fraction === undefined) return value
  const normalizedFraction = fraction.replace(/0+$/, '')
  return normalizedFraction ? `${integer}.${normalizedFraction}` : integer
}

function formatRate(value: string, locale: string | undefined): string {
  const numeric = Number(value)
  return Number.isFinite(numeric)
    ? new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
        numeric
      )
    : value
}

function rateColumn(
  id: string,
  term: string,
  accessorFn: (rate: CanvasPointIssuanceRateVersion) => unknown,
  cell: (rate: CanvasPointIssuanceRateVersion) => React.ReactNode
): ColumnDef<CanvasPointIssuanceRateVersion, unknown> {
  return {
    id,
    accessorFn,
    header: ({ column }) => (
      <PricingTableColumnHeader column={column} term={term} />
    ),
    cell: ({ row }) => cell(row.original),
  }
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

export function PointIssuanceRateSettings() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage ?? i18n.language)
  const queryClient = useQueryClient()
  const [review, setReview] = useState<PointIssuanceRateFormValues | null>(null)
  const rates = useQuery({
    queryKey: ['canvas-cloud', 'point-issuance-rates'],
    queryFn: getCanvasPointIssuanceRates,
  })
  const form = useForm<PointIssuanceRateFormValues>({
    resolver: zodResolver(pointIssuanceRateSchema),
    defaultValues: { pointsPerRmb: '', decisionSummary: '' },
    mode: 'onTouched',
    reValidateMode: 'onChange',
  })
  useEffect(() => {
    const current = rates.data?.find((rate) => rate.status === 'PUBLISHED')
    if (!current || form.getValues('pointsPerRmb')) return
    form.setValue('pointsPerRmb', canonicalRateInput(current.pointsPerRmb))
  }, [form, rates.data])
  const publish = useMutation({
    mutationFn: () => {
      if (!review) throw new Error('Point issuance rate review is missing')
      return publishConfirmedCanvasPointIssuanceRate({
        pointsPerRmb: review.pointsPerRmb,
        ...(review.decisionSummary
          ? { decisionSummary: review.decisionSummary }
          : {}),
      })
    },
    onSuccess: async () => {
      setReview(null)
      toast.success(t('Point issuance rate published'))
      form.reset({
        pointsPerRmb: form.getValues('pointsPerRmb').trim(),
        decisionSummary: '',
      })
      await queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'point-issuance-rates'],
      })
    },
    onError: (error) => {
      const failure = serverErrorPayload(error)
      let description: string
      if (failure.code === 'VALIDATION_FAILED') {
        description = t(
          'The submitted rate change did not pass server validation. Check the field requirements and try again.'
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
      toast.error(t('Point issuance rate publication failed'), {
        description,
        closeButton: false,
      })
    },
  })
  const rateColumns = useMemo<
    ColumnDef<CanvasPointIssuanceRateVersion, unknown>[]
  >(
    () => [
      rateColumn(
        'version',
        'RATE_VERSION',
        (rate) => rate.version,
        (rate) => `v${rate.version}`
      ),
      rateColumn(
        'status',
        'RATE_STATUS',
        (rate) => t(getCanvasBusinessTermLabelKey('configStatus', rate.status)),
        (rate) => <BusinessTerm kind='configStatus' value={rate.status} />
      ),
      rateColumn(
        'rate',
        'ISSUANCE_RATE',
        (rate) => Number(rate.pointsPerRmb),
        (rate) =>
          `${formatRate(rate.pointsPerRmb, locale)} ${t('points per RMB')}`
      ),
      rateColumn(
        'created',
        'RATE_CREATED',
        (rate) => rate.createdAt,
        (rate) => dateTime(rate.createdAt, locale)
      ),
      rateColumn(
        'approved',
        'RATE_APPROVED',
        (rate) => rate.approvedAt ?? '',
        (rate) => dateTime(rate.approvedAt, locale)
      ),
      rateColumn(
        'effective',
        'RATE_EFFECTIVE',
        (rate) => rate.effectiveAt ?? '',
        (rate) => dateTime(rate.effectiveAt, locale)
      ),
    ],
    [locale, t]
  )
  const rateFilters = useMemo(
    () => [
      { columnId: 'version', label: t('Rate version') },
      { columnId: 'status', label: t('Status') },
      { columnId: 'rate', label: t('Point issuance rate') },
    ],
    [t]
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Point issuance rate')}</CardTitle>
        <CardDescription>
          {t(
            'The published rate applies only to new prices and new recharge facts. Historical snapshots are never recalculated.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <Form {...form}>
          <form
            aria-label={t('Adjust point issuance rate')}
            className='bg-muted/20 max-w-5xl rounded-xl border p-4'
            onSubmit={form.handleSubmit(setReview)}
          >
            <div className='grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)_auto] lg:items-start'>
              <FormField
                control={form.control}
                name='pointsPerRmb'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='min-h-5'>
                      <BusinessTerm kind='pricingField' value='ISSUANCE_RATE' />
                      <span
                        className='text-destructive ml-1'
                        aria-hidden='true'
                      >
                        *
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        inputMode='decimal'
                        aria-required='true'
                      />
                    </FormControl>
                    <FormDescription>{t('points per RMB')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='decisionSummary'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='min-h-5'>
                      {t('Decision summary (optional)')}
                    </FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type='submit'
                className='w-full lg:mt-7 lg:w-auto'
                disabled={publish.isPending}
              >
                {t('Review rate change')}
              </Button>
            </div>
          </form>
        </Form>
        {rates.isPending && (
          <div className='text-muted-foreground text-sm'>{t('Loading')}</div>
        )}
        {rates.isError && (
          <Button variant='outline' onClick={() => void rates.refetch()}>
            {t('Retry')}
          </Button>
        )}
        <div className='space-y-3'>
          <div>
            <h3 className='text-sm font-semibold'>{t('Rate records')}</h3>
          </div>
          <PricingRecordsTable
            columns={rateColumns}
            data={rates.data ?? []}
            filters={rateFilters}
            getRowId={(rate) => rate.id}
            initialSorting={[{ id: 'version', desc: true }]}
            emptyTitle={t('No rate records')}
          />
        </div>
        <PricingActionConfirmation
          open={review !== null}
          onOpenChange={(open) => {
            if (!open) setReview(null)
          }}
          title={t('Confirm pricing change')}
          description={t(
            'Review the values below. Confirmation approves the change; immediate prices publish now and scheduled prices publish at the selected time. Published history remains immutable.'
          )}
          details={
            review
              ? [
                  {
                    label: t('Point issuance rate'),
                    value: `${review.pointsPerRmb} ${t('points per RMB')}`,
                  },
                  {
                    label: t('Decision summary'),
                    value: review.decisionSummary || t('Not provided'),
                  },
                ]
              : []
          }
          confirmLabel={t('Confirm change')}
          pending={publish.isPending}
          onConfirm={() => publish.mutate()}
        />
      </CardContent>
    </Card>
  )
}
