/* Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License version 3 or later. */
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'

import { getCanvasCustomerBusinessFacts } from '../api'
import {
  factFieldLabels,
  factKindLabels,
  factStatusTerms,
  factStatusValues,
  factValueLabels,
} from '../business-facts'
import { isCanvasDateRangeValid } from '../date-range'
import { formatMoneyMinor } from '../formatters'
import { formatExactRmbReference } from '../point-conversion-types'
import type {
  CanvasBusinessFact,
  CanvasBusinessFactDetail,
  CanvasBusinessFactKind,
} from '../types'
import { useServerTableState } from '../use-server-table-state'
import { BusinessTermText } from './BusinessTerm'
import { CanvasColumnFilterField } from './CanvasColumnFilterPanel'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import { CanvasServerTable } from './CanvasServerTable'
import { CopyableText } from './CopyableText'

export type CustomerFactTarget = { kind: CanvasBusinessFactKind; id: string }
function FactStatus({ fact }: { fact: CanvasBusinessFact }) {
  const { t } = useTranslation()
  const term = factStatusTerms[fact.kind]
  return term ? (
    <BusinessTermText kind={term} value={fact.status} />
  ) : (
    <>{t(factValueLabels[fact.status] ?? 'Unknown')}</>
  )
}
function FactFields({ fact }: { fact: CanvasBusinessFactDetail }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const renderValue = (key: string, value: string | null) => {
    if (value === null) return t('Not recorded')
    if (key.endsWith('At')) {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'medium',
      }).format(new Date(value))
    }
    if (key === 'executionOrigin') {
      if (value === 'MOCK') return t('Mock calls')
      if (value === 'REAL') return t('Real calls')
      return t('Not recorded')
    }
    if (key === 'executionStatus') {
      return <BusinessTermText kind='taskExecutionStatus' value={value} />
    }
    if (key === 'billingStatus') {
      return <BusinessTermText kind='billingStatus' value={value} />
    }
    if (key === 'reconciliationStatus') {
      return <BusinessTermText kind='reconciliationStatus' value={value} />
    }
    if (key === 'lotType') {
      return <BusinessTermText kind='pointLotType' value={value} />
    }
    if (key === 'eventType') {
      return <BusinessTermText kind='ledgerEvent' value={value} />
    }
    if (key === 'reason') {
      return <BusinessTermText kind='ledgerReason' value={value} />
    }
    if (key === 'cashEffect') return t(value === 'true' ? 'Yes' : 'No')
    if (
      ['listedAmountMinor', 'cashAmountMinor', 'signedAmountMinor'].includes(
        key
      )
    ) {
      return formatMoneyMinor(value, fact.fields.currency ?? 'CNY')
    }
    if (
      ['sourceType', 'paymentEvent', 'costEvent', 'classification'].includes(
        key
      )
    ) {
      return t(factValueLabels[value] ?? 'Unknown')
    }
    if (
      ['signedAmount', 'exchangeRate', 'normalizedAmountMinor'].includes(key)
    ) {
      // This formatter only groups decimal digits; it does not convert units or currency.
      return formatExactRmbReference(value, locale)
    }
    if (
      /(?:^points[A-Z]|Points$|Delta$|After$|Version$)/.test(key) &&
      /^-?\d+$/.test(value)
    ) {
      return new Intl.NumberFormat(locale).format(BigInt(value))
    }
    return value
  }
  const sections =
    fact.kind === 'task'
      ? [
          {
            title: 'Execution',
            keys: ['executionStatus', 'executionOrigin', 'completedAt'],
          },
          {
            title: 'Customer billing',
            keys: [
              'billingStatus',
              'quotedPoints',
              'allocatedPoints',
              'settledPoints',
              'paidSettledPoints',
              'bonusSettledPoints',
              'releasedPoints',
              'transferredPoints',
              'billingFinalizedAt',
            ],
          },
          { title: 'Provider reconciliation', keys: ['reconciliationStatus'] },
        ]
      : [
          {
            title: 'Details',
            keys: Object.keys(fact.fields).filter(
              (key) => !['upstreamTaskId', 'pricePlanCode'].includes(key)
            ),
          },
        ]
  return (
    <div className='space-y-4'>
      {sections.map((section) => (
        <section key={section.title} className='rounded-md border p-4'>
          <h3 className='mb-3 font-medium'>{t(section.title)}</h3>
          <dl className='grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            {section.keys.map((key) => (
              <div key={key} className='min-w-0'>
                <dt className='text-muted-foreground text-sm'>
                  {t(factFieldLabels[key] ?? 'Unknown')}
                </dt>
                <dd className='mt-1 text-sm [overflow-wrap:anywhere] break-words'>
                  {renderValue(key, fact.fields[key] ?? null)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      {fact.kind === 'refund' && (
        <p className='text-muted-foreground text-sm'>
          {t(
            'Statuses describe Canvas point recovery only, not cash-payment processing.'
          )}
        </p>
      )}
      <details className='text-muted-foreground text-sm'>
        <summary className='cursor-pointer'>{t('Internal reference')}</summary>
        <CopyableText value={fact.id} />
        {fact.fields.pricePlanCode && (
          <p>
            {t('Price plan')}:{' '}
            <CopyableText value={fact.fields.pricePlanCode} />
          </p>
        )}
        {fact.fields.upstreamTaskId && (
          <p>
            {t('Upstream task ID')}:{' '}
            <CopyableText value={fact.fields.upstreamTaskId} />
          </p>
        )}
      </details>
    </div>
  )
}
function FactPage({
  customerId,
  root,
  onOpen,
}: {
  customerId: string
  root?: CustomerFactTarget
  onOpen: (target: CustomerFactTarget) => void
}) {
  const { t, i18n } = useTranslation()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const state = useServerTableState('at')
  const [kind, setKind] = useState<CanvasBusinessFactKind | ''>('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState<Date>()
  const [to, setTo] = useState<Date>()
  const { setPagination } = state
  useEffect(() => {
    setPagination((p) => (p.pageIndex ? { ...p, pageIndex: 0 } : p))
  }, [kind, status, from, to, setPagination])
  const params = {
    page: state.query.page,
    pageSize: state.query.pageSize,
    sortOrder: state.query.sortOrder,
    ...(kind ? { kind } : {}),
    ...(state.query.search ? { name: state.query.search } : {}),
    ...(status ? { status } : {}),
    ...(from ? { from: from.toISOString() } : {}),
    ...(to ? { to: to.toISOString() } : {}),
  }
  const query = useQuery({
    queryKey: [
      'canvas-cloud',
      'admin-customer',
      customerId,
      'business-facts',
      root,
      params,
    ],
    queryFn: ({ signal }) =>
      getCanvasCustomerBusinessFacts(customerId, params, root, signal),
    enabled: isCanvasDateRangeValid(from, to),
  })
  const factId = query.data?.fact?.id
  useEffect(() => {
    if (factId) headingRef.current?.focus()
  }, [factId])
  const columns = useMemo<ColumnDef<CanvasBusinessFact, unknown>[]>(
    () => [
      {
        id: 'at',
        accessorKey: 'at',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Time')} />
        ),
        cell: ({ row }) =>
          new Intl.DateTimeFormat(toIntlLocale(i18n.language), {
            dateStyle: 'medium',
            timeStyle: 'medium',
          }).format(new Date(row.original.at)),
      },
      {
        id: 'kind',
        accessorKey: 'kind',
        header: t('Type'),
        enableSorting: false,
        cell: ({ row }) => t(factKindLabels[row.original.kind]),
      },
      {
        id: 'name',
        accessorKey: 'name',
        header: t('Business record'),
        enableSorting: false,
        cell: ({ row }) => (
          <button
            type='button'
            className='text-primary text-start break-words underline underline-offset-4 focus-visible:ring-2'
            onClick={() => onOpen(row.original)}
          >
            {row.original.kind === 'ledger' ? (
              <BusinessTermText
                kind='ledgerReason'
                value={row.original.name}
                fallback={t('Point ledger')}
              />
            ) : (
              row.original.name || t(factKindLabels[row.original.kind])
            )}
          </button>
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: t('Status'),
        enableSorting: false,
        cell: ({ row }) => <FactStatus fact={row.original} />,
      },
    ],
    [t, i18n.language, onOpen]
  )
  if (query.isError) {
    return (
      <div role='alert' className='space-y-3'>
        <p>{t('Unable to load business facts for this customer.')}</p>
        <Button variant='outline' onClick={() => query.refetch()}>
          {t('Retry')}
        </Button>
      </div>
    )
  }
  return (
    <div className='space-y-4'>
      {query.data?.fact && (
        <>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className='text-lg font-semibold break-words outline-none'
          >
            {t(factKindLabels[query.data.fact.kind])}
            {query.data.fact.name && query.data.fact.kind !== 'ledger'
              ? ` · ${query.data.fact.name}`
              : ''}
          </h2>
          <p className='text-muted-foreground text-sm'>
            <FactStatus fact={query.data.fact} /> ·{' '}
            {new Intl.DateTimeFormat(toIntlLocale(i18n.language), {
              dateStyle: 'medium',
              timeStyle: 'medium',
            }).format(new Date(query.data.fact.at))}
          </p>
          <FactFields fact={query.data.fact} />
          <h3 className='font-medium'>{t('Related business timeline')}</h3>
        </>
      )}
      <CanvasServerTable
        data={query.data?.items ?? []}
        columns={columns}
        total={query.data?.total ?? 0}
        state={state}
        loading={query.isLoading || query.isFetching}
        emptyTitle={t('No related business facts')}
        searchLabel={t('Business record')}
        getRowId={(row) => `${row.kind}:${row.id}`}
        additionalFilters={
          <>
            <CanvasColumnFilterField label={t('Type')}>
              <select
                className='border-input bg-background h-9 w-full min-w-0 rounded-md border px-3 text-sm'
                aria-label={t('Type')}
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as CanvasBusinessFactKind | '')
                  setStatus('')
                }}
              >
                <option value=''>{t('All types')}</option>
                {Object.entries(factKindLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {t(label)}
                  </option>
                ))}
              </select>
            </CanvasColumnFilterField>
            <CanvasColumnFilterField label={t('Status')}>
              <select
                className='border-input bg-background h-9 w-full min-w-0 rounded-md border px-3 text-sm'
                aria-label={t('Status')}
                disabled={!kind}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value=''>
                  {t(kind ? 'All statuses' : 'Select a type first')}
                </option>
                {kind &&
                  factStatusValues[kind].map((value) => (
                    <option key={value} value={value}>
                      <FactStatus
                        fact={{ kind, id: '', at: '', name: '', status: value }}
                      />
                    </option>
                  ))}
              </select>
            </CanvasColumnFilterField>
            <div className='sm:col-span-2'>
              <CanvasDateRangeFilter
                from={from}
                to={to}
                onFromChange={setFrom}
                onToChange={setTo}
              />
            </div>
          </>
        }
        hasActiveFilters={Boolean(kind || status || from || to)}
        onResetFilters={() => {
          setKind('')
          setStatus('')
          setFrom(undefined)
          setTo(undefined)
        }}
      />
    </div>
  )
}
export function CustomerBusinessFacts({
  customerId,
  initial,
}: {
  customerId: string
  initial?: CustomerFactTarget
}) {
  const { t } = useTranslation()
  const [history, setHistory] = useState<CustomerFactTarget[]>(
    initial ? [initial] : []
  )
  const root = history.at(-1)
  return (
    <div className='space-y-4'>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Read-only business facts. Follow related records to inspect the original facts.'
        )}
      </p>
      {root && (
        <div className='flex flex-wrap gap-2'>
          <Button
            variant='outline'
            onClick={() => setHistory((h) => h.slice(0, -1))}
          >
            {t('Back')}
          </Button>
          <Button variant='ghost' onClick={() => setHistory([])}>
            {t('All business facts')}
          </Button>
        </div>
      )}
      <FactPage
        key={`${customerId}:${root?.kind ?? ''}:${root?.id ?? ''}`}
        customerId={customerId}
        root={root}
        onOpen={(target) =>
          setHistory((h) => [...h, { kind: target.kind, id: target.id }])
        }
      />
    </div>
  )
}
