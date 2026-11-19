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
  getModelAvailabilityBadge,
  modelAvailabilityBadgeQueryKey,
} from '../model-availability-api'

/** Solid count of missing models, failed probe targets and paused providers; renders nothing at zero. */
export function ModelAvailabilityAlertBadge() {
  const { t } = useTranslation()
  const badge = useQuery({
    queryKey: modelAvailabilityBadgeQueryKey,
    queryFn: ({ signal }) => getModelAvailabilityBadge(signal),
    refetchInterval: 5 * 60_000,
  })
  const count = badge.data?.count ?? 0
  if (count === 0) return null
  return (
    <NavBadge
      tone='alert'
      label={t('{{count}} model availability alerts', { count })}
    >
      {String(count)}
    </NavBadge>
  )
}
