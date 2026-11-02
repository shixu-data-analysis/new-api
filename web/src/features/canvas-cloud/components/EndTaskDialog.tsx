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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'

import { endableResults } from '../admin-task-end'
import { releaseCanvasTaskFrozenPoints } from '../api'
import type { CanvasAdminTaskRecordDetail } from '../types'

// Mirrors the Cloud release reason bound.
const REASON_MAX_LENGTH = 1000

type EndTaskChoice = 'manual' | 'failed' | 'unsure'

const earlyReleaseBlockedReasons: Record<string, string> = {
  TASK_NOT_ELIGIBLE: 'This task is not eligible for early point release.',
  MANUAL_RESULT_PENDING:
    'A manual result is being processed. Points can be released after it finishes.',
}

/**
 * One action to end a task the provider has not answered for: enter the result address, or release the frozen points as
 * a confirmed failure or by timeout. A release takes the task over first, so the system stops querying the provider; no
 * cancellation request is sent to it.
 */
export function EndTaskDialog(props: {
  task: CanvasAdminTaskRecordDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  onEnterManualResult: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { task } = props
  const [choice, setChoice] = useState<EndTaskChoice | null>(null)
  const [reason, setReason] = useState('')
  const [reasonTried, setReasonTried] = useState(false)
  const [impactConfirmed, setImpactConfirmed] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const scope = endableResults(task)
  const releaseChosen = choice === 'failed' || choice === 'unsure'
  const reasonMissing = releaseChosen && reason.trim() === ''

  const reset = () => {
    setChoice(null)
    setReason('')
    setReasonTried(false)
    setImpactConfirmed(false)
    setError('')
    setConflict(false)
  }
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'task-record', task.id],
      }),
      queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'admin-task-logs'],
      }),
      queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'customer', 'point-summary'],
      }),
    ])
  const release = useMutation({
    mutationFn: (submitted: 'failed' | 'unsure') =>
      releaseCanvasTaskFrozenPoints(task.id, {
        upstreamFailureConfirmed: submitted === 'failed',
        reason: reason.trim(),
      }),
    onSuccess: async () => {
      props.onOpenChange(false)
      reset()
      await refresh()
      toast.success(
        t(
          scope.forceEnd
            ? 'Task ended and frozen points released'
            : 'Frozen points released'
        )
      )
    },
    // A conflict means the task changed: the details are refreshed and the input kept, the request is not retried.
    onError: async (failure) => {
      const status = (failure as { response?: { status?: number } }).response
        ?.status
      if (status === 409) {
        setError('')
        setConflict(true)
        await queryClient.invalidateQueries({
          queryKey: ['canvas-cloud', 'task-record', task.id],
        })
        return
      }
      setError(t('Unable to release frozen points'))
    },
  })

  const releaseUnavailable = task.earlyReleaseAllowed
    ? null
    : t(
        earlyReleaseBlockedReasons[task.earlyReleaseBlockedReason ?? ''] ??
          'This task is not eligible for early point release.'
      )
  const options: Array<{
    value: EndTaskChoice
    label: string
    description: string
    unavailable: string | null
  }> = [
    {
      value: 'manual',
      label: 'Enter a manual result',
      description:
        'For a result file you found at the provider. The executor downloads it, delivers it and charges the frozen points.',
      unavailable:
        task.manualResultTargets.length > 0
          ? null
          : t(
              'Not available: only an unknown media result not billed by Tokens can take a manual result, one at a time.'
            ),
    },
    {
      value: 'failed',
      label: 'Provider failure was confirmed',
      description:
        'The result will be marked failed and asynchronous capacity will be returned immediately.',
      unavailable: releaseUnavailable,
    },
    {
      value: 'unsure',
      label: 'Not sure, release the points',
      description:
        'The system stops querying and later provider results will not be delivered to the customer. If the provider already charged, the platform bears the cost. Asynchronous capacity remains occupied until the execution deadline.',
      unavailable: releaseUnavailable,
    },
  ]
  const releaseValues = { points: scope.points, count: scope.count }
  let submitLabel = 'End task'
  if (choice === 'manual') submitLabel = 'Continue'
  if (releaseChosen) submitLabel = 'Release points'

  return (
    <AlertDialog
      open={props.open}
      onOpenChange={(open) => {
        props.onOpenChange(open)
        if (!open) reset()
      }}
    >
      <AlertDialogContent className='max-h-[90vh] overflow-y-auto'>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('End task')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              'Choose how to end this task. No cancellation request is sent to the provider.'
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className='space-y-4'>
          {conflict ? (
            <p
              className='border-destructive/35 text-destructive rounded-md border p-3 text-sm'
              role='alert'
            >
              {t(
                'Task status changed and details were refreshed. Your input was kept and the request was not retried.'
              )}
            </p>
          ) : null}
          <RadioGroup
            aria-label={t('How to end the task')}
            value={choice}
            onValueChange={(value) => {
              setChoice(value as EndTaskChoice)
              setReasonTried(false)
              setImpactConfirmed(false)
              setError('')
            }}
          >
            {options.map((option) => (
              <label
                key={option.value}
                className='has-[[data-checked]]:border-primary flex items-start gap-3 rounded-md border p-3 text-sm has-[[data-disabled]]:cursor-not-allowed'
              >
                <RadioGroupItem
                  value={option.value}
                  disabled={option.unavailable !== null}
                  aria-describedby={`end-task-${option.value}-help`}
                  className='mt-0.5'
                />
                <span className='grid gap-1'>
                  <span className='font-medium'>{t(option.label)}</span>
                  <span
                    id={`end-task-${option.value}-help`}
                    className='text-muted-foreground'
                  >
                    {option.unavailable ?? t(option.description)}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>
          {releaseChosen ? (
            <p className='text-sm'>
              {t(
                task.outputs.length > 1
                  ? 'Releases {{points}} frozen points for {{count}} unfinished results.'
                  : 'Releases {{points}} frozen points.',
                releaseValues
              )}
            </p>
          ) : null}
          {releaseChosen ? (
            <div className='space-y-1'>
              <label htmlFor='end-task-reason' className='text-sm font-medium'>
                {t('Administrator reason')}
              </label>
              <Textarea
                id='end-task-reason'
                value={reason}
                maxLength={REASON_MAX_LENGTH}
                aria-invalid={reasonTried && reasonMissing}
                aria-describedby='end-task-reason-help'
                placeholder={t(
                  'Describe the verification channel and conclusion. Do not include secrets or unsanitized responses.'
                )}
                onChange={(event) => setReason(event.target.value)}
              />
              <div
                id='end-task-reason-help'
                className='text-muted-foreground flex justify-between text-xs'
              >
                <span>{t('Recorded only in the audit log')}</span>
                <span className='tabular-nums'>
                  {reason.trim().length} / {REASON_MAX_LENGTH}
                </span>
              </div>
              {reasonTried && reasonMissing ? (
                <p className='text-destructive text-xs' role='alert'>
                  {t('Enter a reason.')}
                </p>
              ) : null}
            </div>
          ) : null}
          {releaseChosen ? (
            <label className='flex items-start gap-2 text-sm'>
              <Checkbox
                checked={impactConfirmed}
                onCheckedChange={(checked) =>
                  setImpactConfirmed(checked === true)
                }
              />
              <span>{t('I understand the impact of this operation')}</span>
            </label>
          ) : null}
          {error ? (
            <p className='text-destructive text-sm' role='alert'>
              {error}
            </p>
          ) : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant={releaseChosen ? 'destructive' : 'default'}
            disabled={
              choice === null ||
              release.isPending ||
              (releaseChosen && !impactConfirmed)
            }
            onClick={(event) => {
              event.preventDefault()
              if (choice === null) return
              if (choice === 'manual') {
                props.onOpenChange(false)
                reset()
                props.onEnterManualResult()
                return
              }
              setReasonTried(true)
              if (reasonMissing) {
                document.querySelector<HTMLElement>('#end-task-reason')?.focus()
                return
              }
              release.mutate(choice)
            }}
          >
            {t(release.isPending ? 'Submitting…' : submitLabel)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
