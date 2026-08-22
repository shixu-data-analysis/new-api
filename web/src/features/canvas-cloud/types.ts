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
export type CanvasPrincipalType = 'CUSTOMER' | 'PLATFORM_ADMIN' | 'BOSS'

export interface CanvasSession {
  principalId: string
  principalType: CanvasPrincipalType
  displayName: string
  emailMasked: string | null
}

export interface CanvasCustomerWorkspace {
  wallet: {
    availablePoints: string
    paidAvailablePoints: string
    bonusAvailablePoints: string
    lots: Array<{
      id: string
      type: string
      availablePoints: string
      remainingPoints: string
      reservedPoints: string
      expiresAt: string | null
      issuedAt: string
    }>
  }
  rechargeOrders: Array<{
    id: string
    orderNumber: string
    status: string
    currency: string
    listedAmountMinor: string
    createdAt: string
  }>
  tasks: Array<{
    id: string
    modelName: string
    quotedPoints: string
    executionStatus: string
    customerBillingStatus: string
    providerReconcileStatus: string
    acceptedAt: string
    completedAt: string | null
  }>
  ledger: Array<{
    id: string
    eventType: string
    eventPoints: string
    remainingDelta: string
    reservedDelta: string
    taskId: string | null
    refundLinkId: string | null
    reason: string | null
    occurredAt: string
  }>
}

export interface CanvasCatalogModel {
  id: string
  name: string
  catalog: Record<string, unknown>
  parameterCombinations: Array<{
    id: string
    parameters: Record<string, unknown>
    billingDimensions: Record<string, unknown>
    points: string
  }>
}

export interface CanvasRechargeOffer {
  offerVersionId: string
  currency: string
  listedAmountMinor: string
  paidPoints: string
  promotionPreview: Record<string, unknown> | null
  effectiveAt: string
}

export interface CanvasAdminWorkspace {
  principal: { principalId: string; principalType: 'PLATFORM_ADMIN' | 'BOSS' }
  channels: Array<{
    id: string
    providerName: string
    code: string
    version: number
    status: string
    protocolAdapter: string
    upstreamModel: string
    effectiveAt: string | null
  }>
  prices: Array<{
    id: string
    modelName: string
    priceGroup: string
    version: number
    status: string
    points: string
    breakEvenPoints: string
    targetMarginPoints: string
    effectiveAt: string | null
  }>
  refunds: Array<{
    id: string
    refundReference: string
    orderNumber: string
    status: string
    cashAmountMinor: string
    pointsRequested: string
    pointsClawedBack: string
    pointsOutstanding: string
    recoveryStatus: string | null
    createdAt: string
  }>
  reconciliationTasks: Array<{
    id: string
    modelName: string
    executionStatus: string
    customerBillingStatus: string
    providerReconcileStatus: string
    upstreamTaskId: string | null
    acceptedAt: string
  }>
}

export interface CanvasContributionReport {
  originalBatchContributionMinor: string
  refundAndChargebackAdjustmentsMinor: string
  adjustedContributionMinor: string
  reconciliationTimeoutLossMinor: string
  disclaimer: string
}
