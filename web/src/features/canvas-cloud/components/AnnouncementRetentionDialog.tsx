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
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

import { announcementQueryKeys, setCanvasAnnouncementRetention } from '../api'
import { announcementDeleteAfterLabelKey } from '../lib/announcement-labels'
import type { CanvasAnnouncementRetention } from '../types'

const PRESET_DAYS = [7, 14, 30] as const
const DELETE_AFTER = [null, 30, 90] as const

export function AnnouncementRetentionDialog(props: {
  retention: CanvasAnnouncementRetention
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const id = useId()
  const preset = PRESET_DAYS.find(
    (days) => days === props.retention.visibleDays
  )
  const [choice, setChoice] = useState<number | 'custom'>(preset ?? 'custom')
  const [customDays, setCustomDays] = useState(
    preset ? '' : String(props.retention.visibleDays)
  )
  const [deleteAfter, setDeleteAfter] = useState(
    props.retention.deleteAfterOfflineDays
  )
  const [tried, setTried] = useState(false)
  const customValid =
    /^\d+$/.test(customDays) &&
    Number(customDays) >= 1 &&
    Number(customDays) <= 365
  const visibleDays = choice === 'custom' ? Number(customDays) : choice
  const save = useMutation({
    mutationFn: () =>
      setCanvasAnnouncementRetention({
        visibleDays,
        deleteAfterOfflineDays: deleteAfter,
      }),
    onSuccess: async (result) => {
      queryClient.setQueryData(announcementQueryKeys.retention, result)
      // Statuses and offline times in the list follow the visible days.
      await queryClient.invalidateQueries({
        queryKey: announcementQueryKeys.all,
      })
      toast.success(t('Settings saved'))
      props.onClose()
    },
    onError: () =>
      toast.error(t('Unable to save the settings. Please try again.')),
  })
  const showCustomError = tried && choice === 'custom' && !customValid

  return (
    <Dialog
      open
      onOpenChange={(open) =>
        !open && !save.isPending ? props.onClose() : undefined
      }
    >
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('Visible time and cleanup')}</DialogTitle>
          <DialogDescription>
            {t(
              'Announcements published longer ago than the visible time go offline automatically: customers no longer see them and they no longer pop up.'
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-4'
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            setTried(true)
            if (choice === 'custom' && !customValid) return
            save.mutate()
          }}
        >
          <fieldset className='space-y-2'>
            <legend className='text-sm font-medium'>
              {t('Visible to customers for')}
            </legend>
            {PRESET_DAYS.map((days) => (
              <label key={days} className='flex items-center gap-2 text-sm'>
                <input
                  type='radio'
                  name={`${id}-visible`}
                  checked={choice === days}
                  onChange={() => setChoice(days)}
                />
                {t('{{count}} days', { count: days })}
              </label>
            ))}
            <label className='flex flex-wrap items-center gap-2 text-sm'>
              <input
                type='radio'
                name={`${id}-visible`}
                checked={choice === 'custom'}
                onChange={() => setChoice('custom')}
              />
              {t('Custom')}
              <Input
                aria-label={t('Visible days')}
                inputMode='numeric'
                className='w-20'
                value={customDays}
                aria-invalid={showCustomError}
                aria-describedby={
                  showCustomError ? `${id}-custom-error` : undefined
                }
                onFocus={() => setChoice('custom')}
                onChange={(event) => {
                  setChoice('custom')
                  setCustomDays(event.target.value)
                }}
              />
              {t('days')}
            </label>
            {showCustomError ? (
              <p
                id={`${id}-custom-error`}
                role='alert'
                className='text-destructive text-xs'
              >
                {t('Enter a whole number from 1 to 365')}
              </p>
            ) : null}
          </fieldset>
          <fieldset className='space-y-2 border-t border-dashed pt-4'>
            <legend className='text-sm font-medium'>
              {t('Delete after going offline')}
            </legend>
            {DELETE_AFTER.map((days) => (
              <label
                key={String(days)}
                className='flex items-center gap-2 text-sm'
              >
                <input
                  type='radio'
                  name={`${id}-delete`}
                  checked={deleteAfter === days}
                  onChange={() => setDeleteAfter(days)}
                />
                {t(announcementDeleteAfterLabelKey(days))}
              </label>
            ))}
            <p className='text-muted-foreground text-xs'>
              {t(
                'Deleted announcements no longer show for customers or here; the operation log keeps their title, body, publish time and deletion time.'
              )}
            </p>
          </fieldset>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={save.isPending}
              onClick={props.onClose}
            >
              {t('Cancel')}
            </Button>
            <Button type='submit' disabled={save.isPending}>
              {t('Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
