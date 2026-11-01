/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

/** Filters brought in by a link from another page: each shows on the toolbar and can be removed alone. */
export function ActiveFilterTags(props: {
  tags: Array<{ key: string; label: string; remove: () => void }>
}) {
  const { t } = useTranslation()
  if (props.tags.length === 0) return null
  return (
    <ul
      className='flex flex-wrap items-center gap-1'
      aria-label={t('Active filters')}
    >
      {props.tags.map((tag) => (
        <li key={tag.key}>
          <span className='bg-muted inline-flex items-center gap-1 rounded-md py-0.5 ps-2 pe-0.5 text-xs'>
            {tag.label}
            <Button
              type='button'
              variant='ghost'
              size='icon-xs'
              aria-label={t('Remove filter {{filter}}', { filter: tag.label })}
              onClick={tag.remove}
            >
              <X aria-hidden='true' />
            </Button>
          </span>
        </li>
      ))}
    </ul>
  )
}
