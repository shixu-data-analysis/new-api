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
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import {
  UNTAGGED_CATEGORY,
  orderCapabilities,
  orderCategories,
} from '../lib/model-categories'
import type { CanvasCatalogCategories, CanvasCatalogModel } from '../types'
import { ModelCardPrices } from './ModelCardPrices'
import { ModelCatalogCard } from './ModelCatalogCard'
import { ModelFilterBar, UNTAGGED_TAG_ID } from './ModelFilterBar'
import { useMinuteNow } from './time-of-day-text'

export function CustomerModelCenter(props: {
  models: CanvasCatalogModel[]
  categories: CanvasCatalogCategories
  showModelIcons: boolean
}) {
  const { t } = useTranslation()
  // '' opens the first type in client order; null follows the category the type opens on.
  const [capability, setCapability] = useState('')
  const [tagId, setTagId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const capabilities = useMemo(
    () =>
      orderCapabilities(
        props.models
          .map((model) =>
            typeof model.catalog.capability === 'string'
              ? model.catalog.capability
              : ''
          )
          .filter(Boolean)
      ),
    [props.models]
  )
  const effectiveCapability = capabilities.includes(capability)
    ? capability
    : (capabilities[0] ?? '')
  const typeModels = props.models.filter(
    (model) => model.catalog.capability === effectiveCapability
  )
  const tags = orderCategories(
    [
      ...new Map(
        typeModels.flatMap((model) => model.tags).map((tag) => [tag.id, tag])
      ).values(),
    ],
    props.categories.orders[effectiveCapability] ?? []
  )
  const serverDefault = props.categories.defaults[effectiveCapability]
  let defaultTagId = ''
  if (serverDefault === UNTAGGED_CATEGORY) defaultTagId = UNTAGGED_TAG_ID
  else if (serverDefault) defaultTagId = serverDefault
  const requestedTagId = tagId ?? defaultTagId
  const effectiveTagId =
    tags.some((tag) => tag.id === requestedTagId) ||
    requestedTagId === UNTAGGED_TAG_ID
      ? requestedTagId
      : ''
  const scoped = typeModels.filter((model) => {
    if (effectiveTagId === UNTAGGED_TAG_ID) return model.tags.length === 0
    return (
      !effectiveTagId || model.tags.some((tag) => tag.id === effectiveTagId)
    )
  })
  const tagCountModels = typeModels.filter((model) =>
    model.effectiveDisplayName
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase())
  )
  const tagCountById = new Map<string, number>()
  let untaggedCount = 0
  for (const model of tagCountModels) {
    if (model.tags.length === 0) untaggedCount += 1
    for (const tag of model.tags) {
      tagCountById.set(tag.id, (tagCountById.get(tag.id) ?? 0) + 1)
    }
  }
  const visible = tagCountModels.filter((model) => {
    if (effectiveTagId === UNTAGGED_TAG_ID) return model.tags.length === 0
    return (
      !effectiveTagId || model.tags.some((tag) => tag.id === effectiveTagId)
    )
  })
  const now = useMinuteNow(
    visible.some((model) =>
      model.parameterCombinations.some((item) => item.timeOfDaySchedule)
    )
  )
  return (
    <div className='space-y-4'>
      <ModelFilterBar
        capabilities={capabilities}
        capability={effectiveCapability}
        onCapabilityChange={(value) => {
          setCapability(value)
          setTagId(null)
        }}
        tags={tags.map((tag) => ({
          ...tag,
          count: tagCountById.get(tag.id) ?? 0,
        }))}
        totalCount={tagCountModels.length}
        untaggedCount={untaggedCount}
        tagId={effectiveTagId}
        onTagChange={setTagId}
        search={search}
        onSearchChange={setSearch}
      />
      {visible.length === 0 ? (
        <div className='space-y-2 text-sm' role='status'>
          <p>
            {scoped.length
              ? t('No matching models')
              : t('No models available in this filter')}
          </p>
          {scoped.length > 0 && (
            <Button variant='outline' onClick={() => setSearch('')}>
              {t('Clear search')}
            </Button>
          )}
        </div>
      ) : (
        <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
          {visible.map((model) => (
            <ModelCatalogCard
              key={model.id}
              name={model.effectiveDisplayName}
              capability={model.catalog.capability}
              iconKey={model.iconKey}
              iconColor={model.iconColor}
              showIcon={props.showModelIcons}
              badges={model.badges}
              description={
                typeof model.catalog.description === 'string'
                  ? model.catalog.description
                  : undefined
              }
            >
              <ModelCardPrices
                prices={model.parameterCombinations.map((combination) => ({
                  ...combination,
                  key: combination.id,
                }))}
                now={now}
              />
            </ModelCatalogCard>
          ))}
        </div>
      )}
    </div>
  )
}
