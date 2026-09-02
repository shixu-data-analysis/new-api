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
import { ArrowLeft, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  DataTableColumnHeader,
  DISABLED_ROW_DESKTOP,
  DISABLED_ROW_MOBILE,
} from '@/components/data-table'
import { DateTimePicker } from '@/components/datetime-picker'
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import {
  deductCanvasPointLot,
  getCanvasAdminCustomerPointLots,
  getCanvasAdminCustomers,
  getCanvasAdminRechargeOrders,
  grantCanvasManualBonus,
  grantCanvasPaidCorrection,
} from '../api'
import { getCanvasBusinessTermLabelKey } from '../business-terms'
import { isCanvasDateRangeValid } from '../date-range'
import {
  bonusAdjustmentSchema,
  deductionSchema,
  paidCorrectionSchema,
  type BonusAdjustmentValues,
  type DeductionValues,
  type PaidCorrectionValues,
} from '../form-validation'
import { formatCanvasDateTime } from '../formatters'
import type {
  CanvasAdminCustomerPointBalance,
  CanvasAdminPointLot,
  CanvasAdminRechargeOrder,
} from '../types'
import { useServerTableState } from '../use-server-table-state'
import { AdminCustomerOperations } from './AdminCustomerOperations'
import { BusinessTerm } from './BusinessTerm'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import {
  CanvasRechargeOrderSummary,
  useCanvasRechargeOrderColumns,
} from './CanvasRechargeOrder'
import { CanvasServerTable } from './CanvasServerTable'
import { CopyableText } from './CopyableText'
import { PricingActionConfirmation } from './PricingActionConfirmation'

type PendingAction = 'bonus' | 'paid' | 'deduction' | null
const isLotDeductible = (lot: CanvasAdminPointLot) =>
  BigInt(lot.availablePoints) > 0n &&
  (!lot.expiresAt || new Date(lot.expiresAt).getTime() > Date.now())
const isOrderCorrectable = (order: CanvasAdminRechargeOrder) =>
  order.eligibleForPaidCorrection &&
  BigInt(order.remainingCorrectionPoints) > 0n

export interface RefundRecoveryPrefill {
  customerId: string
  customerName?: string
  orderId?: string
  orderNumber?: string
}

