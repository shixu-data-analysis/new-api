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
import { Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader } from '@/components/data-table'
import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { getServerErrorStatus } from '@/lib/server-error-message'

import { getCanvasAuditEvents } from '../api'
import {
  AUDIT_ACTIONS,
  auditActionLabelKey,
  auditActionOptionLabel,
  auditActorText,
  auditObjectText,
  type AuditEvent,
} from '../audit-log-format'
import { isCanvasDateRangeValid } from '../date-range'
import { formatCanvasDateTime } from '../formatters'
import type { CanvasAuditActorScope, CanvasAuditResolvedNames } from '../types'
import { useServerTableState } from '../use-server-table-state'
import { AuditEventDetailsSheet } from './AuditEventDetailsSheet'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { CanvasServerTable } from './CanvasServerTable'
import {
  ALL_OPTION_VALUE,
  DashboardCustomerSelect,
  DashboardSearchSelect,
  type DashboardSelectOption,
} from './DashboardSearchSelect'

const DEFAULT_SCOPE: CanvasAuditActorScope = 'ADMIN'
const scopeLabelKeys: Record<CanvasAuditActorScope, string> = {
  ADMIN: 'Admin',
  SYSTEM: 'System',
  CUSTOMER: 'Customer',
  ALL: 'All',
}
const emptyNames: CanvasAuditResolvedNames = {
  customers: {},
  customerModels: {},
  agents: {},
  rechargeOrders: {},
  priceGroups: {},
  modelTags: {},
  promotionVersions: {},
  campaignGrantPlans: {},
  priceVersions: {},
  providerRateVersions: {},
  providers: {},
  inviteCodes: {},
  rechargeCodes: {},
  rechargeCodeBatches: {},
  principals: {},
}

function loadErrorKey(error: unknown) {
  const status = getServerErrorStatus(error)
  if (status === 401) return 'Your session has expired. Sign in again.'
  if (status === 403) {
    return 'You do not have permission to view operation logs.'
  }
  return 'Unable to load operation logs'
}

