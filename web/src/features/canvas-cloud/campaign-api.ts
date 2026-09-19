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
import { api } from '@/lib/api'

import type {
  CanvasCampaignDraft,
  CanvasCampaignPage,
  CanvasCampaignPreview,
  CanvasCampaignTracking,
} from './campaign-types'

const webBase = '/canvas-api/v1/web'

function campaignIdempotencyKey(scope: string): string {
  return `${scope}-${crypto.randomUUID()}`
}

export async function getCanvasCampaigns(
  query: {
    page: number
    pageSize: 10 | 20 | 30 | 40 | 50 | 100
    search?: string
    status?: string
    kind?: string
    sortBy: 'name' | 'kind' | 'status' | 'startsAt' | 'endsAt' | 'createdAt'
    sortOrder: 'asc' | 'desc'
  },
  signal?: AbortSignal
): Promise<CanvasCampaignPage> {
  return (
    await api.get<CanvasCampaignPage>(`${webBase}/admin/point-campaigns`, {
      params: query,
      signal,
    })
  ).data
}

export async function previewCanvasCampaign(
  draft: CanvasCampaignDraft
): Promise<CanvasCampaignPreview> {
  return (
    await api.post<CanvasCampaignPreview>(
      `${webBase}/admin/point-campaigns/preview`,
      draft,
      { skipErrorHandler: true }
    )
  ).data
}

export async function saveCanvasCampaignDraft(input: {
  draft: CanvasCampaignDraft
  versionId?: string
  promotionId?: string
}): Promise<{
  id: string
  previewHash: string
  preview: CanvasCampaignPreview
}> {
  return (
    await api.post(`${webBase}/admin/point-campaigns/drafts`, input, {
      headers: {
        'Idempotency-Key': campaignIdempotencyKey('web-point-campaign-draft'),
      },
      skipErrorHandler: true,
    })
  ).data
}

export async function publishCanvasCampaign(id: string, previewHash: string) {
  return (
    await api.post(
      `${webBase}/admin/point-campaigns/${id}/publish`,
      { confirmed: true, previewHash },
      {
        headers: {
          'Idempotency-Key': campaignIdempotencyKey(
            'web-point-campaign-publish'
          ),
        },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function stopCanvasCampaign(id: string, reason: string) {
  return (
    await api.post(
      `${webBase}/admin/point-campaigns/${id}/stop`,
      { confirmed: true, reason },
      {
        headers: {
          'Idempotency-Key': campaignIdempotencyKey('web-point-campaign-stop'),
        },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function grantCanvasCampaign(id: string, customerId: string) {
  return (
    await api.post(
      `${webBase}/admin/point-campaigns/${id}/grants`,
      { confirmed: true, customerId },
      {
        headers: {
          'Idempotency-Key': campaignIdempotencyKey('web-point-campaign-grant'),
        },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function getCanvasCampaignTracking(
  id: string,
  query: { page: number; pageSize: 10 | 20 | 30 | 40 | 50 | 100 },
  signal?: AbortSignal
): Promise<CanvasCampaignTracking> {
  return (
    await api.get<CanvasCampaignTracking>(
      `${webBase}/admin/point-campaigns/${id}/tracking`,
      { params: query, signal }
    )
  ).data
}
