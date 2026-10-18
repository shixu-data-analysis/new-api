/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with this program.
If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { type Dispatch, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

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

import type {
  DraftCategory,
  PresentationCapability,
  PresentationDraftAction,
  PresentationSnapshot,
} from '../lib/client-presentation-draft'

/**
 * Picks the models of one generation type in a category. Ticks change the draft directly, so the category keeps
 * its models in other types and every model keeps its other categories; "Save and publish" sends them.
 */
export function ClientPresentationCategoryModelsDialog(props: {
  category: DraftCategory | null
  capability: PresentationCapability
  snapshot: PresentationSnapshot
  dispatch: Dispatch<PresentationDraftAction>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const searchId = useId()
  const [search, setSearch] = useState('')
  const category = props.category
  const normalized = search.trim().toLocaleLowerCase()
  const models = props.snapshot.orders[props.capability]
    .flatMap((modelKey) => props.snapshot.models[modelKey] ?? [])
    .filter(
      (model) =>
        !normalized ||
        `${model.displayName} ${model.modelKey} ${model.providerName}`
          .toLocaleLowerCase()
          .includes(normalized)
    )
  const setAll = (checked: boolean) => {
    if (!category) return
    for (const model of models) {
      if (model.tagIds.includes(category.id) !== checked) {
        props.dispatch({
          type: 'toggleModelCategory',
          modelKey: model.modelKey,
          tagId: category.id,
        })
      }
    }
  }
  return (
    <Dialog
      open={Boolean(category)}
      onOpenChange={(open) => {
        if (open) return
        setSearch('')
        props.onClose()
      }}
    >
      <DialogContent className='max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>
            {t('Associate models')} — {category?.name.trim() || t('(No name)')}
          </DialogTitle>
        </DialogHeader>
        <Label htmlFor={searchId}>
          {t('Search model, API provider or upstream model ID')}
        </Label>
        <Input
          id={searchId}
          value={search}
          autoComplete='off'
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className='flex flex-wrap gap-2'>
          <Button variant='outline' onClick={() => setAll(true)}>
            {t('Select search results')}
          </Button>
          <Button variant='outline' onClick={() => setAll(false)}>
            {t('Deselect search results')}
          </Button>
        </div>
        <div className='max-h-72 space-y-2 overflow-y-auto'>
          {models.map((model) => (
            <Label key={model.modelKey} className='flex items-center gap-2'>
              <Checkbox
                checked={Boolean(category && model.tagIds.includes(category.id))}
                onCheckedChange={() =>
                  category &&
                  props.dispatch({
                    type: 'toggleModelCategory',
                    modelKey: model.modelKey,
                    tagId: category.id,
                  })
                }
              />
              {model.displayName.trim() || t('(No name)')}
            </Label>
          ))}
        </div>
        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => {
              setSearch('')
              props.onClose()
            }}
          >
            {t('Done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
