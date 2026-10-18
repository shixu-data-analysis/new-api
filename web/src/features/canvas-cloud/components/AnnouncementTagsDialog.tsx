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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
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
import { Input } from '@/components/ui/input'

import {
  announcementQueryKeys,
  getCanvasAnnouncementTags,
  replaceCanvasAnnouncementTags,
} from '../api'
import type { ModelPresentationColor } from '../lib/model-icons'
import type { CanvasAnnouncementTag } from '../types'
import { ModelColorSwatches } from './ModelColorSwatches'

const NAME_LIMIT = 6

interface DraftTag {
  key: string
  id?: string
  name: string
  color: string
  defaultAutoPopup: boolean
}

const draftOf = (tag: CanvasAnnouncementTag): DraftTag => ({
  key: tag.id,
  ...tag,
})

export function AnnouncementTagsDialog(props: { onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const id = useId()
  const tags = useQuery({
    queryKey: announcementQueryKeys.tags,
    queryFn: getCanvasAnnouncementTags,
  })
  const [draft, setDraft] = useState<DraftTag[] | null>(null)
  const [tried, setTried] = useState(false)
  const rows = draft ?? tags.data?.items.map(draftOf) ?? []
  const names = rows.map((row) => row.name.trim().toLowerCase())
  const nameError = (row: DraftTag, index: number) => {
    if (!row.name.trim()) return 'Enter a name.'
    return names.indexOf(row.name.trim().toLowerCase()) !== index
      ? 'Another tag already has this name.'
      : undefined
  }
  const invalid = rows.some((row, index) => nameError(row, index))
  const update = (key: string, patch: Partial<DraftTag>) =>
    setDraft(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  const save = useMutation({
    mutationFn: () =>
      replaceCanvasAnnouncementTags(
        rows.map((row) => ({
          ...(row.id ? { id: row.id } : {}),
          name: row.name.trim(),
          color: row.color,
          defaultAutoPopup: row.defaultAutoPopup,
        }))
      ),
    onSuccess: async (result) => {
      queryClient.setQueryData(announcementQueryKeys.tags, result)
      // A deleted tag disappears from its announcements.
      await queryClient.invalidateQueries({
        queryKey: announcementQueryKeys.all,
      })
      toast.success(t('Tags saved'))
      props.onClose()
    },
    onError: () => toast.error(t('Unable to save the tags. Please try again.')),
  })

  return (
    <Dialog
      open
      onOpenChange={(open) =>
        !open && !save.isPending ? props.onClose() : undefined
      }
    >
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('Manage tags')}</DialogTitle>
          <DialogDescription>
            {t(
              'A tag name has up to 6 characters and uses the model badge colors. Deleting a tag keeps its announcements and only removes the tag from them.'
            )}
          </DialogDescription>
        </DialogHeader>
        {/* Saving replaces the whole list, so editing starts only from the loaded list. */}
        {tags.isPending ? <LoadingState /> : null}
        {tags.isError ? (
          <ErrorState
            className='min-h-0'
            title={t('Unable to load the tags')}
            onRetry={() => void tags.refetch()}
          />
        ) : null}
        <ul className='max-h-[50vh] space-y-2 overflow-y-auto'>
          {rows.map((row, index) => {
            const error = tried ? nameError(row, index) : undefined
            return (
              <li key={row.key} className='space-y-2 rounded-lg border p-3'>
                <div className='flex items-start gap-2'>
                  <div className='min-w-0 flex-1 space-y-1'>
                    <Input
                      aria-label={t('Tag name')}
                      value={row.name}
                      maxLength={NAME_LIMIT}
                      aria-invalid={Boolean(error)}
                      aria-describedby={
                        error ? `${id}-${row.key}-error` : undefined
                      }
                      onChange={(event) =>
                        update(row.key, { name: event.target.value })
                      }
                    />
                    {error ? (
                      <p
                        id={`${id}-${row.key}-error`}
                        role='alert'
                        className='text-destructive text-xs'
                      >
                        {t(error)}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    className='text-destructive'
                    onClick={() =>
                      setDraft(rows.filter((item) => item.key !== row.key))
                    }
                  >
                    {t('Delete')}
                  </Button>
                </div>
                <ModelColorSwatches
                  label={t('Color')}
                  value={row.color}
                  onChange={(color: ModelPresentationColor) =>
                    update(row.key, { color })
                  }
                />
                <label className='text-muted-foreground flex items-center gap-2 text-sm'>
                  <Checkbox
                    checked={row.defaultAutoPopup}
                    onCheckedChange={(checked) =>
                      update(row.key, { defaultAutoPopup: checked })
                    }
                  />
                  {t(
                    'Turn on “Pop up once” by default when this tag is picked'
                  )}
                </label>
              </li>
            )
          })}
        </ul>
        <div>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={!tags.data}
            onClick={() =>
              setDraft([
                ...rows,
                {
                  key: `new-${crypto.randomUUID()}`,
                  name: '',
                  color: 'gray',
                  defaultAutoPopup: false,
                },
              ])
            }
          >
            {t('Add tag')}
          </Button>
        </div>
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            disabled={save.isPending}
            onClick={props.onClose}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='button'
            disabled={save.isPending || !tags.data}
            onClick={() => {
              setTried(true)
              if (invalid) return
              save.mutate()
            }}
          >
            {t('Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
