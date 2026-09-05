/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License version 3 or later.
*/
import { useTranslation } from 'react-i18next'
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'

import { StaticDataTable } from '@/components/data-table'
import { ChartContainer } from '@/components/ui/chart'
import { toIntlLocale } from '@/i18n/languages'

import { channelReasonLabels, healthTrendPoints } from '../channel-health'
import { formatCanvasDateTime } from '../formatters'
import type { ChannelHealthReport } from '../types'
import { BusinessTerm } from './BusinessTerm'

export function ChannelHealthDetails(props: { report: ChannelHealthReport }) {
  const { t, i18n } = useTranslation()
  const detail = props.report.detail
  const channel = props.report.items[0]
  if (!detail || !channel) return <p>{t('No provider channels')}</p>
  const points = healthTrendPoints(detail)
  const date = (value: number) =>
    new Intl.DateTimeFormat(toIntlLocale(i18n.language), {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  return (
    <>
      <p className='font-medium break-words'>
        {channel.providerName} · {channel.code}
      </p>
      <dl className='grid gap-2 text-sm sm:grid-cols-3'>
        {[
          [t('Since latest enablement'), channel.roundStartedAt],
          [t('Last success'), channel.lastSuccessAt],
          [t('Last failure'), channel.lastFailureAt],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className='text-muted-foreground'>{label}</dt>
            <dd>{formatCanvasDateTime(value)}</dd>
          </div>
        ))}
      </dl>
      <h3 className='font-medium'>{t('Task success rate trend')}</h3>
      <ChartContainer
        config={{
          successRate: {
            label: t('Task success rate'),
            color: 'var(--chart-1)',
          },
        }}
        className='aspect-auto h-60 w-full'
      >
        <LineChart
          accessibilityLayer
          data={points}
          margin={{ left: 0, right: 12, top: 8, bottom: 4 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis dataKey='at' tickFormatter={date} minTickGap={35} />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(value: number) => `${value}%`}
            width={45}
          />
          <Tooltip
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as
                | (typeof points)[number]
                | undefined
              return active && row ? (
                <div className='bg-popover rounded-md border p-3 text-sm shadow'>
                  {date(row.at)}
                  <p>
                    {t('Successful tasks')}: {row.succeeded}
                  </p>
                  <p>
                    {t('Confirmed failures')}: {row.failed}
                  </p>
                  <p>
                    {t('Unknown outcomes')}: {row.unknown}
                  </p>
                </div>
              ) : null
            }}
          />
          <Line
            dataKey='successRate'
            type='linear'
            connectNulls={false}
            stroke='var(--color-successRate)'
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
      <details>
        <summary className='cursor-pointer text-sm'>
          {t('View interval counts')}
        </summary>
        <div className='max-h-64 overflow-auto'>
          <StaticDataTable
            data={points}
            getRowKey={(point) => point.at}
            columns={[
              {
                id: 'at',
                header: t('Time'),
                className: 'w-52',
                cell: (point) => date(point.at),
              },
              {
                id: 'succeeded',
                header: t('Successful tasks'),
                className: 'w-32',
                cell: (point) => point.succeeded,
              },
              {
                id: 'failed',
                header: t('Confirmed failures'),
                className: 'w-32',
                cell: (point) => point.failed,
              },
              {
                id: 'unknown',
                header: t('Unknown outcomes'),
                className: 'w-32',
                cell: (point) => point.unknown,
              },
            ]}
          />
        </div>
      </details>
      <div className='grid gap-4 lg:grid-cols-2'>
        <div>
          <h3 className='font-medium'>{t('Failure reasons')}</h3>
          {detail.failures.length ? (
            <ul className='mt-2 space-y-1 text-sm'>
              {detail.failures.map((failure) => (
                <li key={failure.category}>
                  {t(
                    channelReasonLabels[failure.category] ??
                      'Unclassified failure'
                  )}
                  : {failure.count}
                </li>
              ))}
            </ul>
          ) : (
            <p className='text-muted-foreground text-sm'>
              {t('No confirmed failures')}
            </p>
          )}
        </div>
        <div>
          <h3 className='font-medium'>
            {t('Recent control history (latest 20)')}
          </h3>
          <ol className='mt-2 max-h-64 space-y-3 overflow-auto text-sm'>
            {detail.operations.map((operation) => (
              <li key={operation.id} className='border-b pb-2 break-words'>
                <p>
                  {formatCanvasDateTime(operation.at)} · {operation.actorName}
                </p>
                <p>
                  {operation.previousEnabled === null && t('Unknown status')}
                  {operation.previousEnabled !== null &&
                    t(operation.previousEnabled ? 'Enabled' : 'Disabled')}{' '}
                  → {operation.enabled ? t('Enabled') : t('Disabled')}
                </p>
                <p>
                  {operation.reasonCode
                    ? t(channelReasonLabels[operation.reasonCode] ?? 'Other')
                    : operation.legacyReason}
                  {operation.note ? ` · ${operation.note}` : ''}
                </p>
              </li>
            ))}
          </ol>
          {!detail.operations.length && (
            <p className='text-muted-foreground text-sm'>{t('No data')}</p>
          )}
        </div>
      </div>
      <details>
        <summary className='cursor-pointer font-medium'>
          {t('Recent tasks (latest 20)')}
        </summary>
        <ul className='mt-2 max-h-64 space-y-2 overflow-auto text-sm'>
          {detail.tasks.map((task) => (
            <li key={task.id} className='break-words'>
              {task.id} · {formatCanvasDateTime(task.acceptedAt)} ·{' '}
              <BusinessTerm kind='taskExecutionStatus' value={task.status} />
              {task.failureCategory && (
                <span>
                  {' '}
                  ·{' '}
                  {t(
                    channelReasonLabels[task.failureCategory] ??
                      'Unclassified failure'
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      </details>
    </>
  )
}
