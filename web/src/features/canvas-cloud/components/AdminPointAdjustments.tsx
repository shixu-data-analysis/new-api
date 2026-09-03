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
import { ArrowLeft, Gift, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTableColumnHeader } from '@/components/data-table'
import { DateTimePicker } from '@/components/datetime-picker'
import {
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
  SideDrawerSection,
} from '@/components/drawer-layout'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import {
  deductCanvasPointLot,
  getCanvasAdminCustomers,
  grantCanvasManualBonus,
  grantCanvasPaidCorrection,
} from '../api'
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
  CanvasPage,
} from '../types'
import { useServerTableState } from '../use-server-table-state'
import { AdminCustomerOperations } from './AdminCustomerOperations'
import { BusinessTerm, BusinessTermText } from './BusinessTerm'
import { CanvasColumnFilterField } from './CanvasColumnFilterPanel'
import { CanvasRechargeOrderSummary } from './CanvasRechargeOrder'
import { CanvasServerTable } from './CanvasServerTable'
import { CopyableText } from './CopyableText'
import { PricingActionConfirmation } from './PricingActionConfirmation'

type AdjustmentAction = 'bonus' | 'paid' | 'deduction'
type PendingAction = AdjustmentAction | null

function errorPayload(error: unknown): Record<string, unknown> | null {
  if (!error || typeof error !== 'object') return null
  if ('response' in error) {
    const response = error.response
    if (
      response &&
      typeof response === 'object' &&
      'data' in response &&
      response.data &&
      typeof response.data === 'object'
    ) {
      return response.data as Record<string, unknown>
    }
  }
  return error as Record<string, unknown>
}

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
  const [sheetAction, setSheetAction] = useState<AdjustmentAction | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [customerStatus, setCustomerStatus] = useState('')
  const [refreshingCustomer, setRefreshingCustomer] = useState(false)
  const customersState = useServerTableState('createdAt')
  const customerId = customer?.customerId

  const customersQueryKey = [
    'canvas-cloud',
    'admin',
    'customers',
    customersState.query,
    customerStatus,
  ] as const
  const customers = useQuery({
    queryKey: customersQueryKey,
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

  const closeAdjustmentSheet = () => {
    setSheetAction(null)
    setPendingAction(null)
    setSelectedOrder(null)
    setSelectedLot(null)
    bonusForm.reset()
    paidForm.reset()
    deductionForm.reset()
  }
  const returnToCustomerList = () => {
    closeAdjustmentSheet()
    setCustomer(null)
  }
  const openBonusSheet = () => {
    closeAdjustmentSheet()
    setSheetAction('bonus')
  }
  const openPaidSheet = (order: CanvasAdminRechargeOrder) => {
    closeAdjustmentSheet()
    setSelectedOrder(order)
    paidForm.reset({ rechargeOrderId: order.id, points: '', reason: '' })
    setSheetAction('paid')
  }
  const openDeductionSheet = (lot: CanvasAdminPointLot) => {
    closeAdjustmentSheet()
    setSelectedLot(lot)
    deductionForm.reset({ pointLotId: lot.id, points: '', reason: '' })
    setSheetAction('deduction')
  }

  const refreshCustomerRecord = async () => {
    if (!customerId) return false
    setRefreshingCustomer(true)
    try {
      await queryClient.invalidateQueries({ queryKey: ['canvas-cloud'] })
      const refreshed = await customers.refetch()
      const latest = refreshed.data?.items.find(
        (item) => item.customerId === customerId
      )
      if (!latest) throw new Error('Selected customer was not returned')
      setCustomer(latest)
      return true
    } catch {
      toast.error(
        t(
          'Points were adjusted, but the latest customer balance could not be loaded. Try refreshing the record.'
        )
      )
      return false
    } finally {
      setRefreshingCustomer(false)
    }
  }

  const showMutationError = (error: unknown) => {
    setPendingAction(null)
    const payload = errorPayload(error)
    const requestId =
      typeof payload?.requestId === 'string' ? payload.requestId : undefined
    toast.error(t('Point adjustment failed'), {
      description: requestId ? `${t('Request ID')}: ${requestId}` : undefined,
    })
  }
  const finishSuccessfulAdjustment = async (message: string) => {
    toast.success(message)
    closeAdjustmentSheet()
    await refreshCustomerRecord()
  }

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
    onSuccess: () => finishSuccessfulAdjustment(t('Bonus points granted')),
    onError: showMutationError,
  })
  const paidMutation = useMutation({
    mutationFn: (values: PaidCorrectionValues) =>
      grantCanvasPaidCorrection(values),
    onSuccess: () => finishSuccessfulAdjustment(t('Paid points corrected')),
    onError: showMutationError,
  })
  const deductionMutation = useMutation({
    mutationFn: (values: DeductionValues) => deductCanvasPointLot(values),
    onSuccess: () => finishSuccessfulAdjustment(t('Points deducted')),
    onError: async (error) => {
      const payload = errorPayload(error)
      if (payload?.code !== 'INSUFFICIENT_AVAILABLE_POINTS' || !customerId) {
        showMutationError(error)
        return
      }
      setPendingAction(null)
      const lotsQueryKey = [
        'canvas-cloud',
        'admin-customer',
        customerId,
        'point-lots',
      ] as const
      await queryClient.refetchQueries({ queryKey: lotsQueryKey })
      const pages = queryClient.getQueriesData<CanvasPage<CanvasAdminPointLot>>(
        {
          queryKey: lotsQueryKey,
        }
      )
      const latestLot = pages
        .flatMap(([, page]) => page?.items ?? [])
        .find((lot) => lot.id === selectedLot?.id)
      if (latestLot) setSelectedLot(latestLot)
      const availablePoints = latestLot?.availablePoints ?? '0'
      deductionForm.reset({
        pointLotId: selectedLot?.id ?? '',
        points: '',
        reason: deductionForm.getValues('reason'),
      })
      toast.error(
        t(
          'Deduction cannot exceed current available points {{points}}. Please enter a new amount.',
          { points: availablePoints }
        )
      )
    },
  })

  const customerColumns: ColumnDef<CanvasAdminCustomerPointBalance, unknown>[] =
    [
      {
        id: 'customer',
        accessorKey: 'username',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Username')} />
        ),
        meta: { label: t('Username') },
        cell: ({ row }) => (
          <CopyableText value={row.original.username ?? '—'} />
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
        enableHiding: false,
        header: t('Actions'),
        cell: ({ row }) => (
          <Button
            type='button'
            size='sm'
            variant='outline'
            onClick={() => {
              closeAdjustmentSheet()
              setCustomer(row.original)
            }}
          >
            {t('Select')}
          </Button>
        ),
      },
    ]

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
            searchLabel={t('Username')}
            loading={customers.isLoading || customers.isFetching}
            emptyTitle={t('No customers')}
            additionalFilters={
              <CanvasColumnFilterField label={t('Status')}>
                <Select
                  value={customerStatus || 'ALL'}
                  onValueChange={(value) =>
                    setCustomerStatus(value === 'ALL' ? '' : (value ?? ''))
                  }
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue>
                      {customerStatus ? (
                        <BusinessTermText
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
              </CanvasColumnFilterField>
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
    | null = null
  if (pendingAction === 'bonus') pendingValues = bonusForm.getValues()
  if (pendingAction === 'paid') pendingValues = paidForm.getValues()
  if (pendingAction === 'deduction') pendingValues = deductionForm.getValues()
  const details = Object.entries(pendingValues ?? {}).map(([label, value]) => ({
    label: t(label),
    value: value instanceof Date ? value.toLocaleString() : String(value ?? ''),
  }))
  const mutationPending =
    bonusMutation.isPending ||
    paidMutation.isPending ||
    deductionMutation.isPending
  let sheetTitle = t('Deduct from a Point Lot')
  if (sheetAction === 'bonus') sheetTitle = t('Grant Bonus points')
  if (sheetAction === 'paid') sheetTitle = t('Correct Paid points')
  let reviewLabel = t('Review deduction')
  if (sheetAction === 'bonus') reviewLabel = t('Review Bonus grant')
  if (sheetAction === 'paid') reviewLabel = t('Review Paid correction')
  const formId = `point-adjustment-${sheetAction ?? 'closed'}`

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
                <CopyableText value={customer.username ?? '—'} />
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
                {refreshingCustomer ? (
                  <span>{t('Refreshing customer record...')}</span>
                ) : null}
              </div>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Button type='button' onClick={openBonusSheet}>
                <Gift className='size-4' />
                {t('Grant Bonus points')}
              </Button>
              {onOpenRefundRecovery ? (
                <Button
                  type='button'
                  variant='outline'
                  onClick={() =>
                    onOpenRefundRecovery({
                      customerId: customer.customerId,
                      customerName: customer.username ?? '—',
                    })
                  }
                >
                  <RotateCcw className='size-4' />
                  {t('Open refund point recovery')}
                </Button>
              ) : null}
            </div>
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
          <AdminCustomerOperations
            customerId={customer.customerId}
            selectedOrderId={selectedOrder?.id}
            selectedLotId={selectedLot?.id}
            onCorrectOrder={openPaidSheet}
            onDeductLot={openDeductionSheet}
          />
        </CardContent>
      </Card>

      <Sheet
        open={sheetAction !== null}
        onOpenChange={(open) => !open && closeAdjustmentSheet()}
      >
        <SheetContent
          className={sideDrawerContentClassName('sm:max-w-[640px]')}
        >
          <SheetHeader className={sideDrawerHeaderClassName()}>
            <SheetTitle>{sheetTitle}</SheetTitle>
            <SheetDescription>
              {t(
                'Review the selected customer and record, enter the adjustment, then continue to final confirmation.'
              )}
            </SheetDescription>
          </SheetHeader>

          {sheetAction === 'bonus' ? (
            <Form {...bonusForm}>
              <form
                id={formId}
                className={sideDrawerFormClassName()}
                onSubmit={bonusForm.handleSubmit(() =>
                  setPendingAction('bonus')
                )}
              >
                <SideDrawerSection>
                  <div className='font-medium'>
                    <CopyableText value={customer.username ?? '—'} />
                  </div>
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
                </SideDrawerSection>
              </form>
            </Form>
          ) : null}

          {sheetAction === 'paid' && selectedOrder ? (
            <Form {...paidForm}>
              <form
                id={formId}
                className={sideDrawerFormClassName()}
                onSubmit={paidForm.handleSubmit(() => setPendingAction('paid'))}
              >
                <SideDrawerSection>
                  <CanvasRechargeOrderSummary
                    order={selectedOrder}
                    showCorrectionDetails
                  />
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
                </SideDrawerSection>
              </form>
            </Form>
          ) : null}

          {sheetAction === 'deduction' && selectedLot ? (
            <Form {...deductionForm}>
              <form
                id={formId}
                className={sideDrawerFormClassName()}
                onSubmit={deductionForm.handleSubmit(() =>
                  setPendingAction('deduction')
                )}
              >
                <SideDrawerSection>
                  <div className='space-y-1'>
                    <div className='font-medium'>
                      {t('Point Lot')}: <CopyableText value={selectedLot.id} />
                    </div>
                    <div className='text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm'>
                      <span>
                        {t('Type')}:{' '}
                        <BusinessTerm
                          kind='pointLotType'
                          value={selectedLot.type}
                        />
                      </span>
                      <span>
                        {t('Available points')}: {selectedLot.availablePoints}
                      </span>
                      <span>
                        {t('Task-reserved points')}:{' '}
                        {selectedLot.reservedPoints}
                      </span>
                      <span>
                        {t('Expires at')}:{' '}
                        {formatCanvasDateTime(
                          selectedLot.expiresAt,
                          t('No expiry')
                        )}
                      </span>
                    </div>
                  </div>
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
                </SideDrawerSection>
              </form>
            </Form>
          ) : null}

          <SheetFooter className={sideDrawerFooterClassName()}>
            <Button
              type='button'
              variant='outline'
              onClick={closeAdjustmentSheet}
            >
              {t('Cancel')}
            </Button>
            <Button
              type='submit'
              form={formId}
              variant={sheetAction === 'deduction' ? 'destructive' : 'default'}
            >
              {reviewLabel}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

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
