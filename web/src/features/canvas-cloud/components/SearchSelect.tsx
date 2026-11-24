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
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import { useDebounce } from '@/hooks'

export interface SearchSelectOption {
  value: string
  label: string
  /** Shown after the label, such as a disabled status. */
  hint?: string
  /** Listed but not choosable; the hint says why. */
  disabled?: boolean
}

/**
 * Searchable single choice: the operating dashboard's agent, customer and model filters, and the customer of 发起会话. The
 * typed text only requests candidates; the choice changes once an option is chosen. Fixed options (such as "All" or "No
 * agent") stay at the top.
 */
export function SearchSelect(props: {
  id?: string
  value: SearchSelectOption
  fixedOptions: SearchSelectOption[]
  placeholder: string
  load: (search: string, signal: AbortSignal) => Promise<SearchSelectOption[]>
  queryKey: string
  onChange: (option: SearchSelectOption) => void
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search.trim(), 300)
  const candidates = useQuery({
    queryKey: ['canvas-cloud', 'search-select', props.queryKey, debounced],
    queryFn: ({ signal }) => props.load(debounced, signal),
    staleTime: 30_000,
  })
  const items = [
    ...props.fixedOptions,
    ...(candidates.data ?? []).filter(
      (option) =>
        !props.fixedOptions.some((fixed) => fixed.value === option.value)
    ),
  ]
  return (
    <Combobox<SearchSelectOption>
      items={items}
      value={props.value}
      filter={null}
      // A fixed option shows its label in the current language, not the one saved when it was chosen. The value object
      // itself stays as chosen: a new object on every render would make the combobox overwrite the typed search.
      itemToStringLabel={(option) =>
        props.fixedOptions.find((fixed) => fixed.value === option.value)
          ?.label ?? option.label
      }
      isItemEqualToValue={(left, right) => left.value === right.value}
      onInputValueChange={(value, details) => {
        if (details.reason === 'input-change') setSearch(value)
      }}
      onValueChange={(option) => {
        if (option) props.onChange(option)
        setSearch('')
      }}
    >
      <ComboboxInput
        id={props.id}
        className='w-full'
        placeholder={props.placeholder}
      />
      <ComboboxContent>
        <ComboboxEmpty>
          {candidates.isFetching ? t('Loading…') : t('No matching results')}
        </ComboboxEmpty>
        <ComboboxList>
          {(option: SearchSelectOption) => (
            <ComboboxItem
              key={option.value}
              value={option}
              disabled={option.disabled}
            >
              <span className='truncate'>{option.label}</span>
              {option.hint ? (
                <span className='text-muted-foreground ms-2 shrink-0 text-xs'>
                  {option.hint}
                </span>
              ) : null}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
