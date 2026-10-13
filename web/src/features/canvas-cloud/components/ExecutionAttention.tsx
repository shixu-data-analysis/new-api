/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
*/
import { Trans, useTranslation } from 'react-i18next'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { attentionMessageKeys } from '../execution-attention-messages'
import type { ExecutionAttention } from '../execution-types'
import { formatCanvasDateTime } from '../formatters'
import { TaskLogCountLink } from './ExecutionCapacityOverview'

/**
 * The attention hints in force, after the drain row; hidden when there are none. Details stay on the linked task log and
 * the running-workers table, so the hints name no model, group or instance.
 */
export function ExecutionAttentionCard(props: {
  attention: ExecutionAttention[]
}) {
  const { t } = useTranslation()
  if (props.attention.length === 0) return null
  return (
    <Card
      size='sm'
      className='border-destructive/40'
      aria-labelledby='execution-attention-title'
    >
      <CardHeader>
        <CardTitle id='execution-attention-title'>
          {t('Needs attention')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className='divide-y text-sm'>
          {props.attention.map((hint) => (
            <li key={hint.type} className='space-y-1 py-2 first:pt-0 last:pb-0'>
              <p className='font-medium'>
                {t(
                  attentionMessageKeys[hint.type] ?? 'Unknown attention hint',
                  {
                    count: hint.count,
                  }
                )}
              </p>
              <p className='text-muted-foreground'>
                {hint.type === 'WAITING_AREA_NEARLY_FULL'
                  ? t(
                      'When it is full, the instance stops taking new tasks. Add executor instances or raise the poll interval.'
                    )
                  : null}
                {hint.type === 'UNRECOGNIZED_PROVIDER_STATUS'
                  ? `${t('These tasks keep querying. Once the meaning of each value is confirmed, add it to the interface template and publish a new catalog.')} `
                  : null}
                {hint.latestAt
                  ? t('Latest {{time}}', {
                      time: formatCanvasDateTime(hint.latestAt),
                    })
                  : null}
                {hint.taskLogFilters ? (
                  <>
                    {' · '}
                    <TaskLogCountLink
                      count={hint.count}
                      search={hint.taskLogFilters}
                    >
                      {t('View these {{count}} tasks in task records', {
                        count: hint.count,
                      })}
                    </TaskLogCountLink>
                  </>
                ) : null}
              </p>
              {hint.unrecognizedStatuses?.length ? (
                <ul className='text-muted-foreground space-y-0.5'>
                  {hint.unrecognizedStatuses.map((entry) => (
                    <li
                      key={`${entry.channelCode}:${entry.status}`}
                      className='[overflow-wrap:anywhere]'
                    >
                      {/* The status is the raw value, exactly as the interface template needs it. */}
                      <Trans
                        i18nKey='{{provider}} / {{channel}}: <status>{{status}}</status> ({{count}} tasks)'
                        values={{
                          provider: entry.providerName,
                          channel: entry.channelCode,
                          status: entry.status,
                          count: entry.taskCount,
                        }}
                        components={{
                          status: (
                            <code className='text-foreground font-mono' />
                          ),
                        }}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
