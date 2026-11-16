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
import { useTranslation } from 'react-i18next'

import { NavBadge } from '@/components/layout/components/nav-group'

import {
  getProviderBalanceAlerts,
  providerBalanceAlertsQueryKey,
} from '../operating-dashboard-api'

/** Solid count of API providers below their balance alert threshold; renders nothing when there are none. */
export function ProviderBalanceAlertBadge() {
  const { t } = useTranslation()
  const alerts = useQuery({
    queryKey: providerBalanceAlertsQueryKey,
    queryFn: ({ signal }) => getProviderBalanceAlerts(signal),
    refetchInterval: 5 * 60_000,
  })
  const count = alerts.data?.alertCount ?? 0
  if (count === 0) return null
  return (
    <NavBadge
      tone='alert'
      label={t(
        '{{count}} API providers are below their balance alert threshold',
        {
          count,
        }
      )}
    >
      {String(count)}
    </NavBadge>
  )
}
