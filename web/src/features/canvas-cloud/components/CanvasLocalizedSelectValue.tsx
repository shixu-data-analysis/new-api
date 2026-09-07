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
*/
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { SelectValue } from '@/components/ui/select'

import type { CanvasBusinessTermKind } from '../business-terms'
import { BusinessTermText } from './BusinessTerm'

export function CanvasLocalizedSelectValue(props: {
  value?: string | null
  emptyLabelKey?: string
  displayValue?: ReactNode
  valueLabelKey?: string
  termKind?: CanvasBusinessTermKind
  placeholderKey?: string
}) {
  const { t } = useTranslation()
  const emptyLabelKey = props.emptyLabelKey ?? props.placeholderKey ?? 'Unknown'
  let content: ReactNode = t(emptyLabelKey)

  if (props.value) {
    content = props.displayValue ?? t(props.valueLabelKey ?? props.value)
  }
  if (props.value && props.termKind) {
    content = (
      <BusinessTermText
        kind={props.termKind}
        value={props.value}
        fallback={t('Unknown')}
      />
    )
  }

  return (
    <SelectValue
      placeholder={props.placeholderKey ? t(props.placeholderKey) : undefined}
    >
      {content}
    </SelectValue>
  )
}
