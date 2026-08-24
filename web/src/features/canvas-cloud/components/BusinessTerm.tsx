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
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import {
  getCanvasBusinessTerm,
  type CanvasBusinessTermKind,
} from '../business-terms'

export function BusinessTerm(props: {
  kind: CanvasBusinessTermKind
  value: string
}) {
  const { t } = useTranslation()
  const definition = getCanvasBusinessTerm(props.kind, props.value)
  if (!definition) return <span>{props.value}</span>

  const label = t(definition.labelKey)
  const help = t(definition.helpKey, { term: label })
  const textStyle =
    definition.presentation === 'text'
      ? 'border-b border-dotted border-current text-start underline-offset-4'
      : ''
  const trigger = (
    <button
      type='button'
      className={`focus-visible:ring-ring/50 cursor-help focus-visible:rounded-sm focus-visible:ring-2 focus-visible:outline-none ${textStyle}`}
      aria-label={`${label}. ${help}`}
    >
      {definition.presentation === 'badge' ? (
        <StatusBadge label={label} copyable={false} />
      ) : (
        label
      )}
    </button>
  )

  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger render={trigger} />
        <TooltipContent className='max-w-72 leading-relaxed'>
          {help}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
