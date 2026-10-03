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

import { getCanvasAdminCustomers, getCanvasAgents } from '../api'
import { getOperatingDashboardModelOptions } from '../operating-dashboard-api'

export interface DashboardSelectOption {
  value: string
  label: string
  /** Shown after the label, such as a disabled status. */
  hint?: string
}

/**
 * Searchable single choice for the dashboard's agent and customer filters. The typed text only requests candidates; the
 * filter changes once an option is chosen. Fixed options (such as "All" or "No agent") stay at the top.
 */
function DashboardSearchSelect(props: {
  id?: string
  value: DashboardSelectOption
  fixedOptions: DashboardSelectOption[]
  placeholder: string
  load: (
    search: string,
    signal: AbortSignal
  ) => Promise<DashboardSelectOption[]>
  queryKey: string
  onChange: (option: DashboardSelectOption) => void
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search.trim(), 300)
  const candidates = useQuery({
    queryKey: [
      'canvas-cloud',
      'operating-dashboard',
      'options',
      props.queryKey,
      debounced,
    ],
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
    <Combobox<DashboardSelectOption>
      items={items}
      value={props.value}
      filter={null}
      itemToStringLabel={(option) => option.label}
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
          {(option: DashboardSelectOption) => (
            <ComboboxItem key={option.value} value={option}>
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

export const ALL_OPTION_VALUE = '__all__'
export const NO_AGENT_OPTION_VALUE = '__none__'

export function DashboardAgentSelect(props: {
  id?: string
  value: DashboardSelectOption
  onChange: (option: DashboardSelectOption) => void
}) {
  const { t } = useTranslation()
  return (
    <DashboardSearchSelect
      id={props.id}
      value={props.value}
      queryKey='agents'
      placeholder={t('All agents')}
      fixedOptions={[
        { value: ALL_OPTION_VALUE, label: t('All agents') },
        { value: NO_AGENT_OPTION_VALUE, label: t('No agent') },
      ]}
      load={async (search, signal) =>
        (
          await getCanvasAgents(
            {
              page: 1,
              pageSize: 20,
              ...(search ? { search } : {}),
              sortBy: 'username',
              sortOrder: 'asc',
            },
            signal
          )
        ).items.map((agent) => ({
          value: agent.principalId,
          label: agent.username,
          ...(agent.status === 'DISABLED' ? { hint: t('Disabled') } : {}),
        }))
      }
      onChange={props.onChange}
    />
  )
}

export function DashboardCustomerSelect(props: {
  id?: string
  value: DashboardSelectOption
  onChange: (option: DashboardSelectOption) => void
}) {
  const { t } = useTranslation()
  const statusLabels: Partial<Record<string, string>> = {
    SUSPENDED: 'Suspended',
    CLOSED: 'Closed',
  }
  const hint = (label: string | undefined) => (label ? { hint: t(label) } : {})
  return (
    <DashboardSearchSelect
      id={props.id}
      value={props.value}
      queryKey='customers'
      placeholder={t('All customers')}
      fixedOptions={[{ value: ALL_OPTION_VALUE, label: t('All customers') }]}
      load={async (search, signal) =>
        (
          await getCanvasAdminCustomers(
            {
              page: 1,
              pageSize: 20,
              ...(search ? { username: search } : {}),
              sortBy: 'customer',
              sortOrder: 'asc',
            },
            signal
          )
        ).items.map((customer) => ({
          value: customer.customerId,
          label: customer.username ?? customer.customerId,
          ...hint(statusLabels[customer.status]),
        }))
      }
      onChange={props.onChange}
    />
  )
}

export function DashboardModelSelect(props: {
  id?: string
  value: DashboardSelectOption
  onChange: (option: DashboardSelectOption) => void
}) {
  const { t } = useTranslation()
  return (
    <DashboardSearchSelect
      id={props.id}
      value={props.value}
      queryKey='models'
      placeholder={t('All models')}
      fixedOptions={[{ value: ALL_OPTION_VALUE, label: t('All models') }]}
      load={async (search, signal) =>
        (await getOperatingDashboardModelOptions(search, signal)).items.map(
          (model) => ({
            value: model.modelKey,
            label: model.name,
            hint: model.modelKey,
          })
        )
      }
      onChange={props.onChange}
    />
  )
}
