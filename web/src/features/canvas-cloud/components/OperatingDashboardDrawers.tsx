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
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader } from '@/components/data-table'
import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
import {
  sideDrawerContentClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import {
  getOperatingDashboardBalances,
  getOperatingDashboardCosts,
  getProviderBalances,
  getOperatingDashboardFlows,
} from '../operating-dashboard-api'
import type {
  DashboardBalanceRow,
  DashboardBalanceState,
  DashboardCostRow,
  DashboardFlowRow,
  DashboardFlowSubType,
  DashboardFlowType,
  DashboardGroupRowFilter,
  DashboardScopeQuery,
  PointSourceCategory,
  ProviderCostIncompleteReason,
} from '../operating-dashboard-types'
import { useDashboardFormatters } from '../use-dashboard-formatters'
import { useServerTableState } from '../use-server-table-state'
import { AdminTaskRecordDetails } from './AdminTaskRecordDetails'
import { CanvasServerTable } from './CanvasServerTable'
import { CopyableText } from './CopyableText'
import { CustomerRecordDetails } from './CustomerRecordDetails'
import {
  ALL_OPTION_VALUE,
  DashboardModelSelect,
  type DashboardSelectOption,
} from './DashboardSearchSelect'
import {
  ProviderCostRevocationDialog,
  ProviderCostSettlementDialog,
} from './ProviderCostSettlementDialogs'

export interface DashboardDrawerScope extends DashboardScopeQuery {
  /** Period end; drawers read up to it so their totals match the page. */
  to: string
  asOf: string
  periodLabel: string
}

export type DashboardDrawerRequest =
  | {
      kind: 'balance'
      scope: DashboardDrawerScope
      at: 'OPENING' | 'CLOSING'
      state?: DashboardBalanceState
      expiringWithinDays?: number
    }
  | ({
      kind: 'flow'
      scope: DashboardDrawerScope
      flowType: DashboardFlowType
      sourceCategory?: PointSourceCategory
      graceOnly?: boolean
    } & DashboardGroupRowFilter)
  | ({
      kind: 'cost'
      scope: DashboardDrawerScope
      costState: 'ALL' | 'RECORDED' | 'INCOMPLETE'
    } & DashboardGroupRowFilter)

/** A drawer request before the page adds its scope. */
export type DashboardDrawerPreset = DashboardDrawerRequest extends infer Request
  ? Request extends DashboardDrawerRequest
    ? Omit<Request, 'scope'>
    : never
  : never

const sourceLabels: Record<PointSourceCategory, string> = {
  PURCHASED: 'Purchased points',
  RECHARGE_BONUS: 'Recharge bonus',
  INDEPENDENT_BONUS: 'Independent bonus',
}
const stateLabels: Record<DashboardBalanceState, string> = {
  AVAILABLE: 'Available for new tasks',
  RESERVED_VALID: 'Reserved by tasks',
  RESERVED_EXPIRED: 'Expired awaiting settlement',
}
const flowTypeLabels: Record<DashboardFlowType, string> = {
  ISSUED: 'Point increase',
  CONSUMED: 'Point consumption',
  EXPIRED: 'Point expiry',
  OTHER_DECREASE: 'Other decreases',
}
const subTypeLabels: Record<DashboardFlowSubType, string> = {
  RECHARGE_PURCHASE: 'Recharge redemption',
  RECHARGE_BONUS: 'Recharge bonus',
  MANUAL_OR_CAMPAIGN: 'Manual or campaign grant',
  INVITE_BONUS: 'Invitation bonus',
  REISSUE: 'Reissue',
  TASK_SETTLE: 'Task deduction',
  DEBT_REPAYMENT: 'Debt repayment',
  EXPIRED_AT_DEADLINE: 'Expired at deadline',
  EXPIRED_AFTER_RELEASE: 'Expired after release',
  POINT_RETURN: 'Point return',
  MANUAL_DEDUCTION: 'Manual deduction',
  CLAWBACK: 'Historical clawback',
}
const subTypesByFlow: Record<DashboardFlowType, DashboardFlowSubType[]> = {
  ISSUED: [
    'RECHARGE_PURCHASE',
    'RECHARGE_BONUS',
    'MANUAL_OR_CAMPAIGN',
    'INVITE_BONUS',
    'REISSUE',
  ],
  CONSUMED: ['TASK_SETTLE', 'DEBT_REPAYMENT'],
  EXPIRED: ['EXPIRED_AT_DEADLINE', 'EXPIRED_AFTER_RELEASE'],
  OTHER_DECREASE: ['POINT_RETURN', 'MANUAL_DEDUCTION', 'CLAWBACK'],
}
const costStateLabels = {
  RECORDED: 'Recorded',
  SETTLED: 'Settled manually',
  INCOMPLETE: 'Incomplete cost data',
} as const
const incompleteReasonLabels: Record<ProviderCostIncompleteReason, string> = {
  MISSING_USAGE: 'Missing complete usage',
  MISSING_RATE: 'Missing purchase rate',
  UNKNOWN_RESULT: 'Call result unknown',
  UNCLASSIFIED: 'Unclassified',
}
const ALL = '__all__'
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

function scopeParams(
  scope: DashboardDrawerScope
): DashboardScopeQuery & { to: string } {
  return {
    from: scope.from,
    to: scope.to,
    timeZone: scope.timeZone,
    ...(scope.agentPrincipalId
      ? { agentPrincipalId: scope.agentPrincipalId }
      : {}),
    ...(scope.noAgent ? { noAgent: true } : {}),
    ...(scope.customerId ? { customerId: scope.customerId } : {}),
  }
}

function groupRowParams(
  request: DashboardGroupRowFilter
): DashboardGroupRowFilter {
  return Object.fromEntries(
    Object.entries({
      modelKey: request.modelKey,
      providerId: request.providerId,
      tagId: request.tagId,
      untagged: request.untagged,
      capability: request.capability,
      untypedCapability: request.untypedCapability,
    }).filter(([, value]) => value !== undefined)
  )
}

function EnumFilter<T extends string>(props: {
  id: string
  label: string
  value: T | undefined
  allLabel: string
  options: Array<[T, string]>
  onChange: (value: T | undefined) => void
}) {
  const { t } = useTranslation()
  return (
    <DataTableColumnFilterField label={props.label} htmlFor={props.id}>
      <Select
        value={props.value ?? ALL}
        onValueChange={(value) =>
          props.onChange(value === ALL ? undefined : (value as T))
        }
      >
        <SelectTrigger id={props.id}>
          <SelectValue>
            {(value: string) =>
              value === ALL
                ? props.allLabel
                : t(
                    props.options.find(([option]) => option === value)?.[1] ??
                      value
                  )
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{props.allLabel}</SelectItem>
          {props.options.map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {t(label)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </DataTableColumnFilterField>
  )
}

/** Task ID filter: accepts a complete Task ID only, so a partial value never reaches the server. */
function TaskIdFilter(props: {
  id: string
  value: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const invalid =
    props.value.trim() !== '' && !uuidPattern.test(props.value.trim())
  return (
    <DataTableColumnFilterField label={t('Task ID')} htmlFor={props.id}>
      <Input
        id={props.id}
        value={props.value}
        placeholder={t('Task ID')}
        aria-invalid={invalid}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {invalid ? (
        <p className='text-destructive mt-1 text-xs'>
          {t('Enter a complete task ID')}
        </p>
      ) : null}
    </DataTableColumnFilterField>
  )
}

/** Model condition of a drawer: starts from the grouped row's model and can be changed to any model or cleared. */
function useModelFilter(presetModelKey: string | undefined) {
  const { t } = useTranslation()
  const preset: DashboardSelectOption = presetModelKey
    ? { value: presetModelKey, label: presetModelKey }
    : { value: ALL_OPTION_VALUE, label: t('All models') }
  const [option, setOption] = useState(preset)
  const modelKey = option.value === ALL_OPTION_VALUE ? undefined : option.value
  return {
    option,
    setOption,
    modelKey,
    changed: modelKey !== presetModelKey,
    reset: () => setOption(preset),
  }
}

function TaskLink(props: {
  taskId: string
  onOpen: (taskId: string, trigger: HTMLElement) => void
}) {
  // A shortened ID keeps the row on one line; the full ID is the accessible name, the hover title and what is copied.
  return (
    <span className='inline-flex items-center gap-0.5 whitespace-nowrap'>
      <button
        type='button'
        title={props.taskId}
        aria-label={props.taskId}
        className='text-primary focus-visible:ring-ring/50 rounded-sm font-mono text-xs underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none'
        onClick={(event) => props.onOpen(props.taskId, event.currentTarget)}
      >
        {props.taskId.slice(0, 8)}…{props.taskId.slice(-4)}
      </button>
      <CopyableText value={props.taskId} hideValue />
    </span>
  )
}

function LotLink(props: {
  lotId: string
  customerId: string
  onOpen: OpenLot
}) {
  return (
    <span className='inline-flex min-w-0 items-center gap-1'>
      <button
        type='button'
        className='text-primary focus-visible:ring-ring/50 truncate rounded-sm text-start underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none'
        onClick={(event) =>
          props.onOpen(props.lotId, props.customerId, event.currentTarget)
        }
      >
        {props.lotId}
      </button>
      <CopyableText value={props.lotId} hideValue />
    </span>
  )
}

type OpenLot = (lotId: string, customerId: string, trigger: HTMLElement) => void

function BalanceDrawer(props: {
  request: Extract<DashboardDrawerRequest, { kind: 'balance' }>
  onOpenTask: (taskId: string, trigger: HTMLElement) => void
  onOpenLot: OpenLot
}) {
  const { t } = useTranslation()
  const format = useDashboardFormatters()
  const id = useId()
  const preset = props.request
  const state = useServerTableState<
    'points' | 'cashSupport' | 'expiresAt' | 'customer'
  >('points')
  const [balanceState, setBalanceState] = useState(preset.state)
  const [sourceCategory, setSourceCategory] = useState<PointSourceCategory>()
  const filtersActive =
    balanceState !== preset.state || sourceCategory !== undefined
  const query = useQuery({
    queryKey: [
      'canvas-cloud',
      'operating-dashboard',
      'balances',
      preset,
      balanceState,
      sourceCategory,
      state.query,
    ],
    queryFn: ({ signal }) =>
      getOperatingDashboardBalances(
        {
          ...scopeParams(preset.scope),
          at: preset.at,
          ...(balanceState ? { state: balanceState } : {}),
          ...(sourceCategory ? { sourceCategory } : {}),
          ...(preset.expiringWithinDays
            ? { expiringWithinDays: preset.expiringWithinDays }
            : {}),
          page: state.query.page,
          pageSize: state.query.pageSize,
          sortBy: state.query.sortBy,
          sortOrder: state.query.sortOrder,
        },
        signal
      ),
    placeholderData: (previous) => previous,
  })
  const summary = query.data?.summary
  const columns: ColumnDef<DashboardBalanceRow, unknown>[] = [
    {
      id: 'customer',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Customer')} />
      ),
      enableHiding: false,
      cell: ({ row }) => row.original.customerName ?? t('Unknown customer'),
    },
    {
      id: 'lotId',
      header: t('Lot ID'),
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <LotLink
          lotId={row.original.lotId}
          customerId={row.original.customerId}
          onOpen={props.onOpenLot}
        />
      ),
    },
    {
      id: 'source',
      header: t('Point source'),
      enableSorting: false,
      cell: ({ row }) =>
        row.original.sourceCategory
          ? t(sourceLabels[row.original.sourceCategory])
          : t('Source cannot be classified'),
    },
    {
      id: 'grace',
      header: t('Grace conversion'),
      enableSorting: false,
      cell: ({ row }) => (row.original.graceConverted ? t('Yes') : t('No')),
    },
    {
      id: 'state',
      header: t('Status'),
      enableSorting: false,
      cell: ({ row }) => t(stateLabels[row.original.state]),
    },
    {
      id: 'points',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Points')} />
      ),
      enableHiding: false,
      cell: ({ row }) => (
        <span className='tabular-nums'>
          {format.points(row.original.points)}
        </span>
      ),
    },
    {
      id: 'cashSupport',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('Corresponding recharge amount')}
        />
      ),
      cell: ({ row }) => (
        <span className='tabular-nums'>
          {format.rmb(row.original.cashSupportRmb)}
        </span>
      ),
    },
    {
      id: 'expiresAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Expires at')} />
      ),
      cell: ({ row }) =>
        row.original.expiresAt
          ? format.dateTime(row.original.expiresAt)
          : t('Never expires'),
    },
  ]
  return (
    <div className='space-y-3'>
      <div className='space-y-1 text-sm'>
        <p>
          {t('Statistics time')}{' '}
          {format.dateTime(
            query.data?.at ??
              (preset.at === 'OPENING' ? preset.scope.from : preset.scope.to)
          )}
        </p>
        {summary ? (
          <>
            <p className='tabular-nums'>
              {t('Point balance {{points}} · recharge amount {{amount}}', {
                points: format.points(summary.points),
                amount: format.rmb(summary.cashSupportRmb),
              })}
            </p>
            <p className='text-muted-foreground tabular-nums'>
              {t('Available for new tasks {{points}}', {
                points: format.points(summary.available),
              })}{' '}
              ·{' '}
              {t('Reserved by tasks {{points}}', {
                points: format.points(summary.reservedValid),
              })}{' '}
              ·{' '}
              {t('Expired awaiting settlement {{points}}', {
                points: format.points(summary.reservedExpired),
              })}
            </p>
          </>
        ) : null}
      </div>
      <CanvasServerTable
        data={query.data?.items ?? []}
        columns={columns}
        total={query.data?.total ?? 0}
        state={state}
        loading={query.isFetching}
        error={query.isError}
        onRetry={() => void query.refetch()}
        emptyTitle={t('No records')}
        getRowId={(row) => `${row.lotId}:${row.state}`}
        initialColumnVisibility={{ grace: false }}
        hasActiveFilters={filtersActive}
        activeFilterCount={
          (balanceState !== preset.state ? 1 : 0) + (sourceCategory ? 1 : 0)
        }
        onResetFilters={() => {
          setBalanceState(preset.state)
          setSourceCategory(undefined)
        }}
        additionalFilters={
          <>
            <EnumFilter
              id={`${id}-source`}
              label={t('Point source')}
              allLabel={t('All point sources')}
              value={sourceCategory}
              options={
                Object.entries(sourceLabels) as Array<
                  [PointSourceCategory, string]
                >
              }
              onChange={setSourceCategory}
            />
            <EnumFilter
              id={`${id}-state`}
              label={t('Status')}
              allLabel={t('All statuses')}
              value={balanceState}
              options={
                Object.entries(stateLabels) as Array<
                  [DashboardBalanceState, string]
                >
              }
              onChange={setBalanceState}
            />
          </>
        }
      />
    </div>
  )
}

