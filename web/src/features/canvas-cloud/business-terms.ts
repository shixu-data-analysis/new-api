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
  | 'customerStatus'
  | 'ledgerEvent'
  | 'ledgerReason'
  | 'pointBalance'
  | 'pointLotType'
  | 'pricingField'
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
  helpKeys?: Record<string, string>
  labels: Record<string, string>
  presentation: 'badge' | 'text'
}

export const canvasBusinessTermConfig = {
  customerStatus: {
    helpKey: '{{term}} is the current Canvas customer account status.',
    labels: {
      ACTIVE: 'Active',
      SUSPENDED: 'Suspended',
      CLOSED: 'Closed',
    },
    presentation: 'badge',
  },
  pointBalance: {
    helpKey: '{{term}} is a Canvas customer point balance.',
    helpKeys: {
      AVAILABLE:
        '{{term}} is the spendable total after reserved and expired points are excluded.',
      PAID: '{{term}} is the spendable part issued from redeemed paid recharge codes.',
      BONUS:
        '{{term}} is the spendable part issued by registration, invitations, promotions, or manual grants.',
    },
    labels: {
      AVAILABLE: 'Available points',
      PAID: 'Paid points',
      BONUS: 'Bonus points',
    },
    presentation: 'text',
  },
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
  pricingField: {
    helpKey: '{{term}} is a Canvas PriceVersion field.',
    helpKeys: {
      MODEL:
        'The customer-visible model name. It comes from the versioned CustomerModel and is read-only here.',
      PRICE_GROUP:
        'The internal published PriceGroup used to resolve the customer price. Customers never see this group name.',
      PRICE_GROUP_CODE:
        'The stable internal code identifying a customer pricing segment. Customers never see it directly.',
      PRICE_GROUP_NAME:
        'The administrator-facing name of the customer pricing segment. A change creates a new governed version.',
      GROUP_VERSION:
        'The monotonically increasing version of this PriceGroup code.',
      GROUP_STATUS:
        'The controlled draft, approval, publication, or retirement state of this PriceGroup version.',
      GROUP_CREATED: 'The immutable time this PriceGroup version was created.',
      GROUP_APPROVED:
        'The immutable PLATFORM_ADMIN approval time backed by an ApprovalRecord.',
      GROUP_EFFECTIVE:
        'The publication time after which new pricing and customer assignments may reference this PriceGroup version.',
      COMBINATION:
        'The immutable parameter-combination key covered by this price version.',
      VERSION:
        'The monotonically increasing PriceVersion number for this model, group, and parameter combination.',
      STATUS:
        'The controlled draft, approval, publication, or retirement state. It cannot be edited directly.',
      POINTS:
        'The final integer points charged for a new Quote. A change always creates a new draft version.',
      BASE_RATE:
        'The immutable points-per-RMB snapshot captured by this PriceVersion. It comes from the published issuance-rate ConfigVersion and is never edited here.',
      ISSUANCE_RATE:
        'The points issued for one RMB of new eligible business. A change creates a governed draft and affects only facts created after publication.',
      RATE_VERSION:
        'The monotonically increasing ConfigVersion number for the CNY point issuance rate.',
      RATE_STATUS:
        'The controlled draft, approval, publication, or retirement state of this issuance-rate ConfigVersion. It cannot be edited directly.',
      RATE_DECISION:
        'The administrator decision summary stored in this immutable issuance-rate ConfigVersion payload.',
      RATE_EVIDENCE:
        'The evidence references supporting this issuance-rate version, stored in its immutable payload.',
      RATE_CREATED:
        'The immutable actor and time that created this issuance-rate ConfigVersion.',
      RATE_APPROVED:
        'The immutable PLATFORM_ADMIN approval actor and time for this issuance-rate ConfigVersion, backed by an ApprovalRecord.',
      RATE_EFFECTIVE:
        'The immutable publication time after which new pricing and recharge facts use this issuance rate.',
      APPROVAL_REASON:
        'The PLATFORM_ADMIN review reason that will be stored in an immutable ApprovalRecord.',
      TARGET_MARGIN_RATE:
        'The frozen normal target margin rate of 40%. It is a health target, not permission to undercut break-even.',
      SUCCESS_PROBABILITY:
        'The reviewed probability that one attempt succeeds and is chargeable, expressed from 0 to 1.',
      EXPECTED_ATTEMPT_COST:
        'The probability-weighted RMB cost of one attempt before dividing by the success probability.',
      SUCCESS_COST:
        'The reviewed RMB Provider cost of one successful chargeable attempt. A change creates a new draft.',
      FAILURE_COST:
        'The reviewed RMB cost that cannot be recovered when an attempt fails. A change creates a new draft.',
      OTHER_COST:
        'Other reviewed variable RMB cost per attempt included in the theoretical cost formula. A change creates a new draft.',
      K_THEORY:
        'The server-derived theoretical RMB cost per successful chargeable result.',
      K_ACTUAL:
        'The audited 30-day actual RMB cost per successful chargeable result. It is read-only and only eligible with at least 100 complete, consistent results.',
      ACTUAL_ELIGIBLE:
        'A simulation switch for the audited K_actual path. It does not change the stored eligibility facts or any PriceVersion.',
      K_PRICING:
        'The server-derived RMB cost used for pricing: eligible max(K_theory, K_actual), otherwise K_theory plus the approved risk buffer.',
      RISK_BUFFER:
        'The reviewed RMB risk buffer used only when eligible K_actual is unavailable. A change creates a new draft.',
      BREAK_EVEN:
        'The read-only ceiling of K_pricing multiplied by this PriceVersion issuance-rate snapshot. A published price must be strictly greater.',
      PROPOSED_POINTS:
        'A side-effect-free simulated point price used only to compare against the calculated floors.',
      TARGET_MARGIN_POINTS:
        'The read-only ceiling of break-even cost divided by 1 minus the 40% target margin.',
      ASSUMPTIONS:
        'The immutable calculation inputs, evidence, and eligibility facts captured with this PriceVersion.',
      DECISION:
        'The administrator decision summary stored in the immutable pricing assumptions snapshot.',
      EVIDENCE:
        'The evidence references supporting the draft inputs, stored in the immutable pricing assumptions snapshot.',
      CREATED: 'The immutable actor and time that created this PriceVersion.',
      APPROVED:
        'The immutable PLATFORM_ADMIN approval actor and time, backed by an ApprovalRecord.',
      EFFECTIVE:
        'The immutable publication time after which new Quotes may use this version.',
      ACTION:
        'Only legal state transitions are available. Historical rows and derived fields remain read-only.',
    },
    labels: {
      MODEL: 'Model',
      PRICE_GROUP: 'Price group',
      PRICE_GROUP_CODE: 'Price group code',
      PRICE_GROUP_NAME: 'Price group name',
      GROUP_VERSION: 'Group version',
      GROUP_STATUS: 'Status',
      GROUP_CREATED: 'Created',
      GROUP_APPROVED: 'Approved',
      GROUP_EFFECTIVE: 'Effective',
      COMBINATION: 'Parameter combination',
      VERSION: 'Version',
      STATUS: 'Status',
      POINTS: 'Points',
      BASE_RATE: 'Base rate',
      ISSUANCE_RATE: 'Point issuance rate',
      RATE_VERSION: 'Rate version',
      RATE_STATUS: 'Status',
      RATE_DECISION: 'Decision summary',
      RATE_EVIDENCE: 'Evidence references',
      RATE_CREATED: 'Created',
      RATE_APPROVED: 'Approved',
      RATE_EFFECTIVE: 'Effective',
      APPROVAL_REASON: 'Approval reason',
      TARGET_MARGIN_RATE: 'Target margin rate',
      SUCCESS_PROBABILITY: 'Success probability',
      EXPECTED_ATTEMPT_COST: 'Expected attempt cost',
      SUCCESS_COST: 'Successful task cost',
      FAILURE_COST: 'Failed unrecoverable cost',
      OTHER_COST: 'Other variable cost',
      K_THEORY: 'K_theory',
      K_ACTUAL: 'K_actual',
      ACTUAL_ELIGIBLE: 'Actual cost eligibility',
      K_PRICING: 'K_pricing',
      RISK_BUFFER: 'Risk buffer',
      BREAK_EVEN: 'Break-even',
      PROPOSED_POINTS: 'Proposed price points',
      TARGET_MARGIN_POINTS: 'Target margin floor',
      ASSUMPTIONS: 'Pricing assumptions',
      DECISION: 'Decision summary',
      EVIDENCE: 'Evidence references',
      CREATED: 'Created',
      APPROVED: 'Approved',
      EFFECTIVE: 'Effective',
      ACTION: 'Action',
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
  const group = canvasBusinessTermConfig[kind] as CanvasBusinessTermGroup
  const labelKey = (group.labels as Record<string, string>)[value]
  return labelKey
    ? {
        helpKey: group.helpKeys?.[value] ?? group.helpKey,
        labelKey,
        presentation: group.presentation,
      }
    : null
}
