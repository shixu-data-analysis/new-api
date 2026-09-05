/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License version 3 or later.
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTableColumnHeader } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

import {
  assignCanvasCustomerPriceGroup,
  getCanvasCustomerPriceAssignments,
  getCanvasPriceGroups,
} from '../api'
import {
  customerPriceAssignmentSchema,
  type CustomerPriceAssignmentValues,
} from '../form-validation'
import { formatCanvasDateTime } from '../formatters'
import type { CanvasCustomerPriceAssignment } from '../types'
import { useServerTableState } from '../use-server-table-state'
import { CanvasServerTable } from './CanvasServerTable'
import { PricingActionConfirmation } from './PricingActionConfirmation'

export function CustomerPriceAssignment(props: { customerId: string }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const state = useServerTableState('effectiveAt')
  const query = useQuery({
    queryKey: [
      'canvas-cloud',
      'customer-price-assignments',
      props.customerId,
      state.query,
    ],
    queryFn: ({ signal }) =>
      getCanvasCustomerPriceAssignments(
        props.customerId,
        {
          page: state.query.page,
          pageSize: state.query.pageSize,
          sortOrder: state.query.sortOrder,
          ...(state.query.search ? { group: state.query.search } : {}),
        },
        signal
      ),
  })
  const groups = useQuery({
    queryKey: ['canvas-cloud', 'price-groups'],
    queryFn: getCanvasPriceGroups,
  })
  const available = (groups.data ?? []).filter(
    (group) =>
      group.status === 'PUBLISHED' && group.id !== query.data?.currentGroup.id
  )
  const form = useForm<CustomerPriceAssignmentValues>({
    resolver: zodResolver(customerPriceAssignmentSchema),
    mode: 'onTouched',
    defaultValues: { priceGroupId: '', reason: '' },
  })
  const [review, setReview] = useState<
    | (CustomerPriceAssignmentValues & {
        key: string
        plan: string
        current: string
      })
    | null
  >(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const submitting = useRef(false)
  const mutation = useMutation({
    mutationFn: (value: NonNullable<typeof review>) =>
      assignCanvasCustomerPriceGroup(
        props.customerId,
        { priceGroupId: value.priceGroupId, reason: value.reason },
        value.key
      ),
    onSuccess: async () => {
      form.reset()
      setReview(null)
      setReviewOpen(false)
      toast.success(t('Customer price plan updated'))
      await client.invalidateQueries({
        queryKey: [
          'canvas-cloud',
          'customer-price-assignments',
          props.customerId,
        ],
      })
    },
    onError: () =>
      toast.error(
        t('Price plan change failed. Refresh the current plan before retrying.')
      ),
    onSettled: () => {
      submitting.current = false
    },
  })
  const columns = useMemo<ColumnDef<CanvasCustomerPriceAssignment, unknown>[]>(
    () => [
      {
        accessorKey: 'internalName',
        header: t('Price plan'),
        enableSorting: false,
        cell: ({ row }) =>
          `${row.original.internalName} · v${row.original.version}`,
      },
      {
        accessorKey: 'reason',
        header: t('Reason'),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.reason === 'INVITE_REGISTRATION'
            ? t('Invite registration')
            : row.original.reason,
      },
      {
        accessorKey: 'actorName',
        header: t('Operator'),
        enableSorting: false,
        cell: ({ row }) => row.original.actorName ?? t('Unknown'),
      },
      {
        accessorKey: 'effectiveAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Effective at')} />
        ),
        cell: ({ row }) => formatCanvasDateTime(row.original.effectiveAt),
      },
      {
        accessorKey: 'endedAt',
        header: t('Ended at'),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.endedAt
            ? formatCanvasDateTime(row.original.endedAt)
            : t('Current'),
      },
    ],
    [t]
  )
  const current = query.data?.currentGroup
  const currentLabel = current
    ? `${current.internalName} · v${current.version}`
    : '—'
  const disabled =
    mutation.isPending ||
    query.isFetching ||
    groups.isFetching ||
    query.isError ||
    groups.isError ||
    !query.data
  return (
    <Card className='min-w-0'>
      <CardHeader>
        <CardTitle>{t('Customer price plan')}</CardTitle>
      </CardHeader>
      <CardContent className='min-w-0 space-y-4'>
        <p className='text-sm break-words'>
          {t('Current price plan')}: {currentLabel}
        </p>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Only new quotes use the new plan. Existing quotes and tasks keep their original prices.'
          )}
        </p>
        {(query.isError || groups.isError) && (
          <div role='alert' className='text-destructive text-sm'>
            {t('Unable to load price plans or assignment history')}
          </div>
        )}
        <Button
          type='button'
          variant='outline'
          disabled={mutation.isPending || query.isFetching || groups.isFetching}
          onClick={() => {
            void query.refetch()
            void groups.refetch()
          }}
        >
          {t('Refresh')}
        </Button>
        <Form {...form}>
          <form
            noValidate
            onSubmit={form.handleSubmit((value) => {
              if (disabled) return
              const group = available.find(
                (item) => item.id === value.priceGroupId
              )
              if (!group) {
                form.setError('priceGroupId', {
                  message: t('Select a published price plan'),
                })
                return
              }
              setReview((previous) => ({
                ...value,
                key:
                  previous?.priceGroupId === value.priceGroupId &&
                  previous.reason === value.reason
                    ? previous.key
                    : `customer-price:${crypto.randomUUID()}`,
                plan: `${group.internalName} · v${group.version}`,
                current: currentLabel,
              }))
              setReviewOpen(true)
            })}
            className='grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]'
          >
            <FormField
              control={form.control}
              name='priceGroupId'
              render={({ field }) => (
                <FormItem className='min-w-0'>
                  <FormLabel className='min-h-5'>
                    {t('New price plan')} *
                  </FormLabel>
                  <FormControl>
                    <NativeSelect
                      {...field}
                      className='w-full min-w-0'
                      disabled={disabled || available.length === 0}
                    >
                      <NativeSelectOption value=''>
                        {t('Select a published price plan')}
                      </NativeSelectOption>
                      {available.map((group) => (
                        <NativeSelectOption key={group.id} value={group.id}>
                          {group.internalName} · v{group.version}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='reason'
              render={({ field }) => (
                <FormItem className='min-w-0'>
                  <FormLabel className='min-h-5'>{t('Reason')} *</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={disabled} maxLength={255} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type='submit'
              disabled={disabled || available.length === 0}
              className='w-full lg:mt-7 lg:w-auto'
            >
              {t('Review price plan change')}
            </Button>
          </form>
        </Form>
        {!groups.isLoading && !groups.isError && available.length === 0 && (
          <p className='text-muted-foreground text-sm'>
            {t('No other published price plans')}
          </p>
        )}
        <PricingActionConfirmation
          open={reviewOpen}
          onOpenChange={(open) => {
            if (!mutation.isPending) setReviewOpen(open)
          }}
          title={t('Confirm price plan change')}
          description={t(
            'Only new quotes use the new plan. Existing quotes and tasks keep their original prices.'
          )}
          details={[
            {
              label: t('Customer'),
              value: query.data?.customerName ?? t('Unknown'),
            },
            {
              label: t('Current price plan'),
              value: review?.current ?? currentLabel,
            },
            { label: t('New price plan'), value: review?.plan ?? '' },
            { label: t('Reason'), value: review?.reason ?? '' },
          ]}
          confirmLabel={t('Confirm')}
          pending={mutation.isPending}
          onConfirm={() => {
            if (!review || submitting.current) return
            submitting.current = true
            mutation.mutate(review)
          }}
        />
        <h3 className='text-sm font-medium'>{t('Price plan history')}</h3>
        <CanvasServerTable
          data={query.data?.items ?? []}
          columns={columns}
          total={query.data?.total ?? 0}
          state={state}
          searchLabel={t('Price plan')}
          loading={query.isFetching}
          emptyTitle={t('No price plan history')}
          getRowId={(row) => row.id}
        />
      </CardContent>
    </Card>
  )
}
