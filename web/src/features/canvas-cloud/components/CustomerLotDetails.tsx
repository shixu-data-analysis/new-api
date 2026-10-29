/* Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License version 3 or later. */
import { useQueries, useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'

import { getCanvasCustomerBusinessFacts } from '../api'
import { factValueLabels } from '../business-facts'
import { formatCanvasDateTime } from '../formatters'
import { BusinessTermText } from './BusinessTerm'
import { CopyableText } from './CopyableText'

function FactValue(props: { label: string; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className='min-w-0'>
      <dt className='text-muted-foreground text-sm'>{t(props.label)}</dt>
      <dd className='mt-1 min-h-5 text-sm [overflow-wrap:anywhere] break-words'>
        {props.children}
      </dd>
    </div>
  )
}

function FactRow(props: { label: string; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className='grid min-w-0 grid-cols-[minmax(5rem,6rem)_minmax(0,1fr)] items-start gap-x-4'>
      <dt className='text-muted-foreground text-sm'>{t(props.label)}</dt>
      <dd className='min-w-0 text-sm [overflow-wrap:anywhere] break-words'>
        {props.children}
      </dd>
    </div>
  )
}

function Points(props: { value: string }) {
  const { i18n } = useTranslation()
  return (
    <span className='tabular-nums'>
      {new Intl.NumberFormat(toIntlLocale(i18n.language)).format(
        BigInt(props.value)
      )}
    </span>
  )
}

/** A point lot of one customer: its source and ledger. */
export function CustomerLotDetails(props: {
  customerId: string
  lotId: string
  onOpenOrder: (id: string) => void
}) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: [
      'canvas-cloud',
      'admin-customer',
      props.customerId,
      'point-lot',
      props.lotId,
      page,
    ],
    queryFn: ({ signal }) =>
      getCanvasCustomerBusinessFacts(
        props.customerId,
        { page, pageSize: 20, sortOrder: 'desc', kind: 'ledger' },
        { kind: 'lot', id: props.lotId },
        signal
      ),
  })
  const ledgerDetails = useQueries({
    queries: (query.data?.items ?? []).map((ledger) => ({
      queryKey: [
        'canvas-cloud',
        'admin-customer',
        props.customerId,
        'point-ledger',
        ledger.id,
      ],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getCanvasCustomerBusinessFacts(
          props.customerId,
          { page: 1, pageSize: 20, sortOrder: 'desc' },
          { kind: 'ledger', id: ledger.id },
          signal
        ),
    })),
  })
  if (query.isLoading) return <p role='status'>{t('Loading')}</p>
  if (query.isError) {
    return (
      <div className='space-y-2' role='alert'>
        <p>{t('Unable to load customer details')}</p>
        <Button
          type='button'
          variant='outline'
          onClick={() => void query.refetch()}
        >
          {t('Retry')}
        </Button>
      </div>
    )
  }
  const fact = query.data?.fact
  if (!fact) return <p>{t('Not recorded')}</p>
  const field = (key: string) => {
    const value = fact.fields[key]
    return typeof value === 'string' ? value : null
  }
  const ledgerRows = (query.data?.items ?? []).map((ledger, index) => ({
    ledger,
    fact: ledgerDetails[index]?.data?.fact,
    query: ledgerDetails[index],
  }))
  const columns: StaticDataTableColumn<(typeof ledgerRows)[number]>[] = [
    {
      id: 'at',
      header: t('Time'),
      cell: (row) => formatCanvasDateTime(row.ledger.at),
    },
    {
      id: 'event',
      header: t('Event'),
      cell: (row) => (
        <BusinessTermText kind='ledgerEvent' value={row.ledger.status} />
      ),
    },
    {
      id: 'points',
      header: t('Change amount'),
      className: 'text-right',
      cellClassName: 'text-right tabular-nums',
      cell: (row) => {
        if (row.query?.isError) {
          return (
            <div className='flex flex-col items-end gap-1' role='alert'>
              <span>{t('Unable to load customer details')}</span>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => void row.query.refetch()}
              >
                {t('Retry')}
              </Button>
            </div>
          )
        }
        const points = row.fact?.fields.eventPoints
        if (typeof points === 'string') return <Points value={points} />
        if (row.query?.isLoading) {
          return <span role='status'>{t('Loading')}</span>
        }
        return t('Not recorded')
      },
    },
  ]
  const sourceOrderId = field('rechargeOrderId')
  const sourceOrderNumber = field('rechargeOrderNumber')
  const sourceType = field('sourceType')
  const initialPoints = field('initialPoints')
  const availablePoints = field('availablePoints')
  const reservedPoints = field('reservedPoints')
  return (
    <div className='space-y-5'>
      <dl className='space-y-4'>
        <FactRow label='Type'>
          <BusinessTermText
            kind='pointLotType'
            value={field('lotType') ?? fact.status}
          />
        </FactRow>
        <FactRow label='Source'>
          {sourceOrderId && sourceOrderNumber ? (
            <Button
              type='button'
              variant='link'
              className='h-auto p-0'
              onClick={() => props.onOpenOrder(sourceOrderId)}
            >
              {sourceOrderNumber}
            </Button>
          ) : (
            t(
              sourceType === 'MANUAL_GRANT'
                ? 'Manual gift'
                : (factValueLabels[sourceType ?? ''] ?? 'Unknown')
            )
          )}
        </FactRow>
        {field('inviteCode') ? (
          <FactRow label='Invite code'>{field('inviteCode')}</FactRow>
        ) : null}
        {field('inviteRegisteredAt') ? (
          <FactRow label='Registered at'>
            {formatCanvasDateTime(field('inviteRegisteredAt'))}
          </FactRow>
        ) : null}
        {field('activityName') ? (
          <FactRow label='Activity name'>{field('activityName')}</FactRow>
        ) : null}
        {field('issueReason') ? (
          <FactRow label='Reason'>
            <BusinessTermText
              kind='ledgerReason'
              value={field('issueReason') ?? ''}
            />
          </FactRow>
        ) : null}
        {field('issuedBy') ? (
          <FactRow label='Operator'>{field('issuedBy')}</FactRow>
        ) : null}
        {field('originalLotId') ? (
          <FactRow label='Source lot'>
            <CopyableText value={field('originalLotId') ?? ''} />
          </FactRow>
        ) : null}
        <FactRow label='Point lot number'>
          <CopyableText value={fact.id} />
        </FactRow>
        <FactRow label='Issued at'>{formatCanvasDateTime(fact.at)}</FactRow>
        <FactRow label='Expires at'>
          {formatCanvasDateTime(field('expiresAt'), t('No expiry'))}
        </FactRow>
        {field('originalExpiresAt') ? (
          <FactRow label='Original expiry'>
            {formatCanvasDateTime(field('originalExpiresAt'))}
          </FactRow>
        ) : null}
        {field('closedAt') ? (
          <FactRow label='Closed at'>
            {formatCanvasDateTime(field('closedAt'))}
          </FactRow>
        ) : null}
      </dl>
      <dl className='grid gap-4 border-y py-5 sm:grid-cols-3'>
        {initialPoints ? (
          <FactValue label='Original issued points'>
            <Points value={initialPoints} />
          </FactValue>
        ) : null}
        {availablePoints ? (
          <FactValue label='Available points'>
            <Points value={availablePoints} />
          </FactValue>
        ) : null}
        {reservedPoints ? (
          <FactValue label='Frozen points'>
            <Points value={reservedPoints} />
          </FactValue>
        ) : null}
      </dl>
      <section className='space-y-3'>
        <h3 className='font-medium'>{t('Point changes')}</h3>
        <StaticDataTable
          data={ledgerRows}
          columns={columns}
          getRowKey={(row) => row.ledger.id}
          emptyContent={t('No consumption records')}
        />
        {query.data && query.data.total > 20 ? (
          <div className='flex items-center justify-end gap-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              {t('Previous')}
            </Button>
            <span className='text-muted-foreground text-sm'>
              {t('Page')} {page}
            </span>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={page * 20 >= query.data.total}
              onClick={() => setPage((value) => value + 1)}
            >
              {t('Next')}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  )
}
