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
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTableColumnHeader } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDebounce } from '@/hooks'
import { toIntlLocale } from '@/i18n/languages'

import { getCanvasAdminCustomers } from '../api'
import {
  getCanvasCampaigns,
  getCanvasCampaignTracking,
  grantCanvasCampaign,
  publishCanvasCampaign,
  saveCanvasCampaignDraft,
  stopCanvasCampaign,
} from '../campaign-api'
import type {
  CanvasCampaign,
  CanvasCampaignDraft,
  CanvasCampaignKind,
  CanvasCampaignStatus,
} from '../campaign-types'
import { formatCanvasDateTime } from '../formatters'
import {
  formatExactPointQuantity,
  formatExactRmbReference,
} from '../point-conversion-types'
import { useServerTableState } from '../use-server-table-state'
import { BusinessTermText } from './BusinessTerm'
import { CampaignForm } from './CampaignForm'
import { CanvasColumnFilterField } from './CanvasColumnFilterPanel'
import { CanvasServerTable } from './CanvasServerTable'
import { PricingActionConfirmation } from './PricingActionConfirmation'

const kinds: CanvasCampaignKind[] = [
  'RECHARGE_BONUS',
  'INVITE_BONUS',
  'MANUAL_BONUS',
  'TASK_PRICE_SPECIAL',
]
const statuses: CanvasCampaignStatus[] = [
  'DRAFT',
  'APPROVED',
  'ACTIVE',
  'STOPPED',
  'EXPIRED',
  'RETIRED',
]

