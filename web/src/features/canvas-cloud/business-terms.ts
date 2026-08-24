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
export type CanvasBusinessTermKind =
  | 'billingStatus'
  | 'configStatus'
  | 'ledgerEvent'
  | 'ledgerReason'
  | 'pointLotType'
  | 'rechargeCodeStatus'
  | 'rechargeOrderStatus'
  | 'reconciliationStatus'
  | 'refundStatus'
  | 'releaseAction'
  | 'releaseResource'
  | 'releaseTarget'
  | 'taskExecutionStatus'

type CanvasBusinessTermGroup = {
  helpKey: string
  labels: Record<string, string>
  presentation: 'badge' | 'text'
}

export const canvasBusinessTermConfig = {
  pointLotType: {
    helpKey:
      '{{term}} identifies how this point lot was obtained and which expiry rule applies.',
    labels: {
      PAID: 'Paid points',
      BONUS: 'Bonus points',
      GRACE_BONUS: 'Grace bonus points',
    },
    presentation: 'text',
  },
  ledgerEvent: {
    helpKey:
      '{{term}} is the immutable ledger operation that changed the point balance.',
    labels: {
      ISSUE: 'Issued',
      FREEZE: 'Reserved for a task',
      SETTLE: 'Settled',
      RELEASE: 'Released',
      EXPIRE: 'Expired',
      CLAWBACK: 'Clawed back',
      TRANSFER_OUT: 'Transferred out',
      TRANSFER_IN: 'Transferred in',
    },
    presentation: 'text',
  },
  ledgerReason: {
    helpKey: '{{term}} records why this point ledger entry was created.',
    labels: {
      INVITE_REGISTRATION: 'Invite registration',
      'RechargeCode redemption': 'Recharge code redemption',
      'Task accepted': 'Task accepted',
      'Task succeeded': 'Task succeeded',
      'Task failed or timed out': 'Task failed or timed out',
      'Crossed-expiry task release': 'Expired bonus task release',
      'Seven-day failure grace': 'Seven-day failure grace',
    },
    presentation: 'text',
  },
  rechargeOrderStatus: {
    helpKey: '{{term}} is the current stage of this recharge order.',
    labels: {
      CREATED: 'Created',
      PAYMENT_PENDING: 'Payment pending',
      PAID: 'Paid',
      CODE_ACTIVATED: 'Code activated',
      REFUND_REVIEW: 'Refund review',
      REFUNDED: 'Refunded',
      CANCELLED: 'Cancelled',
    },
    presentation: 'badge',
  },
  rechargeCodeStatus: {
    helpKey:
      '{{term}} is the current one-time use state of this Canvas recharge code.',
    labels: {
      ACTIVE: 'Active',
      REDEEMED: 'Redeemed',
      VOID: 'Voided',
      EXPIRED: 'Expired',
    },
    presentation: 'badge',
  },
  taskExecutionStatus: {
    helpKey: '{{term}} is the current execution state reported for this task.',
    labels: {
      ACCEPTED: 'Accepted',
      PROCESSING: 'Processing',
      SUCCEEDED: 'Succeeded',
      CONFIRMED_FAILED: 'Confirmed failed',
      UNKNOWN: 'Unknown',
    },
    presentation: 'badge',
  },
  billingStatus: {
    helpKey: '{{term}} is the customer point-billing state for this task.',
    labels: {
      FROZEN: 'Points reserved',
      SETTLED: 'Points settled',
      RELEASED_FAILED: 'Released after failure',
      RELEASED_TIMEOUT: 'Released after timeout',
    },
    presentation: 'badge',
  },
  configStatus: {
    helpKey:
      '{{term}} is the review and publication state of this configuration.',
    labels: {
      DRAFT: 'Draft',
      APPROVED: 'Approved',
      PUBLISHED: 'Published',
      RETIRED: 'Retired',
      ACTIVE: 'Active',
      PAUSED: 'Paused',
    },
    presentation: 'badge',
  },
  reconciliationStatus: {
    helpKey:
      '{{term}} is the Provider-cost reconciliation state for this task.',
    labels: {
      PENDING: 'Pending',
      COST_CONFIRMED: 'Cost confirmed',
      RECONCILED: 'Reconciled',
      DISPUTED: 'Disputed',
    },
    presentation: 'badge',
  },
  refundStatus: {
    helpKey:
      '{{term}} is the current cash-and-points recovery stage of this refund.',
    labels: {
      REQUESTED: 'Requested',
      APPROVED: 'Approved',
      CASH_POSTED: 'Cash adjustment posted',
      POINTS_PROCESSED: 'Points processed',
      PARTIAL_RECOVERY: 'Partially recovered',
      COMPLETED: 'Completed',
      REJECTED: 'Rejected',
    },
    presentation: 'badge',
  },
  releaseResource: {
    helpKey: '{{term}} is the configuration resource affected by this release.',
    labels: {
      PROVIDER: 'Provider',
      PROVIDER_CHANNEL: 'Provider channel',
      CUSTOMER_MODEL: 'Customer model',
      PARAMETER_COMBINATION: 'Parameter combination',
      PRICE_VERSION: 'Price version',
    },
    presentation: 'text',
  },
  releaseAction: {
    helpKey:
      '{{term}} is the database action planned for this release resource.',
    labels: {
      CREATE: 'Create',
      REUSE: 'Reuse',
      CREATE_VERSION: 'Create version',
      REPLACE: 'Replace',
      REPLAY: 'Replay',
      CREATE_DRAFT: 'Create draft',
    },
    presentation: 'badge',
  },
  releaseTarget: {
    helpKey: '{{term}} is the environment targeted by this reviewed release.',
    labels: {
      local: 'Local environment',
      stg: 'Staging environment',
    },
    presentation: 'text',
  },
} satisfies Record<CanvasBusinessTermKind, CanvasBusinessTermGroup>

export function getCanvasBusinessTerm(
  kind: CanvasBusinessTermKind,
  value: string
): {
  helpKey: string
  labelKey: string
  presentation: 'badge' | 'text'
} | null {
  const group = canvasBusinessTermConfig[kind]
  const labelKey = (group.labels as Record<string, string>)[value]
  return labelKey
    ? {
        helpKey: group.helpKey,
        labelKey,
        presentation: group.presentation,
      }
    : null
}
