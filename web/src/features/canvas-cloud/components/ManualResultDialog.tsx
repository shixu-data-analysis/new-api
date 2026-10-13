/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
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
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import { requestCanvasTaskManualResult } from '../api'
import type { CanvasAdminTaskRecordDetail } from '../types'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { CopyableText } from './CopyableText'

// Mirrors Cloud MANUAL_RESULT_URL_MAX_LENGTH and MANUAL_RESULT_REASON_MAX_LENGTH.
const URL_MAX_LENGTH = 2048
const REASON_MAX_LENGTH = 500

/**
 * The error key for a manual result URL, or null. Mirrors Cloud manualResultUrl: credential-free HTTP(S); Cloud keeps and
 * downloads an HTTP address over HTTPS.
 */
function manualResultUrlError(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return 'Enter the result file URL.'
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return 'Enter an HTTP or HTTPS URL without a user name or password.'
  }
  return (url.protocol === 'https:' || url.protocol === 'http:') &&
    !url.username &&
    !url.password &&
    trimmed.length <= URL_MAX_LENGTH
    ? null
    : 'Enter an HTTP or HTTPS URL without a user name or password.'
}

/**
 * Enters a manual result for one result of a task whose result is UNKNOWN with frozen points. Canvas Cloud only records it:
 * the executor that next claims the task downloads and checks the file, then settles the result or records why not.
 */
