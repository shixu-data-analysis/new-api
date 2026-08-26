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
import type { Column } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader } from '@/components/data-table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { getCanvasBusinessTerm } from '../business-terms'

export function PricingTableColumnHeader<TData>(props: {
  column: Column<TData, unknown>
  term: string
}) {
  const { t } = useTranslation()
  const definition = getCanvasBusinessTerm('pricingField', props.term)
  const label = definition ? t(definition.labelKey) : props.term
  const help = definition ? t(definition.helpKey, { term: label }) : label

  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              className='focus-visible:ring-ring/50 rounded-sm focus-visible:ring-2 focus-visible:outline-none'
              aria-label={`${label}. ${help}`}
              tabIndex={0}
            />
          }
        >
          <DataTableColumnHeader column={props.column} title={label} />
        </TooltipTrigger>
        <TooltipContent className='max-w-72 leading-relaxed'>
          {help}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
