/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with this program.
If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import { publishCanvasParameterCombinationControl } from '../api'
import type { CanvasAdminTestingModel } from '../types'
import { executionTargetLabel } from './execution-target-label'

type ExecutionTarget = CanvasAdminTestingModel['executionTargets'][number]

/** Confirms disabling or restoring one specification of an execution target. */
export function ParameterCombinationControlDialog(props: {
  model: CanvasAdminTestingModel
  target: ExecutionTarget
  combination: ExecutionTarget['parameterCombinations'][number]
  onClose: () => void
}) {
  const { model, target, combination, onClose } = props
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const control = useMutation({
    mutationFn: publishCanvasParameterCombinationControl,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'admin-testing-models'],
      })
      onClose()
    },
    // A rejected change usually means the state moved; refresh the list behind the dialog.
    onError: () =>
      void queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'admin-testing-models'],
      }),
  })
  const turningOff = combination.controlEnabled
  const lastEnabled = !target.parameterCombinations.some(
    (candidate) =>
      candidate.id !== combination.id &&
      candidate.enabled &&
      candidate.controlEnabled
  )
  const priced = model.pricingTargets.some(
    (price) => price.parameterCombinationId === combination.id && price.priced
  )
  let description: string
  if (turningOff) {
    description = lastEnabled
      ? t(
          'When disabled, customers no longer see this specification, and new quotes and unsubmitted earlier quotes are rejected; accepted tasks continue. Other specifications of this target are not affected. It stays disabled after a Catalog re-import. This is the last enabled specification of this target; after disabling it the whole target is no longer shown to customers.'
        )
      : t(
          'When disabled, customers no longer see this specification, and new quotes and unsubmitted earlier quotes are rejected; accepted tasks continue. Other specifications of this target are not affected. It stays disabled after a Catalog re-import.'
        )
  } else {
    description = priced
      ? t(
          'When restored, this specification is shown to customers only when runtime and pricing conditions are met.'
        )
      : t(
          'When restored, this specification is shown to customers only when runtime and pricing conditions are met. It has no price yet, so it stays hidden until priced; other specifications are not affected.'
        )
  }
  let actionLabel = turningOff
    ? t('Disable specification')
    : t('Restore specification')
  if (control.isPending) actionLabel = t('Publishing...')
  const enabledState = t('Specification enabled state')
  const disabledState = t('Specification disabled state')
  return (
    <AlertDialog
      open
      onOpenChange={(open) => !open && !control.isPending && onClose()}
    >
      <AlertDialogContent aria-busy={control.isPending}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {turningOff
              ? t('Disable specification?')
              : t('Restore specification?')}
          </AlertDialogTitle>
        </AlertDialogHeader>
        <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm'>
          <dt className='text-muted-foreground'>{t('Model')}</dt>
          <dd>{model.effectiveDisplayName}</dd>
          <dt className='text-muted-foreground'>{t('Execution target')}</dt>
          <dd>{executionTargetLabel(target, t)}</dd>
          <dt className='text-muted-foreground'>{t('Upstream model ID')}</dt>
          <dd className='break-all'>{target.upstreamModelId}</dd>
          <dt className='text-muted-foreground'>{t('Specification')}</dt>
          <dd>{t(combination.label)}</dd>
          <dt className='text-muted-foreground'>{t('Specification status')}</dt>
          <dd>
            {turningOff ? enabledState : disabledState} →{' '}
            {turningOff ? disabledState : enabledState}
          </dd>
        </dl>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        <div className='grid gap-2'>
          <Label htmlFor='parameter-combination-control-reason'>
            {t('Reason (optional)')}
          </Label>
          <Textarea
            id='parameter-combination-control-reason'
            value={reason}
            maxLength={2000}
            placeholder={t(
              'For example: the provider stopped supplying this specification'
            )}
            disabled={control.isPending}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        {control.isError && (
          <p role='alert' className='text-destructive text-sm'>
            {t(
              'Specification change failed. Refresh the model list before retrying.'
            )}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={control.isPending}>
            {t('Cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={turningOff ? 'destructive' : 'default'}
            disabled={control.isPending}
            onClick={() => {
              if (control.isPending) return
              control.mutate({
                parameterCombinationId: combination.id,
                enabled: !turningOff,
                reason,
              })
            }}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
