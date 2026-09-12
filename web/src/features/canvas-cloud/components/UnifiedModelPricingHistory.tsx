/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef, Row } from '@tanstack/react-table'
import i18n from 'i18next'
import { Fragment, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTableColumnHeader, DataTableRow } from '@/components/data-table'
import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
import { Button } from '@/components/ui/button'
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
  cancelCanvasModelPricingSchedule,
  getCanvasModelPricingHistory,
  getCanvasModelPricingPublication,
} from '../api'
import { isCanvasDateRangeValid } from '../date-range'
import { formatCanvasDateTime } from '../formatters'
import {
  pricingLoadErrorTitle,
  pricingPublicationErrorTitle,
} from '../model-pricing-error'
import { pricingScopeLabel } from '../pricing-scope-label'
import {
  providerTokenCategories,
  providerTokenCategoryLabel,
} from '../provider-pricing'
import type {
  CanvasModelPricingDetail,
  CanvasModelPricingLegacyFacts,
  CanvasModelPricingPriceSnapshot,
  CanvasModelPricingPreview,
  CanvasModelPricingProviderRate,
  CanvasModelPricingPublication,
  CanvasModelPricingQuestionnaire,
  CanvasTokenCategoryAssumptions,
  CanvasTokenCategoryRisk,
} from '../types'
import { useServerTableState } from '../use-server-table-state'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import { CanvasServerTable } from './CanvasServerTable'
import { PricingActionConfirmation } from './PricingActionConfirmation'

type HistoryStatus = 'ALL' | CanvasModelPricingPublication['status']
type HistoryChange =
  | 'ALL'
  | NonNullable<CanvasModelPricingPublication['change']>

