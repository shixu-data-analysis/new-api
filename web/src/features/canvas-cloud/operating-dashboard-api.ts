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
import { api } from '@/lib/api'

import type {
  DashboardBalancePage,
  DashboardBalanceQuery,
  DashboardCostPage,
  DashboardCostQuery,
  DashboardFlowPage,
  DashboardFlowQuery,
  DashboardSummary,
  DashboardSummaryQuery,
  ProviderBalanceAlerts,
  ProviderBalancePage,
  ProviderBalanceRecordPage,
  ProviderBalanceRow,
} from './operating-dashboard-types'

const webBase = '/canvas-api/v1/web/admin'

function idempotencyKey(scope: string): string {
  return `${scope}-${crypto.randomUUID()}`
}

export async function getOperatingDashboard(
  query: DashboardSummaryQuery,
  signal?: AbortSignal
): Promise<DashboardSummary> {
  return (
    await api.get<DashboardSummary>(`${webBase}/operating-dashboard`, {
      params: query,
      signal,
      skipErrorHandler: true,
    })
  ).data
}

export async function getOperatingDashboardBalances(
  query: DashboardBalanceQuery,
  signal?: AbortSignal
): Promise<DashboardBalancePage> {
  return (
    await api.get<DashboardBalancePage>(
      `${webBase}/operating-dashboard/point-balances`,
      { params: query, signal, skipErrorHandler: true }
    )
  ).data
}

export async function getOperatingDashboardFlows(
  query: DashboardFlowQuery,
  signal?: AbortSignal
): Promise<DashboardFlowPage> {
  return (
    await api.get<DashboardFlowPage>(
      `${webBase}/operating-dashboard/point-flows`,
      { params: query, signal, skipErrorHandler: true }
    )
  ).data
}

export async function getOperatingDashboardCosts(
  query: DashboardCostQuery,
  signal?: AbortSignal
): Promise<DashboardCostPage> {
  return (
    await api.get<DashboardCostPage>(
      `${webBase}/operating-dashboard/provider-costs`,
      { params: query, signal, skipErrorHandler: true }
    )
  ).data
}

export async function getOperatingDashboardModelOptions(
  search: string,
  signal?: AbortSignal
): Promise<{
  items: Array<{ modelKey: string; name: string; status: string }>
}> {
  return (
    await api.get<{
      items: Array<{ modelKey: string; name: string; status: string }>
    }>(`${webBase}/operating-dashboard/model-options`, {
      params: search ? { search } : {},
      signal,
    })
  ).data
}

export async function getProviderBalances(
  query: {
    providerId?: string
    sortBy: 'estimate' | 'name'
    sortOrder: 'asc' | 'desc'
    page: number
    pageSize: 10 | 20 | 30 | 40 | 50 | 100
  },
  signal?: AbortSignal
): Promise<ProviderBalancePage> {
  return (
    await api.get<ProviderBalancePage>(`${webBase}/provider-balances`, {
      params: query,
      signal,
    })
  ).data
}

export async function getProviderBalanceRecords(
  providerId: string,
  query: {
    asOf?: string
    page: number
    pageSize: 10 | 20 | 30 | 40 | 50 | 100
  },
  signal?: AbortSignal
): Promise<ProviderBalanceRecordPage> {
  return (
    await api.get<ProviderBalanceRecordPage>(
      `${webBase}/provider-balances/${encodeURIComponent(providerId)}/records`,
      { params: query, signal }
    )
  ).data
}

export async function addProviderBalanceRecord(
  providerId: string,
  input: {
    recordType: 'BALANCE' | 'TOP_UP'
    amountRmb: string
    recordedAt: string
    note?: string
  },
  requestKey = idempotencyKey('web-provider-balance-record')
): Promise<ProviderBalanceRow> {
  return (
    await api.post<ProviderBalanceRow>(
      `${webBase}/provider-balances/${encodeURIComponent(providerId)}/records`,
      input,
      { headers: { 'Idempotency-Key': requestKey }, skipErrorHandler: true }
    )
  ).data
}

/** Shared by the navigation and tab badges, and refreshed after every balance, threshold or settlement change. */
export const providerBalanceAlertsQueryKey = [
  'canvas-cloud',
  'provider-balance-alerts',
] as const

export async function getProviderBalanceAlerts(
  signal?: AbortSignal
): Promise<ProviderBalanceAlerts> {
  return (
    await api.get<ProviderBalanceAlerts>(
      `${webBase}/provider-balances/alerts`,
      {
        signal,
        skipErrorHandler: true,
      }
    )
  ).data
}

/** `null` makes the provider use the default threshold. */
export async function setProviderAlertThreshold(
  providerId: string,
  thresholdRmb: string | null
): Promise<ProviderBalanceRow> {
  return (
    await api.put<ProviderBalanceRow>(
      `${webBase}/provider-balances/${encodeURIComponent(providerId)}/alert-threshold`,
      { thresholdRmb },
      { skipErrorHandler: true }
    )
  ).data
}

/** `null` removes the default threshold. */
export async function setProviderDefaultAlertThreshold(
  thresholdRmb: string | null
): Promise<{ defaultAlertThresholdRmb: string | null; alertCount: number }> {
  return (
    await api.put<{
      defaultAlertThresholdRmb: string | null
      alertCount: number
    }>(
      `${webBase}/provider-balances/default-alert-threshold`,
      { thresholdRmb },
      { skipErrorHandler: true }
    )
  ).data
}

export async function setProviderWebsite(
  providerId: string,
  websiteUrl: string
): Promise<ProviderBalanceRow> {
  return (
    await api.put<ProviderBalanceRow>(
      `${webBase}/provider-balances/${encodeURIComponent(providerId)}/website`,
      { websiteUrl },
      { skipErrorHandler: true }
    )
  ).data
}
