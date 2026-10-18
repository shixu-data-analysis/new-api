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
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { orderCapabilities } from '../lib/model-categories'
import { ModelTagFilterButton } from './ModelTagFilterButton'

/** `tagId` of the "No category" choice. */
export const UNTAGGED_TAG_ID = '__untagged__'

/**
 * The model center's filters: one generation type at a time in client order (no "all types"), categories with icons
 * and counts, and model name search. The caller chooses the type and category a page opens on.
 */
export function ModelFilterBar(props: {
  capabilities: string[]
  capability: string
  onCapabilityChange: (capability: string) => void
  tags: Array<{ id: string; name: string; count: number }>
  totalCount: number
  untaggedCount: number
  tagId: string
  onTagChange: (tagId: string) => void
  search: string
  onSearchChange: (search: string) => void
}) {
  const { t } = useTranslation()
  const searchId = useId()
  return (
    <section
      className='space-y-3 border-b pb-4'
      aria-label={t('Filter models')}
    >
      <div
        className='flex flex-wrap gap-2'
        role='group'
        aria-label={t('Generation type')}
      >
        {orderCapabilities(props.capabilities).map((value) => (
          <Button
            key={value}
            variant={props.capability === value ? 'default' : 'outline'}
            aria-pressed={props.capability === value}
            onClick={() => props.onCapabilityChange(value)}
          >
            {t(value)}
          </Button>
        ))}
      </div>
      <div
        className='flex flex-wrap gap-2'
        role='group'
        aria-label={t('Categories')}
      >
        <ModelTagFilterButton
          label={t('All categories')}
          count={props.totalCount}
          selected={!props.tagId}
          onClick={() => props.onTagChange('')}
        />
        {/* Categories without a model in the current filters stay hidden unless chosen. */}
        {props.tags
          .filter((tag) => tag.count > 0 || props.tagId === tag.id)
          .map((tag) => (
            <ModelTagFilterButton
              key={tag.id}
              label={tag.name}
              count={tag.count}
              selected={props.tagId === tag.id}
              onClick={() => props.onTagChange(tag.id)}
            />
          ))}
        {(props.untaggedCount > 0 || props.tagId === UNTAGGED_TAG_ID) && (
          <ModelTagFilterButton
            label={t('No category')}
            count={props.untaggedCount}
            selected={props.tagId === UNTAGGED_TAG_ID}
            onClick={() => props.onTagChange(UNTAGGED_TAG_ID)}
          />
        )}
      </div>
      <div className='max-w-sm space-y-1'>
        <Label htmlFor={searchId}>{t('Search model name')}</Label>
        <Input
          id={searchId}
          value={props.search}
          onChange={(event) => props.onSearchChange(event.target.value)}
          placeholder={t('Search model name')}
        />
      </div>
    </section>
  )
}
