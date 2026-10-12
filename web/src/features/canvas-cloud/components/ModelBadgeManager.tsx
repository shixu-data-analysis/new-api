/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { Tag, X } from 'lucide-react'
import { useState, type Dispatch } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

import {
  badgeNameError,
  type BadgeNameError,
  type PresentationDraftAction,
  type PresentationSnapshot,
} from '../lib/client-presentation-draft'
import { MODEL_BADGE_NAME_MAX_LENGTH } from '../lib/model-icons'
import { ModelColorSwatches } from './ModelColorSwatches'

function useBadgeNameMessage() {
  const { t } = useTranslation()
  return (error: BadgeNameError) => {
    if (error.kind === 'empty') return t('Enter a badge name')
    if (error.kind === 'tooLong') {
      return t('A badge has at most {{count}} characters', {
        count: MODEL_BADGE_NAME_MAX_LENGTH,
      })
    }
    return t('A badge named "{{name}}" already exists', { name: error.name })
  }
}

/** "角标管理" popover; every change goes into the draft and is published with the models. */
export function ModelBadgeManager(props: {
  draft: PresentationSnapshot
  dispatch: Dispatch<PresentationDraftAction>
}) {
  const { t } = useTranslation()
  const nameMessage = useBadgeNameMessage()
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newError, setNewError] = useState('')
  const [renaming, setRenaming] = useState<{
    id: string
    name: string
    error: string
  } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const badges = props.draft.badges
  const modelCount = (badgeId: string) =>
    Object.values(props.draft.models).filter((model) =>
      model.badgeIds.includes(badgeId)
    ).length

  function add() {
    const error = badgeNameError(badges, newName, null)
    if (error) {
      setNewError(nameMessage(error))
      return
    }
    props.dispatch({ type: 'createBadge', name: newName })
    setNewName('')
    setNewError('')
  }

  function confirmRename() {
    if (!renaming) return
    const error = badgeNameError(badges, renaming.name, renaming.id)
    if (error) {
      setRenaming({ ...renaming, error: nameMessage(error) })
      return
    }
    props.dispatch({
      type: 'updateBadge',
      id: renaming.id,
      name: renaming.name,
    })
    setRenaming(null)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Esc while renaming only cancels the rename.
        if (!next && renaming) {
          setRenaming(null)
          return
        }
        setOpen(next)
        setRenaming(null)
        setDeletingId(null)
      }}
    >
      <PopoverTrigger render={<Button type='button' variant='outline' />}>
        <Tag aria-hidden='true' />
        {t('Badge management')}
      </PopoverTrigger>
      <PopoverContent
        align='end'
        className='max-h-[560px] w-[min(400px,calc(100vw-32px))] gap-0 overflow-hidden p-0'
        aria-labelledby='model-badge-manager-title'
      >
        <header className='flex items-center justify-between gap-2 px-3.5 pt-3 pb-1.5'>
          <h3 id='model-badge-manager-title' className='text-sm font-semibold'>
            {t('Badge management')}
          </h3>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            aria-label={t('Close')}
            onClick={() => setOpen(false)}
          >
            <X aria-hidden='true' />
          </Button>
        </header>
        <div className='grid content-start gap-2.5 overflow-auto px-3.5 pb-3.5'>
          <p className='text-muted-foreground text-xs leading-normal'>
            {t(
              'Shown after the model name and not used for filtering. Changes go into the draft and are published with the model settings.'
            )}
          </p>
          <p className='text-muted-foreground text-xs leading-normal'>
            {t(
              'Each badge has at most {{count}} characters; its color comes from the preset palette.',
              { count: MODEL_BADGE_NAME_MAX_LENGTH }
            )}
          </p>
          <form
            className='flex flex-wrap gap-2'
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              add()
            }}
          >
            <Input
              className='min-w-0 flex-[1_1_180px]'
              value={newName}
              maxLength={MODEL_BADGE_NAME_MAX_LENGTH * 2}
              placeholder={t('New badge name, for example: 官渠')}
              aria-label={t('New badge name')}
              aria-invalid={Boolean(newError)}
              aria-describedby={newError ? 'model-badge-new-error' : undefined}
              autoComplete='off'
              onChange={(event) => {
                setNewName(event.target.value)
                setNewError('')
              }}
            />
            <Button type='submit'>{t('Add badge')}</Button>
          </form>
          {newError && (
            <p id='model-badge-new-error' className='text-destructive text-xs'>
              {newError}
            </p>
          )}
          <div className='grid gap-1.5'>
            {badges.length === 0 && (
              <p className='text-muted-foreground text-xs'>
                {t('No badges yet')}
              </p>
            )}
            {badges.map((badge) => {
              const count = modelCount(badge.id)
              let main = (
                <>
                  <span className='model-badge' data-model-color={badge.color}>
                    {badge.name}
                  </span>
                  <span className='text-muted-foreground text-xs'>
                    {t('{{count}} models', { count })}
                  </span>
                </>
              )
              if (renaming?.id === badge.id) {
                main = (
                  <div className='grid w-full gap-1'>
                    <div className='flex flex-wrap items-center gap-1.5'>
                      <Input
                        autoFocus
                        className='h-7 w-[140px]'
                        value={renaming.name}
                        aria-label={t('Rename {{name}}', { name: badge.name })}
                        aria-invalid={Boolean(renaming.error)}
                        onChange={(event) =>
                          setRenaming({
                            ...renaming,
                            name: event.target.value,
                            error: '',
                          })
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            confirmRename()
                          }
                        }}
                      />
                      <Button type='button' size='sm' onClick={confirmRename}>
                        {t('Apply rename')}
                      </Button>
                      <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        onClick={() => setRenaming(null)}
                      >
                        {t('Cancel')}
                      </Button>
                    </div>
                    {renaming.error && (
                      <p className='text-destructive text-xs'>
                        {renaming.error}
                      </p>
                    )}
                  </div>
                )
              } else if (deletingId === badge.id) {
                main = (
                  <div className='flex flex-wrap items-center gap-1.5 text-sm'>
                    <span>
                      {count
                        ? t(
                            'Delete "{{name}}"? It will be removed from {{count}} models.',
                            { name: badge.name, count }
                          )
                        : t('Delete "{{name}}"?', { name: badge.name })}
                    </span>
                    <Button
                      type='button'
                      size='sm'
                      variant='destructive'
                      onClick={() => {
                        props.dispatch({ type: 'deleteBadge', id: badge.id })
                        setDeletingId(null)
                      }}
                    >
                      {t('Delete')}
                    </Button>
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      onClick={() => setDeletingId(null)}
                    >
                      {t('Cancel')}
                    </Button>
                  </div>
                )
              }
              return (
                <div
                  key={badge.id}
                  className='grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5 rounded-lg border px-2.5 py-2'
                >
                  <div className='flex min-w-0 flex-wrap items-center gap-2'>
                    {main}
                  </div>
                  <div className='flex flex-wrap gap-1.5'>
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      onClick={() => {
                        setDeletingId(null)
                        setRenaming({
                          id: badge.id,
                          name: badge.name,
                          error: '',
                        })
                      }}
                    >
                      {t('Rename')}
                    </Button>
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      className='text-destructive'
                      onClick={() => {
                        setRenaming(null)
                        setDeletingId(badge.id)
                      }}
                    >
                      {t('Delete')}
                    </Button>
                  </div>
                  <div className='text-muted-foreground col-span-full flex flex-wrap items-center gap-2 text-xs'>
                    {t('Color')}
                    <ModelColorSwatches
                      size='small'
                      label={t('{{name}} color', { name: badge.name })}
                      value={badge.color}
                      onChange={(color) =>
                        props.dispatch({
                          type: 'updateBadge',
                          id: badge.id,
                          color,
                        })
                      }
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
