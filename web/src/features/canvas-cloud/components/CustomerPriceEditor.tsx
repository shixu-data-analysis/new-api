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
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm, type FieldPath } from 'react-hook-form'
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

import {
  getCanvasPriceGroups,
  publishConfirmedCanvasInitialPrice,
  publishConfirmedCanvasPriceChange,
} from '../api'
import {
  customerPriceFormSchema,
  customerPriceFormValues,
  customerPriceRequest,
  type CustomerPriceFormValues,
} from '../customer-pricing'
import {
  providerTokenCategories,
  providerTokenCategoryLabel,
} from '../provider-pricing'
import type { CanvasBillingUnit, CanvasProviderPricingRow } from '../types'
import { PricingActionConfirmation } from './PricingActionConfirmation'

type MatrixPrice = CanvasProviderPricingRow['prices'][number]
type Review = {
  values: CustomerPriceFormValues
  groupName: string
}

const billingUnitLabel: Record<CanvasBillingUnit, string> = {
  REQUEST: 'Per request',
  SECOND: 'Per second',
  MILLION_TOKENS: 'Per million tokens',
}

export function CustomerPriceEditor(props: {
  row: CanvasProviderPricingRow
  price?: MatrixPrice
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const { t } = useTranslation()
  const groups = useQuery({
    queryKey: ['canvas-cloud', 'price-groups'],
    queryFn: getCanvasPriceGroups,
  })
  const form = useForm<CustomerPriceFormValues>({
    resolver: zodResolver(customerPriceFormSchema),
    defaultValues: customerPriceFormValues(props.row, props.price),
  })
  const [review, setReview] = useState<Review | null>(null)
  const billingUnit = form.watch('billingUnit')
  const unavailableGroupIds = new Set(
    props.row.prices
      .filter(
        (price) => price.status === 'PUBLISHED' || price.status === 'APPROVED'
      )
      .map((price) => price.groupId)
  )
  const availableGroups = (groups.data ?? []).filter(
    (group) =>
      group.status === 'PUBLISHED' && !unavailableGroupIds.has(group.id)
  )
  const hasSchedule = Boolean(
    props.price &&
    props.row.prices.some(
      (candidate) =>
        candidate.groupId === props.price?.groupId &&
        candidate.status === 'APPROVED'
    )
  )
  const publish = useMutation({
    mutationFn: () => {
      if (!review) throw new Error('A customer price review is required')
      const request = customerPriceRequest(review.values)
      if (props.price) {
        return publishConfirmedCanvasPriceChange({
          ...request,
          sourcePriceVersionId: props.price.id,
        })
      }
      return publishConfirmedCanvasInitialPrice({
        ...request,
        customerModelId: props.row.customerModelId,
        priceGroupId: review.values.priceGroupId,
        parameterCombinationId: props.row.combinationId,
      })
    },
    onSuccess: async (result: { status?: string }) => {
      setReview(null)
      toast.success(
        result.status === 'APPROVED'
          ? t('Price activation scheduled')
          : t('Price published')
      )
      await props.onChanged()
      props.onClose()
    },
    onError: () => toast.error(t('Price publication failed')),
  })

  const reviewRates =
    review?.values.billingUnit === 'MILLION_TOKENS'
      ? providerTokenCategories
          .map(
            (category) =>
              t(providerTokenCategoryLabel[category]) +
              ': ' +
              review.values.tokenRates[category]
          )
          .join(' · ')
      : (review?.values.points ?? '—')

  return (
    <Card className='border-primary/30'>
      <CardHeader>
        <CardTitle>
          {props.price ? t('Edit customer price') : t('Add customer price')}
        </CardTitle>
        <CardDescription>
          {t(
            'Publish a new immutable customer price version for this model quality and price group.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            noValidate
            className='space-y-5'
            onSubmit={form.handleSubmit((values) => {
              const groupName =
                props.price?.groupName ??
                availableGroups.find(
                  (group) => group.id === values.priceGroupId
                )?.internalName
              if (!groupName) {
                form.setError('priceGroupId', {
                  message: t('Select a price group'),
                })
                return
              }
              setReview({ values, groupName })
            })}
          >
            <div className='grid items-start gap-3 md:grid-cols-3'>
              <FormField
                control={form.control}
                name='priceGroupId'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Price group')}</FormLabel>
                    <FormControl>
                      {props.price ? (
                        <Input value={props.price.groupName} disabled />
                      ) : (
                        <NativeSelect
                          {...field}
                          className='w-full'
                          disabled={groups.isPending}
                        >
                          <NativeSelectOption value=''>
                            {t('Select a price group')}
                          </NativeSelectOption>
                          {availableGroups.map((group) => (
                            <NativeSelectOption key={group.id} value={group.id}>
                              {group.internalName} · v{group.version}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      )}
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
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
                      {t(
                        'The billing unit cannot change for this model quality'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormItem>
                <FormLabel>{t('Model and quality')}</FormLabel>
                <Input
                  value={
                    props.row.modelName +
                    ' · ' +
                    String(
                      props.row.parameters.quality ?? props.row.combinationKey
                    )
                  }
                  disabled
                />
              </FormItem>
            </div>

            {billingUnit === 'MILLION_TOKENS' ? (
              <div className='overflow-x-auto rounded-xl border'>
                <Table className='w-full min-w-[480px] text-sm'>
                  <TableHeader className='bg-muted/40 text-muted-foreground'>
                    <TableRow>
                      <TableHead className='p-3 text-left font-medium'>
                        {t('Token category')}
                      </TableHead>
                      <TableHead className='p-3 text-left font-medium'>
                        {t('Customer points per million tokens')}
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
                          <CustomerPriceInput
                            control={form.control}
                            name={
                              ('tokenRates.' +
                                category) as FieldPath<CustomerPriceFormValues>
                            }
                            label=''
                            ariaLabel={
                              t(providerTokenCategoryLabel[category]) +
                              ' ' +
                              t('Customer points per million tokens')
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className='text-muted-foreground border-t p-3 text-xs'>
                  {t(
                    'Each token category is priced independently. Zero is allowed only when the server-calculated safe floor for that category is zero.'
                  )}
                </p>
              </div>
            ) : (
              <CustomerPriceInput
                control={form.control}
                name='points'
                label={t(
                  billingUnit === 'SECOND'
                    ? 'Customer points per second'
                    : 'Customer points per request'
                )}
                className='max-w-sm'
              />
            )}

            <fieldset className='space-y-3 rounded-xl border p-4'>
              <legend className='px-1 text-sm font-semibold'>
                {t('Margin and risk policy')}
              </legend>
              <div className='grid items-start gap-3 md:grid-cols-2 lg:grid-cols-4'>
                <CustomerPriceInput
                  control={form.control}
                  name='targetMarginRate'
                  label={t('Target margin rate')}
                  description={t('Decimal rate, for example 0.25')}
                />
                <CustomerPriceInput
                  control={form.control}
                  name='successProbability'
                  label={t('Expected success probability')}
                  description={t('Decimal probability, for example 0.9')}
                />
                <CustomerPriceInput
                  control={form.control}
                  name='successfulTaskCostRmb'
                  label={t('Successful upstream unit cost (RMB)')}
                  description={t(
                    'Uses the selected billing unit; provider-rate-backed prices are verified by the server.'
                  )}
                />
                <CustomerPriceInput
                  control={form.control}
                  name='failedUnrecoverableCostRmb'
                  label={t('Unrecoverable failure cost (RMB)')}
                  description={t('Per actual upstream attempt')}
                />
                <CustomerPriceInput
                  control={form.control}
                  name='otherVariableCostRmb'
                  label={t('Other variable cost (RMB)')}
                  description={t('Per actual upstream attempt')}
                />
                <CustomerPriceInput
                  control={form.control}
                  name='riskBufferRmb'
                  label={t('Risk buffer (RMB)')}
                  description={t('Per customer result position')}
                />
                <FormField
                  control={form.control}
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
                <CustomerPriceInput
                  control={form.control}
                  name='decisionSummary'
                  label={t('Decision summary')}
                  maxLength={2000}
                />
              </div>
            </fieldset>
            {hasSchedule ? (
              <p className='text-destructive text-sm' role='alert'>
                {t(
                  'Cancel the existing schedule before creating another price change.'
                )}
              </p>
            ) : null}
            {!props.price &&
            !groups.isPending &&
            availableGroups.length === 0 ? (
              <p className='text-muted-foreground text-sm'>
                {t(
                  'Every published price group already has a price for this model quality.'
                )}
              </p>
            ) : null}
            <div className='flex flex-wrap gap-2'>
              <Button
                type='submit'
                disabled={
                  publish.isPending ||
                  hasSchedule ||
                  (!props.price && availableGroups.length === 0)
                }
              >
                {t('Review price change')}
              </Button>
              <Button type='button' variant='outline' onClick={props.onClose}>
                {t('Cancel')}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>

      <PricingActionConfirmation
        open={Boolean(review)}
        title={t('Publish this customer price?')}
        description={t(
          'The current version remains immutable. New quotes use the new version after its effective time.'
        )}
        confirmLabel={t('Confirm publication')}
        pending={publish.isPending}
        details={[
          { label: t('Price group'), value: review?.groupName ?? '—' },
          {
            label: t('Billing unit'),
            value: review
              ? t(billingUnitLabel[review.values.billingUnit])
              : '—',
          },
          {
            label:
              review?.values.billingUnit === 'MILLION_TOKENS'
                ? t('Token rates')
                : t('Customer price'),
            value: reviewRates,
          },
          {
            label: t('Effective at'),
            value: review?.values.effectiveAt
              ? new Intl.DateTimeFormat(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(review.values.effectiveAt))
              : t('Immediately'),
          },
        ]}
        onOpenChange={(open) => {
          if (!open) setReview(null)
        }}
        onConfirm={() => publish.mutate()}
      />
    </Card>
  )
}

function CustomerPriceInput(props: {
  control: ReturnType<typeof useForm<CustomerPriceFormValues>>['control']
  name: FieldPath<CustomerPriceFormValues>
  label: string
  description?: string
  ariaLabel?: string
  maxLength?: number
  className?: string
}) {
  return (
    <FormField
      control={props.control}
      name={props.name}
      render={({ field }) => (
        <FormItem className={props.className}>
          {props.label ? <FormLabel>{props.label}</FormLabel> : null}
          <FormControl>
            <Input
              {...field}
              value={typeof field.value === 'string' ? field.value : ''}
              aria-label={props.ariaLabel}
              inputMode='decimal'
              maxLength={props.maxLength}
            />
          </FormControl>
          {props.description ? (
            <FormDescription>{props.description}</FormDescription>
          ) : null}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
