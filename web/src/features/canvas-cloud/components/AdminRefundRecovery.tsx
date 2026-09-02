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
import type { ColumnDef } from '@tanstack/react-table'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTableColumnHeader } from '@/components/data-table'
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  createCanvasRefund,
  getCanvasAdminRechargeOrders,
  getCanvasAdminRefunds,
} from '../api'
import { isCanvasDateRangeValid } from '../date-range'
import {
  refundRecoverySchema,
  type RefundRecoveryValues,
} from '../form-validation'
import { formatMoneyMinor } from '../formatters'
import type { CanvasAdminRechargeOrder, CanvasAdminRefund } from '../types'
import { useServerTableState } from '../use-server-table-state'
import { BusinessTerm } from './BusinessTerm'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import {
  CanvasRechargeOrderSummary,
  useCanvasRechargeOrderColumns,
} from './CanvasRechargeOrder'
import { CanvasServerTable } from './CanvasServerTable'
import { CopyableText } from './CopyableText'
import { PricingActionConfirmation } from './PricingActionConfirmation'

export interface AdminRefundRecoveryPrefill {
  customerId?: string
  customerName?: string
  orderId?: string
  orderNumber?: string
}

export function AdminRefundRecovery({
  prefill = {},
}: {
  prefill?: AdminRefundRecoveryPrefill
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedOrder, setSelectedOrder] =
    useState<CanvasAdminRechargeOrder | null>(null)
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [refundStatus, setRefundStatus] = useState('')
  const [refundFrom, setRefundFrom] = useState<Date>()
  const [refundTo, setRefundTo] = useState<Date>()
  const refundDateRangeValid = isCanvasDateRangeValid(refundFrom, refundTo)
  const ordersState = useServerTableState('createdAt', prefill.orderNumber)
  const refundsState = useServerTableState('createdAt')
  const orders = useQuery({
    queryKey: [
      'canvas-cloud',
      'admin',
      'refund-orders',
      ordersState.query,
      prefill.customerId,
    ],
    queryFn: ({ signal }) =>
      getCanvasAdminRechargeOrders(
        {
          ...ordersState.query,
          ...(prefill.customerId ? { customerId: prefill.customerId } : {}),
        },
        signal
      ),
  })
  const refunds = useQuery({
    queryKey: [
      'canvas-cloud',
      'admin',
      'refunds',
      prefill.customerId,
      refundsState.query,
      refundStatus,
      refundFrom?.toISOString(),
      refundTo?.toISOString(),
    ],
    queryFn: ({ signal }) =>
      getCanvasAdminRefunds(
        {
          ...refundsState.query,
          ...(prefill.customerId ? { customerId: prefill.customerId } : {}),
          ...(refundStatus ? { status: refundStatus } : {}),
          ...(refundFrom ? { from: refundFrom.toISOString() } : {}),
          ...(refundTo ? { to: refundTo.toISOString() } : {}),
        },
        signal
      ),
    enabled: refundDateRangeValid,
  })
  const form = useForm<RefundRecoveryValues>({
    resolver: zodResolver(refundRecoverySchema),
    mode: 'onTouched',
    defaultValues: {
      rechargeOrderId: '',
      confirmedRefundAmountMinor: '',
      refundConfirmationReference: '',
      customerConfirmationReference: '',
      reason: '',
    },
  })
  const createRefund = useMutation({
    mutationFn: createCanvasRefund,
    onSuccess: async () => {
      setConfirmationOpen(false)
      setSelectedOrder(null)
      form.reset()
      toast.success(t('Refund point recovery recorded'))
      await queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'admin', 'refunds'],
      })
    },
    onError: () => toast.error(t('Refund point recovery failed')),
  })
  const selectOrder = useCallback(
    (order: CanvasAdminRechargeOrder, shouldValidate = true) => {
      setSelectedOrder(order)
      form.setValue('rechargeOrderId', order.id, { shouldValidate })
    },
    [form]
  )
  useEffect(() => {
    if (!prefill.orderId || selectedOrder || !orders.data) return
    const order = orders.data.items.find((item) => item.id === prefill.orderId)
    if (order) selectOrder(order, false)
  }, [orders.data, prefill.orderId, selectOrder, selectedOrder])
  const orderColumns = useCanvasRechargeOrderColumns({
    showCustomer: !prefill.customerId,
    selectedOrderId: selectedOrder?.id,
    onSelect: selectOrder,
  })
  const refundColumns = useMemo<ColumnDef<CanvasAdminRefund, unknown>[]>(
    () => [
      {
        id: 'reference',
        accessorKey: 'refundReference',
        enableSorting: false,
        header: t('Reference'),
        cell: ({ row }) => (
          <CopyableText value={row.original.refundReference} />
        ),
      },
      {
        id: 'orderNumber',
        accessorKey: 'orderNumber',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Order')} />
        ),
        meta: { label: t('Order') },
        cell: ({ row }) => <CopyableText value={row.original.orderNumber} />,
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Status')} />
        ),
        meta: { label: t('Status') },
        cell: ({ row }) => (
          <>
            <BusinessTerm kind='refundStatus' value={row.original.status} />
            {row.original.recoveryStatus ? (
              <span className='ms-2'>
                <BusinessTerm
                  kind='recoveryStatus'
                  value={row.original.recoveryStatus}
                />
              </span>
            ) : null}
          </>
        ),
      },
      {
        id: 'amount',
        accessorKey: 'cashAmountMinor',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Confirmed amount')}
          />
        ),
        meta: { label: t('Confirmed amount') },
        cell: ({ row }) =>
          formatMoneyMinor(row.original.cashAmountMinor, 'CNY'),
      },
      {
        id: 'points',
        accessorKey: 'pointsRequested',
        enableSorting: false,
        header: t('Calculated points'),
      },
      {
        id: 'outstanding',
        accessorKey: 'pointsOutstanding',
        enableSorting: false,
        header: t('Outstanding'),
      },
    ],
    [t]
  )
  const values = form.getValues()
  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader>
          <CardTitle>{t('Record externally confirmed refund')}</CardTitle>
          <CardDescription>
            {t(
              'Canvas does not issue the cash refund. Select the Canvas recharge order and record the confirmed external fact; the server calculates point recovery automatically.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          {prefill.customerId ? (
            <div className='bg-muted/30 rounded-md border p-3 text-sm'>
              <span className='text-muted-foreground'>
                {t('Prefilled customer')}:{' '}
              </span>
              <CopyableText
                value={prefill.customerName ?? prefill.customerId}
              />
            </div>
          ) : null}
          <CanvasServerTable
            data={orders.data?.items ?? []}
            columns={orderColumns}
            total={orders.data?.total ?? 0}
            state={ordersState}
            searchLabel={t('Canvas recharge order number or customer')}
            searchPlaceholder={t('Search by Canvas order number or customer')}
            searchDescription={t(
              'Fuzzy matches the Canvas recharge order number or customer name. A customer opened from Customers & Points remains scoped to that customer.'
            )}
            loading={orders.isLoading || orders.isFetching}
            emptyTitle={t('No recharge orders')}
            getRowId={(row) => row.id}
            getRowClassName={(row) =>
              selectedOrder?.id === row.original.id ? 'bg-primary/5' : undefined
            }
          />
          {selectedOrder ? (
            <Form {...form}>
              <form
                className='grid max-w-3xl gap-4 md:grid-cols-2'
                onSubmit={form.handleSubmit(() => setConfirmationOpen(true))}
              >
                <div className='bg-muted/30 rounded-md border p-3 text-sm md:col-span-2'>
                  <CanvasRechargeOrderSummary
                    order={selectedOrder}
                    showCustomer={!prefill.customerId}
                  />
                </div>
                <FormField
                  control={form.control}
                  name='confirmedRefundAmountMinor'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t('Externally confirmed refund amount (minor units)')}
                      </FormLabel>
                      <FormControl>
                        <Input inputMode='numeric' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='refundConfirmationReference'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t('Refund confirmation reference')}
                      </FormLabel>
                      <FormControl>
                        <Input maxLength={191} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='customerConfirmationReference'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t('Customer confirmation reference')}
                      </FormLabel>
                      <FormControl>
                        <Input maxLength={191} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='reason'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Reason')}</FormLabel>
                      <FormControl>
                        <Input maxLength={255} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  className='md:col-span-2 md:justify-self-start'
                  type='submit'
                >
                  {t('Review refund point recovery')}
                </Button>
              </form>
            </Form>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('Refund point recovery history')}</CardTitle>
          <CardDescription>
            {t(
              'Statuses describe Canvas point recovery only, not cash-payment processing.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CanvasServerTable
            data={refunds.data?.items ?? []}
            columns={refundColumns}
            total={refunds.data?.total ?? 0}
            state={refundsState}
            searchPlaceholder={t('Search refunds')}
            loading={refunds.isLoading || refunds.isFetching}
            emptyTitle={t('No refunds')}
            additionalFilters={
              <div className='flex flex-wrap gap-2'>
                <Select
                  value={refundStatus || 'ALL'}
                  onValueChange={(value) =>
                    setRefundStatus(value === 'ALL' ? '' : (value ?? ''))
                  }
                >
                  <SelectTrigger className='w-44'>
                    <SelectValue placeholder={t('Status')}>
                      {refundStatus ? (
                        <BusinessTerm
                          kind='refundStatus'
                          value={refundStatus}
                        />
                      ) : (
                        t('All statuses')
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='ALL'>{t('All statuses')}</SelectItem>
                    {['COMPLETED', 'PARTIAL_RECOVERY', 'RECOVERY_PENDING'].map(
                      (value) => (
                        <SelectItem key={value} value={value}>
                          <BusinessTerm kind='refundStatus' value={value} />
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
                <CanvasDateRangeFilter
                  from={refundFrom}
                  to={refundTo}
                  onFromChange={setRefundFrom}
                  onToChange={setRefundTo}
                />
              </div>
            }
            hasActiveFilters={Boolean(refundStatus || refundFrom || refundTo)}
            onResetFilters={() => {
              setRefundStatus('')
              setRefundFrom(undefined)
              setRefundTo(undefined)
            }}
            getRowId={(row) => row.id}
          />
        </CardContent>
      </Card>
      <PricingActionConfirmation
        open={confirmationOpen}
        onOpenChange={setConfirmationOpen}
        title={t('Confirm refund point recovery?')}
        description={t(
          'This confirms an external refund fact. Canvas will not move cash; it will calculate and recover only available Paid points linked to this Canvas recharge order.'
        )}
        details={[
          {
            label: t('Canvas recharge order'),
            value: selectedOrder?.orderNumber ?? '',
          },
          {
            label: t('Externally confirmed amount'),
            value: values.confirmedRefundAmountMinor,
          },
          {
            label: t('Refund confirmation reference'),
            value: values.refundConfirmationReference,
          },
          {
            label: t('Customer confirmation reference'),
            value: values.customerConfirmationReference,
          },
          { label: t('Reason'), value: values.reason },
        ]}
        confirmLabel={t('Confirm point recovery')}
        destructive
        pending={createRefund.isPending}
        onConfirm={() => createRefund.mutate(form.getValues())}
      />
    </div>
  )
}
