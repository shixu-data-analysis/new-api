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
import { describe, expect, it, vi } from 'vitest'

import {
  grantCanvasCampaign,
  previewCanvasCampaign,
  publishCanvasCampaign,
  saveCanvasCampaignDraft,
  stopCanvasCampaign,
} from '../../campaign-api'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: mocks }))

const draft = {
  name: 'Manual launch',
  kind: 'MANUAL_BONUS' as const,
  bonusPoints: '100',
  bonusTtlDays: 30,
  startsAt: '2026-09-05T00:00:00.000Z',
  endsAt: '2026-09-06T00:00:00.000Z',
  pointBudget: '1000',
  referenceBudgetMinor: '0',
  maxParticipants: '10',
  expectedParticipants: '10',
  customerIds: [],
  reason: 'UAT',
}

describe('point campaign API boundary', () => {
  it('keeps preview read-only and sends confirmed mutations to campaign endpoints', async () => {
    mocks.post.mockResolvedValue({ data: {} })
    await previewCanvasCampaign(draft)
    expect(mocks.post).toHaveBeenLastCalledWith(
      '/canvas-api/v1/web/admin/point-campaigns/preview',
      draft,
      { skipErrorHandler: true }
    )

    await saveCanvasCampaignDraft({ draft, promotionId: 'promotion-id' })
    await publishCanvasCampaign('version-id', 'preview-hash')
    await stopCanvasCampaign('version-id', 'expired terms')
    await grantCanvasCampaign('version-id', 'customer-id')

    expect(mocks.post.mock.calls.slice(-4).map((call) => call[0])).toEqual([
      '/canvas-api/v1/web/admin/point-campaigns/drafts',
      '/canvas-api/v1/web/admin/point-campaigns/version-id/publish',
      '/canvas-api/v1/web/admin/point-campaigns/version-id/stop',
      '/canvas-api/v1/web/admin/point-campaigns/version-id/grants',
    ])
    expect(mocks.post.mock.calls.at(-3)?.[1]).toEqual({
      confirmed: true,
      previewHash: 'preview-hash',
    })
    expect(mocks.post.mock.calls.at(-2)?.[1]).toEqual({
      confirmed: true,
      reason: 'expired terms',
    })
    expect(mocks.post.mock.calls.at(-1)?.[1]).toEqual({
      confirmed: true,
      customerId: 'customer-id',
    })
  })
})
