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
import { ArrowLeft, Gift } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTableColumnHeader } from '@/components/data-table'
import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
import { DateTimePicker } from '@/components/datetime-picker'
import {
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
  SideDrawerSection,
} from '@/components/drawer-layout'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { toIntlLocale } from '@/i18n/languages'

import {
  deductCanvasPointLot,
  createCanvasOrderPointReturn,
  getCanvasAdminCustomer,
  getCanvasAdminCustomerPointLots,
  getCanvasAdminCustomers,
  grantCanvasManualBonus,
  grantCanvasPaidCorrection,
  previewCanvasOrderPointReturn,
} from '../api'
import { factValueLabels } from '../business-facts'
import {
  bonusAdjustmentSchema,
  deductionSchema,
  paidCorrectionSchema,
  pointReturnSchema,
  type BonusAdjustmentValues,
  type DeductionValues,
  type PaidCorrectionValues,
  type PointReturnValues,
} from '../form-validation'
import { formatCanvasDateTime, formatMoneyMinor } from '../formatters'
import type {
  CanvasAdminCustomerPointBalance,
  CanvasAdminPointLot,
  CanvasAdminRechargeOrder,
  CanvasPage,
  CanvasOrderPointReturnPreview,
} from '../types'
import { useServerTableState } from '../use-server-table-state'
import { AdminCustomerOperations } from './AdminCustomerOperations'
import { BusinessTerm } from './BusinessTerm'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { CanvasRechargeOrderSummary } from './CanvasRechargeOrder'
import { CanvasServerTable } from './CanvasServerTable'
import { CopyableText } from './CopyableText'
import { CustomerPriceAssignment } from './CustomerPriceAssignment'

type AdjustmentAction = 'bonus' | 'paid' | 'deduction' | 'return'
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

