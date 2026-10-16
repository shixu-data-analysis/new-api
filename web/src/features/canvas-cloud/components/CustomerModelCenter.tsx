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

import type { CanvasCatalogModel } from '../types'
import { ModelCatalogCard, ModelPriceRow } from './ModelCatalogCard'
import { ModelFilterBar, UNTAGGED_TAG_ID } from './ModelFilterBar'

export function CustomerModelCenter(props: { models: CanvasCatalogModel[] }) {
  const { t } = useTranslation()
  const [capability, setCapability] = useState('')
  const [tagId, setTagId] = useState('')
  const [search, setSearch] = useState('')
  const capabilities = useMemo(
    () => [
      ...new Set(
        props.models
          .map((model) =>
            typeof model.catalog.capability === 'string'
              ? model.catalog.capability
              : ''
          )
          .filter(Boolean)
      ),
    ],
    [props.models]
  )
  const effectiveCapability = capabilities.includes(capability)
    ? capability
    : ''
  const typeModels = props.models.filter(
    (model) =>
      !effectiveCapability || model.catalog.capability === effectiveCapability
  )
  const tags = [
    ...new Map(
      typeModels.flatMap((model) => model.tags).map((tag) => [tag.id, tag])
    ).values(),
  ]
  const effectiveTagId =
    tags.some((tag) => tag.id === tagId) || tagId === UNTAGGED_TAG_ID
      ? tagId
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
  return (
    <div className='space-y-4'>
      <ModelFilterBar
        capabilities={capabilities}
        capability={effectiveCapability}
        onCapabilityChange={(value) => {
          setCapability(value)
          setTagId('')
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
              badges={model.badges}
              tags={model.tags}
              description={
                typeof model.catalog.description === 'string'
                  ? model.catalog.description
                  : undefined
              }
            >
              {model.parameterCombinations.map((combination) => (
                <ModelPriceRow
                  key={combination.id}
                  parameters={combination.parameters}
                  billingUnit={combination.billingUnit}
                  points={combination.points}
                  tokenRates={combination.tokenRates}
                />
              ))}
            </ModelCatalogCard>
          ))}
        </div>
      )}
    </div>
  )
}
