/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { api } from '@/lib/api'

import type {
  CanvasActivityDetail,
  CanvasActivityEligibleCustomerPage,
  CanvasActivityPage,
  CanvasActivityStatus,
  CanvasActivityType,
  CanvasBonusActivity,
  CanvasEligibilityBasis,
  CanvasManualGrantMemberPage,
  CanvasManualGrantPlan,
  CanvasManualGrantSchedule,
  CanvasManualGrantScope,
  CanvasManualGrantUpdateScope,
  CanvasActivityRecordPage,
  CanvasInviteBonusGrantRecord,
  CanvasLimitedPriceParticipationTaskRecord,
  CanvasRechargeBonusBindingRecord,
} from './activity-types'

const webBase = '/canvas-api/v1/web/admin/activities'

function idempotencyKey(scope: string): string {
  return `${scope}-${crypto.randomUUID()}`
}

export interface CanvasActivityListQuery {
  page: number
  pageSize: 10 | 20 | 30 | 40 | 50 | 100
  name?: string
  type?: CanvasActivityType
  status?: CanvasActivityStatus
  createdFrom?: string
  createdTo?: string
  sortBy: 'name' | 'type' | 'status' | 'createdAt'
  sortOrder: 'asc' | 'desc'
}

export interface CanvasEligibleCustomerQuery {
  page: number
  pageSize: 10 | 20 | 30 | 40 | 50 | 100
  username?: string
  minimumRechargeAmountMinor?: string
  currency?: 'CNY'
  redeemedFrom?: string
  redeemedTo?: string
  selectionToken?: string
}

export async function getCanvasActivities(
  query: CanvasActivityListQuery,
  signal?: AbortSignal
): Promise<CanvasActivityPage> {
  return (await api.get<CanvasActivityPage>(webBase, { params: query, signal }))
    .data
}

export async function getCanvasEligibleActivityCustomers(
  query: CanvasEligibleCustomerQuery,
  signal?: AbortSignal
): Promise<CanvasActivityEligibleCustomerPage> {
  return (
    await api.get<CanvasActivityEligibleCustomerPage>(
      `${webBase}/eligible-customers`,
      { params: query, signal }
    )
  ).data
}

export async function getCanvasBindableBonusActivities(
  type: 'RECHARGE_BONUS' | 'INVITE_BONUS',
  signal?: AbortSignal
): Promise<CanvasBonusActivity[]> {
  return (
    await api.get<CanvasBonusActivity[]>(`${webBase}/bindable`, {
      params: { type },
      signal,
    })
  ).data
}

export async function resolveCanvasEligibleActivityCustomers(input: {
  username?: string
  minimumRechargeAmountMinor?: string
  currency?: 'CNY'
  redeemedFrom?: string
  redeemedTo?: string
}): Promise<{
  selectionToken: string
  count: number
  expiresAt: string
}> {
  return (
    await api.post(
      `${webBase}/eligible-customers/selection`,
      { ...input, confirmed: true },
      {
        headers: { 'Idempotency-Key': idempotencyKey('web-activity-resolve') },
      }
    )
  ).data
}

export async function createCanvasManualBonusActivity(input: {
  name: string
  points: string
  ttlDays: number
  reason: string
  scope: CanvasManualGrantScope
  schedule: CanvasManualGrantSchedule
}): Promise<CanvasManualGrantPlan> {
  return (
    await api.post<CanvasManualGrantPlan>(
      `${webBase}/manual-bonuses`,
      { ...input, confirmed: true },
      { headers: { 'Idempotency-Key': idempotencyKey('web-activity-manual') } }
    )
  ).data
}

export async function createCanvasBonusActivity(
  type: 'RECHARGE_BONUS' | 'INVITE_BONUS',
  input: { name: string; points: string; ttlDays: number; reason: string }
): Promise<CanvasBonusActivity> {
  const path = type === 'RECHARGE_BONUS' ? 'recharge-bonuses' : 'invite-bonuses'
  return (
    await api.post<CanvasBonusActivity>(
      `${webBase}/${path}`,
      { ...input, confirmed: true },
      { headers: { 'Idempotency-Key': idempotencyKey('web-activity-bonus') } }
    )
  ).data
}

export async function createCanvasLimitedPriceActivity(input: {
  name: string
  sourcePriceVersionId: string
  specialPoints?: string
  specialTokenRates?: {
    input: string
    output: string
    cacheRead?: string
    cacheWrite?: string
  }
  startsAt: string
  endsAt: string
  approvalReason: string
}): Promise<Extract<CanvasActivityDetail, { billingUnit: string }>> {
  return (
    await api.post<Extract<CanvasActivityDetail, { billingUnit: string }>>(
      '/canvas-api/v1/web/admin/limited-price-promotions',
      { ...input, confirmed: true },
      { headers: { 'Idempotency-Key': idempotencyKey('web-limited-special') } }
    )
  ).data
}

export async function getCanvasActivity(
  id: string,
  signal?: AbortSignal
): Promise<CanvasActivityDetail> {
  return (await api.get<CanvasActivityDetail>(`${webBase}/${id}`, { signal }))
    .data
}

export async function updateCanvasManualBonusActivity(
  activityId: string,
  input: {
    expectedVersion: number
    points: string
    ttlDays: number
    reason: string
    scope: CanvasManualGrantUpdateScope
    schedule: CanvasManualGrantSchedule
  }
): Promise<CanvasManualGrantPlan> {
  return (
    await api.patch<CanvasManualGrantPlan>(
      `${webBase}/${activityId}/manual-bonus`,
      { ...input, confirmed: true },
      { headers: { 'Idempotency-Key': idempotencyKey('web-activity-update') } }
    )
  ).data
}

