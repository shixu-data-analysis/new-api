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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { getServerErrorStatus } from '@/lib/server-error-message'

import { controlCanvasLogicalModel } from '../api'
import {
  getModelAvailability,
  type MissingModel,
} from '../model-availability-api'
import {
  modelControlFormSchema,
  modelDisableReasons,
  modelMonitoringReasonLabels,
} from '../model-monitoring-control'

interface Failure {
  model: MissingModel
  /** Someone else changed this model, so a retry must read its state again and be confirmed. */
  conflict: boolean
}

/** Each model goes through the single-model control, so it keeps its own version check and record. */
export function ModelAvailabilityBulkDisableDialog(props: {
  models: MissingModel[]
  onClose: () => void
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState(
    () => new Set(props.models.map((model) => model.modelKey))
  )
  const [reasonCode, setReasonCode] = useState('')
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)
  const [running, setRunning] = useState(false)
  // Set on the first submit and used by every retry, so one operation has one reason.
  const [operation, setOperation] = useState<{
    reasonCode: string
    note: string
  } | null>(null)
  const [succeeded, setSucceeded] = useState(0)
  const [noLongerNeeded, setNoLongerNeeded] = useState(0)
  const [failures, setFailures] = useState<Failure[]>([])
  const [loadFailed, setLoadFailed] = useState(false)
  const form = modelControlFormSchema(false).safeParse({ reasonCode, note })
  const issues = form.success
    ? []
    : form.error.issues.map((item) => item.path[0])
  const started = operation !== null
  const chosen = props.models.filter((model) => selected.has(model.modelKey))
  const hasConflict = failures.some((failure) => failure.conflict)
  const providers = [
    ...new Set(props.models.map((model) => model.providerName)),
  ]

  let submitLabel = t('Disable {{count}} models', { count: chosen.length })
  if (started) {
    submitLabel = t(
      hasConflict ? 'Reload and retry ({{count}})' : 'Retry failed ({{count}})',
      { count: failures.length }
    )
  }
  if (running) submitLabel = t('Saving...')

  const toggle = (keys: string[], checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      for (const key of keys) {
        if (checked) next.add(key)
        else next.delete(key)
      }
      return next
    })

  const disableEach = async (
    models: MissingModel[],
    content: { reasonCode: string; note: string }
  ) => {
    const failed: Failure[] = []
    for (const model of models) {
      try {
        await controlCanvasLogicalModel(model.modelKey, {
          enabled: false,
          expectedVersion: model.controlVersion,
          reasonCode: content.reasonCode,
          note: content.note,
          confirmed: true,
        })
        setSucceeded((count) => count + 1)
      } catch (error) {
        failed.push({ model, conflict: getServerErrorStatus(error) === 409 })
      }
    }
    setFailures(failed)
    props.onChanged()
  }

  const submitFirst = async () => {
    setTried(true)
    if (!form.success || chosen.length === 0) return
    const content = { reasonCode, note: note.trim() }
    setOperation(content)
    setRunning(true)
    await disableEach(chosen, content)
    setRunning(false)
  }

  /** Reads each model again, so a retry carries its current version and skips one that no longer needs it. */
  const retry = async (content: { reasonCode: string; note: string }) => {
    setRunning(true)
    setLoadFailed(false)
    try {
      const latest = await getModelAvailability()
      const current = new Map(
        latest.models
          .filter((model) => model.enabled)
          .map((model) => [model.modelKey, model])
      )
      const models = failures.flatMap((failure) => {
        const model = current.get(failure.model.modelKey)
        return model ? [model] : []
      })
      setNoLongerNeeded((count) => count + failures.length - models.length)
      await disableEach(models, content)
    } catch {
      setLoadFailed(true)
    }
    setRunning(false)
  }

  const submit = () => {
    if (operation) void retry(operation)
    else void submitFirst()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !running) props.onClose()
      }}
    >
      <DialogContent className='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t('Disable all missing models')}</DialogTitle>
          <DialogDescription>
            {t(
              'Disabling blocks new quotes and new task acceptance for this model. Accepted tasks continue.'
            )}
          </DialogDescription>
        </DialogHeader>

        {started ? (
          <div className='space-y-2 text-sm'>
            <p role='status'>
              {t('{{ok}} succeeded, {{failed}} failed', {
                ok: succeeded,
                failed: failures.length,
              })}
            </p>
            {noLongerNeeded > 0 ? (
              <p className='text-muted-foreground'>
                {t('{{count}} models no longer need disabling.', {
                  count: noLongerNeeded,
                })}
              </p>
            ) : null}
            {failures.map((failure) => (
              <p key={failure.model.modelKey} className='text-destructive'>
                {failure.model.displayName}:{' '}
                {t(
                  failure.conflict
                    ? 'Someone else changed this model. Review it, then retry with its latest state.'
                    : 'The change failed.'
                )}
              </p>
            ))}
            {loadFailed ? (
              <p role='alert' className='text-destructive'>
                {t('The latest state could not be loaded. Try again.')}
              </p>
            ) : null}
          </div>
        ) : (
          <div className='max-h-72 space-y-3 overflow-y-auto'>
            {providers.map((provider) => {
              const models = props.models.filter(
                (model) => model.providerName === provider
              )
              const keys = models.map((model) => model.modelKey)
              return (
                <fieldset key={provider} className='space-y-1'>
                  <Label className='font-medium'>
                    <Checkbox
                      checked={keys.every((key) => selected.has(key))}
                      disabled={running}
                      onCheckedChange={(value) => toggle(keys, Boolean(value))}
                    />
                    {provider}
                  </Label>
                  {models.map((model) => (
                    <Label key={model.modelKey} className='ms-6 font-normal'>
                      <Checkbox
                        checked={selected.has(model.modelKey)}
                        disabled={running}
                        onCheckedChange={(value) =>
                          toggle([model.modelKey], Boolean(value))
                        }
                      />
                      {model.displayName}
                    </Label>
                  ))}
                </fieldset>
              )
            })}
          </div>
        )}

        <div className='space-y-1'>
          <Label htmlFor='availability-bulk-reason'>{t('Reason')} *</Label>
          <NativeSelect
            id='availability-bulk-reason'
            value={reasonCode}
            disabled={started}
            aria-invalid={tried && issues.includes('reasonCode')}
            onChange={(event) => setReasonCode(event.target.value)}
          >
            <NativeSelectOption value=''>
              {t('Select a disable reason')}
            </NativeSelectOption>
            {modelDisableReasons.map((reason) => (
              <NativeSelectOption key={reason} value={reason}>
                {t(modelMonitoringReasonLabels[reason])}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {tried && issues.includes('reasonCode') ? (
            <p role='alert' className='text-destructive text-sm'>
              {t('Select a reason')}
            </p>
          ) : null}
        </div>
        <div className='space-y-1'>
          <Label htmlFor='availability-bulk-note'>
            {t('Additional explanation (required for Other)')}
          </Label>
          <Textarea
            id='availability-bulk-note'
            value={note}
            disabled={started}
            maxLength={1000}
            aria-invalid={tried && issues.includes('note')}
            onChange={(event) => setNote(event.target.value)}
          />
          {tried && issues.includes('note') ? (
            <p role='alert' className='text-destructive text-sm'>
              {t('Provide an explanation of up to 1000 characters')}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant='outline' disabled={running} onClick={props.onClose}>
            {started && failures.length === 0 ? t('Close') : t('Cancel')}
          </Button>
          {!started || failures.length ? (
            <Button
              variant='destructive'
              disabled={running || (!started && chosen.length === 0)}
              onClick={submit}
            >
              {submitLabel}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
