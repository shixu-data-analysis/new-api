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
import { Plus, X } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

const QUICK_REPLY_LIMITS = { count: 20, length: 500 } as const

/** One group of 快捷回复 in 客服设置: plain texts, added and removed here, saved with the settings. */
export function SupportQuickRepliesField(props: {
  label: string
  values: string[]
  onChange: (values: string[]) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const [draft, setDraft] = useState('')
  const text = draft.trim()
  const full = props.values.length >= QUICK_REPLY_LIMITS.count
  // Each text is its own key, so the same text is not added twice.
  const duplicate = props.values.includes(text)
  const add = () => {
    if (!text || full || duplicate) return
    props.onChange([...props.values, text])
    setDraft('')
  }

  return (
    <div className='space-y-2'>
      <span className='text-sm font-medium' id={`${id}-label`}>
        {props.label}
      </span>
      {props.values.length > 0 ? (
        <ul className='space-y-1.5' aria-labelledby={`${id}-label`}>
          {props.values.map((value) => (
            <li key={value} className='flex items-start gap-1.5'>
              <p className='flex-1 rounded-lg border px-2.5 py-1 text-xs leading-5 whitespace-pre-wrap'>
                {value}
              </p>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='size-8 shrink-0'
                aria-label={t('Remove this quick reply')}
                onClick={() =>
                  props.onChange(props.values.filter((item) => item !== value))
                }
              >
                <X aria-hidden='true' />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className='text-muted-foreground text-xs'>{t('No quick replies')}</p>
      )}
      <div className='flex items-start gap-1.5'>
        <Textarea
          className='min-h-9 flex-1 resize-none text-sm'
          rows={1}
          value={draft}
          maxLength={QUICK_REPLY_LIMITS.length}
          disabled={full}
          placeholder={
            full
              ? t('At most {{count}} quick replies', {
                  count: QUICK_REPLY_LIMITS.count,
                })
              : t('Add a quick reply')
          }
          aria-label={t('Add a quick reply')}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={!text || full || duplicate}
          onClick={add}
        >
          <Plus aria-hidden='true' />
          {t('Add')}
        </Button>
      </div>
    </div>
  )
}
