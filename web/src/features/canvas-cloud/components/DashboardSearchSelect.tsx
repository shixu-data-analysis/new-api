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

import { agentQualificationLabelKey } from '../agent-earnings-format'
import { getCanvasAgents } from '../api'
import { searchCanvasCustomers } from '../customer-search'
import { getOperatingDashboardModelOptions } from '../operating-dashboard-api'
import { SearchSelect, type SearchSelectOption } from './SearchSelect'

export const ALL_OPTION_VALUE = '__all__'
export const NO_AGENT_OPTION_VALUE = '__none__'

export function DashboardAgentSelect(props: {
  id?: string
  value: SearchSelectOption
  onChange: (option: SearchSelectOption) => void
}) {
  const { t } = useTranslation()
  return (
    <SearchSelect
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
          ...(agent.status === 'DISABLED'
            ? { hint: t(agentQualificationLabelKey('DISABLED')) }
            : {}),
        }))
      }
      onChange={props.onChange}
    />
  )
}

export function DashboardCustomerSelect(props: {
  id?: string
  value: SearchSelectOption
  onChange: (option: SearchSelectOption) => void
}) {
  const { t } = useTranslation()
  const statusLabels: Partial<Record<string, string>> = {
    SUSPENDED: 'Suspended',
    CLOSED: 'Closed',
  }
  const hint = (label: string | undefined) => (label ? { hint: t(label) } : {})
  return (
    <SearchSelect
      id={props.id}
      value={props.value}
      queryKey='customers'
      placeholder={t('All customers')}
      fixedOptions={[{ value: ALL_OPTION_VALUE, label: t('All customers') }]}
      load={async (search, signal) =>
        (await searchCanvasCustomers(search, signal)).map((customer) => ({
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
  value: SearchSelectOption
  onChange: (option: SearchSelectOption) => void
}) {
  const { t } = useTranslation()
  return (
    <SearchSelect
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