export function CampaignManagement() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const state = useServerTableState('createdAt')
  const [kind, setKind] = useState<CanvasCampaignKind | ''>('')
  const [status, setStatus] = useState<CanvasCampaignStatus | ''>('')
  const [selected, setSelected] = useState<CanvasCampaign | null>(null)
  const [publishCandidate, setPublishCandidate] = useState<{
    id: string
    previewHash: string
    campaign: CanvasCampaign
  } | null>(null)
  const [stopCandidate, setStopCandidate] = useState<CanvasCampaign | null>(
    null
  )
  const [stopReason, setStopReason] = useState('')
  const [reviewStop, setReviewStop] = useState(false)
  const campaigns = useQuery({
    queryKey: [
      'canvas-cloud',
      'admin',
      'point-campaigns',
      state.query,
      kind,
      status,
    ],
    queryFn: ({ signal }) =>
      getCanvasCampaigns(
        {
          ...state.query,
          ...(kind ? { kind } : {}),
          ...(status ? { status } : {}),
        },
        signal
      ),
  })
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ['canvas-cloud', 'admin', 'point-campaigns'],
    })
  const save = useMutation({
    mutationFn: saveCanvasCampaignDraft,
    onSuccess: (result, variables) => {
      setPublishCandidate({
        id: result.id,
        previewHash: result.previewHash,
        campaign: {
          id: result.id,
          promotionId: variables.promotionId ?? variables.versionId ?? '',
          version: 1,
          name: variables.draft.name,
          kind: variables.draft.kind,
          status: 'DRAFT',
          startsAt: variables.draft.startsAt,
          endsAt: variables.draft.endsAt,
          createdAt: '',
          actorName: '',
          draft: variables.draft,
          preview: result.preview,
          previewHash: result.previewHash,
          usage: { participants: '0', points: '0', reference: '0' },
        },
      })
      refresh()
    },
    onError: () => toast.error(t('Unable to save point campaign')),
  })
  const publish = useMutation({
    mutationFn: (candidate: { id: string; previewHash: string }) =>
      publishCanvasCampaign(candidate.id, candidate.previewHash),
    onSuccess: () => {
      setPublishCandidate(null)
      refresh()
    },
    onError: () => toast.error(t('Unable to publish point campaign')),
  })
  const stop = useMutation({
    mutationFn: (candidate: { id: string; reason: string }) =>
      stopCanvasCampaign(candidate.id, candidate.reason),
    onSuccess: () => {
      setStopCandidate(null)
      setStopReason('')
      setReviewStop(false)
      refresh()
    },
    onError: () => toast.error(t('Unable to stop point campaign')),
  })

  const columns = useMemo<ColumnDef<CanvasCampaign, unknown>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Campaign')} />
        ),
        meta: { label: t('Campaign') },
        cell: ({ row }) => (
          <button
            type='button'
            className='text-primary text-left underline-offset-4 hover:underline'
            onClick={() => setSelected(row.original)}
          >
            {row.original.name}
          </button>
        ),
      },
      {
        id: 'kind',
        accessorKey: 'kind',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Campaign kind')} />
        ),
        meta: { label: t('Campaign kind') },
        cell: ({ row }) => t(row.original.kind),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Status')} />
        ),
        meta: { label: t('Status') },
        cell: ({ row }) => t(row.original.status),
      },
      {
        id: 'startsAt',
        accessorKey: 'startsAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Starts at')} />
        ),
        meta: { label: t('Starts at') },
        cell: ({ row }) => formatCanvasDateTime(row.original.startsAt),
      },
      {
        id: 'endsAt',
        accessorKey: 'endsAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Ends at')} />
        ),
        meta: { label: t('Ends at') },
        cell: ({ row }) => formatCanvasDateTime(row.original.endsAt),
      },
    ],
    [t]
  )

  const selectedId = selected?.id
  const trackingState = useServerTableState('acceptedAt')
  const tracking = useQuery({
    queryKey: [
      'canvas-cloud',
      'admin',
      'point-campaign-tracking',
      selectedId,
      trackingState.query.page,
      trackingState.query.pageSize,
    ],
    queryFn: ({ signal }) =>
      selectedId
        ? getCanvasCampaignTracking(
            selectedId,
            {
              page: trackingState.query.page,
              pageSize: trackingState.query.pageSize,
            },
            signal
          )
        : Promise.reject(new Error('Campaign selection is required')),
    enabled: Boolean(selectedId),
  })
  const canEdit =
    selected?.status === 'DRAFT' && selected.kind !== 'TASK_PRICE_SPECIAL'
  const handleSave = (
    draft: CanvasCampaignDraft,
    campaign: CanvasCampaign | null
  ) => {
    if (campaign?.id) {
      save.mutate({ draft, versionId: campaign.id })
      return
    }
    if (campaign?.promotionId) {
      save.mutate({ draft, promotionId: campaign.promotionId })
      return
    }
    save.mutate({ draft })
  }

  return (
    <div className='space-y-4'>
      <CanvasServerTable
        data={campaigns.data?.items ?? []}
        columns={columns}
        total={campaigns.data?.total ?? 0}
        state={state}
        searchLabel={t('Campaign')}
        loading={campaigns.isPending || campaigns.isFetching}
        emptyTitle={t('No point campaigns')}
        additionalFilters={
          <>
            <CanvasColumnFilterField label={t('Campaign kind')}>
              <Select
                value={kind || 'ALL'}
                onValueChange={(value) => {
                  setKind(value === 'ALL' ? '' : (value as CanvasCampaignKind))
                  state.setPagination((current) => ({
                    ...current,
                    pageIndex: 0,
                  }))
                }}
              >
                <SelectTrigger aria-label={t('Campaign kind')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>{t('All campaign kinds')}</SelectItem>
                  {kinds.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CanvasColumnFilterField>
            <CanvasColumnFilterField label={t('Status')}>
              <Select
                value={status || 'ALL'}
                onValueChange={(value) => {
                  setStatus(
                    value === 'ALL' ? '' : (value as CanvasCampaignStatus)
                  )
                  state.setPagination((current) => ({
                    ...current,
                    pageIndex: 0,
                  }))
                }}
              >
                <SelectTrigger aria-label={t('Status')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>{t('All statuses')}</SelectItem>
                  {statuses.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CanvasColumnFilterField>
          </>
        }
        hasActiveFilters={Boolean(kind || status)}
        activeFilterCount={[state.search, kind, status].filter(Boolean).length}
        onResetFilters={() => {
          setKind('')
          setStatus('')
          state.setSearch('')
          state.setSorting([{ id: 'createdAt', desc: true }])
        }}
        getRowId={(item) => item.id}
      />
      <CampaignForm
        campaign={canEdit ? selected : null}
        saving={save.isPending}
        onSave={handleSave}
      />
      {selected ? (
        <CampaignDetail
          campaign={selected}
          tracking={tracking.data}
          loading={tracking.isPending}
          trackingError={tracking.isError}
          trackingState={trackingState}
          onNewVersion={() =>
            setSelected({
              ...selected,
              status: 'DRAFT',
              id: '',
              draft: selected.draft,
            })
          }
          onStop={() => setStopCandidate(selected)}
          onPublish={() =>
            selected.id &&
            selected.previewHash &&
            setPublishCandidate({
              id: selected.id,
              previewHash: selected.previewHash,
              campaign: selected,
            })
          }
        />
      ) : null}
      <PricingActionConfirmation
        open={Boolean(publishCandidate)}
        onOpenChange={(open) => {
          if (!open && !publish.isPending) setPublishCandidate(null)
        }}
        title={t('Publish point campaign')}
        description={t(
          'Publishing applies the reviewed plan. Actual participation and grants remain separately tracked.'
        )}
        details={
          publishCandidate
            ? [
                { label: t('Campaign'), value: publishCandidate.campaign.name },
                {
                  label: t('Version'),
                  value: String(publishCandidate.campaign.version),
                },
                {
                  label: t('Bonus points'),
                  value: publishCandidate.campaign.draft?.bonusPoints ?? '—',
                },
                {
                  label: t('Point budget'),
                  value: publishCandidate.campaign.draft?.pointBudget ?? '—',
                },
                {
                  label: t('Recharge amount (minor RMB)'),
                  value:
                    publishCandidate.campaign.draft?.rechargeAmountMinor ?? '—',
                },
                {
                  label: t('Reference budget (minor RMB)'),
                  value:
                    publishCandidate.campaign.draft?.referenceBudgetMinor ??
                    '—',
                },
                {
                  label: t('Maximum participations'),
                  value:
                    publishCandidate.campaign.draft?.maxParticipants ?? '—',
                },
                {
                  label: t('Starts at'),
                  value: formatCanvasDateTime(
                    publishCandidate.campaign.startsAt
                  ),
                },
                {
                  label: t('Ends at'),
                  value: formatCanvasDateTime(publishCandidate.campaign.endsAt),
                },
                {
                  label: t('Planned participations'),
                  value:
                    publishCandidate.campaign.preview?.plannedParticipants ??
                    '—',
                },
              ]
            : []
        }
        confirmLabel={t('Publish campaign')}
        pending={publish.isPending}
        onConfirm={() => {
          if (publishCandidate) publish.mutate(publishCandidate)
        }}
      />
      <div className='flex flex-wrap items-end gap-2'>
        {stopCandidate ? (
          <>
            <div>
              <label
                className='text-sm font-medium'
                htmlFor='campaign-stop-reason'
              >
                {t('Stop reason')}
              </label>
              <Input
                id='campaign-stop-reason'
                value={stopReason}
                onChange={(event) => setStopReason(event.target.value)}
              />
            </div>
            <Button
              type='button'
              variant='destructive'
              disabled={!stopReason.trim()}
              onClick={() => setReviewStop(true)}
            >
              {t('Review stop')}
            </Button>
          </>
        ) : null}
      </div>
      <PricingActionConfirmation
        open={reviewStop}
        onOpenChange={(open) => {
          if (!open && !stop.isPending) setReviewStop(false)
        }}
        title={t('Stop point campaign')}
        description={t(
          'Stopping prevents new campaign admissions while preserving existing history.'
        )}
        details={[
          { label: t('Campaign'), value: stopCandidate?.name ?? '' },
          { label: t('Reason'), value: stopReason },
        ]}
        confirmLabel={t('Stop campaign')}
        destructive
        pending={stop.isPending}
        onConfirm={() => {
          if (stopCandidate) {
            stop.mutate({ id: stopCandidate.id, reason: stopReason })
          }
        }}
      />
    </div>
  )
}

function CampaignDetail(props: {
  campaign: CanvasCampaign
  tracking: Awaited<ReturnType<typeof getCanvasCampaignTracking>> | undefined
  loading: boolean
  trackingError: boolean
  trackingState: ReturnType<typeof useServerTableState<'acceptedAt'>>
  onNewVersion: () => void
  onPublish: () => void
  onStop: () => void
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [customerId, setCustomerId] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const debouncedCustomerSearch = useDebounce(customerSearch.trim(), 300)
  const [grantCandidate, setGrantCandidate] = useState<string | null>(null)
  const customers = useQuery({
    queryKey: [
      'canvas-cloud',
      'admin',
      'campaign-grant-customers',
      debouncedCustomerSearch,
    ],
    queryFn: ({ signal }) =>
      getCanvasAdminCustomers(
        {
          status: 'ACTIVE',
          pageSize: 20,
          ...(debouncedCustomerSearch
            ? { username: debouncedCustomerSearch }
            : {}),
          sortBy: 'customer',
          sortOrder: 'asc',
        },
        signal
      ),
  })
  const grant = useMutation({
    mutationFn: () => grantCanvasCampaign(props.campaign.id, customerId),
    onSuccess: () => {
      setCustomerId('')
      setGrantCandidate(null)
      queryClient.invalidateQueries({
        queryKey: [
          'canvas-cloud',
          'admin',
          'point-campaign-tracking',
          props.campaign.id,
        ],
      })
    },
    onError: () => toast.error(t('Unable to grant campaign bonus')),
  })
  const manual =
    props.campaign.kind === 'MANUAL_BONUS' && props.campaign.status === 'ACTIVE'
  const admissionBudgetExhausted = (() => {
    const draft = props.campaign.draft
    if (!draft) return false
    try {
      return (
        BigInt(props.campaign.usage.participants) >=
          BigInt(draft.maxParticipants) ||
        BigInt(props.campaign.usage.points) + BigInt(draft.bonusPoints) >
          BigInt(draft.pointBudget)
      )
    } catch {
      return false
    }
  })()
  const renderAdmissionStatus = useCallback(
    (admission: NonNullable<typeof props.tracking>['admissions'][number]) => {
      if (admission.orderStatus) {
        return (
          <BusinessTermText
            kind='rechargeOrderStatus'
            value={admission.orderStatus}
          />
        )
      }
      if (admission.inviteStatus) {
        return t(`Invite status ${admission.inviteStatus}`)
      }
      if (admission.billingStatus) {
        return (
          <BusinessTermText
            kind='billingStatus'
            value={admission.billingStatus}
          />
        )
      }
      return '—'
    },
    [t]
  )
  const admissionColumns = useMemo<
    ColumnDef<
      NonNullable<typeof props.tracking>['admissions'][number],
      unknown
    >[]
  >(
    () => [
      {
        id: 'acceptedAt',
        accessorKey: 'acceptedAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Issued at')} />
        ),
        cell: ({ row }) => formatCanvasDateTime(row.original.acceptedAt),
      },
      {
        id: 'customer',
        header: t('Customer'),
        cell: ({ row }) => row.original.customerName ?? '—',
      },
      {
        id: 'operator',
        header: t('Operator'),
        cell: ({ row }) => row.original.actorName ?? '—',
      },
      {
        id: 'order',
        header: t('Order'),
        cell: ({ row }) =>
          row.original.orderNumber ? (
            <span className='font-mono'>{row.original.orderNumber}</span>
          ) : (
            '—'
          ),
      },
      {
        id: 'orderStatus',
        header: t('Status'),
        cell: ({ row }) => renderAdmissionStatus(row.original),
      },
      {
        id: 'rechargeCodeStatus',
        header: t('Recharge code status'),
        cell: ({ row }) =>
          row.original.rechargeCodeStatus ? (
            <BusinessTermText
              kind='rechargeCodeStatus'
              value={row.original.rechargeCodeStatus}
            />
          ) : (
            '—'
          ),
      },
      {
        id: 'task',
        header: t('Task'),
        cell: ({ row }) => row.original.taskId ?? '—',
      },
      {
        id: 'bonusPoints',
        header: t('Bonus points'),
        cell: ({ row }) =>
          formatExactPointQuantity(
            row.original.bonusPoints,
            toIntlLocale(i18n.language)
          ),
      },
      {
        id: 'discountPoints',
        header: t('Discount points'),
        cell: ({ row }) =>
          row.original.discountPoints
            ? formatExactPointQuantity(
                row.original.discountPoints,
                toIntlLocale(i18n.language)
              )
            : '—',
      },
    ],
    [i18n.language, renderAdmissionStatus, t]
  )
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('Campaign details')}: {props.campaign.name}
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-3'>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Plans are assumptions. The tracking values below are actual issued, available, reserved, and admission records.'
          )}
        </p>
        <div className='grid gap-3 sm:grid-cols-3'>
          <DetailValue
            label={t('Actual issued points')}
            value={
              props.tracking
                ? formatExactPointQuantity(
                    props.tracking.totals.issuedPoints,
                    toIntlLocale(i18n.language)
                  )
                : '—'
            }
          />
          <DetailValue
            label={t('Actual available points')}
            value={
              props.tracking
                ? formatExactPointQuantity(
                    props.tracking.totals.availablePoints,
                    toIntlLocale(i18n.language)
                  )
                : '—'
            }
          />
          <DetailValue
            label={t('Actual reserved points')}
            value={
              props.tracking
                ? formatExactPointQuantity(
                    props.tracking.totals.reservedPoints,
                    toIntlLocale(i18n.language)
                  )
                : '—'
            }
          />
        </div>
        <div className='grid gap-3 sm:grid-cols-3'>
          <DetailValue
            label={t('Actual participations')}
            value={
              props.campaign.draft
                ? `${formatExactPointQuantity(props.campaign.usage.participants, toIntlLocale(i18n.language))} / ${props.campaign.draft.maxParticipants}`
                : formatExactPointQuantity(
                    props.campaign.usage.participants,
                    toIntlLocale(i18n.language)
                  )
            }
          />
          <DetailValue
            label={t('Actual used points')}
            value={
              props.campaign.draft
                ? `${formatExactPointQuantity(props.campaign.usage.points, toIntlLocale(i18n.language))} / ${props.campaign.draft.pointBudget}`
                : formatExactPointQuantity(
                    props.campaign.usage.points,
                    toIntlLocale(i18n.language)
                  )
            }
          />
          <DetailValue
            label={t('Actual used reference (minor RMB)')}
            value={
              props.campaign.draft
                ? `${props.campaign.usage.reference} / ${props.campaign.draft.referenceBudgetMinor}`
                : props.campaign.usage.reference
            }
          />
        </div>
        {props.campaign.kind === 'TASK_PRICE_SPECIAL' ? (
          <div className='grid gap-3 sm:grid-cols-3'>
            <DetailValue
              label={t('Actual settled points')}
              value={
                props.tracking
                  ? formatExactPointQuantity(
                      props.tracking.taskTotals.settledPoints,
                      toIntlLocale(i18n.language)
                    )
                  : '—'
              }
            />
            <DetailValue
              label={t('Actual released points')}
              value={
                props.tracking
                  ? formatExactPointQuantity(
                      props.tracking.taskTotals.releasedPoints,
                      toIntlLocale(i18n.language)
                    )
                  : '—'
              }
            />
            <DetailValue
              label={t('Actual task RMB reference')}
              value={
                props.tracking
                  ? `RMB ${formatExactRmbReference(
                      props.tracking.taskTotals.referenceAmountRmb,
                      toIntlLocale(i18n.language)
                    )}`
                  : '—'
              }
            />
          </div>
        ) : null}
        <div className='flex flex-wrap gap-2'>
          {props.campaign.id &&
          props.campaign.status === 'DRAFT' &&
          props.campaign.previewHash ? (
            <Button type='button' onClick={props.onPublish}>
              {t('Publish campaign')}
            </Button>
          ) : null}
          {props.campaign.status === 'ACTIVE' ? (
            <Button type='button' variant='destructive' onClick={props.onStop}>
              {t('Stop campaign')}
            </Button>
          ) : null}
          {props.campaign.status !== 'DRAFT' &&
          props.campaign.kind !== 'TASK_PRICE_SPECIAL' ? (
            <Button
              type='button'
              variant='outline'
              onClick={props.onNewVersion}
            >
              {t('Create new version')}
            </Button>
          ) : null}
        </div>
        {manual && admissionBudgetExhausted ? (
          <p role='alert' className='text-destructive text-sm'>
            {t('Admission budget exhausted')}
          </p>
        ) : null}
        {manual && !admissionBudgetExhausted ? (
          <div className='flex flex-wrap items-end gap-2 rounded-md border p-3'>
            <div className='min-w-56 flex-1'>
              <label className='text-sm font-medium'>{t('Customer')}</label>
              <Input
                value={customerSearch}
                onChange={(event) => setCustomerSearch(event.target.value)}
                placeholder={t('Search active customers')}
                aria-label={t('Search active customers')}
              />
              <Select
                value={customerId}
                onValueChange={(value) => setCustomerId(value ?? '')}
              >
                <SelectTrigger aria-label={t('Customer')}>
                  <SelectValue placeholder={t('Select an active customer')} />
                </SelectTrigger>
                <SelectContent>
                  {(customers.data?.items ?? []).map((customer) => (
                    <SelectItem
                      key={customer.customerId}
                      value={customer.customerId}
                    >
                      {customer.username ?? customer.customerId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {customers.isError ? (
                <p role='alert' className='text-destructive mt-1 text-sm'>
                  {t('Unable to load active customers')}
                </p>
              ) : null}
            </div>
            <Button
              type='button'
              disabled={!customerId || grant.isPending}
              onClick={() => setGrantCandidate(customerId)}
            >
              {t('Review campaign grant')}
            </Button>
          </div>
        ) : null}
        {props.loading ? (
          <p className='text-muted-foreground text-sm'>
            {t('Loading tracking')}
          </p>
        ) : null}
        {props.trackingError ? (
          <p role='alert' className='text-destructive text-sm'>
            {t('Unable to load campaign tracking')}
          </p>
        ) : null}
        <PricingActionConfirmation
          open={Boolean(grantCandidate)}
          onOpenChange={(open) => {
            if (!open && !grant.isPending) setGrantCandidate(null)
          }}
          title={t('Grant campaign bonus')}
          description={t(
            'This grants the campaign bonus to the selected active customer and records it in the campaign history.'
          )}
          details={[
            { label: t('Campaign'), value: props.campaign.name },
            {
              label: t('Customer'),
              value:
                (customers.data?.items ?? []).find(
                  (customer) => customer.customerId === grantCandidate
                )?.username ?? '',
            },
          ]}
          confirmLabel={t('Grant campaign bonus')}
          pending={grant.isPending}
          onConfirm={() => {
            if (grantCandidate) grant.mutate()
          }}
        />
        {props.tracking?.events.length ? (
          <div className='grid gap-2 text-sm'>
            {props.tracking.events.map((event) => (
              <div
                key={event.eventType}
                className='flex justify-between rounded border p-2'
              >
                <span>{t(event.eventType)}</span>
                <span className='tabular-nums'>
                  {formatExactPointQuantity(
                    event.points,
                    toIntlLocale(i18n.language)
                  )}{' '}
                  · RMB{' '}
                  {formatExactRmbReference(
                    event.referenceAmountRmb,
                    toIntlLocale(i18n.language)
                  )}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        {props.tracking ? (
          <div className='space-y-2'>
            <h3 className='font-medium'>{t('Campaign admissions')}</h3>
            <CanvasServerTable
              data={props.tracking.admissions ?? []}
              columns={admissionColumns}
              total={props.tracking.total}
              state={props.trackingState}
              loading={props.loading}
              emptyTitle={t('No campaign admissions')}
              getRowId={(admission) => admission.id}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function DetailValue(props: { label: string; value: string }) {
  return (
    <div>
      <div className='text-muted-foreground text-xs'>{props.label}</div>
      <div className='mt-1 font-medium tabular-nums'>{props.value}</div>
    </div>
  )
}
