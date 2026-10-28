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
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import type { TypeCategory } from '../lib/client-presentation-draft'
import { UNTAGGED_CATEGORY } from '../lib/model-categories'
import { CategoryIconTile } from './CategoryIconTile'

/**
 * Replica of the Canvas Web category menu: no "all categories", one row per category with its icon and model
 * count; the description opens only on a hovered, focused or selected row.
 */
export function ClientPresentationPreviewCategoryMenu(props: {
  categories: TypeCategory[]
  untaggedCount: number
  selected: string | null
  onSelect: (id: string) => void
  className?: string
}) {
  const { t } = useTranslation()
  const rows = [
    ...props.categories,
    ...(props.untaggedCount > 0
      ? [
          {
            id: UNTAGGED_CATEGORY,
            name: t('No category'),
            description: '',
            count: props.untaggedCount,
            iconKey: null,
            iconColor: 'gray' as const,
          },
        ]
      : []),
  ]
  return (
    <div
      role='menu'
      aria-label={t('Categories')}
      className={cn(
        'box-border grid gap-0.5 overflow-y-auto rounded-xl border p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.25)]',
        props.className
      )}
      style={{
        borderColor: 'var(--model-preview-border)',
        background: 'var(--model-preview-surface)',
        color: 'var(--model-preview-text)',
      }}
    >
      {rows.length === 0 && (
        <p
          className='m-1.5 text-xs'
          style={{ color: 'var(--model-preview-muted)' }}
        >
          {t('No models of this type are visible to customers')}
        </p>
      )}
      {rows.map((category) => {
        const checked = category.id === props.selected
        const description = category.description.trim()
        return (
          <button
            key={category.id}
            type='button'
            role='menuitemradio'
            aria-checked={checked}
            className={cn(
              'group grid w-full cursor-pointer grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-[10px] border-0 bg-transparent p-2 text-start hover:bg-[var(--model-preview-hover)]',
              checked && 'bg-[var(--model-preview-hover)]'
            )}
            style={{ color: 'var(--model-preview-text)' }}
            onClick={() => props.onSelect(category.id)}
          >
            <CategoryIconTile
              category={category}
              kind={category.id === UNTAGGED_CATEGORY ? 'untagged' : undefined}
              className='model-icon-tile--large row-span-2'
            />
            <span className='min-w-0 truncate text-sm font-[640]'>
              {category.name.trim() || t('(No name)')}
            </span>
            <span
              className='rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums'
              style={{
                background: 'var(--model-preview-hover)',
                color: 'var(--model-preview-muted)',
              }}
            >
              {category.count}
            </span>
            {description && (
              <span
                className={cn(
                  'col-start-2 col-end-4 row-start-2 mt-0.5 hidden text-xs leading-[1.45] group-hover:block group-focus-visible:block',
                  checked && 'block'
                )}
                style={{ color: 'var(--model-preview-muted)' }}
              >
                {description}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
