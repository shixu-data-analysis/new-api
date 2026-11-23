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
import { useTranslation } from 'react-i18next'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { formatCanvasDateTime } from '../formatters'
import type { UpstreamStatus } from '../model-availability-api'
import type {
  AvailabilityControl,
  AvailabilityModelRow,
} from '../model-availability-rows'
import { modelMonitoringReasonLabels } from '../model-monitoring-control'
import { CanvasRowAction } from './CanvasRowAction'

const upstreamLabels: Record<Exclude<UpstreamStatus, null>, string> = {
  AVAILABLE: 'Listed by the provider',
  SUSPECTED: 'Absence to be confirmed',
  MISSING: 'Missing from the provider',
}

function UpstreamCell(props: { row: AvailabilityModelRow }) {
  const { t } = useTranslation()
  const { row } = props
  const status = row.kind === 'missing' ? 'MISSING' : row.model.upstreamStatus
  if (status === null) return <div>{t('Not probed yet')}</div>
  const time =
    status === 'MISSING' && row.model.firstMissingAt
      ? t('First missing {{time}}', {
          time: formatCanvasDateTime(row.model.firstMissingAt),
        })
      : null
  const listedAt = row.kind === 'disabled' ? row.model.lastListedAt : null
  const read =
    status !== 'MISSING' && listedAt
      ? t('Last read {{time}}', { time: formatCanvasDateTime(listedAt) })
      : null
  return (
    <>
      <div>{t(upstreamLabels[status])}</div>
      {time || read ? (
        <div className='text-muted-foreground text-xs tabular-nums'>
          {time ?? read}
        </div>
      ) : null}
    </>
  )
}

/** Missing and disabled models share these columns, so the two tables line up. */
export function ModelAvailabilityModelTable(props: {
  title: string
  rows: AvailabilityModelRow[]
  onControl: (control: AvailabilityControl) => void
}) {
  const { t } = useTranslation()
  return (
    <div className='overflow-x-auto rounded-lg border'>
      <Table className='min-w-[840px] table-fixed'>
        <colgroup>
          <col className='w-[28%]' />
          <col className='w-[20%]' />
          <col className='w-[20%]' />
          <col className='w-[16%]' />
          <col />
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead>{props.title}</TableHead>
            <TableHead>{t('API provider')}</TableHead>
            <TableHead>{t('Upstream status')}</TableHead>
            <TableHead>{t('Model state')}</TableHead>
            <TableHead className='text-center'>{t('Actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.rows.map((row) => {
            const { model } = row
            const enabled = row.kind === 'missing'
            const reason =
              row.kind === 'disabled' && row.model.disabledReason
                ? modelMonitoringReasonLabels[row.model.disabledReason]
                : undefined
            return (
              <TableRow key={model.modelKey}>
                <TableCell className='whitespace-normal'>
                  <div className='font-medium [overflow-wrap:anywhere]'>
                    {model.displayName}
                  </div>
                  <div className='text-muted-foreground font-mono text-xs [overflow-wrap:anywhere]'>
                    {model.upstreamIds.join(', ')}
                  </div>
                </TableCell>
                <TableCell className='whitespace-normal'>
                  {model.providerName}
                  {model.credentialGroupName ? (
                    <div className='text-muted-foreground text-xs'>
                      {t('API Key group: {{name}}', {
                        name: model.credentialGroupName,
                      })}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className='whitespace-normal'>
                  <UpstreamCell row={row} />
                </TableCell>
                <TableCell className='whitespace-normal'>
                  <div>{t(enabled ? 'Model enabled' : 'Model disabled')}</div>
                  {reason ? (
                    <div className='text-muted-foreground text-xs'>
                      {t('Reason: {{reason}}', { reason: t(reason) })}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className='text-center'>
                  <CanvasRowAction
                    tone={enabled ? 'danger' : 'primary'}
                    onClick={() =>
                      props.onControl({
                        modelKey: model.modelKey,
                        displayName: model.displayName,
                        controlVersion: model.controlVersion,
                        enabled,
                      })
                    }
                  >
                    {enabled ? t('Disable model') : t('Restore model')}
                  </CanvasRowAction>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