export function AdminPointAdjustments({
  customerId: controlledCustomerId,
  onCustomerChange,
  orderId,
  pointLotId,
}: {
  customerId?: string
  onCustomerChange?: (customerId?: string) => void
  orderId?: string
  pointLotId?: string
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [localCustomer, setLocalCustomer] =
    useState<CanvasAdminCustomerPointBalance | null>(null)
  const listScrollY = useRef(0)
  const [selectedOrder, setSelectedOrder] =
    useState<CanvasAdminRechargeOrder | null>(null)
  const [selectedLot, setSelectedLot] = useState<CanvasAdminPointLot | null>(
    null
  )
  const [sheetAction, setSheetAction] = useState<AdjustmentAction | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [pointReturnPreview, setPointReturnPreview] =
    useState<CanvasOrderPointReturnPreview | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [customerStatus, setCustomerStatus] = useState('')
  const [refreshingCustomer, setRefreshingCustomer] = useState(false)
  const submittingAction = useRef(false)
  const customersState = useServerTableState('createdAt')
  const setCustomersPagination = customersState.setPagination
  const customerId = controlledCustomerId ?? localCustomer?.customerId

  useEffect(() => {
    setCustomersPagination((value) =>
      value.pageIndex === 0 ? value : { ...value, pageIndex: 0 }
    )
  }, [customerStatus, setCustomersPagination])

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
  const customerDetail = useQuery({
    queryKey: ['canvas-cloud', 'admin-customer', customerId, 'detail'],
    queryFn: ({ signal }) => {
      if (!customerId) throw new Error('Customer ID is required')
      return getCanvasAdminCustomer(customerId, signal)
    },
    enabled: Boolean(customerId),
  })
  const customer =
    customerDetail.data ??
    (localCustomer?.customerId === customerId ? localCustomer : null)
  useEffect(() => {
    if (!customerId && listScrollY.current > 0) {
      requestAnimationFrame(() => window.scrollTo({ top: listScrollY.current }))
    }
  }, [customerId])

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
  const pointReturnForm = useForm<PointReturnValues>({
    resolver: zodResolver(
      pointReturnSchema(selectedOrder?.availablePaidPoints ?? '0')
    ),
    mode: 'onTouched',
    defaultValues: { rechargeOrderId: '', points: '', reason: '' },
  })
  const pointReturnPoints = pointReturnForm.watch('points')
  const previousControlledCustomerId = useRef(controlledCustomerId)

  const closeAdjustmentSheet = () => {
    setSheetAction(null)
    setPendingAction(null)
    setSelectedOrder(null)
    setSelectedLot(null)
    bonusForm.reset()
    paidForm.reset()
    deductionForm.reset()
    pointReturnForm.reset()
    setPointReturnPreview(null)
    submittingAction.current = false
  }
  useEffect(() => {
    if (previousControlledCustomerId.current === controlledCustomerId) return
    previousControlledCustomerId.current = controlledCustomerId
    setLocalCustomer(null)
    setSheetAction(null)
    setPendingAction(null)
    setSelectedOrder(null)
    setSelectedLot(null)
    setPointReturnPreview(null)
    setDiscardOpen(false)
    bonusForm.reset()
    paidForm.reset()
    deductionForm.reset()
    pointReturnForm.reset()
    submittingAction.current = false
  }, [
    bonusForm,
    controlledCustomerId,
    deductionForm,
    paidForm,
    pointReturnForm,
  ])
  const returnToCustomerList = () => {
    closeAdjustmentSheet()
    setLocalCustomer(null)
    onCustomerChange?.(undefined)
  }
  const openCustomer = (value: CanvasAdminCustomerPointBalance) => {
    listScrollY.current = window.scrollY
    setLocalCustomer(value)
    onCustomerChange?.(value.customerId)
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
  const openReturnSheet = (order: CanvasAdminRechargeOrder) => {
    closeAdjustmentSheet()
    setSelectedOrder(order)
    pointReturnForm.reset({
      rechargeOrderId: order.id,
      points: '',
      reason: '',
    })
    setSheetAction('return')
  }
  const adjustmentDirty =
    (sheetAction === 'bonus' && bonusForm.formState.isDirty) ||
    (sheetAction === 'paid' && paidForm.formState.isDirty) ||
    (sheetAction === 'deduction' && deductionForm.formState.isDirty) ||
    (sheetAction === 'return' && pointReturnForm.formState.isDirty)
  const requestCloseAdjustmentSheet = () => {
    if (mutationPending) return
    if (adjustmentDirty) setDiscardOpen(true)
    else closeAdjustmentSheet()
  }

  const refreshCustomerRecord = async () => {
    if (!customerId) return false
    setRefreshingCustomer(true)
    try {
      await queryClient.invalidateQueries({ queryKey: ['canvas-cloud'] })
      const refreshed = await customerDetail.refetch()
      const latest = refreshed.data
      if (!latest) throw new Error('Selected customer was not returned')
      setLocalCustomer(latest)
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
  const pointReturnPreviewMutation = useMutation({
    mutationFn: (values: PointReturnValues) =>
      previewCanvasOrderPointReturn({
        rechargeOrderId: values.rechargeOrderId,
        points: values.points,
      }),
    onSuccess: (preview) => {
      setPointReturnPreview(preview)
      setPendingAction('return')
    },
    onError: showMutationError,
  })
  const pointReturnMutation = useMutation({
    mutationFn: (values: PointReturnValues) => {
      if (!pointReturnPreview) {
        throw new Error('Point-return review is required')
      }
      return createCanvasOrderPointReturn({
        rechargeOrderId: values.rechargeOrderId,
        points: values.points,
        reason: values.reason,
        expectedAvailablePaidPoints: pointReturnPreview.availablePaidPoints,
        expectedCumulativeReturnedPoints:
          pointReturnPreview.cumulativeReturnedPoints,
        expectedReferenceAmountMinor: pointReturnPreview.referenceAmountMinor,
      })
    },
    onSuccess: () => finishSuccessfulAdjustment(t('Points returned')),
    onError: (error) => {
      const payload = errorPayload(error)
      if (payload?.code === 'STALE_POINT_RETURN_REVIEW') {
        setPendingAction(null)
        setPointReturnPreview(null)
        toast.error(t('Point return values changed. Review the latest values.'))
        return
      }
      showMutationError(error)
    },
  })

  const reviewPointReturn = (values: PointReturnValues) => {
    if (submittingAction.current) return
    submittingAction.current = true
    pointReturnPreviewMutation.mutate(values, {
      onSettled: () => {
        submittingAction.current = false
      },
    })
  }

  const reviewDeduction = async (values: DeductionValues) => {
    if (!customerId || submittingAction.current) return
    submittingAction.current = true
    try {
      const page = await getCanvasAdminCustomerPointLots(customerId, {
        lotId: values.pointLotId,
        page: 1,
        pageSize: 20,
        sortBy: 'issuedAt',
        sortOrder: 'desc',
      })
      const latestLot = page.items.find((lot) => lot.id === values.pointLotId)
      if (!latestLot) throw new Error('Selected Point Lot was not returned')
      setSelectedLot(latestLot)
      if (BigInt(values.points) > BigInt(latestLot.availablePoints)) {
        deductionForm.reset({
          pointLotId: latestLot.id,
          points: '',
          reason: values.reason,
        })
        toast.error(
          t(
            'Deduction cannot exceed current available points {{points}}. Please enter a new amount.',
            { points: formatPoints(latestLot.availablePoints) }
          )
        )
        return
      }
      setPendingAction('deduction')
    } catch {
      toast.error(t('Point adjustment failed'))
    } finally {
      submittingAction.current = false
    }
  }

  const confirmPendingAction = () => {
    if (!pendingAction || submittingAction.current) return
    submittingAction.current = true
    const options = {
      onSettled: () => {
        submittingAction.current = false
      },
    }
    if (pendingAction === 'bonus') {
      bonusMutation.mutate(bonusForm.getValues(), options)
    } else if (pendingAction === 'paid') {
      paidMutation.mutate(paidForm.getValues(), options)
    } else if (pendingAction === 'deduction') {
      deductionMutation.mutate(deductionForm.getValues(), options)
    } else {
      pointReturnMutation.mutate(pointReturnForm.getValues(), options)
    }
  }

  const customerColumns: ColumnDef<CanvasAdminCustomerPointBalance, unknown>[] =
    [
      {
        id: 'customer',
        accessorKey: 'username',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Username')} />
        ),
        meta: { label: t('Username') },
        cell: ({ row }) => {
          const username = row.original.username ?? '—'
          return (
            <span className='inline-flex items-center gap-2'>
              <a
                href={`/canvas-cloud/customers?customerId=${encodeURIComponent(row.original.customerId)}`}
                className='text-primary focus-visible:ring-ring font-normal underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none'
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  ) {
                    return
                  }
                  event.preventDefault()
                  openCustomer(row.original)
                }}
              >
                {username}
              </a>
              <CopyableText value={username} hideValue />
            </span>
          )
        },
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
        cell: ({ row }) => (
          <div className='text-right tabular-nums'>
            {new Intl.NumberFormat(toIntlLocale(i18n.language)).format(
              BigInt(row.original.availablePoints)
            )}
          </div>
        ),
      },
    ]

  if (!customer) {
    if (customerId && customerDetail.isLoading) {
      return <p>{t('Loading customer details...')}</p>
    }
    if (customerId && customerDetail.isError) {
      return (
        <div role='alert' className='space-y-3'>
          <p>{t('Unable to load customer details')}</p>
          <Button variant='outline' onClick={() => customerDetail.refetch()}>
            {t('Retry')}
          </Button>
          <Button variant='ghost' onClick={returnToCustomerList}>
            {t('Back to customer list')}
          </Button>
        </div>
      )
    }
    return (
      <Card>
        <CardContent>
          <CanvasServerTable
            data={customers.data?.items ?? []}
            columns={customerColumns}
            total={customers.data?.total ?? 0}
            state={customersState}
            searchLabel={t('Username')}
            loading={customers.isLoading || customers.isFetching}
            error={customers.isError}
            onRetry={() => void customers.refetch()}
            emptyTitle={t('No customers')}
            filteredEmptyTitle={t('No matching results')}
            additionalFilters={
              <DataTableColumnFilterField label={t('Status')}>
                <Select
                  value={customerStatus || 'ALL'}
                  onValueChange={(value) =>
                    setCustomerStatus(value === 'ALL' ? '' : (value ?? ''))
                  }
                >
                  <SelectTrigger className='w-full'>
                    <CanvasLocalizedSelectValue
                      value={customerStatus}
                      emptyLabelKey='All statuses'
                      termKind='customerStatus'
                    />
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
              </DataTableColumnFilterField>
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
    | PointReturnValues
    | null = null
  if (pendingAction === 'bonus') pendingValues = bonusForm.getValues()
  if (pendingAction === 'paid') pendingValues = paidForm.getValues()
  if (pendingAction === 'deduction') pendingValues = deductionForm.getValues()
  if (pendingAction === 'return') pendingValues = pointReturnForm.getValues()
  const formatPoints = (value: string) =>
    new Intl.NumberFormat(toIntlLocale(i18n.language)).format(BigInt(value))
  let details: Array<{ label: string; value: string }> = []
  if (pendingAction === 'bonus' && pendingValues) {
    const values = pendingValues as BonusAdjustmentValues
    details = [
      { label: t('Gift points'), value: formatPoints(values.points) },
      {
        label: t('Expires at'),
        value: formatCanvasDateTime(values.expiresAt.toISOString()),
      },
      { label: t('Reason'), value: values.reason },
    ]
  } else if (pendingAction === 'paid' && pendingValues && selectedOrder) {
    const values = pendingValues as PaidCorrectionValues
    details = [
      { label: t('Recharge order'), value: selectedOrder.orderNumber },
      { label: t('Paid points'), value: formatPoints(values.points) },
      { label: t('Reason'), value: values.reason },
    ]
  } else if (pendingAction === 'deduction' && pendingValues && selectedLot) {
    const values = pendingValues as DeductionValues
    details = [
      { label: t('Customer'), value: customer.username ?? t('Unknown') },
      { label: t('Point Lot'), value: selectedLot.id },
      {
        label: t('Type'),
        value: t(factValueLabels[selectedLot.type] ?? 'Unknown'),
      },
      { label: t('Points to deduct'), value: formatPoints(values.points) },
      {
        label: t('Available points after deduction'),
        value: formatPoints(
          (
            BigInt(selectedLot.availablePoints) - BigInt(values.points)
          ).toString()
        ),
      },
      {
        label: t('Task-reserved points'),
        value: formatPoints(selectedLot.reservedPoints),
      },
      { label: t('Reason'), value: values.reason },
    ]
  } else if (pendingAction === 'return' && pendingValues && selectedOrder) {
    const values = pendingValues as PointReturnValues
    details = [
      { label: t('Recharge order'), value: selectedOrder.orderNumber },
      { label: t('Returned points'), value: formatPoints(values.points) },
      { label: t('Reason'), value: values.reason },
    ]
  }
  const mutationPending =
    bonusMutation.isPending ||
    paidMutation.isPending ||
    deductionMutation.isPending ||
    pointReturnPreviewMutation.isPending ||
    pointReturnMutation.isPending
  let sheetTitle = t('Deduct from a Point Lot')
  if (sheetAction === 'bonus') {
    sheetTitle = t('Gift points · {{username}}', {
      username: customer.username ?? '—',
    })
  }
  if (sheetAction === 'paid') sheetTitle = t('Correct Paid points')
  if (sheetAction === 'return') {
    sheetTitle = t('Return points · {{username}}', {
      username: customer.username ?? '—',
    })
  }
  if (pendingAction === 'bonus') {
    sheetTitle = t('Confirm gift · {{username}}', {
      username: customer.username ?? '—',
    })
  }
  if (pendingAction === 'paid') sheetTitle = t('Confirm Paid correction')
  if (pendingAction === 'deduction') sheetTitle = t('Confirm deduction')
  if (pendingAction === 'return') {
    sheetTitle = t('Confirm return · {{username}}', {
      username: customer.username ?? '—',
    })
  }
  let reviewLabel = t('Next')
  if (sheetAction === 'paid') reviewLabel = t('Review Paid correction')
  let submitLabel = reviewLabel
  if (pendingAction === 'bonus') submitLabel = t('Confirm gift')
  if (pendingAction === 'paid') submitLabel = t('Confirm correction')
  if (pendingAction === 'return') submitLabel = t('Confirm return points')
  if (pendingAction === 'deduction') submitLabel = t('Confirm deduction')
  const formId = `point-adjustment-${sheetAction ?? 'closed'}`
  let pointReturnDraft:
    | { referenceAmountMinor: string; remainingAvailablePaidPoints: string }
    | undefined
  if (
    selectedOrder &&
    /^(0|[1-9]\d*)$/.test(pointReturnPoints) &&
    BigInt(pointReturnPoints) > 0n &&
    BigInt(pointReturnPoints) <= BigInt(selectedOrder.availablePaidPoints)
  ) {
    const purchased = BigInt(
      selectedOrder.purchasedPoints ?? selectedOrder.expectedPaidPoints
    )
    const priorPoints = BigInt(selectedOrder.returnedPoints)
    const priorReference = BigInt(selectedOrder.returnedReferenceAmountMinor)
    if (
      purchased > 0n &&
      priorPoints + BigInt(pointReturnPoints) <= purchased
    ) {
      const cumulativeReference =
        (BigInt(selectedOrder.listedAmountMinor) *
          (priorPoints + BigInt(pointReturnPoints))) /
        purchased
      pointReturnDraft = {
        referenceAmountMinor: (cumulativeReference - priorReference).toString(),
        remainingAvailablePaidPoints: (
          BigInt(selectedOrder.availablePaidPoints) - BigInt(pointReturnPoints)
        ).toString(),
      }
    }
  }

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
                  {t('Available points')}:{' '}
                  {new Intl.NumberFormat(toIntlLocale(i18n.language)).format(
                    BigInt(customer.availablePoints)
                  )}
                </span>
                <span>
                  {t('Paid points')}:{' '}
                  {new Intl.NumberFormat(toIntlLocale(i18n.language)).format(
                    BigInt(customer.paidAvailablePoints)
                  )}
                </span>
                <span>
                  {t('Bonus points')}:{' '}
                  {new Intl.NumberFormat(toIntlLocale(i18n.language)).format(
                    BigInt(customer.bonusAvailablePoints)
                  )}
                </span>
                {BigInt(customer.debtPoints ?? '0') > 0n ? (
                  <span>
                    {t('Outstanding debt')}:{' '}
                    {new Intl.NumberFormat(toIntlLocale(i18n.language)).format(
                      BigInt(customer.debtPoints ?? '0')
                    )}
                  </span>
                ) : null}
                {refreshingCustomer ? (
                  <span>{t('Refreshing customer record...')}</span>
                ) : null}
              </div>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Button type='button' onClick={openBonusSheet}>
                <Gift className='size-4' />
                {t('Gift points')}
              </Button>
            </div>
          </div>
          <CustomerPriceAssignment
            key={customer.customerId}
            customerId={customer.customerId}
            customerName={customer.username ?? '—'}
          />
        </CardContent>
      </Card>
      <AdminCustomerOperations
        customerId={customer.customerId}
        selectedOrderId={selectedOrder?.id}
        initialOrderId={orderId}
        initialLotId={pointLotId}
        selectedLotId={selectedLot?.id}
        onCorrectOrder={openPaidSheet}
        onDeductLot={openDeductionSheet}
        onReturnOrder={openReturnSheet}
      />

      <Sheet
        open={sheetAction !== null}
        onOpenChange={(open) => !open && requestCloseAdjustmentSheet()}
      >
        <SheetContent
          className={sideDrawerContentClassName('sm:max-w-[640px]')}
        >
          <SheetHeader className={sideDrawerHeaderClassName()}>
            <SheetTitle>{sheetTitle}</SheetTitle>
            <SheetDescription
              className={sheetAction === 'bonus' ? 'sr-only' : undefined}
            >
              {t(
                'Review the selected customer and record, enter the adjustment, then continue to final confirmation.'
              )}
            </SheetDescription>
          </SheetHeader>

          {sheetAction === 'bonus' && pendingAction !== 'bonus' ? (
            <Form {...bonusForm}>
              <form
                id={formId}
                className={sideDrawerFormClassName()}
                onSubmit={bonusForm.handleSubmit(() =>
                  setPendingAction('bonus')
                )}
              >
                <SideDrawerSection>
                  <FormField
                    control={bonusForm.control}
                    name='points'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Gift points')} *</FormLabel>
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
                        <FormLabel>{t('Expires at')} *</FormLabel>
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
                        <FormLabel>{t('Reason')} *</FormLabel>
                        <FormControl>
                          <Textarea rows={4} maxLength={255} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </SideDrawerSection>
              </form>
            </Form>
          ) : null}

          {sheetAction === 'paid' &&
          selectedOrder &&
          pendingAction !== 'paid' ? (
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
                        <FormLabel>{t('Paid points')} *</FormLabel>
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
                        <FormLabel>{t('Reason')} *</FormLabel>
                        <FormControl>
                          <Textarea rows={4} maxLength={255} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </SideDrawerSection>
              </form>
            </Form>
          ) : null}

          {sheetAction === 'deduction' &&
          selectedLot &&
          pendingAction !== 'deduction' ? (
            <Form {...deductionForm}>
              <form
                id={formId}
                className={sideDrawerFormClassName()}
                onSubmit={deductionForm.handleSubmit(reviewDeduction)}
              >
                <SideDrawerSection>
                  <div className='space-y-1'>
                    <div className='text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm'>
                      <span>
                        {t('Customer')}: {customer.username ?? t('Unknown')}
                      </span>
                      <span>
                        {t('Type')}:{' '}
                        <BusinessTerm
                          kind='pointLotType'
                          value={selectedLot.type}
                        />
                      </span>
                      <span>
                        {t('Source')}:{' '}
                        {selectedLot.rechargeOrderNumber ??
                          t(
                            factValueLabels[selectedLot.sourceType] ?? 'Unknown'
                          )}
                      </span>
                      <span>
                        {t('Issued at')}:{' '}
                        {formatCanvasDateTime(selectedLot.issuedAt)}
                      </span>
                      <span>
                        {t('Available points')}:{' '}
                        {formatPoints(selectedLot.availablePoints)}
                      </span>
                      <span>
                        {t('Task-reserved points')}:{' '}
                        {formatPoints(selectedLot.reservedPoints)}
                      </span>
                      <span>
                        {t('Expires at')}:{' '}
                        {formatCanvasDateTime(
                          selectedLot.expiresAt,
                          t('No expiry')
                        )}
                      </span>
                    </div>
                    <details className='pt-2 text-sm'>
                      <summary className='cursor-pointer'>{t('More')}</summary>
                      <div className='mt-2'>
                        {t('Point Lot')}:{' '}
                        <CopyableText value={selectedLot.id} />
                      </div>
                    </details>
                  </div>
                  <FormField
                    control={deductionForm.control}
                    name='points'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Points to deduct')} *</FormLabel>
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
                        <FormLabel>{t('Reason')} *</FormLabel>
                        <FormControl>
                          <Textarea rows={4} maxLength={255} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </SideDrawerSection>
              </form>
            </Form>
          ) : null}

          {sheetAction === 'return' &&
          selectedOrder &&
          pendingAction !== 'return' ? (
            <Form {...pointReturnForm}>
              <form
                id={formId}
                className={sideDrawerFormClassName()}
                onSubmit={pointReturnForm.handleSubmit(reviewPointReturn)}
              >
                <SideDrawerSection>
                  <div className='space-y-1 text-sm'>
                    <p>
                      <strong>{t('Recharge order')}:</strong>{' '}
                      {selectedOrder.orderNumber}
                    </p>
                    <p>
                      {t('Original recharge amount')}:{' '}
                      {formatMoneyMinor(
                        selectedOrder.listedAmountMinor,
                        selectedOrder.currency
                      )}
                    </p>
                    <p>
                      {t('Original purchased points')}:{' '}
                      {formatPoints(
                        selectedOrder.purchasedPoints ??
                          selectedOrder.expectedPaidPoints
                      )}
                    </p>
                    <p>
                      {t('Currently returnable points')}:{' '}
                      {formatPoints(selectedOrder.availablePaidPoints)}
                    </p>
                  </div>
                  <FormField
                    control={pointReturnForm.control}
                    name='points'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Points to return')} *</FormLabel>
                        <FormControl>
                          <Input
                            inputMode='numeric'
                            max={selectedOrder.availablePaidPoints}
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          {t('Up to {{points}} points can be returned', {
                            points: formatPoints(
                              selectedOrder.availablePaidPoints
                            ),
                          })}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={pointReturnForm.control}
                    name='reason'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Reason')} *</FormLabel>
                        <FormControl>
                          <Textarea rows={4} maxLength={255} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {pointReturnDraft ? (
                    <div className='space-y-1 text-sm'>
                      <p>
                        {t('Refund reference amount')}:{' '}
                        {formatMoneyMinor(
                          pointReturnDraft.referenceAmountMinor,
                          selectedOrder.currency
                        )}
                      </p>
                      <p>
                        {t('Available points after return')}:{' '}
                        {formatPoints(
                          pointReturnDraft.remainingAvailablePaidPoints
                        )}
                      </p>
                    </div>
                  ) : null}
                  <p className='text-muted-foreground text-sm'>
                    {t(
                      'The refund reference amount is for offline refund reference only and does not mean a cash refund has been completed.'
                    )}
                  </p>
                </SideDrawerSection>
              </form>
            </Form>
          ) : null}

          {pendingAction ? (
            <div className={sideDrawerFormClassName()}>
              <SideDrawerSection>
                <dl className='grid gap-4 sm:grid-cols-2'>
                  {details.map((detail) => (
                    <div key={detail.label} className='min-w-0'>
                      <dt className='text-muted-foreground text-sm'>
                        {detail.label}
                      </dt>
                      <dd className='mt-1 text-sm font-medium break-words'>
                        {detail.value}
                      </dd>
                    </div>
                  ))}
                  {pendingAction === 'return' && pointReturnPreview ? (
                    <>
                      <div>
                        <dt className='text-muted-foreground text-sm'>
                          {t('Refund reference amount')}
                        </dt>
                        <dd className='mt-1 text-sm font-medium'>
                          {formatMoneyMinor(
                            pointReturnPreview.referenceAmountMinor,
                            pointReturnPreview.currency
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className='text-muted-foreground text-sm'>
                          {t('Available points after return')}
                        </dt>
                        <dd className='mt-1 text-sm font-medium'>
                          {formatPoints(
                            pointReturnPreview.remainingAvailablePaidPoints
                          )}
                        </dd>
                      </div>
                    </>
                  ) : null}
                </dl>
              </SideDrawerSection>
            </div>
          ) : null}

          <SheetFooter className={sideDrawerFooterClassName()}>
            <Button
              type='button'
              variant='outline'
              disabled={mutationPending}
              onClick={() =>
                pendingAction
                  ? setPendingAction(null)
                  : requestCloseAdjustmentSheet()
              }
            >
              {pendingAction ? t('Back to edit') : t('Cancel')}
            </Button>
            <Button
              type={pendingAction ? 'button' : 'submit'}
              form={pendingAction ? undefined : formId}
              variant={sheetAction === 'deduction' ? 'destructive' : 'default'}
              disabled={mutationPending}
              onClick={pendingAction ? confirmPendingAction : undefined}
            >
              {submitLabel}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Discard changes?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('Your unsaved entries will be lost.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Keep editing')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDiscardOpen(false)
                closeAdjustmentSheet()
              }}
            >
              {t('Discard')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
