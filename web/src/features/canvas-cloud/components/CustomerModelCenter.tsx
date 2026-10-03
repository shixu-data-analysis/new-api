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
import { Box, Image as ImageIcon, Video } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { IconBadge } from '@/components/ui/icon-badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import type {
  CanvasBillingUnit,
  CanvasCatalogModel,
  CanvasTokenCategory,
  CanvasTokenRateVector,
} from '../types'
import { ModelTagFilterButton } from './ModelTagFilterButton'

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
    tags.some((tag) => tag.id === tagId) || tagId === '__untagged__'
      ? tagId
      : ''
  const scoped = typeModels.filter((model) => {
    if (effectiveTagId === '__untagged__') return model.tags.length === 0
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
    if (effectiveTagId === '__untagged__') return model.tags.length === 0
    return (
      !effectiveTagId || model.tags.some((tag) => tag.id === effectiveTagId)
    )
  })
  return (
    <div className='space-y-4'>
      <section
        className='space-y-3 border-b pb-4'
        aria-label={t('Filter models')}
      >
        <div
          className='flex flex-wrap gap-2'
          role='group'
          aria-label={t('Generation type')}
        >
          <Button
            variant={!effectiveCapability ? 'default' : 'outline'}
            aria-pressed={!effectiveCapability}
            onClick={() => {
              setCapability('')
              setTagId('')
            }}
          >
            {t('All types')}
          </Button>
          {capabilities.map((value) => (
            <Button
              key={value}
              variant={effectiveCapability === value ? 'default' : 'outline'}
              aria-pressed={effectiveCapability === value}
              onClick={() => {
                setCapability(value)
                setTagId('')
              }}
            >
              {t(value)}
            </Button>
          ))}
        </div>
        <div
          className='flex flex-wrap gap-2'
          role='group'
          aria-label={t('Model tags')}
        >
          <ModelTagFilterButton
            label={t('All tags')}
            count={tagCountModels.length}
            selected={!effectiveTagId}
            onClick={() => setTagId('')}
          />
          {tags.map((tag) => (
            <ModelTagFilterButton
              key={tag.id}
              label={tag.name}
              count={tagCountById.get(tag.id) ?? 0}
              selected={effectiveTagId === tag.id}
              onClick={() => setTagId(tag.id)}
            />
          ))}
          <ModelTagFilterButton
            label={t('Untagged')}
            count={untaggedCount}
            selected={effectiveTagId === '__untagged__'}
            onClick={() => setTagId('__untagged__')}
          />
        </div>
        <div className='max-w-sm space-y-1'>
          <Label htmlFor='customer-model-search'>
            {t('Search model name')}
          </Label>
          <Input
            id='customer-model-search'
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('Search model name')}
          />
        </div>
      </section>
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
            <Card
              key={model.id}
              className='ring-foreground/15 hover:ring-primary/55 shadow-xs transition-shadow motion-reduce:transition-none'
            >
              <CardHeader className='grid-cols-[auto_minmax(0,1fr)] gap-x-3'>
                <CapabilityIcon capability={model.catalog.capability} />
                <CardTitle className='min-w-0 break-words'>
                  {model.effectiveDisplayName}
                </CardTitle>
                <CardDescription className='flex min-w-0 flex-wrap items-center gap-1.5'>
                  <span>
                    {model.catalog.capability
                      ? t(String(model.catalog.capability))
                      : t('Canvas model')}
                  </span>
                  {model.tags.map((tag) => (
                    <Badge key={tag.id} variant='secondary'>
                      {tag.name}
                    </Badge>
                  ))}
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-2'>
                {model.parameterCombinations.map((combination) => (
                  <div
                    key={combination.id}
                    className='bg-muted flex items-center justify-between gap-2 rounded-lg border px-3 py-2'
                  >
                    <span className='truncate font-medium'>
                      {Object.values(combination.parameters).join(' · ') ||
                        t('Default')}
                    </span>
                    <span className='shrink-0 tabular-nums'>
                      <span className='text-[15px] font-bold'>
                        {combination.billingUnit === 'MILLION_TOKENS' &&
                        combination.tokenRates
                          ? tokenRateSummary(combination.tokenRates, t)
                          : combination.points}
                      </span>
                      <span className='text-muted-foreground ms-1 text-xs'>
                        {t(pointsUnitKey(combination.billingUnit))}
                      </span>
                    </span>
                  </div>
                ))}
                {typeof model.catalog.description === 'string' &&
                  model.catalog.description.trim() && (
                    <p className='text-muted-foreground text-[13px] break-words whitespace-pre-wrap'>
                      {model.catalog.description}
                    </p>
                  )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// Customer price unit mirrors Canvas Web; unknown units stay plain points.
function pointsUnitKey(billingUnit: CanvasBillingUnit) {
  if (billingUnit === 'SECOND') return 'points per second'
  if (billingUnit === 'MILLION_TOKENS') return 'points per million tokens'
  if (billingUnit === 'REQUEST') return 'points per request'
  return 'points'
}

const tokenCategoryLabel: Record<CanvasTokenCategory, string> = {
  input: 'Input',
  output: 'Output',
  cacheRead: 'Cache read',
  cacheWrite: 'Cache write',
}

function tokenRateSummary(
  rates: Partial<CanvasTokenRateVector>,
  t: (key: string) => string
) {
  return (Object.keys(tokenCategoryLabel) as CanvasTokenCategory[])
    .filter((category) => typeof rates[category] === 'string')
    .map((category) => `${t(tokenCategoryLabel[category])} ${rates[category]}`)
    .join(' · ')
}

// Leading visual anchor for each card; the capability text beside the title stays the
// accessible label, so the icon is decorative.
export function CapabilityIcon(props: { capability: unknown }) {
  if (props.capability === 'video.generate') {
    return (
      <IconBadge tone='chart-3' size='title' className='row-span-2'>
        <Video />
      </IconBadge>
    )
  }
  if (props.capability === 'image.generate') {
    return (
      <IconBadge tone='chart-1' size='title' className='row-span-2'>
        <ImageIcon />
      </IconBadge>
    )
  }
  return (
    <IconBadge tone='neutral' size='title' className='row-span-2'>
      <Box />
    </IconBadge>
  )
}