export function ManualResultDialog(props: {
  task: CanvasAdminTaskRecordDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const targets = props.task.manualResultTargets
  const eligible = targets.map((entry) => entry.outputIndex)
  // The result this manual result is for. It is fixed when the dialog opens and never moves on its own: if the task
  // changes and it can no longer take a manual result, the administrator chooses again and confirms again.
  const [target, setTarget] = useState<number | null>(null)
  const [url, setUrl] = useState('')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [tried, setTried] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const firstEligible = eligible[0] ?? null
  useEffect(() => {
    if (props.open && target === null && firstEligible !== null) {
      setTarget(firstEligible)
    }
  }, [props.open, target, firstEligible])
  const targetValid = target !== null && eligible.includes(target)
  const targetLost = target !== null && !targetValid
  // A confirmation is for one result; it lapses when that result can no longer take a manual result.
  useEffect(() => {
    if (targetLost) setConfirmed(false)
  }, [targetLost])
  const output = targetValid
    ? props.task.outputs.find((candidate) => candidate.outputIndex === target)
    : undefined
  const upstreamTaskId = targetValid
    ? (targets.find((candidate) => candidate.outputIndex === target)
        ?.upstreamTaskId ?? null)
    : null
  const chooseTarget = (value: number) => {
    setTarget(value)
    setConfirmed(false)
  }
  // A task with several results names the result even when only one can take a manual result.
  const multipleResults = props.task.outputs.length > 1
  const urlError = tried ? manualResultUrlError(url) : null
  const httpAddress = /^http:\/\//i.test(url.trim())
  let urlDescribedBy: string | undefined
  if (urlError) urlDescribedBy = 'manual-result-url-error'
  else if (httpAddress) urlDescribedBy = 'manual-result-url-hint'
  const submit = useMutation({
    mutationFn: () =>
      requestCanvasTaskManualResult(props.task.id, target as number, {
        url: url.trim(),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      }),
    onSuccess: async () => {
      props.onOpenChange(false)
      setTarget(null)
      setUrl('')
      setReason('')
      setConfirmed(false)
      setTried(false)
      setConflict(false)
      setSubmitError('')
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['canvas-cloud', 'task-record', props.task.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['canvas-cloud', 'admin-task-logs'],
        }),
      ])
      toast.success(
        t('Manual result submitted. The executor applies it shortly.')
      )
    },
    onError: async (error) => {
      const status = (error as { response?: { status?: number } }).response
        ?.status
      if (status === 409) {
        setSubmitError('')
        setConflict(true)
        await queryClient.invalidateQueries({
          queryKey: ['canvas-cloud', 'task-record', props.task.id],
        })
        return
      }
      setSubmitError(t('Unable to submit the manual result'))
    },
  })
  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('Enter a manual result')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              'The executor downloads this file and checks it like a provider result. If it passes, the result succeeds, {{points}} frozen points are deducted and the customer receives the file. If not, the result stays unchanged and the reason is shown in the manual result records.',
              { points: output?.quotedPoints ?? '—' }
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
          {targetLost ? (
            <p
              className='border-destructive/35 text-destructive rounded-md border p-3 text-sm'
              role='alert'
            >
              {eligible.length > 0
                ? t(
                    'Result {{position}} can no longer take a manual result. Choose a result and confirm again.',
                    { position: (target as number) + 1 }
                  )
                : t('No result of this task can take a manual result now.')}
            </p>
          ) : null}
          {multipleResults && eligible.length === 1 && targetValid ? (
            <div className='space-y-1'>
              <span className='text-sm font-medium'>{t('Result')}</span>
              <p className='text-sm'>
                {t('Result {{position}}', { position: (target as number) + 1 })}
              </p>
            </div>
          ) : null}
          {eligible.length > 1 || (targetLost && eligible.length > 0) ? (
            <div className='space-y-1'>
              <span
                id='manual-result-output-label'
                className='text-sm font-medium'
              >
                {t('Result')}
              </span>
              <Select
                value={targetValid ? String(target) : ''}
                onValueChange={(value) => chooseTarget(Number(value))}
              >
                <SelectTrigger
                  className='w-full min-w-0'
                  aria-labelledby='manual-result-output-label'
                  aria-describedby='manual-result-output-help'
                >
                  <CanvasLocalizedSelectValue
                    value={targetValid ? String(target) : null}
                    displayValue={t('Result {{position}}', {
                      position: (target ?? 0) + 1,
                    })}
                    placeholderKey='Choose a result'
                  />
                </SelectTrigger>
                <SelectContent>
                  {eligible.map((index) => (
                    <SelectItem key={index} value={String(index)}>
                      {t('Result {{position}}', { position: index + 1 })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p
                id='manual-result-output-help'
                className='text-muted-foreground text-xs'
              >
                {t(
                  '{{count}} results of this task can take a manual result. Enter one at a time.',
                  { count: eligible.length }
                )}
              </p>
            </div>
          ) : null}
          {targetValid ? (
            <div className='space-y-1'>
              <span className='text-sm font-medium'>
                {t('Upstream task ID')}
              </span>
              {upstreamTaskId ? (
                <div className='font-mono text-sm'>
                  <CopyableText
                    value={upstreamTaskId}
                    copyLabel={t('Upstream task ID')}
                  />
                </div>
              ) : (
                <p className='text-sm'>—</p>
              )}
              <p className='text-muted-foreground text-xs'>
                {t(
                  upstreamTaskId
                    ? "Find the result file in the API provider's console by this ID."
                    : 'This result has no API provider task ID.'
                )}
              </p>
            </div>
          ) : null}
          <div className='space-y-1'>
            <label htmlFor='manual-result-url' className='text-sm font-medium'>
              {t('Result file URL')}
            </label>
            <Input
              id='manual-result-url'
              type='url'
              inputMode='url'
              autoComplete='off'
              value={url}
              maxLength={URL_MAX_LENGTH}
              aria-invalid={urlError !== null}
              aria-describedby={urlDescribedBy}
              placeholder='https://'
              onChange={(event) => {
                // The confirmation is for one file; another address needs it again.
                setUrl(event.target.value)
                setConfirmed(false)
              }}
            />
            {!urlError && httpAddress ? (
              <p
                id='manual-result-url-hint'
                className='text-muted-foreground text-xs'
              >
                {t('This address will be downloaded over HTTPS.')}
              </p>
            ) : null}
            {urlError ? (
              <p
                id='manual-result-url-error'
                className='text-destructive text-xs'
                role='alert'
              >
                {t(urlError)}
              </p>
            ) : null}
          </div>
          <div className='space-y-1'>
            <label
              htmlFor='manual-result-reason'
              className='text-sm font-medium'
            >
              {t('Reason (optional)')}
            </label>
            <Textarea
              id='manual-result-reason'
              value={reason}
              maxLength={REASON_MAX_LENGTH}
              aria-describedby='manual-result-reason-help'
              placeholder={t(
                'Describe where the result was found. Do not include secrets.'
              )}
              onChange={(event) => setReason(event.target.value)}
            />
            <div
              id='manual-result-reason-help'
              className='text-muted-foreground flex justify-between text-xs'
            >
              <span className='ml-auto tabular-nums'>
                {reason.trim().length} / {REASON_MAX_LENGTH}
              </span>
            </div>
          </div>
          <label className='flex items-start gap-2 text-sm'>
            <Checkbox
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked === true)}
            />
            <span>
              {t(
                'I confirmed this file is the result the provider generated for this task'
              )}
            </span>
          </label>
          {submitError ? (
            <p className='text-destructive text-sm' role='alert'>
              {submitError}
            </p>
          ) : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={submit.isPending || !confirmed || !targetValid}
            onClick={(event) => {
              event.preventDefault()
              setTried(true)
              if (manualResultUrlError(url)) {
                document
                  .querySelector<HTMLElement>('#manual-result-url')
                  ?.focus()
                return
              }
              submit.mutate()
            }}
          >
            {t(submit.isPending ? 'Submitting…' : 'Submit manual result')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
