/* Copyright (C) 2023-2026 QuantumNous; licensed under GNU AGPL v3 or later. */
import { useTranslation } from 'react-i18next'

import { formatCanvasDateTime } from '../formatters'
import { formatElapsed, taskElapsed } from '../task-elapsed'
import { shortUpstreamTaskId, upstreamTaskFailed } from '../task-upstream-tasks'
import type { CanvasAdminTaskLog } from '../types'
import { CanvasTooltip } from './CanvasTooltip'
import { CopyableText } from './CopyableText'

/** The accepted time with how long the task took under it; a finished task's results that ended apart add their range. */
export function TaskAcceptedCell({ task }: { task: CanvasAdminTaskLog }) {
  const { t } = useTranslation()
  const elapsed = taskElapsed(
    task.acceptedAt,
    task.completedAt,
    task.outputSummaries
  )
  return (
    <div className='space-y-0.5'>
      <div>{formatCanvasDateTime(task.acceptedAt)}</div>
      {elapsed ? (
        <div className='text-muted-foreground text-xs'>
          {t('Elapsed {{duration}}', {
            duration: formatElapsed(elapsed.totalMs, t),
          })}
        </div>
      ) : null}
      {elapsed?.range ? (
        <div className='text-muted-foreground text-xs'>
          {t('Fastest {{fastest}}, slowest {{slowest}}', {
            fastest: formatElapsed(elapsed.range.fastestMs, t),
            slowest: formatElapsed(elapsed.range.slowestMs, t),
          })}
        </div>
      ) : null}
    </div>
  )
}

/** Every Provider task ID of the task, one per line; an ID whose result failed is red. */
export function TaskUpstreamIdsCell({ task }: { task: CanvasAdminTaskLog }) {
  if (task.upstreamTasks.length === 0) return <>—</>
  return (
    <ul className='space-y-0.5'>
      {task.upstreamTasks.map((upstreamTask) => (
        <li
          key={upstreamTask.upstreamTaskId}
          className='flex items-center gap-1'
        >
          <CanvasTooltip content={upstreamTask.upstreamTaskId}>
            <span
              className={
                upstreamTaskFailed(upstreamTask, task.outputSummaries)
                  ? 'text-destructive font-mono'
                  : 'font-mono'
              }
            >
              {shortUpstreamTaskId(upstreamTask.upstreamTaskId)}
            </span>
          </CanvasTooltip>
          <CopyableText value={upstreamTask.upstreamTaskId} hideValue />
        </li>
      ))}
    </ul>
  )
}
