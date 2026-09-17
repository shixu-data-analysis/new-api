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
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

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
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import {
  createCanvasAdminModelTag,
  deleteCanvasAdminModelTag,
  renameCanvasAdminModelTag,
  setCanvasAdminModelTagModels,
} from '../api'
import type { CanvasAdminModelTag, CanvasAdminTestingModel } from '../types'

const tagFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Required')
    .max(191, 'Name must be 191 characters or fewer'),
})
type TagForm = z.infer<typeof tagFormSchema>

function sameModelKeys(left: string[], right: string[]) {
  return [...left].sort().join(',') === [...right].sort().join(',')
}

export function ModelTagManager(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tags: CanvasAdminModelTag[]
  models: CanvasAdminTestingModel[]
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [editingTag, setEditingTag] = useState<CanvasAdminModelTag | null>(null)
  const [assigningTag, setAssigningTag] = useState<CanvasAdminModelTag | null>(
    null
  )
  const [deletingTag, setDeletingTag] = useState<CanvasAdminModelTag | null>(
    null
  )
  const [selected, setSelected] = useState<string[]>([])
  const [expected, setExpected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [discardRequest, setDiscardRequest] = useState<
    'manager' | 'assignment' | 'rename' | null
  >(null)
  const form = useForm<TagForm>({
    resolver: zodResolver(tagFormSchema),
    mode: 'onTouched',
    defaultValues: { name: '' },
  })
  const nameDraft =
    form.watch('name').trim() !== (editingTag?.name ?? '').trim()
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'admin-model-tags'],
      }),
      queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'admin-testing-models'],
      }),
    ])
  }
  const reloadAfterConflict = async () => {
    await refresh()
    const currentTags =
      queryClient.getQueryData<CanvasAdminModelTag[]>([
        'canvas-cloud',
        'admin-model-tags',
      ]) ?? props.tags
    if (editingTag) {
      const latest = currentTags.find((tag) => tag.id === editingTag.id)
      if (latest) setEditingTag(latest)
    }
    if (deletingTag) {
      const latest = currentTags.find((tag) => tag.id === deletingTag.id)
      if (latest) setDeletingTag(latest)
    }
    if (assigningTag) {
      const latest = currentTags.find((tag) => tag.id === assigningTag.id)
      if (latest) {
        const currentModels =
          queryClient.getQueryData<CanvasAdminTestingModel[]>([
            'canvas-cloud',
            'admin-testing-models',
          ]) ?? props.models
        const visibleKeys = new Set(
          currentModels.map((model) => model.modelKey)
        )
        setAssigningTag(latest)
        setExpected(latest.modelKeys)
        setSelected((draft) => [
          ...draft.filter((key) => visibleKeys.has(key)),
          ...latest.modelKeys.filter((key) => !visibleKeys.has(key)),
        ])
      }
    }
    setError('')
  }
  const closeManager = () => {
    if (mutation.isPending) return
    if (
      form.getValues('name').trim() !== (editingTag?.name ?? '').trim() ||
      (assigningTag && !sameModelKeys(selected, expected))
    ) {
      setDiscardRequest('manager')
      return
    }
    props.onOpenChange(false)
  }
  const closeAssignment = () => {
    if (mutation.isPending) return
    if (!sameModelKeys(selected, expected)) {
      setDiscardRequest('assignment')
      return
    }
    setAssigningTag(null)
  }
  const cancelRename = () => {
    if (!editingTag) return
    if (form.getValues('name').trim() !== editingTag.name.trim()) {
      setDiscardRequest('rename')
      return
    }
    setEditingTag(null)
    form.reset({ name: '' })
  }
  const discard = () => {
    if (discardRequest === 'manager') {
      props.onOpenChange(false)
      setAssigningTag(null)
      setEditingTag(null)
      form.reset({ name: '' })
    } else if (discardRequest === 'assignment') {
      setAssigningTag(null)
    } else if (discardRequest === 'rename') {
      setEditingTag(null)
      form.reset({ name: '' })
    }
    setDiscardRequest(null)
  }
  const mutation = useMutation({
    mutationFn: async (action: {
      kind: 'create' | 'rename' | 'assign' | 'delete'
      name?: string
    }) => {
      if (action.kind === 'create') {
        return createCanvasAdminModelTag(action.name ?? '')
      }
      if (action.kind === 'rename' && editingTag) {
        return renameCanvasAdminModelTag({
          id: editingTag.id,
          name: action.name ?? '',
          expectedName: editingTag.name,
        })
      }
      if (action.kind === 'assign' && assigningTag) {
        return setCanvasAdminModelTagModels({
          id: assigningTag.id,
          modelKeys: selected,
          expectedModelKeys: expected,
        })
      }
      if (action.kind === 'delete' && deletingTag) {
        return deleteCanvasAdminModelTag({
          id: deletingTag.id,
          expectedModelKeys: deletingTag.modelKeys,
        })
      }
    },
    onSuccess: async () => {
      await refresh()
      form.reset({ name: '' })
      setEditingTag(null)
      setAssigningTag(null)
      setDeletingTag(null)
      setError('')
    },
    onError: (failure: unknown) => {
      const status = (failure as { response?: { status?: number } }).response
        ?.status
      setError(
        status === 409
          ? 'Model tags changed elsewhere. Refresh and review before retrying.'
          : 'Model tag change failed'
      )
    },
  })
  const visibleModels = props.models.filter((model) =>
    `${model.name} ${model.provider.name} ${model.modelIds.map((entry) => entry.modelId).join(' ')}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase())
  )
  const openAssignment = (tag: CanvasAdminModelTag) => {
    const keys = tag.modelKeys
    setExpected(keys)
    setSelected(keys)
    setSearch('')
    setError('')
    setAssigningTag(tag)
  }
  const toggle = (key: string, checked: boolean) =>
    setSelected((current) =>
      checked
        ? [...new Set([...current, key])]
        : current.filter((item) => item !== key)
    )
  return (
    <>
      <Dialog
        open={props.open}
        onOpenChange={(open) => {
          if (!open) closeManager()
        }}
      >
        <DialogContent
          className='max-h-[90vh] overflow-y-auto'
          showCloseButton={!mutation.isPending}
        >
          <DialogHeader>
            <DialogTitle>{t('Manage model tags')}</DialogTitle>
          </DialogHeader>
          <form
            className='flex flex-wrap items-end gap-2'
            noValidate
            onSubmit={form.handleSubmit((value) =>
              mutation.mutate({
                kind: editingTag ? 'rename' : 'create',
                name: value.name.trim(),
              })
            )}
          >
            <div className='min-w-48 flex-1 space-y-1'>
              <Label htmlFor='model-tag-name'>
                {editingTag ? t('Rename tag') : t('New tag')}
              </Label>
              <Input
                id='model-tag-name'
                maxLength={191}
                disabled={mutation.isPending}
                aria-invalid={Boolean(form.formState.errors.name)}
                {...form.register('name')}
              />
              {form.formState.errors.name && (
                <p role='alert' className='text-destructive text-xs'>
                  {t(form.formState.errors.name.message ?? 'Required')}
                </p>
              )}
            </div>
            <Button type='submit' disabled={mutation.isPending}>
              {editingTag ? t('Rename') : t('Add tag')}
            </Button>
            {editingTag && (
              <Button type='button' variant='outline' onClick={cancelRename}>
                {t('Cancel')}
              </Button>
            )}
          </form>
          <div className='max-h-72 space-y-2 overflow-y-auto'>
            {props.tags.map((tag) => (
              <div
                key={tag.id}
                className='flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm'
              >
                <span className='min-w-0 break-words'>
                  {tag.name} ·{' '}
                  {t('Associated models: {{count}}', { count: tag.modelCount })}
                </span>
                <div className='flex flex-wrap gap-1'>
                  <Button
                    variant='outline'
                    disabled={mutation.isPending || nameDraft}
                    onClick={() => openAssignment(tag)}
                  >
                    {t('Associate models')}
                  </Button>
                  <Button
                    variant='outline'
                    disabled={mutation.isPending || nameDraft}
                    onClick={() => {
                      setEditingTag(tag)
                      form.reset({ name: tag.name })
                      setError('')
                    }}
                  >
                    {t('Rename')}
                  </Button>
                  <Button
                    variant='outline'
                    disabled={mutation.isPending || nameDraft}
                    onClick={() => {
                      setDeletingTag(tag)
                      setError('')
                    }}
                  >
                    {t('Delete')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {error && !assigningTag && !deletingTag && (
            <div role='alert' className='text-destructive text-sm'>
              {t(error)}{' '}
              <Button
                variant='outline'
                onClick={() => void reloadAfterConflict()}
              >
                {t('Refresh')}
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button
              variant='outline'
              onClick={closeManager}
              disabled={mutation.isPending}
            >
              {t('Done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(assigningTag)}
        onOpenChange={(open) => {
          if (!open) closeAssignment()
        }}
      >
        <DialogContent
          className='max-h-[90vh] overflow-y-auto'
          showCloseButton={!mutation.isPending}
        >
          <DialogHeader>
            <DialogTitle>
              {t('Associate models')} — {assigningTag?.name}
            </DialogTitle>
          </DialogHeader>
          <Label htmlFor='tag-model-search'>
            {t('Search model, API provider or upstream model ID')}
          </Label>
          <Input
            id='tag-model-search'
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className='flex flex-wrap gap-2'>
            <Button
              variant='outline'
              onClick={() =>
                setSelected((current) => [
                  ...new Set([
                    ...current,
                    ...visibleModels.map((model) => model.modelKey),
                  ]),
                ])
              }
            >
              {t('Select search results')}
            </Button>
            <Button
              variant='outline'
              onClick={() =>
                setSelected((current) =>
                  current.filter(
                    (key) =>
                      !visibleModels.some((model) => model.modelKey === key)
                  )
                )
              }
            >
              {t('Deselect search results')}
            </Button>
          </div>
          <div className='max-h-72 space-y-2 overflow-y-auto'>
            {visibleModels.map((model) => (
              <Label key={model.modelKey} className='flex items-center gap-2'>
                <Checkbox
                  checked={selected.includes(model.modelKey)}
                  onCheckedChange={(checked) =>
                    toggle(model.modelKey, checked === true)
                  }
                />
                {model.name}
              </Label>
            ))}
          </div>
          {error && assigningTag && (
            <div role='alert' className='text-destructive text-sm'>
              {t(error)}{' '}
              <Button
                variant='outline'
                onClick={() => void reloadAfterConflict()}
              >
                {t('Refresh')}
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button
              variant='outline'
              onClick={closeAssignment}
              disabled={mutation.isPending}
            >
              {t('Back to tags')}
            </Button>
            <Button
              disabled={mutation.isPending || sameModelKeys(selected, expected)}
              onClick={() => mutation.mutate({ kind: 'assign' })}
            >
              {t('Save associations')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(deletingTag)}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setDeletingTag(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete model tag?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'This removes the tag from {{count}} models. The models and their other tags remain.',
                { count: deletingTag?.modelCount ?? 0 }
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && deletingTag && (
            <div role='alert' className='text-destructive text-sm'>
              {t(error)}{' '}
              <Button
                variant='outline'
                onClick={() => void reloadAfterConflict()}
              >
                {t('Refresh')}
              </Button>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              {t('Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending}
              onClick={(event) => {
                event.preventDefault()
                mutation.mutate({ kind: 'delete' })
              }}
            >
              {t('Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(discardRequest)}
        onOpenChange={(open) => {
          if (!open) setDiscardRequest(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Discard changes?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('Your unsaved model tag changes will be lost.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={discard}>
              {t('Discard changes')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