function FlowDrawer(props: {
  request: Extract<DashboardDrawerRequest, { kind: 'flow' }>
  onOpenTask: (taskId: string, trigger: HTMLElement) => void
  onOpenLot: OpenLot
}) {
  const { t } = useTranslation()
  const format = useDashboardFormatters()
  const id = useId()
  const preset = props.request
  const state = useServerTableState<'occurredAt' | 'points'>('occurredAt')
  const [flowType, setFlowType] = useState(preset.flowType)
  const [subType, setSubType] = useState<DashboardFlowSubType>()
  const [sourceCategory, setSourceCategory] = useState(preset.sourceCategory)
  const [graceOnly, setGraceOnly] = useState(Boolean(preset.graceOnly))
  const model = useModelFilter(preset.modelKey)
  const [taskId, setTaskId] = useState('')
  const validTaskId = uuidPattern.test(taskId.trim())
    ? taskId.trim()
    : undefined
  const activeCount =
    (flowType !== preset.flowType ? 1 : 0) +
    (subType ? 1 : 0) +
    (sourceCategory !== preset.sourceCategory ? 1 : 0) +
    (graceOnly !== Boolean(preset.graceOnly) ? 1 : 0) +
    (model.changed ? 1 : 0) +
    (validTaskId ? 1 : 0)
  const query = useQuery({
    queryKey: [
      'canvas-cloud',
      'operating-dashboard',
      'flows',
      preset,
      flowType,
      subType,
      sourceCategory,
      graceOnly,
      model.modelKey,
      validTaskId,
      state.query,
    ],
    queryFn: ({ signal }) =>
      getOperatingDashboardFlows(
        {
          ...scopeParams(preset.scope),
          ...(flowType === 'CONSUMED'
            ? groupRowParams({ ...preset, modelKey: model.modelKey })
            : {}),
          flowType,
          ...(subType ? { subType } : {}),
          ...(sourceCategory ? { sourceCategory } : {}),
          ...(graceOnly ? { graceOnly: true } : {}),
          ...(validTaskId && flowType === 'CONSUMED'
            ? { taskId: validTaskId }
            : {}),
          page: state.query.page,
          pageSize: state.query.pageSize,
          sortBy: state.query.sortBy,
          sortOrder: state.query.sortOrder,
        },
        signal
      ),
    placeholderData: (previous) => previous,
  })
  const related = (row: DashboardFlowRow): ReactNode => {
    if (row.taskId) {
      return (
        <span className='flex min-w-0 flex-col'>
          <TaskLink taskId={row.taskId} onOpen={props.onOpenTask} />
          <span className='text-muted-foreground truncate text-xs'>
            {row.modelName}
          </span>
        </span>
      )
    }
    if (row.subType === 'POINT_RETURN') {
      return (
        <span className='flex min-w-0 flex-col'>
          {row.pointReturnId ? (
            <CopyableText value={row.pointReturnId} />
          ) : null}
          {row.refundReferenceAmountMinor ? (
            <span className='text-muted-foreground text-xs'>
              {t('Refund reference amount {{amount}}', {
                amount: format.rmb(
                  (Number(row.refundReferenceAmountMinor) / 100).toFixed(2)
                ),
              })}
            </span>
          ) : null}
        </span>
      )
    }
    if (row.flowType === 'EXPIRED') {
      return row.lotExpiresAt
        ? t('Original expiry {{time}}', {
            time: format.dateTime(row.lotExpiresAt),
          })
        : '—'
    }
    if (row.rechargeOrderNumber) {
      return <CopyableText value={row.rechargeOrderNumber} />
    }
    return [row.reason, row.operatorName].filter(Boolean).join(' · ') || '—'
  }
  const columns: ColumnDef<DashboardFlowRow, unknown>[] = [
    {
      id: 'occurredAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Occurred at')} />
      ),
      enableHiding: false,
      cell: ({ row }) => format.dateTime(row.original.occurredAt),
    },
    {
      id: 'customer',
      header: t('Customer'),
      enableSorting: false,
      cell: ({ row }) => row.original.customerName ?? t('Unknown customer'),
    },
    {
      id: 'flowType',
      header: t('Flow type'),
      enableSorting: false,
      cell: ({ row }) => t(flowTypeLabels[row.original.flowType]),
    },
    {
      id: 'subType',
      header: t('Specific type'),
      enableSorting: false,
      cell: ({ row }) => t(subTypeLabels[row.original.subType]),
    },
    {
      id: 'points',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Points')} />
      ),
      enableHiding: false,
      cell: ({ row }) => (
        <span className='tabular-nums'>
          {format.points(row.original.points)}
        </span>
      ),
    },
    {
      id: 'cashSupport',
      header: t('Corresponding recharge amount'),
      enableSorting: false,
      cell: ({ row }) => (
        <span className='tabular-nums'>
          {format.rmb(row.original.cashSupportRmb)}
        </span>
      ),
    },
    {
      id: 'source',
      header: t('Point source / lot'),
      enableSorting: false,
      cell: ({ row }) => (
        <span className='flex min-w-0 flex-col'>
          <span>
            {row.original.sourceCategory
              ? t(sourceLabels[row.original.sourceCategory])
              : t('Source cannot be classified')}
            {row.original.graceConverted ? ` · ${t('Grace conversion')}` : ''}
          </span>
          <LotLink
            lotId={row.original.lotId}
            customerId={row.original.customerId}
            onOpen={props.onOpenLot}
          />
        </span>
      ),
    },
    {
      id: 'related',
      header: t('Related business'),
      enableSorting: false,
      cell: ({ row }) => related(row.original),
    },
  ]
  return (
    <div className='space-y-3'>
      <div className='space-y-1 text-sm'>
        <p>
          {t('Statistics time')} {preset.scope.periodLabel}
        </p>
        {query.data ? (
          <p className='tabular-nums'>
            {t('Flow type')}: {t(flowTypeLabels[flowType])} ·{' '}
            {t('{{points}} points', {
              points: format.points(query.data.summary.points),
            })}{' '}
            ·{' '}
            {t('Recharge amount {{amount}}', {
              amount: format.rmb(query.data.summary.cashSupportRmb),
            })}
          </p>
        ) : null}
      </div>
      <CanvasServerTable
        data={query.data?.items ?? []}
        columns={columns}
        total={query.data?.total ?? 0}
        state={state}
        loading={query.isFetching}
        error={query.isError}
        onRetry={() => void query.refetch()}
        emptyTitle={t('No records')}
        getRowId={(row) => row.id}
        hasActiveFilters={activeCount > 0}
        activeFilterCount={activeCount}
        onResetFilters={() => {
          setFlowType(preset.flowType)
          setSubType(undefined)
          setSourceCategory(preset.sourceCategory)
          setGraceOnly(Boolean(preset.graceOnly))
          model.reset()
          setTaskId('')
        }}
        additionalFilters={
          <>
            <EnumFilter
              id={`${id}-flow`}
              label={t('Flow type')}
              allLabel={t(flowTypeLabels[flowType])}
              value={flowType}
              options={
                Object.entries(flowTypeLabels) as Array<
                  [DashboardFlowType, string]
                >
              }
              onChange={(value) => {
                setFlowType(value ?? preset.flowType)
                setSubType(undefined)
              }}
            />
            <EnumFilter
              id={`${id}-sub`}
              label={t('Specific type')}
              allLabel={t('All specific types')}
              value={subType}
              options={subTypesByFlow[flowType].map((value) => [
                value,
                subTypeLabels[value],
              ])}
              onChange={setSubType}
            />
            <EnumFilter
              id={`${id}-source`}
              label={t('Point source')}
              allLabel={t('All point sources')}
              value={sourceCategory}
              options={
                Object.entries(sourceLabels) as Array<
                  [PointSourceCategory, string]
                >
              }
              onChange={setSourceCategory}
            />
            <DataTableColumnFilterField
              label={t('Grace conversion')}
              htmlFor={`${id}-grace`}
            >
              <label className='flex h-8 items-center gap-2 text-sm'>
                <Checkbox
                  id={`${id}-grace`}
                  checked={graceOnly}
                  onCheckedChange={(checked) => setGraceOnly(checked === true)}
                />
                {t('Grace conversion only')}
              </label>
            </DataTableColumnFilterField>
            {flowType === 'CONSUMED' ? (
              <>
                <DataTableColumnFilterField
                  label={t('Model')}
                  htmlFor={`${id}-model`}
                >
                  <DashboardModelSelect
                    id={`${id}-model`}
                    value={model.option}
                    onChange={model.setOption}
                  />
                </DataTableColumnFilterField>
                <TaskIdFilter
                  id={`${id}-task`}
                  value={taskId}
                  onChange={setTaskId}
                />
              </>
            ) : null}
          </>
        }
      />
    </div>
  )
}

