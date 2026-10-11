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
import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { copyText } from '../copy-text'

export function CopyableText({
  value,
  hideValue = false,
  noTruncate = false,
  copyLabel,
}: {
  value: string
  hideValue?: boolean
  noTruncate?: boolean
  /** Names what is copied, such as "Point lot ID"; the button and the success message then say so. */
  copyLabel?: string
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  let copyName = hideValue ? `${t('Copy')} ${value}` : t('Copy')
  if (copyLabel) copyName = t('Copy {{label}}', { label: copyLabel })

  return (
    <span className='inline-flex min-w-0 items-center gap-1'>
      {!hideValue && (
        <span className={noTruncate ? 'break-all' : 'truncate'}>{value}</span>
      )}
      <Button
        type='button'
        variant='ghost'
        size='icon-sm'
        className='shrink-0'
        aria-label={copyName}
        title={copyLabel ? copyName : undefined}
        onClick={async (event) => {
          event.stopPropagation()
          const copied = await copyText(value, {
            copied: copyLabel
              ? t('Copied {{label}}', { label: copyLabel })
              : t('Copied'),
            failed: t('Failed to copy to clipboard'),
          })
          if (!copied) return
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? <Check className='size-4' /> : <Copy className='size-4' />}
      </Button>
    </span>
  )
}