export function AdminAuditLog() {
  const { t, i18n } = useTranslation()
  const state = useServerTableState('occurredAt')
  const setPagination = state.setPagination
  const allActions = useMemo(
    () => ({ value: ALL_OPTION_VALUE, label: t('All actions') }),
    [t]
  )
  const allCustomers = useMemo(
    () => ({ value: ALL_OPTION_VALUE, label: t('All customers') }),
    [t]
  )
  const [scope, setScope] = useState<CanvasAuditActorScope>(DEFAULT_SCOPE)
  const [actionCode, setActionCode] = useState('')
  const [customer, setCustomer] = useState<DashboardSelectOption>()
  const [from, setFrom] = useState<Date>()
  const [to, setTo] = useState<Date>()
  const [openEventId, setOpenEventId] = useState<string>()
  const fieldId = useId()
  const dateRangeValid = isCanvasDateRangeValid(from, to)
  const customerId = customer?.value ?? ''

  useEffect(() => {
    setPagination((value) =>
      value.pageIndex === 0 ? value : { ...value, pageIndex: 0 }
    )
  }, [actionCode, customerId, from, scope, setPagination, to])
  const query = useQuery({
    queryKey: [
      'canvas-cloud',
      'audit',
      state.query.page,
      state.query.pageSize,
      state.query.sortOrder,
      scope,
      actionCode,
      customerId,
      from?.toISOString(),
      to?.toISOString(),
    ],
    queryFn: ({ signal }) =>
      getCanvasAuditEvents(
        {
          page: state.query.page,
          pageSize: state.query.pageSize,
          sortOrder: state.query.sortOrder,
          actorScope: scope,
          ...(actionCode ? { action: actionCode } : {}),
          ...(customerId ? { customerId } : {}),
          ...(from ? { from: from.toISOString() } : {}),
          ...(to ? { to: to.toISOString() } : {}),
        },
        signal
      ),
    enabled: dateRangeValid,
  })
  const names = query.data?.resolvedNames ?? emptyNames
  const openEvent = query.data?.items.find((item) => item.id === openEventId)
  const actionOptions = useMemo(
    () =>
      AUDIT_ACTIONS.map((code) => ({
        value: code,
        label: auditActionOptionLabel(code, t),
      })),
    [t]
  )
  const columns = useMemo<ColumnDef<AuditEvent, unknown>[]>(
    () => [
      {
        id: 'occurredAt',
        accessorKey: 'occurredAt',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Time')} />
        ),
        meta: { label: t('Time') },
        cell: ({ row }) => (
          <span className='tabular-nums'>
            {formatCanvasDateTime(row.original.occurredAt)}
          </span>
        ),
      },
      {
        id: 'action',
        accessorKey: 'action',
        enableSorting: false,
        enableHiding: false,
        header: t('Action'),
        meta: { label: t('Action') },
        cell: ({ row }) => {
          const labelKey = auditActionLabelKey(row.original.action)
          return (
            <Button
              type='button'
              variant='link'
              className='h-auto p-0 text-start whitespace-normal'
              onClick={() => setOpenEventId(row.original.id)}
            >
              {labelKey ? (
                t(labelKey)
              ) : (
                <span className='font-mono'>{row.original.action}</span>
              )}
            </Button>
          )
        },
      },
      {
        id: 'actor',
        accessorKey: 'actorType',
        enableSorting: false,
        header: t('Actor'),
        meta: { label: t('Actor') },
        cell: ({ row }) => auditActorText(row.original, t),
      },
      {
        id: 'object',
        accessorKey: 'resourceType',
        enableSorting: false,
        header: t('Operation object'),
        meta: { label: t('Operation object') },
        cell: ({ row }) => {
          const label = auditObjectText(row.original, names, t)
          const modelId = row.original.publicMetadata.customerModelId
          if (
            row.original.resourceType === 'MODEL_PRICING_PUBLICATION' &&
            row.original.resourceId &&
            typeof modelId === 'string' &&
            modelId
          ) {
            return (
              <Link
                className='text-primary underline underline-offset-4'
                to='/canvas-cloud/model-management/$modelId/pricing'
                params={{ modelId }}
                search={{
                  tab: 'history',
                  publicationId: row.original.resourceId,
                }}
              >
                {label}
              </Link>
            )
          }
          return label
        },
      },
    ],
    [names, t]
  )
  const filters = (
    <>
      <DataTableColumnFilterField
        label={t('Operation source')}
        htmlFor={`${fieldId}-source`}
      >
        <Select
          value={scope}
          onValueChange={(value) =>
            setScope((value as CanvasAuditActorScope | null) ?? DEFAULT_SCOPE)
          }
        >
          <SelectTrigger id={`${fieldId}-source`} className='w-full'>
            <CanvasLocalizedSelectValue
              value={scope}
              valueLabelKey={scopeLabelKeys[scope]}
            />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(scopeLabelKeys) as CanvasAuditActorScope[]).map(
              (value) => (
                <SelectItem key={value} value={value}>
                  {t(scopeLabelKeys[value])}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      </DataTableColumnFilterField>
      <DataTableColumnFilterField
        label={t('Action')}
        htmlFor={`${fieldId}-action`}
      >
        <DashboardSearchSelect
          id={`${fieldId}-action`}
          value={
            actionCode
              ? {
                  value: actionCode,
                  label: auditActionOptionLabel(actionCode, t),
                }
              : allActions
          }
          queryKey={`audit-actions:${i18n.language}`}
          placeholder={t('All actions')}
          fixedOptions={[allActions]}
          load={async (search) =>
            actionOptions.filter((option) =>
              option.label.toLowerCase().includes(search.toLowerCase())
            )
          }
          onChange={(option) =>
            setActionCode(option.value === ALL_OPTION_VALUE ? '' : option.value)
          }
        />
      </DataTableColumnFilterField>
      <DataTableColumnFilterField
        label={t('Customer')}
        htmlFor={`${fieldId}-customer`}
      >
        <DashboardCustomerSelect
          id={`${fieldId}-customer`}
          value={customer ?? allCustomers}
          onChange={(option) =>
            setCustomer(option.value === ALL_OPTION_VALUE ? undefined : option)
          }
        />
      </DataTableColumnFilterField>
      <div className='sm:col-span-2'>
        <CanvasDateRangeFilter
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
        />
      </div>
    </>
  )
  return (
    <>
      <CanvasServerTable
        data={query.data?.items ?? []}
        columns={columns}
        total={query.data?.total ?? 0}
        state={state}
        loading={query.isLoading || query.isFetching}
        error={query.isError}
        errorTitle={t(loadErrorKey(query.error))}
        onRetry={() => void query.refetch()}
        emptyTitle={t('No operation logs')}
        filteredEmptyTitle={t('No matching operation logs')}
        additionalFilters={filters}
        hasActiveFilters={Boolean(
          scope !== DEFAULT_SCOPE || actionCode || customerId || from || to
        )}
        activeFilterCount={
          [scope !== DEFAULT_SCOPE, actionCode, customerId, from, to].filter(
            Boolean
          ).length
        }
        onResetFilters={() => {
          setScope(DEFAULT_SCOPE)
          setActionCode('')
          setCustomer(undefined)
          setFrom(undefined)
          setTo(undefined)
        }}
        getRowId={(row) => row.id}
      />
      <AuditEventDetailsSheet
        {...(openEvent ? { event: openEvent } : {})}
        names={names}
        onClose={() => setOpenEventId(undefined)}
      />
    </>
  )
}
