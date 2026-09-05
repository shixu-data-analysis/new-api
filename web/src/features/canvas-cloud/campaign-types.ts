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
export type CanvasCampaignKind =
  | 'RECHARGE_BONUS'
  | 'INVITE_BONUS'
  | 'MANUAL_BONUS'
  | 'TASK_PRICE_SPECIAL'

export type CanvasCampaignStatus =
  | 'DRAFT'
  | 'APPROVED'
  | 'ACTIVE'
  | 'STOPPED'
  | 'EXPIRED'
  | 'RETIRED'

export interface CanvasCampaignDraft {
  name: string
  kind: Exclude<CanvasCampaignKind, 'TASK_PRICE_SPECIAL'>
  bonusPoints: string
  bonusTtlDays: number
  startsAt: string
  endsAt: string
  pointBudget: string
  referenceBudgetMinor: string
  maxParticipants: string
  expectedParticipants: string
  customerIds: string[]
  rechargeAmountMinor?: string
  reason: string
}

export interface CanvasCampaignPreview {
  at: string
  plannedParticipants: string
  plannedBonusPoints: string
  paidPointsPerParticipation: string
  referencePerParticipationMinor: string
  issuanceRateVersionId: string | null
  projection: {
    beforePoints: string
    afterPoints: string
    addedPoints: string
    beforeReferenceAmountRmb: string
    afterReferenceAmountRmb: string
    beforeAverageRmbPerPoint: string | null
    afterAverageRmbPerPoint: string | null
    dilutionRate: string | null
  }
}

export interface CanvasCampaignUsage {
  participants: string
  points: string
  reference: string
}

export interface CanvasCampaign {
  id: string
  promotionId: string
  version: number
  name: string
  kind: CanvasCampaignKind
  status: CanvasCampaignStatus
  startsAt: string
  endsAt: string
  createdAt: string
  actorName: string
  draft: CanvasCampaignDraft | null
  preview: CanvasCampaignPreview | null
  previewHash: string | null
  usage: CanvasCampaignUsage
}

export interface CanvasCampaignPage {
  items: CanvasCampaign[]
  total: number
  page: number
  pageSize: number
}

export interface CanvasCampaignTracking {
  id: string
  at: string
  preview: CanvasCampaignPreview | null
  usage: CanvasCampaignUsage
  taskTotals: {
    settledPoints: string
    releasedPoints: string
    referenceAmountRmb: string
  }
  totals: {
    issuedPoints: string
    availablePoints: string
    reservedPoints: string
  }
  events: Array<{
    eventType: string
    points: string
    referenceAmountRmb: string
  }>
  admissions: Array<{
    id: string
    acceptedAt: string
    customerName: string | null
    actorName: string | null
    bonusPoints: string
    referenceMinor: string
    rechargeOrderId: string | null
    orderNumber: string | null
    orderStatus: string | null
    rechargeCodeStatus: 'ACTIVE' | 'REDEEMED' | 'VOID' | 'EXPIRED' | null
    pointLotId: string | null
    inviteClaimId: string | null
    inviteStatus: string | null
    taskId: string | null
    billingStatus: string | null
    discountPoints: string | null
  }>
  total: number
  page: number
  pageSize: number
}