export function UnifiedModelPricingHistory(props: {
  modelId: string
  detail: CanvasModelPricingDetail | undefined
  initialPublicationId?: string
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const state = useServerTableState('effectiveAt')
  const [combinationId, setCombinationId] = useState('')
  const [priceGroupId, setPriceGroupId] = useState('')
  const [change, setChange] = useState<HistoryChange>('ALL')
  const [status, setStatus] = useState<HistoryStatus>('ALL')
  const [from, setFrom] = useState<Date>()
  const [to, setTo] = useState<Date>()
  const [expandedId, setExpandedId] = useState('')
  const [pendingCancellation, setPendingCancellation] =
    useState<CanvasModelPricingPublication>()
  const validRange = isCanvasDateRangeValid(from, to)
  const fromIso = validRange && from ? from.toISOString() : undefined
  const toIso = validRange && to ? to.toISOString() : undefined
  const history = useQuery({
    queryKey: [
      'canvas-cloud',
      'model-pricing',
      props.modelId,
      'history',
      state.query.page,
      state.query.pageSize,
      combinationId,
      priceGroupId,
      change,
      status,
      state.query.sortBy,
      state.query.sortOrder,
      fromIso,
      toIso,
    ],
    queryFn: () =>
      getCanvasModelPricingHistory(props.modelId, {
        page: state.query.page,
        pageSize: state.query.pageSize,
        ...(combinationId ? { combinationId } : {}),
        ...(priceGroupId ? { priceGroupId } : {}),
        ...(change === 'ALL' ? {} : { change }),
        ...(status === 'ALL' ? {} : { status }),
        sortBy: state.query.sortBy,
        sortDirection: state.query.sortOrder,
        ...(fromIso ? { from: fromIso } : {}),
        ...(toIso ? { to: toIso } : {}),
      }),
    enabled: Boolean(props.modelId) && validRange,
  })
  const focused = useQuery({
    queryKey: [
      'canvas-cloud',
      'model-pricing',
      'publication',
      props.initialPublicationId,
    ],
    queryFn: () =>
      getCanvasModelPricingPublication(props.initialPublicationId ?? ''),
    enabled: Boolean(props.initialPublicationId),
  })
  const cancellation = useMutation({
    mutationFn: (item: CanvasModelPricingPublication) =>
      cancelCanvasModelPricingSchedule(item.id),
    onSuccess: async () => {
      setPendingCancellation(undefined)
      toast.success(t('Scheduled pricing cancelled'))
      await client.invalidateQueries({
        queryKey: ['canvas-cloud', 'model-pricing', props.modelId, 'history'],
      })
    },
    onError: () => toast.error(t('Scheduled pricing could not be cancelled')),
  })
  const resetPage = () =>
    state.setPagination((value) => ({ ...value, pageIndex: 0 }))
  const combinationName = (id: string) => {
    const combination = props.detail?.model.combinations.find(
      (value) => value.id === id
    )
    if (combination) {
      return pricingScopeLabel(combination, t)
    }
    const scope = props.detail?.pricingScopes.find(
      (value) => value.parameterCombinationId === id
    )
    return pricingScopeLabel(
      scope
        ? { key: scope.combinationKey, parameters: scope.parameters }
        : undefined,
      t
    )
  }
  const groupName = (id: string | null) =>
    id === null
      ? t('Provider cost')
      : (props.detail?.priceGroups.find((value) => value.id === id)
          ?.internalName ?? t('Not recorded'))
  const columns: ColumnDef<CanvasModelPricingPublication, unknown>[] = [
    {
      id: 'effectiveAt',
      accessorFn: (item) => item.effectiveAt,
      meta: { label: t('Effective at') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Effective at')} />
      ),
      cell: ({ row }) => formatCanvasDateTime(row.original.effectiveAt),
    },
    {
      id: 'combination',
      header: t('Combination'),
      cell: ({ row }) =>
        scopes(row.original, (scope) => combinationName(scope.combinationId)),
    },
    {
      id: 'priceGroup',
      header: t('Price plan'),
      cell: ({ row }) =>
        scopes(row.original, (scope) => groupName(scope.priceGroupId)),
    },
    {
      id: 'change',
      header: t('Changes'),
      cell: ({ row }) => changeLabel(row.original, t),
    },
    {
      id: 'status',
      header: t('Status'),
      cell: ({ row }) => statusLabel(row.original.status, t) || '—',
    },
    {
      id: 'actions',
      header: t('Actions'),
      cell: ({ row }) => (
        <div className='flex flex-wrap items-center gap-2'>
          <Button
            variant='outline'
            aria-expanded={expandedId === row.original.id}
            onClick={(event) => {
              event.stopPropagation()
              setExpandedId((current) =>
                current === row.original.id ? '' : row.original.id
              )
            }}
          >
            {expandedId === row.original.id ? t('Collapse') : t('Details')}
          </Button>
          {row.original.source === 'UNIFIED' &&
          row.original.status === 'SCHEDULED' ? (
            <Button
              variant='outline'
              onClick={(event) => {
                event.stopPropagation()
                setPendingCancellation(row.original)
              }}
            >
              {t('Cancel schedule')}
            </Button>
          ) : null}
        </div>
      ),
    },
  ]
  const activeFilters = [
    combinationId,
    priceGroupId,
    change === 'ALL' ? '' : change,
    status === 'ALL' ? '' : status,
    from,
    to,
  ].filter(Boolean).length
  const renderExpandedContent = (row: Row<CanvasModelPricingPublication>) =>
    expandedId === row.original.id ? (
      <HistoryDetails
        item={row.original}
        combinationName={combinationName}
        groupName={groupName}
      />
    ) : null
  return (
    <div className='space-y-4 [&_[data-slot=card-field-label]]:text-sm [&_[data-slot=card-field-label]]:leading-normal [&_[data-slot=card-field-label]]:font-normal [&_[data-slot=card-field-value]]:text-sm'>
      {props.initialPublicationId ? (
        <FocusedRecord
          loading={focused.isPending}
          failed={focused.isError}
          error={focused.error}
          missing={
            !focused.isPending &&
            !focused.isError &&
            focused.data?.customerModelId !== props.modelId
          }
          item={
            focused.data?.customerModelId === props.modelId
              ? focused.data
              : undefined
          }
          onRetry={() => void focused.refetch()}
          combinationName={combinationName}
          groupName={groupName}
        />
      ) : null}
      {!validRange ? (
        <p role='alert' className='text-destructive text-sm'>
          {t('Start time must not be after end time')}
        </p>
      ) : null}
      {history.isError ? (
        <p role='alert'>
          {pricingLoadErrorTitle(history.error, t)}{' '}
          <Button variant='outline' onClick={() => void history.refetch()}>
            {t('Retry')}
          </Button>
        </p>
      ) : null}
      <CanvasServerTable
        data={validRange ? (history.data?.items ?? []) : []}
        columns={columns}
        total={validRange ? (history.data?.total ?? 0) : 0}
        state={state}
        loading={validRange && (history.isPending || history.isFetching)}
        emptyTitle={t('No model pricing history')}
        getRowId={(item) => item.id}
        renderExpandedContent={renderExpandedContent}
        hasActiveFilters={activeFilters > 0}
        activeFilterCount={activeFilters}
        onResetFilters={() => {
          setCombinationId('')
          setPriceGroupId('')
          setChange('ALL')
          setStatus('ALL')
          setFrom(undefined)
          setTo(undefined)
          resetPage()
        }}
        additionalFilters={
          <>
            <DataTableColumnFilterField label={t('Combination')}>
              <NativeSelect
                aria-label={t('Combination')}
                value={combinationId || 'ALL'}
                onChange={(event) => {
                  setCombinationId(
                    event.target.value === 'ALL' ? '' : event.target.value
                  )
                  resetPage()
                }}
              >
                <NativeSelectOption value='ALL'>
                  {t('All combinations')}
                </NativeSelectOption>
                {props.detail?.model.combinations.map((item) => (
                  <NativeSelectOption key={item.id} value={item.id}>
                    {combinationName(item.id)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </DataTableColumnFilterField>
            <DataTableColumnFilterField label={t('Price plan')}>
              <NativeSelect
                aria-label={t('Price plan')}
                value={priceGroupId || 'ALL'}
                onChange={(event) => {
                  setPriceGroupId(
                    event.target.value === 'ALL' ? '' : event.target.value
                  )
                  resetPage()
                }}
              >
                <NativeSelectOption value='ALL'>
                  {t('All price plans')}
                </NativeSelectOption>
                {props.detail?.priceGroups.map((item) => (
                  <NativeSelectOption key={item.id} value={item.id}>
                    {item.internalName}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </DataTableColumnFilterField>
            <DataTableColumnFilterField label={t('Changes')}>
              <NativeSelect
                aria-label={t('Changes')}
                value={change}
                onChange={(event) => {
                  setChange(event.target.value as HistoryChange)
                  resetPage()
                }}
              >
                <NativeSelectOption value='ALL'>
                  {t('All changes')}
                </NativeSelectOption>
                {['INITIAL', 'COST', 'PRICE', 'COST_AND_PRICE', 'UNIT'].map(
                  (value) => (
                    <NativeSelectOption key={value} value={value}>
                      {t(value)}
                    </NativeSelectOption>
                  )
                )}
              </NativeSelect>
            </DataTableColumnFilterField>
            <DataTableColumnFilterField label={t('Status')}>
              <NativeSelect
                aria-label={t('Status')}
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as HistoryStatus)
                  resetPage()
                }}
              >
                <NativeSelectOption value='ALL'>
                  {t('All statuses')}
                </NativeSelectOption>
                {['SCHEDULED', 'CURRENT', 'CANCELLED'].map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {t(value)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </DataTableColumnFilterField>
            <CanvasDateRangeFilter
              from={from}
              to={to}
              onFromChange={(value) => {
                setFrom(value)
                resetPage()
              }}
              onToChange={(value) => {
                setTo(value)
                resetPage()
              }}
            />
          </>
        }
        renderRow={(row) => (
          <Fragment key={row.id}>
            <DataTableRow
              row={row}
              cellRenderColumns={columns}
              aria-expanded={expandedId === row.original.id}
              className='cursor-pointer'
              onClick={() =>
                setExpandedId((current) =>
                  current === row.original.id ? '' : row.original.id
                )
              }
            />
            {expandedId === row.original.id ? (
              <TableRow>
                <TableCell
                  colSpan={row.getVisibleCells().length}
                  className='bg-muted/20 p-4'
                >
                  {renderExpandedContent(row)}
                </TableCell>
              </TableRow>
            ) : null}
          </Fragment>
        )}
      />
      <PricingActionConfirmation
        open={Boolean(pendingCancellation)}
        onOpenChange={(open) => {
          if (!open) setPendingCancellation(undefined)
        }}
        title={t('Cancel scheduled pricing')}
        description={t(
          'This only cancels the scheduled unified pricing publication.'
        )}
        details={[
          {
            label: t('Effective at'),
            value: formatCanvasDateTime(
              pendingCancellation?.effectiveAt ?? null
            ),
          },
        ]}
        confirmLabel={t('Cancel schedule')}
        destructive
        pending={cancellation.isPending}
        onConfirm={() => {
          if (pendingCancellation) cancellation.mutate(pendingCancellation)
        }}
      />
    </div>
  )
}

function FocusedRecord(props: {
  loading: boolean
  failed: boolean
  error: unknown
  missing: boolean
  item: CanvasModelPricingPublication | undefined
  onRetry: () => void
  combinationName: (id: string) => string
  groupName: (id: string | null) => string
}) {
  const { t } = useTranslation()
  if (props.loading) return <p>{t('Loading')}</p>
  if (props.failed) {
    return (
      <div className='space-y-2'>
        <p role='alert' className='text-destructive text-sm'>
          {pricingPublicationErrorTitle(props.error, t)}
        </p>
        <Button variant='outline' onClick={props.onRetry}>
          {t('Retry')}
        </Button>
      </div>
    )
  }
  if (props.missing) {
    return (
      <p role='alert' className='text-destructive text-sm'>
        {t('This pricing publication does not belong to the selected model.')}
      </p>
    )
  }
  if (!props.item) return null
  return (
    <section
      aria-label={t('Model pricing history details')}
      className='rounded-lg border p-4'
    >
      <HistoryDetails
        item={props.item}
        combinationName={props.combinationName}
        groupName={props.groupName}
      />
    </section>
  )
}
function HistoryDetails(props: {
  item: CanvasModelPricingPublication
  combinationName: (id: string) => string
  groupName: (id: string | null) => string
}) {
  const { t } = useTranslation()
  const scopeSummary = props.item.scopeSummary ?? []
  const combinationIds = [
    ...new Set(scopeSummary.map((scope) => scope.combinationId)),
  ]
  const hasActor = Boolean(props.item.actor.displayName)
  const hasReason = Boolean(props.item.decisionSummary?.trim())
  return (
    <div className='space-y-3 text-sm'>
      {hasActor || hasReason ? (
        <div className='space-y-1'>
          {hasActor ? (
            <p>
              <span className='text-muted-foreground'>{t('Operator')}: </span>
              {props.item.actor.displayName}
            </p>
          ) : null}
          {hasReason ? (
            <p>
              <span className='text-muted-foreground'>{t('Reason')}: </span>
              {props.item.decisionSummary}
            </p>
          ) : null}
        </div>
      ) : null}
      {props.item.source === 'UNIFIED' &&
      (!props.item.preview || !scopeSummary.length) ? (
        <p className='text-muted-foreground'>
          {t('No change snapshot recorded')}
        </p>
      ) : null}
      {props.item.source === 'UNIFIED' && props.item.preview
        ? combinationIds.map((combinationId) => {
            const entries = scopeSummary.filter(
              (scope) => scope.combinationId === combinationId
            )
            const previewScope = props.item.preview?.scopes.find(
              (scope) => scope.parameterCombinationId === combinationId
            )
            const prices = entries.filter(
              (scope, index) =>
                scope.priceGroupId !== null &&
                entries.findIndex(
                  (other) => other.priceGroupId === scope.priceGroupId
                ) === index
            )
            const multiplePlans = prices.length > 1
            return (
              <div className='space-y-3' key={combinationId}>
                {combinationIds.length > 1 || multiplePlans ? (
                  <p className='font-medium'>
                    {props.combinationName(combinationId)}
                  </p>
                ) : null}
                {!previewScope ? (
                  <p className='text-muted-foreground'>
                    {t('No change snapshot recorded')}
                  </p>
                ) : (
                  <>
                    {multiplePlans || prices.length === 0 ? (
                      <ScopeChanges
                        scope={previewScope}
                        priceGroupId={null}
                        changeKind={props.item.change ?? ''}
                        includeCost
                      />
                    ) : null}
                    {multiplePlans && previewScope.costChanged ? (
                      <PricingBasis
                        scope={previewScope}
                        priceGroupId={null}
                        pointIssuanceRate={undefined}
                        includeCost
                        publicationReason={props.item.decisionSummary}
                      />
                    ) : null}
                    {(prices.length ? prices : [entries[0]]).map((entry) => (
                      <div
                        key={entry.priceGroupId ?? 'cost'}
                        className='space-y-3'
                      >
                        {combinationIds.length > 1 || multiplePlans ? (
                          <p className='font-medium'>
                            {props.groupName(entry.priceGroupId)}
                          </p>
                        ) : null}
                        {prices.length ? (
                          <ScopeChanges
                            scope={previewScope}
                            priceGroupId={entry.priceGroupId}
                            changeKind={
                              props.item.change === 'INITIAL'
                                ? 'INITIAL'
                                : entry.changeKind
                            }
                            includeCost={!multiplePlans}
                          />
                        ) : null}
                        <PricingBasis
                          scope={previewScope}
                          priceGroupId={entry.priceGroupId}
                          pointIssuanceRate={
                            props.item.preview?.pointIssuanceRate
                          }
                          includeCost={!multiplePlans}
                          publicationReason={props.item.decisionSummary}
                        />
                      </div>
                    ))}
                  </>
                )}
              </div>
            )
          })
        : null}
      {props.item.source !== 'UNIFIED' ? (
        <LegacyFacts
          initial={
            props.item.source === 'LEGACY_PRICE' &&
            props.item.change === 'INITIAL'
          }
          source={props.item.source}
          before={props.item.before}
          after={props.item.after}
          publicationReason={props.item.decisionSummary}
        />
      ) : null}
    </div>
  )
}

function NoPricingBasis() {
  const { t } = useTranslation()
  return (
    <p className='text-muted-foreground'>{t('No pricing basis recorded')}</p>
  )
}

function PricingBasis(props: {
  scope: CanvasModelPricingPreview['scopes'][number]
  priceGroupId: string | null
  pointIssuanceRate: CanvasModelPricingPreview['pointIssuanceRate'] | undefined
  includeCost: boolean
  publicationReason?: string | null
}) {
  const { t } = useTranslation()
  const price = props.scope.prices.find(
    (value) => value.priceGroupId === props.priceGroupId
  )
  return (
    <details>
      <summary className='cursor-pointer text-sm font-medium'>
        {t('Pricing basis')}
      </summary>
      <div className='mt-3 space-y-2'>
        {props.includeCost && props.scope.costChanged ? (
          <LegacyProviderRateFacts facts={props.scope.proposedProviderRate} />
        ) : null}
        {price?.proposed?.questionnaire ? (
          <Questionnaire
            omitTokenFacts
            publicationReason={props.publicationReason}
            facts={price.proposed.questionnaire}
            billingUnit={price.proposed.billingUnit}
            tokenRates={price.proposed.tokenRates}
            tokenCategoryRisks={undefined}
          />
        ) : null}
        {price?.proposed?.billingUnit === 'MILLION_TOKENS' ? (
          <TokenCategoryAssumptionFacts
            assumptions={
              price.proposed.questionnaire?.tokenCategoryAssumptions ??
              price.proposed.assumptions?.tokenCategoryAssumptions
            }
            tokenRates={price.proposed.tokenRates}
            risks={price.proposed.assumptions?.tokenCategoryRisks}
          />
        ) : null}
        <PricingCalculation
          facts={price?.proposed?.calculation}
          pointIssuanceRate={props.pointIssuanceRate}
          token={price?.proposed?.billingUnit === 'MILLION_TOKENS'}
        />
        {!hasSavedBasis(price?.proposed?.questionnaire) &&
        !hasSavedBasis(price?.proposed?.calculation) &&
        !hasSavedBasis(
          price?.proposed?.assumptions?.tokenCategoryAssumptions
        ) &&
        !price?.proposed?.assumptions?.tokenCategoryRisks?.length &&
        !props.pointIssuanceRate &&
        !(
          props.includeCost &&
          hasProviderBasis(props.scope.proposedProviderRate)
        ) ? (
          <NoPricingBasis />
        ) : null}
      </div>
    </details>
  )
}
function ScopeChanges(props: {
  scope: CanvasModelPricingPreview['scopes'][number]
  priceGroupId: string | null
  changeKind: string
  includeCost: boolean
}) {
  const { t } = useTranslation()
  const price = props.scope.prices.find(
    (value) => value.priceGroupId === props.priceGroupId
  )
  const initial = props.changeKind === 'INITIAL'
  const costChanged = props.includeCost && props.scope.costChanged
  const priceChanged = Boolean(price?.changed)
  if (!costChanged && !priceChanged && !initial) return null
  if (initial) {
    return (
      <dl className='space-y-1 [&_dd]:inline [&_dt]:inline [&_dt]:after:content-[":_"]'>
        {costChanged ? (
          <div>
            <dt className='text-muted-foreground'>{t('Provider cost')}</dt>
            <dd>{providerSummary(props.scope.proposedProviderRate, t)}</dd>
          </div>
        ) : null}
        {priceChanged ? (
          <div>
            <dt className='text-muted-foreground'>{t('Customer price')}</dt>
            <dd>{priceSummary(price?.proposed, t)}</dd>
          </div>
        ) : null}
      </dl>
    )
  }
  const rows: Array<{ label: string; before: string; after: string }> = []
  if (costChanged) {
    rows.push({
      label: t('Provider cost'),
      before: providerSummary(props.scope.currentProviderRate, t),
      after: providerSummary(props.scope.proposedProviderRate, t),
    })
  }
  if (priceChanged) {
    rows.push({
      label: t('Customer price'),
      before: priceSummary(price?.current, t),
      after: priceSummary(price?.proposed, t),
    })
  }
  return <PricingChangesTable rows={rows} />
}

function PricingChangesTable(props: {
  rows: Array<{ label: string; before: string; after: string }>
}) {
  const { t } = useTranslation()
  return (
    <Table className='w-full table-fixed'>
      <TableHeader>
        <TableRow>
          <TableHead className='w-32'>{t('Pricing change field')}</TableHead>
          <TableHead>{t('Before adjustment')}</TableHead>
          <TableHead>{t('After adjustment')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className='[&>tr]:h-auto'>
        {props.rows.map((row) => (
          <TableRow key={row.label}>
            <TableCell className='py-2 whitespace-normal'>
              {row.label}
            </TableCell>
            <TableCell className='py-2 break-words whitespace-normal'>
              {row.before}
            </TableCell>
            <TableCell className='py-2 break-words whitespace-normal'>
              {row.after}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function Questionnaire(props: {
  facts: CanvasModelPricingQuestionnaire
  publicationReason?: string | null
  billingUnit: string
  tokenRates: CanvasModelPricingPriceSnapshot['tokenRates']
  tokenCategoryRisks: CanvasTokenCategoryRisk[] | undefined
  omitTokenFacts?: boolean
}) {
  const { t } = useTranslation()
  const tokenCategoryAssumptions = props.facts.tokenCategoryAssumptions
  const values: Array<
    [string, string | null | undefined, 'number' | 'percent' | 'text']
  > = [
    [t('Target margin rate'), props.facts.targetMarginRate, 'percent'],
    [t('Success probability'), props.facts.successProbability, 'percent'],
    [
      t('Questionnaire summary'),
      props.facts.decisionSummary?.trim() === props.publicationReason?.trim()
        ? undefined
        : props.facts.decisionSummary,
      'text',
    ],
    [t('Evidence references'), props.facts.evidenceRefs?.join(', '), 'text'],
  ]
  if (props.billingUnit !== 'MILLION_TOKENS') {
    values.splice(
      2,
      0,
      [t('Successful task cost'), props.facts.successfulTaskCostRmb, 'number'],
      [t('Failure cost'), props.facts.failedUnrecoverableCostRmb, 'number'],
      [t('Other variable cost'), props.facts.otherVariableCostRmb, 'number'],
      [t('Risk buffer'), props.facts.riskBufferRmb, 'number']
    )
  }
  return (
    <div>
      {values
        .filter(([, value]) => hasRecordedValue(value))
        .map(([label, value, kind]) => (
          <p key={label}>
            {label}: {questionnaireValue(value, kind, t)}
          </p>
        ))}
      {props.billingUnit === 'MILLION_TOKENS' && !props.omitTokenFacts ? (
        <TokenCategoryAssumptionFacts
          assumptions={tokenCategoryAssumptions}
          tokenRates={props.tokenRates}
          risks={props.tokenCategoryRisks}
        />
      ) : null}
    </div>
  )
}
function PricingCalculation(props: {
  token?: boolean
  facts: CanvasModelPricingPriceSnapshot['calculation'] | undefined
  pointIssuanceRate: CanvasModelPricingPreview['pointIssuanceRate'] | undefined
}) {
  const { t } = useTranslation()
  const values: Array<[string, string | undefined, 'rmb' | 'points' | 'rate']> =
    [
      [t('Point issuance rate'), props.pointIssuanceRate?.pointsPerRmb, 'rate'],
      [t('Pricing conversion rate'), props.facts?.baseRatePointsPerRmb, 'rate'],
      [t('Theoretical cost'), props.facts?.kTheoryRmb, 'rmb'],
      [t('Pricing cost'), props.facts?.kPricingRmb, 'rmb'],
      [t('Break-even price'), props.facts?.breakEvenPointsCeil, 'points'],
      [t('Target margin floor'), props.facts?.targetMarginPointsCeil, 'points'],
    ]
  const recorded = values.filter(
    ([, value, unit]) =>
      hasRecordedValue(value) && (!props.token || unit === 'rate')
  )
  if (!recorded.length) return null
  return (
    <div>
      {recorded.map(([label, value, unit]) => (
        <p key={label}>
          {label}: {formatBusinessNumber(value ?? '', 8)}{' '}
          {unit === 'rmb' ? t('RMB') : t('points')}
          {unit === 'rate' ? ` / ${t('RMB')}` : ''}
        </p>
      ))}
    </div>
  )
}
function TokenCategoryAssumptionFacts(props: {
  assumptions: CanvasTokenCategoryAssumptions | null | undefined
  tokenRates: CanvasModelPricingPriceSnapshot['tokenRates']
  risks: CanvasTokenCategoryRisk[] | undefined
}) {
  const { t } = useTranslation()
  const categories = providerTokenCategories.filter(
    (category) =>
      category in (props.tokenRates ?? {}) ||
      category in (props.assumptions ?? {}) ||
      props.risks?.some((risk) => risk.category === category)
  )
  return (
    <div className='space-y-1'>
      {categories.map((category) => {
        const assumption = props.assumptions?.[category]
        const risk = props.risks?.find((value) => value.category === category)
        return (
          <div key={category} className='space-y-1'>
            {assumption || risk ? (
              <p className='font-medium'>
                {t(providerTokenCategoryLabel[category])}
              </p>
            ) : null}
            {hasRecordedValue(assumption?.otherVariableCostRmb) ? (
              <p>
                {t('Other variable cost')}:{' '}
                {formatCny(assumption?.otherVariableCostRmb ?? '')} {t('RMB')} /{' '}
                {t('per million tokens')}
              </p>
            ) : null}
            {hasRecordedValue(assumption?.riskBufferRmb) ? (
              <p>
                {t('Risk buffer')}: {formatCny(assumption?.riskBufferRmb ?? '')}{' '}
                {t('RMB')} / {t('per million tokens')}
              </p>
            ) : null}
            {risk ? <TokenCategoryCalculationFacts risk={risk} /> : null}
          </div>
        )
      })}
    </div>
  )
}
function TokenCategoryCalculationFacts(props: {
  risk: CanvasTokenCategoryRisk
}) {
  const { t } = useTranslation()
  const values: Array<[string, string | undefined, 'cny' | 'points']> = [
    [t('Provider rate'), props.risk.providerRateRmb, 'cny'],
    [t('Customer price'), props.risk.customerRatePoints, 'points'],
    [
      t('Provider-cost break-even points'),
      props.risk.breakEvenPointsCeil,
      'points',
    ],
    [t('Theoretical cost'), props.risk.kTheoryRmb, 'cny'],
    [t('Pricing cost'), props.risk.kPricingRmb, 'cny'],
    [t('Break-even price'), props.risk.pricingBreakEvenPointsCeil, 'points'],
    [t('Target margin floor'), props.risk.targetMarginPointsCeil, 'points'],
    [t('Failure cost'), props.risk.failedUnrecoverableCostRmb, 'cny'],
    [
      t('Recommended price'),
      props.risk.recommendedCustomerRatePoints,
      'points',
    ],
  ]
  return (
    <div className='space-y-1'>
      {values
        .filter(([, value]) => hasRecordedValue(value))
        .map(([label, value, unit]) => (
          <p key={label}>
            {label}:{' '}
            {unit === 'cny'
              ? formatCny(value ?? '')
              : formatBusinessNumber(value ?? '', 8)}{' '}
            {unit === 'cny' ? t('RMB') : t('points')} /{' '}
            {t('per million tokens')}
          </p>
        ))}
    </div>
  )
}

function LegacyFacts(props: {
  initial: boolean
  source: CanvasModelPricingPublication['source']
  before?: CanvasModelPricingLegacyFacts | null
  after?: CanvasModelPricingLegacyFacts | null
  publicationReason?: string | null
}) {
  const { t } = useTranslation()
  const isPrice = props.source === 'LEGACY_PRICE'
  const label = isPrice ? t('Customer price') : t('Provider cost')
  const summary = isPrice ? legacyPriceSummary : legacyProviderSummary
  return (
    <div className='space-y-3'>
      <LegacyChange
        initial={isPrice && props.initial}
        label={label}
        before={summary(props.before, t)}
        after={summary(props.after, t)}
      />
      <details>
        <summary className='cursor-pointer text-sm font-medium'>
          {t('Pricing basis')}
        </summary>
        <div className='mt-3'>
          <LegacyVersionFacts
            publicationReason={props.publicationReason}
            facts={props.after}
            source={props.source}
          />
          {!hasLegacyBasis(props.after, props.source) &&
          hasLegacyBasis(props.before, props.source) ? (
            <div className='mt-3 space-y-1'>
              <p className='font-medium'>{t('Pricing basis before change')}</p>
              <LegacyVersionFacts
                publicationReason={props.publicationReason}
                facts={props.before}
                source={props.source}
              />
            </div>
          ) : null}
        </div>
      </details>
    </div>
  )
}
function LegacyChange(props: {
  initial: boolean
  label: string
  before: string
  after: string
}) {
  if (props.initial) {
    return (
      <dl className='space-y-1 [&_dd]:inline [&_dt]:inline [&_dt]:after:content-[":_"]'>
        <dt className='text-muted-foreground'>{props.label}</dt>
        <dd>{props.after}</dd>
      </dl>
    )
  }
  return (
    <PricingChangesTable
      rows={[{ label: props.label, before: props.before, after: props.after }]}
    />
  )
}

function LegacyVersionFacts(props: {
  facts: CanvasModelPricingLegacyFacts | null | undefined
  source: CanvasModelPricingPublication['source']
  publicationReason?: string | null
}) {
  if (!props.facts) {
    return <NoPricingBasis />
  }
  const isPrice = props.source === 'LEGACY_PRICE'
  if (!hasLegacyBasis(props.facts, props.source)) return <NoPricingBasis />
  return (
    <div className='space-y-1'>
      {isPrice ? (
        <>
          {props.facts.questionnaire ? (
            <Questionnaire
              publicationReason={props.publicationReason}
              facts={props.facts.questionnaire}
              billingUnit={props.facts.billingUnit ?? 'REQUEST'}
              tokenRates={props.facts.tokenRates ?? null}
              tokenCategoryRisks={undefined}
            />
          ) : null}
          <PricingCalculation
            facts={props.facts.calculation}
            pointIssuanceRate={undefined}
            token={props.facts.billingUnit === 'MILLION_TOKENS'}
          />
        </>
      ) : (
        <LegacyProviderRateFacts facts={props.facts} />
      )}
    </div>
  )
}
function hasSavedBasis(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasSavedBasis)
  if (value && typeof value === 'object') {
    return Object.values(value).some(hasSavedBasis)
  }
  return (
    typeof value === 'number' ||
    (typeof value === 'string' && value.trim().length > 0)
  )
}
function hasProviderBasis(
  facts:
    | CanvasModelPricingLegacyFacts
    | CanvasModelPricingProviderRate
    | null
    | undefined
) {
  return Boolean(
    facts &&
    ((facts.currency && facts.currency !== 'CNY') ||
      hasSavedBasis(facts.failureChargePolicy))
  )
}
function hasLegacyBasis(
  facts: CanvasModelPricingLegacyFacts | null | undefined,
  source: CanvasModelPricingPublication['source']
) {
  return source === 'LEGACY_PRICE'
    ? hasSavedBasis(facts?.questionnaire) || hasSavedBasis(facts?.calculation)
    : hasProviderBasis(facts)
}

function LegacyProviderRateFacts(props: {
  facts: CanvasModelPricingLegacyFacts | CanvasModelPricingProviderRate
}) {
  const { t } = useTranslation()
  const foreign = Boolean(
    props.facts.currency && props.facts.currency !== 'CNY'
  )
  const policy = props.facts.failureChargePolicy
  if (!foreign && !policy) return null
  return (
    <>
      {policy ? (
        <p>
          {t('Failure charge')}:{' '}
          {t(
            {
              NONE: 'No failed-attempt cost',
              SAME_AS_SUCCESS: 'Same as successful attempt',
              FIXED: 'Fixed failed-attempt cost',
            }[policy.mode]
          )}
          {policy.mode === 'FIXED' && hasRecordedValue(policy.nativeAmount)
            ? ` · ${formatBusinessNumber(policy.nativeAmount ?? '', 8)} ${props.facts.currency === 'CNY' ? t('RMB') : (props.facts.currency ?? '')}`
            : ''}
        </p>
      ) : null}
      {foreign && hasRecordedValue(props.facts.nativeAmount) ? (
        <p>
          {t('Native amount')}:{' '}
          {formatBusinessNumber(props.facts.nativeAmount ?? '', 8)}
        </p>
      ) : null}
      {foreign && props.facts.currency ? (
        <p>
          {t('Currency')}: {props.facts.currency}
        </p>
      ) : null}
      {foreign && props.facts.exchangeRateSnapshot ? (
        <p>
          {t('Exchange rate snapshot')}:{' '}
          {formatBusinessNumber(props.facts.exchangeRateSnapshot.rate, 8)} ·{' '}
          {props.facts.exchangeRateSnapshot.source} ·{' '}
          {formatCanvasDateTime(props.facts.exchangeRateSnapshot.asOf)}
        </p>
      ) : null}
    </>
  )
}
function scopes(
  item: CanvasModelPricingPublication,
  fn: (
    value: NonNullable<CanvasModelPricingPublication['scopeSummary']>[number]
  ) => string
) {
  return (item.scopeSummary ?? []).map(fn).join(', ') || '—'
}
function changeLabel(
  item: CanvasModelPricingPublication,
  t: (value: string) => string
) {
  if (item.change) return changeLabelFromCode(item.change, t)
  const values = (item.scopeSummary ?? []).map((scope) =>
    changeLabelFromCode(scope.changeKind, t)
  )
  return values.join(', ') || '—'
}
function changeLabelFromCode(value: string, t: (value: string) => string) {
  const keys: Record<string, string> = {
    INITIAL: 'Initial pricing',
    COST: 'Provider cost',
    PRICE: 'Customer price',
    COST_AND_PRICE: 'Provider cost and customer price',
    UNIT: 'Billing unit',
    KEEP: 'Customer price retained',
  }
  return keys[value] ? t(keys[value]) : t('Unknown')
}
function statusLabel(value: string, t: (value: string) => string) {
  const keys: Record<string, string> = {
    SCHEDULED: 'Scheduled',
    CANCELLED: 'Cancelled',
    CURRENT: 'Current',
  }
  return keys[value] ? t(keys[value]) : ''
}
function providerSummary(
  rate: CanvasModelPricingProviderRate | null,
  t: (value: string) => string
) {
  if (!rate) return t('Not recorded')
  const amount =
    rate.billingUnit === 'MILLION_TOKENS'
      ? tokenRateSummary(rate.tokenRates, t)
      : formatBusinessNumber(rate.nativeAmount, 8)
  return `${amount || t('Not recorded')} ${rate.currency === 'CNY' ? t('RMB') : rate.currency} / ${billingUnitLabel(rate.billingUnit, t)}`
}
function priceSummary(
  price: CanvasModelPricingPriceSnapshot | null | undefined,
  t: (value: string) => string
) {
  if (!price) return t('Not recorded')
  const amount =
    price.billingUnit === 'MILLION_TOKENS'
      ? tokenRateSummary(price.tokenRates, t)
      : formatBusinessNumber(price.points, 8)
  return `${amount || t('Not recorded')} ${t('Points')} / ${billingUnitLabel(price.billingUnit, t)}`
}
function legacyPriceSummary(
  facts: CanvasModelPricingLegacyFacts | null | undefined,
  t: (value: string) => string
) {
  if (!facts) return t('Not recorded')
  let amount: string | undefined
  if (facts.billingUnit === 'MILLION_TOKENS') {
    amount = tokenRateSummary(facts.tokenRates ?? null, t)
  } else if (hasRecordedValue(facts.points)) {
    amount = formatBusinessNumber(facts.points ?? '', 8)
  }
  return amount
    ? `${amount} ${t('Points')} / ${billingUnitLabel(facts.billingUnit, t)}`
    : t('Not recorded')
}
function legacyProviderSummary(
  facts: CanvasModelPricingLegacyFacts | null | undefined,
  t: (value: string) => string
) {
  if (!facts) return t('Not recorded')
  let amount: string | undefined
  if (facts.billingUnit === 'MILLION_TOKENS') {
    amount = tokenRateSummary(facts.tokenRates ?? null, t)
  } else if (hasRecordedValue(facts.nativeAmount)) {
    amount = formatBusinessNumber(facts.nativeAmount ?? '', 8)
  }
  return amount
    ? `${amount} ${facts.currency === 'CNY' ? t('RMB') : (facts.currency ?? '')} / ${billingUnitLabel(facts.billingUnit, t)}`
    : t('Not recorded')
}
function billingUnitLabel(value: string, t: (value: string) => string) {
  const keys: Record<string, string> = {
    REQUEST: 'per request',
    SECOND: 'per second',
    MILLION_TOKENS: 'per million tokens',
  }
  return keys[value] ? t(keys[value]) : t('Unknown')
}
function tokenRateSummary(
  rates: CanvasModelPricingProviderRate['tokenRates'],
  t: (value: string) => string
) {
  return rates
    ? Object.entries(rates)
        .filter(([, value]) => hasRecordedValue(value))
        .map(
          ([key, value]) =>
            `${providerTokenCategoryLabel[key as keyof typeof providerTokenCategoryLabel] ? t(providerTokenCategoryLabel[key as keyof typeof providerTokenCategoryLabel]) : t('Unknown')} ${formatBusinessNumber(value, 8)}`
        )
        .join(', ')
    : undefined
}

function hasRecordedValue(value: string | number | null | undefined) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}
function questionnaireValue(
  value: string | null | undefined,
  kind: 'number' | 'percent' | 'text',
  t: (value: string) => string
) {
  if (value === null || value === undefined || value === '') {
    return t('Not recorded')
  }
  if (kind === 'text') return value
  if (kind === 'percent') return `${formatBusinessPercentFromRate(value)}%`
  return `${formatCny(value)} ${t('RMB')}`
}
function formatCny(value: string | number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return String(value)
  return new Intl.NumberFormat(
    toIntlLocale(i18n.resolvedLanguage ?? i18n.language),
    { minimumFractionDigits: 2, maximumFractionDigits: 2 }
  ).format(numeric)
}
function formatBusinessNumber(
  value: string | number,
  maximumFractionDigits = 2
) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return String(value)
  return new Intl.NumberFormat(
    toIntlLocale(i18n.resolvedLanguage ?? i18n.language),
    { maximumFractionDigits }
  ).format(numeric)
}
function formatBusinessPercentFromRate(value: string) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return value
  return formatBusinessNumber(numeric * 100)
}