export function AdminPointAdjustments({
  onOpenRefundRecovery,
}: {
  onOpenRefundRecovery?: (prefill: RefundRecoveryPrefill) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [customer, setCustomer] =
    useState<CanvasAdminCustomerPointBalance | null>(null)
  const [selectedOrder, setSelectedOrder] =
    useState<CanvasAdminRechargeOrder | null>(null)
  const [selectedLot, setSelectedLot] = useState<CanvasAdminPointLot | null>(
    null
  )
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [customerStatus, setCustomerStatus] = useState('')
  const [lotType, setLotType] = useState('')
  const [orderTimeField, setOrderTimeField] = useState<
    'createdAt' | 'redeemedAt'
  >('createdAt')
  const [orderFrom, setOrderFrom] = useState<Date>()
  const [orderTo, setOrderTo] = useState<Date>()
  const paidFormRef = useRef<HTMLDivElement>(null)
  const paidPointsInputRef = useRef<HTMLInputElement | null>(null)
  const customersState = useServerTableState('createdAt')
  const ordersState = useServerTableState('createdAt')
  const lotsState = useServerTableState('expiresAt')
  const setOrdersPagination = ordersState.setPagination
  const customerId = customer?.customerId
  const orderDateRangeValid = isCanvasDateRangeValid(orderFrom, orderTo)
  useEffect(() => {
    setOrdersPagination((value) => ({ ...value, pageIndex: 0 }))
  }, [orderFrom, orderTimeField, orderTo, setOrdersPagination])
  useEffect(() => {
    if (!selectedOrder) return
    paidFormRef.current?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'start',
    })
    paidPointsInputRef.current?.focus()
  }, [selectedOrder])
  const customers = useQuery({
    queryKey: [
      'canvas-cloud',
      'admin',
      'customers',
      customersState.query,
      customerStatus,
    ],
    queryFn: ({ signal }) =>
      getCanvasAdminCustomers(
        {
          ...customersState.query,
          ...(customerStatus
            ? { status: customerStatus as 'ACTIVE' | 'SUSPENDED' | 'CLOSED' }
            : {}),
        },
        signal
      ),
  })
  const orders = useQuery({
    queryKey: [
      'canvas-cloud',
      'admin',
      'recharge-orders',
      customerId,
      ordersState.query,
      orderTimeField,
      orderFrom?.toISOString(),
      orderTo?.toISOString(),
    ],
    queryFn: ({ signal }) =>
      getCanvasAdminRechargeOrders(
        {
          ...ordersState.query,
          customerId: customerId ?? '',
          eligibleForPaidCorrection: true,
          timeField: orderTimeField,
          ...(orderDateRangeValid && orderFrom
            ? { from: orderFrom.toISOString() }
            : {}),
          ...(orderDateRangeValid && orderTo
            ? { to: orderTo.toISOString() }
            : {}),
        },
        signal
      ),
    enabled: Boolean(customerId) && orderDateRangeValid,
  })
  const lots = useQuery({
    queryKey: [
      'canvas-cloud',
      'admin',
      'point-lots',
      customerId,
      lotsState.query,
      lotType,
    ],
    queryFn: ({ signal }) =>
      getCanvasAdminCustomerPointLots(
        customerId ?? '',
        {
          ...lotsState.query,
          ...(lotType ? { type: lotType as 'PAID' | 'BONUS' } : {}),
        },
        signal
      ),
    enabled: Boolean(customerId),
  })

  const bonusForm = useForm<BonusAdjustmentValues>({
    resolver: zodResolver(bonusAdjustmentSchema),
    mode: 'onTouched',
    defaultValues: { points: '', expiresAt: undefined, reason: '' },
  })
  const paidForm = useForm<PaidCorrectionValues>({
    resolver: zodResolver(
      paidCorrectionSchema(selectedOrder?.remainingCorrectionPoints ?? '0')
    ),
    mode: 'onTouched',
    defaultValues: { rechargeOrderId: '', points: '', reason: '' },
  })
  const deductionForm = useForm<DeductionValues>({
    resolver: zodResolver(deductionSchema(selectedLot?.availablePoints ?? '0')),
    mode: 'onTouched',
    defaultValues: { pointLotId: '', points: '', reason: '' },
  })
  const returnToCustomerList = () => {
    setCustomer(null)
    setSelectedOrder(null)
    setSelectedLot(null)
    setPendingAction(null)
    bonusForm.reset()
    paidForm.reset()
    deductionForm.reset()
  }
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['canvas-cloud', 'admin'] })
  const mutationError = () => toast.error(t('Point adjustment failed'))
  const bonusMutation = useMutation({
    mutationFn: (values: BonusAdjustmentValues) => {
      if (!customerId) throw new Error('Customer selection is required')
      return grantCanvasManualBonus({
        customerId,
        points: values.points,
        expiresAt: values.expiresAt.toISOString(),
        reason: values.reason,
      })
    },
    onSuccess: async () => {
      setPendingAction(null)
      bonusForm.reset()
      toast.success(t('Bonus points granted'))
      await refresh()
    },
    onError: mutationError,
  })
  const paidMutation = useMutation({
    mutationFn: (values: PaidCorrectionValues) =>
      grantCanvasPaidCorrection(values),
    onSuccess: async () => {
      setPendingAction(null)
      setSelectedOrder(null)
      paidForm.reset()
      toast.success(t('Paid points corrected'))
      await refresh()
    },
    onError: mutationError,
  })
  const deductionMutation = useMutation({
    mutationFn: (values: DeductionValues) => deductCanvasPointLot(values),
    onSuccess: async () => {
      setPendingAction(null)
      setSelectedLot(null)
      deductionForm.reset()
      toast.success(t('Points deducted'))
      await refresh()
    },
    onError: mutationError,
  })

  const customerColumns = useMemo<
    ColumnDef<CanvasAdminCustomerPointBalance, unknown>[]
  >(
    () => [
      {
        id: 'customer',
        accessorFn: (item) => item.username ?? item.newApiUserId,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Customer name')} />
        ),
        meta: { label: t('Customer name') },
        cell: ({ row }) => (
          <CopyableText
            value={row.original.username ?? row.original.newApiUserId}
          />
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Status')} />
        ),
        meta: { label: t('Status') },
        cell: ({ row }) => (
          <BusinessTerm kind='customerStatus' value={row.original.status} />
        ),
      },
      {
        id: 'availablePoints',
        accessorKey: 'availablePoints',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Available points')}
          />
        ),
        meta: { label: t('Available points') },
      },
      {
        id: 'select',
        enableSorting: false,
        header: t('Actions'),
        cell: ({ row }) => (
          <Button
            type='button'
            size='sm'
            variant={
              customer?.customerId === row.original.customerId
                ? 'default'
                : 'outline'
            }
            onClick={() => {
              setCustomer(row.original)
              setSelectedOrder(null)
              setSelectedLot(null)
              setPendingAction(null)
              bonusForm.reset()
              paidForm.reset()
              deductionForm.reset()
            }}
          >
            {t('Select')}
          </Button>
        ),
      },
    ],
    [bonusForm, customer?.customerId, deductionForm, paidForm, t]
  )
  const selectOrder = useCallback(
    (order: CanvasAdminRechargeOrder) => {
      if (!isOrderCorrectable(order)) return
      setSelectedOrder(order)
      paidForm.setValue('rechargeOrderId', order.id, {
        shouldValidate: true,
      })
    },
    [paidForm]
  )
  const orderColumns = useCanvasRechargeOrderColumns({
    showCorrectionDetails: true,
    selectedOrderId: selectedOrder?.id,
    isSelectable: isOrderCorrectable,
    onSelect: selectOrder,
  })
  const lotColumns = useMemo<ColumnDef<CanvasAdminPointLot, unknown>[]>(
    () => [
      {
        id: 'type',
        accessorKey: 'type',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Type')} />
        ),
        meta: { label: t('Type') },
        cell: ({ row }) =>
          t(getCanvasBusinessTermLabelKey('pointLotType', row.original.type)),
      },
      {
        id: 'availablePoints',
        accessorKey: 'availablePoints',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Available points')}
          />
        ),
        meta: { label: t('Available points') },
      },
      {
        id: 'reservedPoints',
        accessorKey: 'reservedPoints',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Task-reserved points')}
          />
        ),
        meta: { label: t('Task-reserved points') },
      },
      {
        id: 'expiresAt',
        accessorKey: 'expiresAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Expires at')} />
        ),
        meta: { label: t('Expires at') },
        cell: ({ row }) =>
          formatCanvasDateTime(row.original.expiresAt, t('No expiry')),
      },
      {
        id: 'select',
        enableSorting: false,
        header: t('Actions'),
        cell: ({ row }) => {
          const disabled = !isLotDeductible(row.original)
          return (
            <Button
              type='button'
              size='sm'
              disabled={disabled}
              variant={
                selectedLot?.id === row.original.id ? 'default' : 'outline'
              }
              onClick={() => {
                setSelectedLot(row.original)
                deductionForm.setValue('pointLotId', row.original.id, {
                  shouldValidate: true,
                })
              }}
            >
              {disabled ? t('Unavailable') : t('Select')}
            </Button>
          )
        },
      },
    ],
    [deductionForm, selectedLot?.id, t]
  )

  if (!customer) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('Select customer')}</CardTitle>
          <CardDescription>
            {t(
              'Search and select a customer before viewing Lots or creating an adjustment.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CanvasServerTable
            data={customers.data?.items ?? []}
            columns={customerColumns}
            total={customers.data?.total ?? 0}
            state={customersState}
            searchPlaceholder={t('Search customer name')}
            loading={customers.isLoading || customers.isFetching}
            emptyTitle={t('No customers')}
            additionalFilters={
              <Select
                value={customerStatus || 'ALL'}
                onValueChange={(value) =>
                  setCustomerStatus(value === 'ALL' ? '' : (value ?? ''))
                }
              >
                <SelectTrigger className='w-40'>
                  <SelectValue placeholder={t('Status')}>
                    {customerStatus ? (
                      <BusinessTerm
                        kind='customerStatus'
                        value={customerStatus}
                      />
                    ) : (
                      t('All statuses')
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>{t('All statuses')}</SelectItem>
                  {['ACTIVE', 'SUSPENDED', 'CLOSED'].map((value) => (
                    <SelectItem key={value} value={value}>
                      <BusinessTerm kind='customerStatus' value={value} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
            hasActiveFilters={Boolean(customerStatus)}
            onResetFilters={() => setCustomerStatus('')}
            getRowId={(row) => row.customerId}
          />
        </CardContent>
      </Card>
    )
  }

  let pendingValues:
    | BonusAdjustmentValues
    | PaidCorrectionValues
    | DeductionValues
  if (pendingAction === 'bonus') pendingValues = bonusForm.getValues()
  else if (pendingAction === 'paid') pendingValues = paidForm.getValues()
  else pendingValues = deductionForm.getValues()
  const details = Object.entries(pendingValues).map(([label, value]) => ({
    label: t(label),
    value: value instanceof Date ? value.toLocaleString() : String(value ?? ''),
  }))
  const mutationPending =
    bonusMutation.isPending ||
    paidMutation.isPending ||
    deductionMutation.isPending
  return (
    <div className='space-y-4'>
      <Button
        type='button'
        className='w-fit'
        variant='outline'
        onClick={returnToCustomerList}
      >
        <ArrowLeft className='size-4' />
        {t('Back to customer list')}
      </Button>
      <Card size='sm'>
        <CardContent>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div>
              <div className='font-medium'>
                <CopyableText
                  value={customer.username ?? customer.newApiUserId}
                />
              </div>
              <div className='text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm'>
                <span>
                  {t('Status')}:{' '}
                  <BusinessTerm kind='customerStatus' value={customer.status} />
                </span>
                <span>
                  {t('Available points')}: {customer.availablePoints}
                </span>
                <span>
                  {t('Paid points')}: {customer.paidAvailablePoints}
                </span>
                <span>
                  {t('Bonus points')}: {customer.bonusAvailablePoints}
                </span>
              </div>
            </div>
            {onOpenRefundRecovery ? (
              <Button
                type='button'
                variant='outline'
                onClick={() =>
                  onOpenRefundRecovery({
                    customerId: customer.customerId,
                    customerName: customer.username ?? customer.newApiUserId,
                  })
                }
              >
                <RotateCcw className='size-4' />
                {t('Open refund point recovery')}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('Customer operations')}</CardTitle>
          <CardDescription>
            {t(
              'Review this customer’s recharge orders, point facts, task consumption, and customer-linked audit events.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminCustomerOperations customerId={customer.customerId} />
        </CardContent>
      </Card>
      <div>
        <h2 className='text-lg font-semibold'>{t('Point adjustments')}</h2>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Create a governed adjustment only after reviewing the customer records above.'
          )}
        </p>
      </div>
      <Tabs defaultValue='bonus'>
        <TabsList>
          <TabsTrigger value='bonus'>{t('Grant Bonus points')}</TabsTrigger>
          <TabsTrigger value='paid'>{t('Correct Paid points')}</TabsTrigger>
          <TabsTrigger value='deduction'>
            {t('Deduct from a Point Lot')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value='bonus'>
          <Card>
            <CardHeader>
              <CardTitle>{t('Grant Bonus points')}</CardTitle>
              <CardDescription>
                {t(
                  'Manual gifts create Bonus only and require an explicit expiry.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...bonusForm}>
                <form
                  className='max-w-xl space-y-4'
                  onSubmit={bonusForm.handleSubmit(() =>
                    setPendingAction('bonus')
                  )}
                >
                  <FormField
                    control={bonusForm.control}
                    name='points'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Bonus points')}</FormLabel>
                        <FormControl>
                          <Input inputMode='numeric' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={bonusForm.control}
                    name='expiresAt'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Expires at')}</FormLabel>
                        <FormControl>
                          <DateTimePicker
                            value={field.value}
                            onChange={field.onChange}
                            futureOnly
                          />
                        </FormControl>
                        <FormDescription>
                          {t('Uses your current time zone')}:{' '}
                          {Intl.DateTimeFormat().resolvedOptions().timeZone}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={bonusForm.control}
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
                  <Button type='submit'>{t('Review Bonus grant')}</Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value='paid'>
          <Card>
            <CardHeader>
              <CardTitle>{t('Correct Paid points')}</CardTitle>
              <CardDescription>
                {t(
                  'Only orders with verified missing Paid issuance can be corrected. Spending, deductions, reservations, and expiry do not create a correction gap.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <ol className='text-muted-foreground grid gap-2 text-sm sm:grid-cols-3'>
                {[
                  '1. Select order',
                  '2. Enter correction',
                  '3. Review and confirm',
                ].map((step, index) => (
                  <li
                    key={step}
                    className={
                      index === 0 ||
                      (index === 1 && selectedOrder) ||
                      (index === 2 && pendingAction === 'paid')
                        ? 'text-foreground font-medium'
                        : undefined
                    }
                  >
                    {t(step)}
                  </li>
                ))}
              </ol>
              <CanvasServerTable
                data={orders.data?.items ?? []}
                columns={orderColumns}
                total={orders.data?.total ?? 0}
                state={ordersState}
                searchLabel={t('Canvas recharge order number')}
                searchPlaceholder={t(
                  'Enter a full order number or any consecutive fragment'
                )}
                searchDescription={t(
                  'Matches only Canvas recharge order numbers, case-insensitively. For example: 140003 or 3F52CD.'
                )}
                loading={orders.isLoading || orders.isFetching}
                emptyTitle={t('No recharge orders with missing Paid issuance')}
                additionalFilters={
                  <div className='flex flex-wrap items-end gap-2'>
                    <div className='space-y-1'>
                      <Label>{t('Time field')}</Label>
                      <Select
                        value={orderTimeField}
                        onValueChange={(value) =>
                          setOrderTimeField(
                            value === 'redeemedAt' ? 'redeemedAt' : 'createdAt'
                          )
                        }
                      >
                        <SelectTrigger className='w-52'>
                          <SelectValue>
                            {t(
                              orderTimeField === 'redeemedAt'
                                ? 'Recharge code redeemed at'
                                : 'Order created at'
                            )}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='createdAt'>
                            {t('Order created at')}
                          </SelectItem>
                          <SelectItem value='redeemedAt'>
                            {t('Recharge code redeemed at')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <CanvasDateRangeFilter
                      from={orderFrom}
                      to={orderTo}
                      onFromChange={setOrderFrom}
                      onToChange={setOrderTo}
                      showLabels
                    />
                  </div>
                }
                hasActiveFilters={Boolean(orderFrom || orderTo)}
                onResetFilters={() => {
                  setOrderTimeField('createdAt')
                  setOrderFrom(undefined)
                  setOrderTo(undefined)
                }}
                getRowId={(row) => row.id}
                getRowClassName={(row) =>
                  selectedOrder?.id === row.original.id
                    ? 'bg-primary/5'
                    : undefined
                }
              />
              {selectedOrder ? (
                <div
                  ref={paidFormRef}
                  className='border-border scroll-mt-4 space-y-4 rounded-lg border p-4'
                >
                  <CanvasRechargeOrderSummary
                    order={selectedOrder}
                    showCorrectionDetails
                    actions={
                      <div className='flex flex-wrap gap-2'>
                        {onOpenRefundRecovery ? (
                          <Button
                            type='button'
                            variant='outline'
                            onClick={() =>
                              onOpenRefundRecovery({
                                customerId: customer.customerId,
                                customerName:
                                  customer.username ?? customer.newApiUserId,
                                orderId: selectedOrder.id,
                                orderNumber: selectedOrder.orderNumber,
                              })
                            }
                          >
                            <RotateCcw className='size-4' />
                            {t('Open refund point recovery')}
                          </Button>
                        ) : null}
                        <Button
                          type='button'
                          variant='outline'
                          onClick={() => {
                            setSelectedOrder(null)
                            paidForm.reset({
                              rechargeOrderId: '',
                              points: '',
                              reason: '',
                            })
                          }}
                        >
                          {t('Choose another order')}
                        </Button>
                      </div>
                    }
                  />
                  <h3 className='font-semibold'>
                    {t('Correct Paid points for this order')}
                  </h3>
                  <Form {...paidForm}>
                    <form
                      className='max-w-xl space-y-4'
                      onSubmit={paidForm.handleSubmit(() =>
                        setPendingAction('paid')
                      )}
                    >
                      <FormField
                        control={paidForm.control}
                        name='points'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('Paid points')}</FormLabel>
                            <FormControl>
                              <Input
                                inputMode='numeric'
                                max={selectedOrder.remainingCorrectionPoints}
                                {...field}
                                ref={(element) => {
                                  field.ref(element)
                                  paidPointsInputRef.current = element
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={paidForm.control}
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
                      <FormMessage />
                      <Button type='submit'>
                        {t('Review Paid correction')}
                      </Button>
                    </form>
                  </Form>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value='deduction'>
          <Card>
            <CardHeader>
              <CardTitle>{t('Deduct from a Point Lot')}</CardTitle>
              <CardDescription>
                {t(
                  'Only available points can be deducted; task-reserved points stay unchanged.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <p className='text-muted-foreground text-sm'>
                {t(
                  'Points currently held for running or unsettled tasks. Manual deductions do not change them.'
                )}
              </p>
              <CanvasServerTable
                data={lots.data?.items ?? []}
                columns={lotColumns}
                total={lots.data?.total ?? 0}
                state={lotsState}
                searchPlaceholder={t('Search Point Lots')}
                loading={lots.isLoading || lots.isFetching}
                emptyTitle={t('No point lots')}
                additionalFilters={
                  <Select
                    value={lotType || 'ALL'}
                    onValueChange={(value) =>
                      setLotType(value === 'ALL' ? '' : (value ?? ''))
                    }
                  >
                    <SelectTrigger className='w-40'>
                      <SelectValue placeholder={t('Type')}>
                        {lotType
                          ? t(
                              lotType === 'PAID'
                                ? 'Paid points'
                                : 'Bonus points'
                            )
                          : t('All types')}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='ALL'>{t('All types')}</SelectItem>
                      <SelectItem value='PAID'>{t('Paid points')}</SelectItem>
                      <SelectItem value='BONUS'>{t('Bonus points')}</SelectItem>
                    </SelectContent>
                  </Select>
                }
                hasActiveFilters={Boolean(lotType)}
                onResetFilters={() => setLotType('')}
                getRowId={(row) => row.id}
                getRowClassName={(row, context) => {
                  if (isLotDeductible(row.original)) return undefined
                  return context.isMobile
                    ? DISABLED_ROW_MOBILE
                    : DISABLED_ROW_DESKTOP
                }}
              />
              <Form {...deductionForm}>
                <form
                  className='max-w-xl space-y-4'
                  onSubmit={deductionForm.handleSubmit(() =>
                    setPendingAction('deduction')
                  )}
                >
                  <FormField
                    control={deductionForm.control}
                    name='points'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Points to deduct')}</FormLabel>
                        <FormControl>
                          <Input inputMode='numeric' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={deductionForm.control}
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
                  <FormMessage />
                  <Button
                    type='submit'
                    variant='destructive'
                    disabled={!selectedLot || !isLotDeductible(selectedLot)}
                  >
                    {t('Review deduction')}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <PricingActionConfirmation
        open={pendingAction !== null}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title={t('Confirm point adjustment?')}
        description={t(
          'Review the exact customer, source, amount, expiry, and reason. Confirmation writes immutable Lot, ledger, approval, and audit facts.'
        )}
        details={details}
        confirmLabel={t('Confirm adjustment')}
        destructive={pendingAction === 'deduction'}
        pending={mutationPending}
        onConfirm={() => {
          if (pendingAction === 'bonus') {
            bonusMutation.mutate(bonusForm.getValues())
          }
          if (pendingAction === 'paid') {
            paidMutation.mutate(paidForm.getValues())
          }
          if (pendingAction === 'deduction') {
            deductionMutation.mutate(deductionForm.getValues())
          }
        }}
      />
    </div>
  )
}