export async function createCanvasManualBonusMemberSelection(
  activityId: string
): Promise<{ selectionToken: string; count: number; expiresAt: string }> {
  return (
    await api.post(
      `${webBase}/${activityId}/manual-bonus/member-selection`,
      { confirmed: true },
      { headers: { 'Idempotency-Key': idempotencyKey('web-activity-members') } }
    )
  ).data
}

export async function cancelCanvasManualBonusActivity(
  activityId: string,
  expectedVersion: number
): Promise<CanvasManualGrantPlan> {
  return (
    await api.post<CanvasManualGrantPlan>(
      `${webBase}/${activityId}/manual-bonus/cancel`,
      { expectedVersion, confirmed: true },
      { headers: { 'Idempotency-Key': idempotencyKey('web-activity-cancel') } }
    )
  ).data
}

export async function getCanvasManualGrantMembers(
  activityId: string,
  query: {
    page: number
    pageSize: 10 | 20 | 30 | 40 | 50 | 100
    customer?: string
    result?: string
    creditedFrom?: string
    creditedTo?: string
    sortBy: 'customer' | 'status' | 'creditedAt'
    sortOrder: 'asc' | 'desc'
  },
  signal?: AbortSignal
): Promise<CanvasManualGrantMemberPage> {
  return (
    await api.get<CanvasManualGrantMemberPage>(
      `${webBase}/${activityId}/manual-bonus/members`,
      { params: query, signal }
    )
  ).data
}

export async function getCanvasManualGrantEligibilityBasis(
  activityId: string,
  customerId: string,
  signal?: AbortSignal
): Promise<CanvasEligibilityBasis> {
  return (
    await api.get<CanvasEligibilityBasis>(
      `${webBase}/${activityId}/manual-bonus/members/${customerId}/eligibility-basis`,
      { signal }
    )
  ).data
}

export async function getCanvasCurrentManualGrantEligibilityBasis(
  customerId: string,
  query: {
    minimumRechargeAmountMinor: string
    currency: 'CNY'
    redeemedFrom?: string
    redeemedTo?: string
  },
  signal?: AbortSignal
): Promise<CanvasEligibilityBasis> {
  return (
    await api.get<CanvasEligibilityBasis>(
      `${webBase}/eligible-customers/${customerId}/eligibility-basis`,
      { params: query, signal }
    )
  ).data
}

export async function retryCanvasManualGrantFailures(activityId: string) {
  return (
    await api.post<CanvasManualGrantPlan>(
      `${webBase}/${activityId}/manual-bonus/retry-failures`,
      { confirmed: true },
      { headers: { 'Idempotency-Key': idempotencyKey('web-activity-retry') } }
    )
  ).data
}

export async function stopCanvasBonusActivity(
  activityId: string,
  reason: string
) {
  return (
    await api.post<CanvasBonusActivity>(
      `${webBase}/${activityId}/stop`,
      { confirmed: true, reason },
      { headers: { 'Idempotency-Key': idempotencyKey('web-activity-stop') } }
    )
  ).data
}

export async function getCanvasRechargeBonusBindings(
  activityId: string,
  query: {
    page: number
    pageSize: 10 | 20 | 30 | 40 | 50 | 100
    order?: string
    customer?: string
    redemptionStatus?: 'UNREDEEMED' | 'REDEEMED'
    redeemedFrom?: string
    redeemedTo?: string
    sortBy:
      | 'rechargeOrderNumber'
      | 'amountMinor'
      | 'redemptionStatus'
      | 'bonusPoints'
      | 'customer'
      | 'redeemedAt'
    sortOrder: 'asc' | 'desc'
  },
  signal?: AbortSignal
): Promise<CanvasActivityRecordPage<CanvasRechargeBonusBindingRecord>> {
  return (
    await api.get<CanvasActivityRecordPage<CanvasRechargeBonusBindingRecord>>(
      `${webBase}/${activityId}/recharge-bindings`,
      { params: query, signal }
    )
  ).data
}

export async function getCanvasInviteBonusGrants(
  activityId: string,
  query: {
    page: number
    pageSize: 10 | 20 | 30 | 40 | 50 | 100
    customer?: string
    issuedFrom?: string
    issuedTo?: string
    sortBy: 'customer' | 'inviteCodePrefix' | 'bonusPoints' | 'issuedAt'
    sortOrder: 'asc' | 'desc'
  },
  signal?: AbortSignal
): Promise<CanvasActivityRecordPage<CanvasInviteBonusGrantRecord>> {
  return (
    await api.get<CanvasActivityRecordPage<CanvasInviteBonusGrantRecord>>(
      `${webBase}/${activityId}/invite-grants`,
      { params: query, signal }
    )
  ).data
}

export async function getCanvasLimitedPriceParticipationTasks(
  activityId: string,
  query: {
    page: number
    pageSize: 10 | 20 | 30 | 40 | 50 | 100
    task?: string
    customer?: string
    executionStatus?: string
    settlementProgress?: string
    acceptedFrom?: string
    acceptedTo?: string
    sortBy: 'customer' | 'taskId' | 'executionStatus' | 'settledPoints'
    sortOrder: 'asc' | 'desc'
  },
  signal?: AbortSignal
): Promise<
  CanvasActivityRecordPage<CanvasLimitedPriceParticipationTaskRecord>
> {
  return (
    await api.get<
      CanvasActivityRecordPage<CanvasLimitedPriceParticipationTaskRecord>
    >(`${webBase}/${activityId}/limited-price-tasks`, { params: query, signal })
  ).data
}
