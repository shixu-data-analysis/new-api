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

/**
 * What a selected value shows. A value is never shown by translating it as it is: an enum value is not a translation key, and
 * a raw value reached the screen (the task log showed PARTIAL_SUCCESS). So the caller names how the value reads.
 */
type CanvasSelectValueLabel =
  /** Already-localized content, such as a name read from the server. */
  | { displayValue: ReactNode; valueLabelKey?: never; termKind?: never }
  /** The translation key of the selected value; undefined reads as Unknown. */
  | {
      valueLabelKey: string | undefined
      displayValue?: never
      termKind?: never
    }
  /** A business term, localized by its kind. */
  | {
      termKind: CanvasBusinessTermKind
      displayValue?: never
      valueLabelKey?: never
    }

export function CanvasLocalizedSelectValue(
  props: {
    value?: string | null
    emptyLabelKey?: string
    placeholderKey?: string
  } & CanvasSelectValueLabel
) {
  const { t } = useTranslation()
  const emptyLabelKey = props.emptyLabelKey ?? props.placeholderKey ?? 'Unknown'
  let content: ReactNode = t(emptyLabelKey)

  if (props.value && props.termKind) {
    content = (
      <BusinessTermText
        kind={props.termKind}
        value={props.value}
        fallback={t('Unknown')}
      />
    )
  } else if (props.value && props.displayValue !== undefined) {
    content = props.displayValue
  } else if (props.value) {
    content = t(props.valueLabelKey ?? 'Unknown')
  }

  return (
    <SelectValue
      placeholder={props.placeholderKey ? t(props.placeholderKey) : undefined}
    >
      {content}
    </SelectValue>
  )
}