function CostDrawer(props: {
  request: Extract<DashboardDrawerRequest, { kind: 'cost' }>
  onOpenTask: (taskId: string, trigger: HTMLElement) => void
}) {
  const { t } = useTranslation()
  const format = useDashboardFormatters()
  const id = useId()
  const preset = props.request
  const state = useServerTableState<'occurredAt' | 'amount'>('occurredAt')
  const [costState, setCostState] = useState(preset.costState)
  const [reason, setReason] = useState<ProviderCostIncompleteReason>()
  const [costEvent, setCostEvent] = useState<
    'CHARGE' | 'REFUND' | 'ADJUSTMENT'
  >()
  const model = useModelFilter(preset.modelKey)
  const [providerId, setProviderId] = useState(preset.providerId)
  const providers = useQuery({
    queryKey: ['canvas-cloud', 'provider-balances', 'options'],
    queryFn: ({ signal }) =>
      getProviderBalances(
        { page: 1, pageSize: 100, sortBy: 'name', sortOrder: 'asc' },
        signal
      ),
    staleTime: 60_000,
  })
  const [taskId, setTaskId] = useState('')
  const [settleRow, setSettleRow] = useState<DashboardCostRow>()
  const [revokeRow, setRevokeRow] = useState<DashboardCostRow>()
  const validTaskId = uuidPattern.test(taskId.trim())
    ? taskId.trim()
    : undefined
  const activeCount =
    (costState !== preset.costState ? 1 : 0) +
    (reason ? 1 : 0) +
    (costEvent ? 1 : 0) +
    (model.changed ? 1 : 0) +
    (providerId !== preset.providerId ? 1 : 0) +
    (validTaskId ? 1 : 0)
  const query = useQuery({
    queryKey: [
      'canvas-cloud',
      'operating-dashboard',
      'costs',
      preset,
      costState,
      reason,
      costEvent,
      model.modelKey,
      providerId,
      validTaskId,
      state.query,
    ],
    queryFn: ({ signal }) =>
      getOperatingDashboardCosts(
        {
          ...scopeParams(preset.scope),
          ...groupRowParams({
            ...preset,
            modelKey: model.modelKey,
            providerId,
          }),
          costState,
          ...(reason ? { incompleteReason: reason } : {}),
          ...(costEvent ? { costEvent } : {}),
          ...(validTaskId ? { taskId: validTaskId } : {}),
          page: state.query.page,
          pageSize: state.query.pageSize,
          sortBy: state.query.sortBy,
          sortOrder: state.query.sortOrder,
        },
        signal
      ),
    placeholderData: (previous) => previous,
  })
  const summary = query.data?.summary
  const columns: ColumnDef<DashboardCostRow, unknown>[] = [
    {
      id: 'occurredAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Cost recorded at')} />
      ),
      enableHiding: false,
      cell: ({ row }) => (
        <span className='whitespace-nowrap tabular-nums'>
          {format.dateTime(row.original.occurredAt)}
        </span>
      ),
    },
    {
      id: 'task',
      header: t('Task ID'),
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <TaskLink taskId={row.original.taskId} onOpen={props.onOpenTask} />
      ),
    },
    {
      id: 'model',
      header: t('Model'),
      enableSorting: false,
      cell: ({ row }) => row.original.modelName ?? row.original.modelKey,
    },
    {
      // One column for the cost state: an amount when recorded, the reason when incomplete.
      id: 'amount',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Cost information')} />
      ),
      enableHiding: false,
      cell: ({ row }) => {
        if (row.original.costState === 'INCOMPLETE') {
          return (
            <span className='text-amber-700 dark:text-amber-400'>
              {t(
                incompleteReasonLabels[
                  row.original.incompleteReason ?? 'UNCLASSIFIED'
                ]
              )}
            </span>
          )
        }
        return (
          <span className='whitespace-nowrap tabular-nums'>
            {format.rmb(row.original.amountRmb ?? '0')}
            {row.original.costState === 'SETTLED' ? (
              <span className='text-muted-foreground'>
                {' '}
                · {t(costStateLabels.SETTLED)}
              </span>
            ) : null}
          </span>
        )
      },
    },
    {
      id: 'actions',
      header: t('Actions'),
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        if (row.original.canSettle) {
          return (
            <Button
              type='button'
              variant='link'
              className='h-auto p-0 whitespace-nowrap'
              onClick={() => setSettleRow(row.original)}
            >
              {t('Settle cost')}
            </Button>
          )
        }
        if (!row.original.canRevoke) return null
        return (
          <Button
            type='button'
            variant='link'
            className='h-auto p-0 whitespace-nowrap'
            onClick={() => setRevokeRow(row.original)}
          >
            {t('Revoke settlement')}
          </Button>
        )
      },
    },
    {
      id: 'customer',
      header: t('Customer'),
      enableSorting: false,
      cell: ({ row }) => row.original.customerName ?? t('Unknown customer'),
    },
    {
      id: 'costId',
      header: t('Cost ID'),
      enableSorting: false,
      cell: ({ row }) =>
        row.original.costId ? (
          <CopyableText value={row.original.costId} />
        ) : (
          '—'
        ),
    },
    {
      id: 'callId',
      header: t('Call ID'),
      enableSorting: false,
      cell: ({ row }) =>
        row.original.callId ? (
          <CopyableText value={row.original.callId} />
        ) : (
          '—'
        ),
    },
    {
      id: 'classification',
      header: t('Cost classification'),
      enableSorting: false,
      cell: ({ row }) => row.original.classification ?? '—',
    },
    {
      id: 'original',
      header: t('Original currency amount'),
      enableSorting: false,
      cell: ({ row }) =>
        row.original.signedAmount
          ? `${row.original.currency} ${row.original.signedAmount}`
          : '—',
    },
    {
      id: 'exchangeRate',
      header: t('Exchange rate snapshot'),
      enableSorting: false,
      cell: ({ row }) => row.original.exchangeRate ?? '—',
    },
    {
      id: 'channel',
      header: t('Provider channel'),
      enableSorting: false,
      cell: ({ row }) =>
        [row.original.providerName, row.original.channelCode]
          .filter(Boolean)
          .join(' / ') || '—',
    },
    {
      id: 'costSource',
      header: t('Cost source'),
      enableSorting: false,
      cell: ({ row }) => {
        if (row.original.costSource === 'MANUAL_SETTLEMENT') {
          return [
            t('Manual settlement'),
            row.original.settledBy,
            row.original.settlementReason,
          ]
            .filter(Boolean)
            .join(' · ')
        }
        return row.original.costSource === 'SYSTEM'
          ? t('System calculation')
          : '—'
      },
    },
  ]
  return (
    <div className='space-y-3'>
      <div className='space-y-1 text-sm'>
        <p>
          {t('Statistics time')} {preset.scope.periodLabel}
        </p>
        {summary ? (
          <p className='tabular-nums'>
            {[
              // The recorded part shows whenever it is the filter, or when it is non-zero or the only part left.
              costState === 'RECORDED' ||
              (costState === 'ALL' &&
                (Number(summary.recordedCostRmb) !== 0 ||
                  summary.incompleteCostTaskCount === 0))
                ? t('Recorded cost {{amount}}', {
                    amount: format.rmb(summary.recordedCostRmb),
                  })
                : null,
              costState !== 'RECORDED' && summary.incompleteCostTaskCount > 0
                ? t(
                    summary.unknownResultTaskCount > 0
                      ? 'Incomplete cost data {{count}} tasks (of which {{unknown}} with unknown call result)'
                      : 'Incomplete cost data {{count}} tasks',
                    {
                      count: summary.incompleteCostTaskCount,
                      unknown: summary.unknownResultTaskCount,
                    }
                  )
                : null,
            ]
              .filter(Boolean)
              .join(' · ') || t('No records')}
          </p>
        ) : null}
      </div>
      <CanvasServerTable
        data={query.data?.items ?? []}
        columns={columns}
        total={query.data?.total ?? 0}
        state={state}
        loading={query.isFetching}
        error={query.isError}
        onRetry={() => void query.refetch()}
        emptyTitle={t('No records')}
        getRowId={(row) => `${row.costState}:${row.id}`}
        initialColumnVisibility={{
          customer: false,
          costId: false,
          callId: false,
          classification: false,
          original: false,
          exchangeRate: false,
          channel: false,
          costSource: false,
        }}
        hasActiveFilters={activeCount > 0}
        activeFilterCount={activeCount}
        onResetFilters={() => {
          setCostState(preset.costState)
          setReason(undefined)
          setCostEvent(undefined)
          model.reset()
          setProviderId(preset.providerId)
          setTaskId('')
        }}
        additionalFilters={
          <>
            <EnumFilter
              id={`${id}-state`}
              label={t('Cost status')}
              allLabel={t('All cost statuses')}
              value={costState === 'ALL' ? undefined : costState}
              options={[
                ['RECORDED', 'Recorded'],
                ['INCOMPLETE', 'Incomplete cost data'],
              ]}
              onChange={(value) => setCostState(value ?? 'ALL')}
            />
            <EnumFilter
              id={`${id}-reason`}
              label={t('Incomplete reason')}
              allLabel={t('All incomplete reasons')}
              value={reason}
              options={
                Object.entries(incompleteReasonLabels) as Array<
                  [ProviderCostIncompleteReason, string]
                >
              }
              onChange={setReason}
            />
            <EnumFilter
              id={`${id}-event`}
              label={t('Cost event')}
              allLabel={t('All cost events')}
              value={costEvent}
              options={[
                ['CHARGE', 'Charge'],
                ['REFUND', 'Refund'],
                ['ADJUSTMENT', 'Adjustment'],
              ]}
              onChange={setCostEvent}
            />
            <DataTableColumnFilterField
              label={t('Model')}
              htmlFor={`${id}-model`}
            >
              <DashboardModelSelect
                id={`${id}-model`}
                value={model.option}
                onChange={model.setOption}
              />
            </DataTableColumnFilterField>
            <DataTableColumnFilterField
              label={t('API provider')}
              htmlFor={`${id}-provider`}
            >
              <Select
                value={providerId ?? ALL_OPTION_VALUE}
                onValueChange={(value) =>
                  setProviderId(
                    value === ALL_OPTION_VALUE || !value ? undefined : value
                  )
                }
              >
                <SelectTrigger id={`${id}-provider`}>
                  <SelectValue>
                    {(value: string) =>
                      value === ALL_OPTION_VALUE
                        ? t('All API providers')
                        : (providers.data?.items.find(
                            (item) => item.providerId === value
                          )?.name ?? value)
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_OPTION_VALUE}>
                    {t('All API providers')}
                  </SelectItem>
                  {(providers.data?.items ?? []).map((item) => (
                    <SelectItem key={item.providerId} value={item.providerId}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </DataTableColumnFilterField>
            <TaskIdFilter
              id={`${id}-task`}
              value={taskId}
              onChange={setTaskId}
            />
          </>
        }
      />
      {settleRow ? (
        <ProviderCostSettlementDialog
          open
          onOpenChange={(open) => {
            if (!open) setSettleRow(undefined)
          }}
          taskId={settleRow.taskId}
          callId={settleRow.callId}
          upstreamTaskId={settleRow.upstreamTaskId}
          upstreamRequestId={settleRow.upstreamRequestId}
        />
      ) : null}
      {revokeRow?.costId ? (
        <ProviderCostRevocationDialog
          open
          onOpenChange={(open) => {
            if (!open) setRevokeRow(undefined)
          }}
          taskId={revokeRow.taskId}
          providerCostId={revokeRow.costId}
        />
      ) : null}
    </div>
  )
}

const drawerTitles = {
  balance: 'Point balance details',
  flow: 'Point flow details',
  cost: 'Call cost details',
} as const

type DrawerDetail =
  | { kind: 'task'; id: string }
  | { kind: 'lot'; id: string; customerId: string }

/**
 * The three detail drawers. A Task ID or point lot ID replaces the drawer content with the unified Task or lot detail;
 * "Back" restores the list with its filters, page, scroll position and focus, because the list stays mounted meanwhile.
 */
export function OperatingDashboardDrawers(props: {
  request?: DashboardDrawerRequest
  onClose: () => void
}) {
  const { t } = useTranslation()
  const listScroll = useRef<HTMLDivElement | null>(null)
  const detailScroll = useRef<HTMLDivElement | null>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const [detail, setDetail] = useState<DrawerDetail>()
  useEffect(() => setDetail(undefined), [props.request])
  const openTask = (id: string, trigger: HTMLElement) => {
    returnFocus.current = trigger
    setDetail({ kind: 'task', id })
  }
  const openLot: OpenLot = (id, customerId, trigger) => {
    returnFocus.current = trigger
    setDetail({ kind: 'lot', id, customerId })
  }
  const back = () => {
    setDetail(undefined)
    window.setTimeout(() => returnFocus.current?.focus(), 0)
  }
  const request = props.request
  let title: string | null = null
  if (detail?.kind === 'task') title = t('Task details')
  else if (detail?.kind === 'lot') title = t('Point lot details')
  else if (request) title = t(drawerTitles[request.kind])
  return (
    <Sheet
      open={Boolean(request)}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <SheetContent
        className={sideDrawerContentClassName('max-w-none sm:!max-w-[880px]')}
      >
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle className='flex items-center gap-2'>
            {detail ? (
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='-ms-2'
                onClick={back}
              >
                <ArrowLeft />
                {t('Back to details')}
              </Button>
            ) : null}
            {title}
          </SheetTitle>
        </SheetHeader>
        <div
          ref={listScroll}
          className={sideDrawerFormClassName(detail ? 'hidden' : undefined)}
        >
          {request?.kind === 'balance' ? (
            <BalanceDrawer
              request={request}
              onOpenTask={openTask}
              onOpenLot={openLot}
            />
          ) : null}
          {request?.kind === 'flow' ? (
            <FlowDrawer
              request={request}
              onOpenTask={openTask}
              onOpenLot={openLot}
            />
          ) : null}
          {request?.kind === 'cost' ? (
            <CostDrawer request={request} onOpenTask={openTask} />
          ) : null}
        </div>
        {detail?.kind === 'task' ? (
          <div ref={detailScroll} className={sideDrawerFormClassName()}>
            <AdminTaskRecordDetails
              key={detail.id}
              taskId={detail.id}
              scrollContainerRef={detailScroll}
            />
          </div>
        ) : null}
        {detail?.kind === 'lot' ? (
          <div ref={detailScroll} className={sideDrawerFormClassName()}>
            <CustomerRecordDetails
              key={detail.id}
              customerId={detail.customerId}
              target={{ kind: 'lot', id: detail.id }}
              onOpenOrder={(orderId) =>
                window.location.assign(
                  `/canvas-cloud/customers?${new URLSearchParams({
                    customerId: detail.customerId,
                    orderId,
                  }).toString()}`
                )
              }
            />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
