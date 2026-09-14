import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTableColumnHeader } from '@/components/data-table'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDebounce } from '@/hooks'
import { toIntlLocale } from '@/i18n/languages'
import { getServerErrorMessageKey } from '@/lib/server-error-message'

import {
  getCanvasCustomerPointSummary,
  getCanvasCustomerRechargeRedemptions,
  redeemCanvasRechargeCode,
} from '../api'
import { formatCanvasDateTime, formatMoneyMinor } from '../formatters'
import type { CanvasCustomerRechargeRedemption } from '../types'
import { useServerTableState } from '../use-server-table-state'
import { CanvasServerTable } from './CanvasServerTable'
import { CustomerPointHistory } from './CustomerPointHistory'
import { CustomerRechargeCodeCard } from './CustomerRechargeCodeCard'

export type CustomerPointsView = 'redeem' | 'lots' | 'ledger'

export function CustomerPointsCenter(props: {
  view: CustomerPointsView
  onViewChange: (view: CustomerPointsView) => void
  initialOrderNumber?: string
  onOrderNumberChange?: (orderNumber?: string) => void
  onRedeemOrderNavigate?: (orderNumber: string) => void
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [orderNumber, setOrderNumber] = useState(props.initialOrderNumber ?? '')
  const [pendingHighlightOrderNumber, setPendingHighlightOrderNumber] =
    useState<string>()
  const [highlightedOrderNumber, setHighlightedOrderNumber] = useState<string>()
  const debouncedOrderNumber = useDebounce(orderNumber.trim(), 300)
  const redemptionsState = useServerTableState('redeemedAt')
  const setRedemptionsPagination = redemptionsState.setPagination
  const summary = useQuery({
    queryKey: ['canvas-cloud', 'customer', 'point-summary'],
    queryFn: ({ signal }) => getCanvasCustomerPointSummary(signal),
  })
  const redemptions = useQuery({
    queryKey: [
      'canvas-cloud',
      'customer',
      'recharge-redemptions',
      redemptionsState.query,
      debouncedOrderNumber,
    ],
    queryFn: ({ signal }) =>
      getCanvasCustomerRechargeRedemptions(
        {
          rechargeOrderNumber: debouncedOrderNumber || undefined,
          page: redemptionsState.query.page,
          pageSize: redemptionsState.query.pageSize,
          sortOrder: redemptionsState.query.sortOrder,
        },
        signal
      ),
    enabled: props.view === 'redeem',
  })
  useEffect(() => {
    setRedemptionsPagination((value) =>
      value.pageIndex === 0 ? value : { ...value, pageIndex: 0 }
    )
  }, [debouncedOrderNumber, setRedemptionsPagination])
  useEffect(() => {
    setOrderNumber(props.initialOrderNumber ?? '')
  }, [props.initialOrderNumber])
  useEffect(() => {
    if (
      !pendingHighlightOrderNumber ||
      redemptions.isFetching ||
      !redemptions.data
    ) {
      return
    }
    const target = redemptions.data.items.find(
      (item) => item.orderNumber === pendingHighlightOrderNumber
    )?.orderNumber
    setPendingHighlightOrderNumber(undefined)
    if (target) setHighlightedOrderNumber(target)
  }, [pendingHighlightOrderNumber, redemptions.data, redemptions.isFetching])
  useEffect(() => {
    if (!highlightedOrderNumber) return
    const timeout = window.setTimeout(
      () => setHighlightedOrderNumber(undefined),
      3_000
    )
    return () => window.clearTimeout(timeout)
  }, [highlightedOrderNumber])
  const redeem = useMutation({
    mutationFn: redeemCanvasRechargeCode,
    onSuccess: async (result) => {
      setCode('')
      setCodeError(null)
      setRedemptionsPagination((value) => ({ ...value, pageIndex: 0 }))
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['canvas-cloud', 'customer', 'point-summary'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['canvas-cloud', 'customer', 'recharge-redemptions'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['canvas-cloud', 'customer', 'point-lots'],
          refetchType: 'none',
        }),
        queryClient.invalidateQueries({
          queryKey: ['canvas-cloud', 'customer', 'point-ledger'],
          refetchType: 'none',
        }),
      ])
      setPendingHighlightOrderNumber(result.orderNumber)
      toast.success(
        t(
          'Redeemed successfully, paid points +{{paid}}, bonus points +{{bonus}}',
          { paid: result.purchasedPoints, bonus: result.bonusPoints }
        )
      )
    },
    onError: (error) => {
      const messageKey = getServerErrorMessageKey(error)
      setCodeError(
        t(
          messageKey ??
            'Unable to redeem this recharge code. Please verify the code and try again.'
        )
      )
    },
  })
  const formatPoints = useCallback(
    (value: string) =>
      new Intl.NumberFormat(toIntlLocale(i18n.language)).format(BigInt(value)),
    [i18n.language]
  )
  const refreshCurrentView = async () => {
    await summary.refetch()
    if (props.view === 'redeem') await redemptions.refetch()
    if (props.view === 'lots') {
      await queryClient.refetchQueries({
        queryKey: ['canvas-cloud', 'customer', 'point-lots'],
      })
    }
    if (props.view === 'ledger') {
      await queryClient.refetchQueries({
        queryKey: ['canvas-cloud', 'customer', 'point-ledger'],
      })
    }
  }
  const columns = useMemo<
    ColumnDef<CanvasCustomerRechargeRedemption, unknown>[]
  >(
    () => [
      {
        id: 'redeemedAt',
        accessorKey: 'redeemedAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Redeemed at')} />
        ),
        cell: ({ row }) => formatCanvasDateTime(row.original.redeemedAt),
      },
      { accessorKey: 'orderNumber', header: t('Recharge order') },
      {
        id: 'amount',
        header: t('Order amount'),
        cell: ({ row }) =>
          formatMoneyMinor(
            row.original.listedAmountMinor,
            row.original.currency
          ),
      },
      {
        accessorKey: 'issuedPaidPoints',
        header: t('Paid points'),
        cell: ({ row }) => formatPoints(row.original.issuedPaidPoints),
      },
      {
        accessorKey: 'issuedBonusPoints',
        header: t('Bonus points'),
        cell: ({ row }) => formatPoints(row.original.issuedBonusPoints),
      },
      { id: 'status', header: t('Status'), cell: () => t('Redeemed') },
    ],
    [formatPoints, t]
  )
  return (
    <div className='space-y-4'>
      <div className='flex justify-end'>
        <Button
          type='button'
          variant='outline'
          onClick={() => void refreshCurrentView()}
        >
          {t('Refresh')}
        </Button>
      </div>
      {summary.isPending ? <LoadingState /> : null}
      {summary.isError ? (
        <ErrorState
          title={t('Unable to load point summary')}
          onRetry={() => void summary.refetch()}
        />
      ) : null}
      {summary.data ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('Point summary')}</CardTitle>
          </CardHeader>
          <CardContent className='grid grid-cols-2 gap-4 lg:grid-cols-4'>
            {[
              ['Available points', summary.data.availablePoints],
              ['Paid points', summary.data.paidAvailablePoints],
              ['Bonus points', summary.data.bonusAvailablePoints],
              ['Outstanding points', summary.data.debtPoints],
            ].map(([label, value]) => (
              <div key={label}>
                <p className='text-muted-foreground text-sm'>{t(label)}</p>
                <p className='text-2xl font-semibold tabular-nums'>
                  {formatPoints(value)}
                </p>
              </div>
            ))}
            {BigInt(summary.data.debtPoints) > 0n ? (
              <p className='text-destructive col-span-full text-sm font-medium'>
                {t(
                  'New tasks cannot be submitted until the outstanding balance is cleared.'
                )}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      <Tabs
        value={props.view}
        onValueChange={(value) =>
          props.onViewChange(value as CustomerPointsView)
        }
      >
        <TabsList
          className='max-w-full overflow-x-auto'
          aria-label={t('Point center sections')}
        >
          <TabsTrigger value='redeem'>{t('Redeem points')}</TabsTrigger>
          <TabsTrigger value='lots'>{t('Point lots')}</TabsTrigger>
          <TabsTrigger value='ledger'>{t('Point changes')}</TabsTrigger>
        </TabsList>
        <TabsContent value='redeem' className='space-y-4'>
          <CustomerRechargeCodeCard
            code={code}
            error={codeError}
            redeeming={redeem.isPending}
            onCodeChange={(value) => {
              setCode(value)
              setCodeError(
                value.trim().length > 191
                  ? t('Use no more than 191 characters')
                  : null
              )
            }}
            onRedeem={() => redeem.mutate(code.trim())}
          />
          <CanvasServerTable
            data={redemptions.data?.items ?? []}
            columns={columns}
            total={redemptions.data?.total ?? 0}
            state={redemptionsState}
            loading={redemptions.isPending || redemptions.isFetching}
            error={redemptions.isError}
            onRetry={() => void redemptions.refetch()}
            emptyTitle={t('No redemption records')}
            filteredEmptyTitle={t('No matching results')}
            searchLabel={t('Recharge order')}
            additionalFilters={
              <Input
                value={orderNumber}
                aria-label={t('Recharge order')}
                placeholder={t('Recharge order')}
                onChange={(event) => setOrderNumber(event.target.value)}
              />
            }
            hasActiveFilters={Boolean(orderNumber)}
            onResetFilters={() => {
              setOrderNumber('')
              props.onOrderNumberChange?.(undefined)
            }}
            getRowId={(row) => row.orderNumber}
            getRowClassName={(row) =>
              row.original.orderNumber === highlightedOrderNumber
                ? 'bg-primary/10 transition-colors'
                : undefined
            }
          />
        </TabsContent>
        <TabsContent value='lots'>
          <CustomerPointHistory view='lots' />
        </TabsContent>
        <TabsContent value='ledger'>
          <CustomerPointHistory
            view='ledger'
            onOpenOrder={(_orderId, rechargeOrderNumber) => {
              props.onRedeemOrderNavigate?.(rechargeOrderNumber)
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
