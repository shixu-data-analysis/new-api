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
import type { TFunction } from 'i18next'

import { toIntlLocale } from '@/i18n/languages'

import {
  agentQualificationLabelKey,
  formatRmbMinor,
  formatRmbYuan,
} from './agent-earnings-format'
import { attentionMessageKeys } from './execution-attention-messages'
import { formatCanvasDateTime, formatMoneyMinor } from './formatters'
import {
  formatBusinessNumber,
  formatBusinessPercentFromRate,
  formatExactPointQuantity,
} from './number-format'
import { billingLabels, executionLabels } from './task-status-labels'
import type { CanvasAuditEventPage, CanvasAuditResolvedNames } from './types'

/**
 * Display rules for the operation log, one entry per audit action (010 UI review, appendix). Labels are i18n keys:
 * names already used by another Canvas page reuse that page's key; the rest were confirmed on 2026-10-12.
 */
export type AuditEvent = CanvasAuditEventPage['items'][number]

type Context = { event: AuditEvent; names: CanvasAuditResolvedNames }
type NameSource = (context: Context) => string | null | undefined

type FieldKind =
  | 'text'
  | 'number'
  | 'points'
  | 'rmbMinor'
  | 'moneyMinor'
  | 'rmbYuan'
  | 'rate'
  | 'time'
  | 'bool'
  | 'enum'
  | 'count'
  | 'customer'
  | 'agent'
  | 'priceGroup'
  | 'rechargeOrder'
  | 'customerModels'
  | 'modelTags'
  | 'list'
  | 'pointLot'
  | 'positions'
  | 'credentialChanges'
  | 'configChanges'
  | 'configDiff'
  | 'diagnostic'
  | 'counts'
  | 'agentStatus'
  | 'versionCount'

interface FieldSpec {
  key: string
  label: string
  kind?: FieldKind
  /** Metadata key holding the earlier value; the row then reads "earlier → current". */
  previous?: string
}

interface ReasonSpec {
  label: string
  /** When set, only these codes are shown. */
  only?: string[]
}

interface ActionSpec {
  objectType: string
  objectName?: NameSource
  idLabel?: string
  fields?: FieldSpec[]
  reason?: ReasonSpec
}

const text = (value: unknown) =>
  typeof value === 'string' && value ? value : null
const meta =
  (key: string): NameSource =>
  ({ event }) =>
    text(event.publicMetadata[key])
const customerName =
  (key = 'customerId'): NameSource =>
  ({ event, names }) =>
    names.customers[String(event.publicMetadata[key])]
const agentFromMeta: NameSource = ({ event, names }) =>
  names.agents[String(event.publicMetadata.agentPrincipalId)]
const agentFromResource: NameSource = ({ event, names }) =>
  event.resourceId ? names.agents[event.resourceId] : null
const modelFromMeta: NameSource = ({ event, names }) =>
  names.customerModels[String(event.publicMetadata.customerModelId)]
const promotionName: NameSource = ({ event, names }) =>
  names.promotionVersions[
    event.resourceType === 'PROMOTION_VERSION' && event.resourceId
      ? event.resourceId
      : String(event.publicMetadata.promotionVersionId)
  ]?.activityName
const grantPlanName: NameSource = ({ event, names }) =>
  event.resourceId
    ? names.campaignGrantPlans[event.resourceId]?.activityName
    : null
const priceVersionModel: NameSource = ({ event, names }) =>
  event.resourceId ? names.priceVersions[event.resourceId]?.modelName : null
const providerRateModel: NameSource = ({ event, names }) =>
  event.resourceId ? names.providerRateVersions[event.resourceId] : null
const providerName: NameSource = ({ event, names }) =>
  event.resourceId ? names.providers[event.resourceId] : null
const inviteCode: NameSource = ({ event, names }) =>
  event.resourceId ? names.inviteCodes[event.resourceId] : null
const rechargeCode: NameSource = ({ event, names }) =>
  event.resourceId ? names.rechargeCodes[event.resourceId] : null
const rechargeBatch: NameSource = ({ event, names }) =>
  event.resourceId ? names.rechargeCodeBatches[event.resourceId] : null
const principalName: NameSource = ({ event, names }) =>
  event.resourceId ? names.principals[event.resourceId] : null
const modelTagName: NameSource = ({ event, names }) =>
  event.resourceId ? names.modelTags[event.resourceId] : null
const resourceKey: NameSource = ({ event }) => event.resourceKey

const reasonField: FieldSpec = { key: 'reason', label: 'Reason' }
const executionPair: FieldSpec = {
  key: 'executionStatus',
  previous: 'previousExecutionStatus',
  label: 'Execution status',
  kind: 'enum',
}
const billingField: FieldSpec = {
  key: 'customerBillingStatus',
  label: 'Billing status',
  kind: 'enum',
}
const customerField: FieldSpec = {
  key: 'customerId',
  label: 'Customer',
  kind: 'customer',
}
const workerField: FieldSpec = { key: 'workerId', label: 'Executor instance' }
const runtimePublished: FieldSpec[] = [
  { key: 'environment', label: 'Environment' },
  { key: 'version', label: 'Version', kind: 'number' },
  { key: 'keyChange', label: 'API Key change', kind: 'enum' },
  { key: 'changes', label: 'Changes', kind: 'configChanges' },
  reasonField,
]
const runtimeChecked: FieldSpec[] = [
  { key: 'environment', label: 'Environment' },
  { key: 'outcome', label: 'Check result', kind: 'enum' },
  { key: 'reasonCode', label: 'Check failure reason', kind: 'enum' },
]
const inviteCounts: FieldSpec[] = [
  { key: 'consumedCount', label: 'Used', kind: 'number' },
  { key: 'activeReservedCount', label: 'Reserved', kind: 'number' },
  { key: 'remainingCount', label: 'Current remaining', kind: 'number' },
]
const inviteStatus: ActionSpec = {
  objectType: 'Invite code',
  objectName: inviteCode,
  fields: [
    {
      key: 'status',
      previous: 'previousStatus',
      label: 'Status',
      kind: 'enum',
    },
  ],
}
const drainWindow: FieldSpec[] = [
  { key: 'expiresAt', label: 'Expires at', kind: 'time' },
]
const taskEvent: ActionSpec = {
  objectType: 'Task',
  idLabel: 'Task number',
  fields: [
    workerField,
    executionPair,
    billingField,
    { key: 'lateSuccess', label: 'Late success', kind: 'bool' },
  ],
}
const executorTask: ActionSpec = {
  objectType: 'Task',
  idLabel: 'Task number',
  fields: [workerField, { key: 'attempt', label: 'Attempt', kind: 'number' }],
  reason: { label: 'Reason' },
}
const outputRetrieval: ActionSpec = {
  objectType: 'Task',
  idLabel: 'Task number',
  fields: [
    workerField,
    { key: 'outputIndex', label: 'Output index', kind: 'positions' },
    { key: 'step', label: 'Step', kind: 'enum' },
    { key: 'attemptNumber', label: 'Attempt', kind: 'number' },
    { key: 'exhausted', label: 'Retries exhausted', kind: 'bool' },
    { key: 'nextRetryAt', label: 'Next retry at', kind: 'time' },
  ],
  reason: { label: 'Failure reason' },
}
const pricingModel: ActionSpec = {
  objectType: 'Model',
  objectName: modelFromMeta,
  idLabel: 'Price publication ID',
  fields: [
    { key: 'version', label: 'Version', kind: 'number' },
    { key: 'effectiveAt', label: 'Effective at', kind: 'time' },
    { key: 'billingUnit', label: 'Billing unit', kind: 'enum' },
    { key: 'changed', label: 'Changes', kind: 'list' },
  ],
  reason: { label: 'Reason', only: ['BILLING_UNIT_CHANGED'] },
}
const priceVersion: ActionSpec = {
  objectType: 'Model',
  objectName: priceVersionModel,
  idLabel: 'Price version ID',
  fields: [
    { key: '$priceVersionGroup', label: 'Price plan' },
    { key: 'version', label: 'Version', kind: 'number' },
    { key: 'billingUnit', label: 'Billing unit', kind: 'enum' },
    { key: 'effectiveAt', label: 'Effective at', kind: 'time' },
  ],
}
const credentialGroup = (
  fields: FieldSpec[],
  idLabel?: string
): ActionSpec => ({
  objectType: 'API Key group',
  objectName: meta('groupName'),
  ...(idLabel ? { idLabel } : {}),
  fields,
})
const thresholdPair = (label: string): FieldSpec => ({
  key: 'thresholdMinor',
  previous: 'previousThresholdMinor',
  label,
  kind: 'rmbMinor',
})
const limitedSpecial = (
  fields: FieldSpec[],
  reason?: ReasonSpec
): ActionSpec => ({
  objectType: 'Limited-time special',
  objectName: promotionName,
  fields: [{ key: '$promotionModel', label: 'Model' }, ...fields],
  ...(reason ? { reason } : {}),
})

const { reason: _pricingReason, ...pricingModelWithoutReason } = pricingModel

const SPECS: Record<string, ActionSpec> = {
  'admin.super_admin.provisioned': {
    objectType: 'Super Admin',
    objectName: principalName,
    fields: [{ key: 'principalType', label: 'Role', kind: 'enum' }],
  },
  'admin.platform_admin.provisioned': {
    objectType: 'Platform administrator',
    objectName: meta('username'),
    fields: [
      { key: 'username', label: 'Username' },
      { key: 'principalType', label: 'Role', kind: 'enum' },
    ],
  },
  'agent.enabled': {
    objectType: 'Agent',
    objectName: agentFromResource,
    fields: [
      reasonField,
      {
        key: 'resumedInviteCodeIds',
        label: 'Resumed invite codes',
        kind: 'count',
      },
    ],
  },
  'agent.disabled': {
    objectType: 'Agent',
    objectName: agentFromResource,
    fields: [
      reasonField,
      {
        key: 'pausedInviteCodeIds',
        label: 'Paused invite codes',
        kind: 'count',
      },
    ],
  },
  'agent.settlement_policy.published': {
    objectType: 'Agent settlement rules',
    fields: [
      { key: 'version', label: 'Version', kind: 'number' },
      {
        key: 'next',
        previous: 'previous',
        label: 'Changes',
        kind: 'configDiff',
      },
    ],
  },
  'agent.withdrawal.paid': {
    objectType: 'Agent',
    objectName: agentFromMeta,
    idLabel: 'Withdrawal request ID',
    fields: [
      { key: 'agentPrincipalId', label: 'Agent', kind: 'agent' },
      { key: 'amountMinor', label: 'Withdrawal amount', kind: 'rmbMinor' },
      { key: 'netMinor', label: 'Net payment', kind: 'rmbMinor' },
    ],
  },
  'agent.withdrawal.rejected': {
    objectType: 'Agent',
    objectName: agentFromMeta,
    idLabel: 'Withdrawal request ID',
    fields: [
      { key: 'agentPrincipalId', label: 'Agent', kind: 'agent' },
      { key: 'amountMinor', label: 'Withdrawal amount', kind: 'rmbMinor' },
      reasonField,
    ],
  },
  'customer.inviter_capability.granted': {
    objectType: 'Customer',
    objectName: meta('username'),
    fields: [
      { key: 'username', label: 'Username' },
      { key: 'status', label: 'Status', kind: 'agentStatus' },
      reasonField,
    ],
  },
  'catalog.import.published': {
    objectType: 'Model catalog import',
    idLabel: 'Import ID',
    fields: [
      { key: 'bundleId', label: 'Bundle ID' },
      { key: 'replayedBundle', label: 'Repeated import', kind: 'bool' },
    ],
  },
  'catalog.continuity.published': {
    objectType: 'Models directory',
    idLabel: 'Bundle ID',
    fields: [
      { key: 'carried', label: 'Carried', kind: 'number' },
      { key: 'bound', label: 'Bound count', kind: 'number' },
    ],
  },
  'catalog.continuity.recovered': {
    objectType: 'Models directory',
    idLabel: 'Bundle ID',
    fields: [
      { key: 'recovered', label: 'Recovered count', kind: 'number' },
      { key: 'bound', label: 'Bound count', kind: 'number' },
    ],
  },
  'model.key.monitoring.enabled': {
    objectType: 'Model',
    objectName: meta('modelKey'),
    fields: [
      { key: 'modelKey', label: 'Model key' },
      { key: 'version', label: 'Version', kind: 'number' },
      {
        key: 'enabled',
        previous: 'previousEnabled',
        label: 'Status',
        kind: 'enum',
      },
    ],
    reason: { label: 'Reason' },
  },
  'model.tag.created': {
    objectType: 'Model category',
    objectName: meta('name'),
    fields: [{ key: 'name', label: 'Name' }],
  },
  'model.tag.renamed': {
    objectType: 'Model category',
    objectName: meta('name'),
    fields: [{ key: 'name', previous: 'previousName', label: 'Name' }],
  },
  'model.tag.deleted': {
    objectType: 'Model category',
    objectName: meta('name'),
    fields: [
      { key: 'affectedModelKeys', label: 'Affected models', kind: 'list' },
    ],
  },
  'model.tag.assignments.updated': {
    objectType: 'Model category',
    objectName: modelTagName,
    fields: [
      { key: 'addedModelKeys', label: 'Add Models', kind: 'list' },
      { key: 'removedModelKeys', label: 'Removed models', kind: 'list' },
    ],
  },
  'model.tags.assigned': {
    objectType: 'Model',
    objectName: resourceKey,
    fields: [
      { key: 'addedTagIds', label: 'New category', kind: 'modelTags' },
      { key: 'removedTagIds', label: 'Removed categories', kind: 'modelTags' },
    ],
  },
  'pricing.model.published': pricingModel,
  'pricing.model.scheduled': pricingModel,
  'pricing.model.schedule_cancelled': {
    ...pricingModelWithoutReason,
    fields: [
      { key: 'version', label: 'Version', kind: 'number' },
      {
        key: 'effectiveAt',
        label: 'Original scheduled effective time',
        kind: 'time',
      },
    ],
  },
  'pricing.price_version.published': priceVersion,
  'pricing.price_version.scheduled': priceVersion,
  'pricing.price_version.schedule_cancelled': {
    ...priceVersion,
    fields: [
      {
        key: 'scheduledEffectiveAt',
        label: 'Original scheduled effective time',
        kind: 'time',
      },
    ],
  },
  'pricing.provider_rate.published': {
    objectType: 'Model',
    objectName: modelFromMeta,
    idLabel: 'Provider rate version ID',
    fields: [
      { key: 'version', label: 'Version', kind: 'number' },
      { key: 'billingUnit', label: 'Billing unit', kind: 'enum' },
      { key: 'currency', label: 'Currency' },
      { key: 'effectiveAt', label: 'Effective at', kind: 'time' },
      {
        key: 'impactedPriceVersionIds',
        label: 'Affected price versions',
        kind: 'count',
      },
    ],
  },
  'pricing.provider_rate.risk_decided': {
    objectType: 'Model',
    objectName: providerRateModel,
    idLabel: 'Provider rate version ID',
    fields: [
      { key: 'decisionType', label: 'Risk action', kind: 'enum' },
      { key: 'lossEndsAt', label: 'Loss deadline', kind: 'time' },
      {
        key: 'maxExpectedLossPoints',
        label: 'Maximum expected loss points',
        kind: 'points',
      },
      {
        key: 'affectedPriceVersionIds',
        label: 'Affected price versions',
        kind: 'count',
      },
    ],
  },
  'pricing.limited_special.scheduled': limitedSpecial(
    [
      {
        key: 'specialPoints',
        previous: 'basePoints',
        label: 'Base → special',
        kind: 'points',
      },
      {
        key: 'expectedContributionRate',
        label: 'Expected contribution rate',
        kind: 'rate',
      },
      { key: 'startsAt', label: 'Starts at', kind: 'time' },
      { key: 'endsAt', label: 'Ends at', kind: 'time' },
    ],
    { label: 'Risk notice' }
  ),
  'pricing.limited_special.cancelled': limitedSpecial([
    { key: 'startsAt', label: 'Starts at', kind: 'time' },
    { key: 'endsAt', label: 'Ends at', kind: 'time' },
  ]),
  'customer.price_group.assigned': {
    objectType: 'Customer',
    objectName: customerName(),
    fields: [
      customerField,
      {
        key: 'priceGroupName',
        previous: 'previousPriceGroupName',
        label: 'Price plan',
      },
      reasonField,
    ],
  },
  'points.activity.published': {
    objectType: 'Campaign',
    objectName: promotionName,
    fields: [
      { key: 'type', label: 'Activity type', kind: 'enum' },
      { key: 'points', label: 'Points', kind: 'points' },
      { key: 'ttlDays', label: 'Bonus validity (days)', kind: 'number' },
    ],
  },
  'points.activity.stopped': {
    objectType: 'Campaign',
    objectName: promotionName,
    fields: [
      { key: 'type', label: 'Activity type', kind: 'enum' },
      reasonField,
    ],
  },
  'points.activity.manual.created': {
    objectType: 'Manual gift',
    objectName: grantPlanName,
    fields: [
      { key: 'memberCount', label: 'Customer count', kind: 'number' },
      { key: 'points', label: 'Points per customer', kind: 'points' },
      { key: 'scheduleAt', label: 'Scheduled time', kind: 'time' },
    ],
  },
  'points.activity.manual.updated': {
    objectType: 'Manual gift',
    objectName: grantPlanName,
    fields: [
      { key: 'version', label: 'Version', kind: 'number' },
      { key: 'memberCount', label: 'Customer count', kind: 'number' },
      { key: 'scheduleAt', label: 'Scheduled time', kind: 'time' },
    ],
  },
  'points.activity.manual.cancelled': {
    objectType: 'Manual gift',
    objectName: grantPlanName,
    fields: [{ key: 'version', label: 'Version', kind: 'number' }],
  },
  'points.activity.manual.retry_requested': {
    objectType: 'Manual gift',
    objectName: grantPlanName,
    fields: [
      { key: 'failedMemberCount', label: 'Failed customers', kind: 'number' },
      { key: 'requeuedCount', label: 'Requeued customers', kind: 'number' },
      { key: 'rejectedCount', label: 'Not requeued customers', kind: 'number' },
    ],
  },
  'points.manual_bonus.granted': {
    objectType: 'Customer',
    objectName: customerName(),
    idLabel: 'Point lot ID',
    fields: [
      customerField,
      { key: 'points', label: 'Points', kind: 'points' },
      { key: 'expiresAt', label: 'Expires at', kind: 'time' },
    ],
  },
  'points.paid_correction.granted': {
    objectType: 'Customer',
    objectName: customerName(),
    idLabel: 'Point lot ID',
    fields: [
      customerField,
      {
        key: 'rechargeOrderId',
        label: 'Recharge order number',
        kind: 'rechargeOrder',
      },
      { key: 'points', label: 'Points', kind: 'points' },
      { key: 'expiresAt', label: 'Expires at', kind: 'time' },
    ],
  },
  'points.manual_deduction.posted': {
    objectType: 'Customer',
    objectName: customerName(),
    idLabel: 'Ledger ID',
    fields: [
      customerField,
      { key: 'pointLotId', label: 'Point lot ID', kind: 'pointLot' },
      { key: 'lotType', label: 'Lot type', kind: 'enum' },
      { key: 'points', label: 'Deduct points', kind: 'points' },
      {
        key: 'remainingAfter',
        label: 'Available points after deduction',
        kind: 'points',
      },
      { key: 'reservedPoints', label: 'Task-reserved points', kind: 'points' },
    ],
  },
  'points.order_return.posted': {
    objectType: 'Customer',
    objectName: customerName(),
    idLabel: 'Point return ID',
    fields: [
      customerField,
      {
        key: 'rechargeOrderId',
        label: 'Recharge order number',
        kind: 'rechargeOrder',
      },
      { key: 'points', label: 'Returned points', kind: 'points' },
      {
        key: 'referenceAmountMinor',
        label: 'Refund reference amount',
        kind: 'moneyMinor',
      },
    ],
  },
  'provider.credential_group.published': credentialGroup(
    [
      { key: 'version', label: 'Version', kind: 'number' },
      { key: 'changeType', label: 'Change type', kind: 'enum' },
      { key: 'keyChange', label: 'API Key change', kind: 'enum' },
      { key: 'affectedModels', label: 'Affected models', kind: 'list' },
      reasonField,
      { key: 'changes', label: 'Changes', kind: 'credentialChanges' },
    ],
    'API Key group version ID'
  ),
  'provider.credential_group.managed': credentialGroup(
    [
      { key: 'keyChange', label: 'API Key change', kind: 'enum' },
      {
        key: 'addedCustomerModelIds',
        label: 'Add Models',
        kind: 'customerModels',
      },
      {
        key: 'removedCustomerModelIds',
        label: 'Removed models',
        kind: 'customerModels',
      },
      {
        key: 'reboundCustomerModelIds',
        label: 'Rebound models',
        kind: 'customerModels',
      },
      { key: 'changes', label: 'Changes', kind: 'credentialChanges' },
      reasonField,
    ],
    'API Key group version ID'
  ),
  'provider.credential_group.archived': credentialGroup([
    { key: 'changes', label: 'Changes', kind: 'credentialChanges' },
    reasonField,
  ]),
  'provider.credential_group.restored': credentialGroup([
    { key: 'changes', label: 'Changes', kind: 'credentialChanges' },
    reasonField,
  ]),
  'provider.balance_record.added': {
    objectType: 'API provider',
    objectName: providerName,
    fields: [
      { key: 'recordType', label: 'Type', kind: 'enum' },
      { key: 'amountMinor', label: 'Amount', kind: 'rmbMinor' },
      { key: 'recordedAt', label: 'Recorded at', kind: 'time' },
      { key: 'note', label: 'Note' },
    ],
  },
  'provider.website.updated': {
    objectType: 'API provider',
    objectName: providerName,
    fields: [
      { key: 'websiteUrl', previous: 'previousWebsiteUrl', label: 'Website' },
    ],
  },
  'provider.balance_alert_threshold.updated': {
    objectType: 'API provider',
    objectName: providerName,
    fields: [thresholdPair('Alert threshold')],
  },
  'provider.balance_alert_default.updated': {
    objectType: 'Default alert threshold',
    fields: [thresholdPair('Default alert threshold')],
  },
  'runtime.task_media.published': {
    objectType: 'Task media',
    fields: runtimePublished,
  },
  'runtime.database_backup.published': {
    objectType: 'Database backups',
    fields: runtimePublished,
  },
  'runtime.task_media.checked': {
    objectType: 'Task media',
    fields: runtimeChecked,
  },
  'runtime.database_backup.checked': {
    objectType: 'Database backups',
    fields: runtimeChecked,
  },
  'customer_model.access_permission.checked': {
    objectType: 'Model',
    objectName: modelFromMeta,
    fields: runtimeChecked.slice(1),
  },
  'invite.code.created': {
    objectType: 'Invite code',
    objectName: inviteCode,
    fields: [
      { key: 'inviterUsername', label: 'Agent' },
      { key: 'priceGroupId', label: 'Price plan', kind: 'priceGroup' },
      {
        key: 'maxRegistrations',
        label: 'Registration capacity',
        kind: 'number',
      },
      { key: 'validFrom', label: 'Valid from', kind: 'time' },
      { key: 'expiresAt', label: 'Expires at', kind: 'time' },
      {
        key: 'initialBonusPoints',
        label: 'Initial Bonus points',
        kind: 'points',
      },
      {
        key: 'initialBonusTtlDays',
        label: 'Bonus validity (days)',
        kind: 'number',
      },
    ],
  },
  'invite.code.pause': inviteStatus,
  'invite.code.resume': inviteStatus,
  'invite.code.revoke': inviteStatus,
  'invite.code.displayed': {
    objectType: 'Invite code',
    objectName: inviteCode,
  },
  'invite.code.copied': { objectType: 'Invite code', objectName: inviteCode },
  'invite.code.expiration_extended': {
    objectType: 'Invite code',
    objectName: inviteCode,
    fields: [
      {
        key: 'newExpiresAt',
        previous: 'previousExpiresAt',
        label: 'Expires at',
        kind: 'time',
      },
      reasonField,
      {
        key: 'maxRegistrations',
        label: 'Registration capacity',
        kind: 'number',
      },
      ...inviteCounts,
    ],
  },
  'invite.code.capacity_expanded': {
    objectType: 'Invite code',
    objectName: inviteCode,
    fields: [
      {
        key: 'newMaxRegistrations',
        previous: 'previousMaxRegistrations',
        label: 'Registration capacity',
        kind: 'number',
      },
      {
        key: 'additionalRegistrations',
        label: 'Additional registrations',
        kind: 'number',
      },
      ...inviteCounts,
    ],
  },
  'recharge.code.displayed': {
    objectType: 'Recharge code',
    objectName: rechargeCode,
  },
  'recharge.code.copied': {
    objectType: 'Recharge code',
    objectName: rechargeCode,
  },
  'recharge.code_batch.unused_downloaded': {
    objectType: 'Recharge code batch',
    objectName: rechargeBatch,
    idLabel: 'Recharge code batch ID',
    fields: [
      { key: 'downloadCount', label: 'Download count', kind: 'number' },
      { key: '$counts', label: 'Quantity', kind: 'counts' },
    ],
  },
  'task.policy.published': {
    objectType: 'Task policy',
    fields: [
      { key: 'quoteTtlSeconds', label: 'Quote validity', kind: 'number' },
      {
        key: 'bonusFailureGraceDays',
        label: 'Bonus failure grace',
        kind: 'number',
      },
      { key: 'paidExpiryDays', label: 'Paid points validity', kind: 'number' },
      { key: 'changedConfigKeys', label: 'Changed field', kind: 'list' },
    ],
  },
  'execution.policy.published': {
    objectType: 'Execution policy',
    objectName: ({ event }) =>
      EXECUTION_POLICY_LABEL_KEYS[String(event.publicMetadata.kind)],
    fields: [
      { key: 'version', label: 'Version', kind: 'number' },
      {
        key: 'after',
        previous: 'before',
        label: 'Changes',
        kind: 'configDiff',
      },
    ],
    reason: { label: 'Reason', only: ['RESTORED_DEFAULT'] },
  },
  'executor.drain.started': {
    objectType: 'All executor instances of this environment',
    fields: drainWindow,
  },
  'executor.drain.extended': {
    objectType: 'All executor instances of this environment',
    fields: drainWindow,
  },
  'executor.drain.cancelled': {
    objectType: 'All executor instances of this environment',
  },
  'task.execution.admin_frozen_points_released': {
    objectType: 'Customer',
    objectName: customerName(),
    idLabel: 'Task number',
    fields: [
      customerField,
      reasonField,
      {
        key: 'releasedOutputIndices',
        label: 'Released result positions',
        kind: 'positions',
      },
      executionPair,
      billingField,
    ],
    reason: { label: 'Release mode' },
  },
  'task.execution.admin_manual_result_requested': {
    objectType: 'Customer',
    objectName: customerName(),
    idLabel: 'Task number',
    fields: [
      customerField,
      reasonField,
      { key: 'outputIndex', label: 'Output index', kind: 'positions' },
      { key: 'resultOrigin', label: 'Result file site' },
    ],
  },
  'task.provider_cost.settled': {
    objectType: 'Customer',
    objectName: customerName(),
    idLabel: 'Task number',
    fields: [
      customerField,
      { key: 'amountRmb', label: 'Provider cost', kind: 'rmbYuan' },
      { key: 'classification', label: 'Cost classification', kind: 'enum' },
      reasonField,
    ],
  },
  'task.provider_cost.settlement_revoked': {
    objectType: 'Customer',
    objectName: customerName(),
    idLabel: 'Task number',
    fields: [customerField, reasonField],
  },
  'task.execution.late_success': taskEvent,
  'task.outputs.updated': {
    objectType: 'Task',
    idLabel: 'Task number',
    fields: [
      { key: 'outputIndices', label: 'Output index', kind: 'positions' },
      { key: 'executionStatus', label: 'Execution status', kind: 'enum' },
      billingField,
    ],
  },
  'task.execution.unsent_confirmed_failed': {
    objectType: 'Customer',
    objectName: customerName(),
    idLabel: 'Task number',
    fields: [
      executionPair,
      billingField,
      {
        key: 'providerCallCount',
        label: 'Provider call count',
        kind: 'number',
      },
      {
        key: 'providerCostCreated',
        label: 'Provider cost created',
        kind: 'bool',
      },
    ],
  },
  'task.execution.unknown_timeout_released': {
    objectType: 'Task',
    idLabel: 'Task number',
    fields: [
      { key: 'executionStatus', label: 'Execution status', kind: 'enum' },
      billingField,
      {
        key: 'providerCostCreated',
        label: 'Provider cost created',
        kind: 'bool',
      },
    ],
  },
  'agent.withdrawal.requested': {
    objectType: 'Withdrawal request',
    idLabel: 'Withdrawal request ID',
    fields: [
      { key: 'amountMinor', label: 'Withdrawal amount', kind: 'rmbMinor' },
      { key: 'taxMinor', label: 'Withholding tax', kind: 'rmbMinor' },
      { key: 'netMinor', label: 'Net payment', kind: 'rmbMinor' },
      { key: 'fullBalance', label: 'Full balance', kind: 'bool' },
    ],
  },
  'agent.payment_qr.uploaded': {
    objectType: 'Payment QR code',
    fields: [
      {
        key: 'pendingWithdrawalCount',
        label: 'Pending withdrawals',
        kind: 'number',
      },
    ],
  },
  'executor.task.claimed': executorTask,
  'executor.task.reclaimed': executorTask,
  'executor.task.capacity_recheck': executorTask,
  'executor.task.attempt_failed': {
    ...executorTask,
    fields: [
      workerField,
      { key: 'attempt', label: 'Attempt', kind: 'number' },
      { key: 'errorName', label: 'Error type' },
      {
        key: 'preflightDiagnostic',
        label: 'Failure diagnosis',
        kind: 'diagnostic',
      },
    ],
    reason: { label: 'Failure reason' },
  },
  'executor.manual_result.applied': {
    objectType: 'Task',
    idLabel: 'Task number',
    fields: [{ key: 'outputIndex', label: 'Output index', kind: 'positions' }],
  },
  'executor.manual_result.failed': {
    objectType: 'Task',
    idLabel: 'Task number',
    fields: [{ key: 'outputIndex', label: 'Output index', kind: 'positions' }],
    reason: { label: 'Failure reason' },
  },
  'executor.output.retrieval_retry': outputRetrieval,
  'executor.output.retrieval_failed': outputRetrieval,
  'executor.drain.expired': {
    objectType: 'All executor instances of this environment',
    fields: [
      workerField,
      {
        key: 'resumedAutomatically',
        label: 'Resumed automatically',
        kind: 'bool',
      },
    ],
  },
  'executor.worker.started': {
    objectType: 'Executor instance',
    objectName: resourceKey,
  },
  'executor.worker.stopped': {
    objectType: 'Executor instance',
    objectName: resourceKey,
  },
  'executor.worker.start_failed': {
    objectType: 'Executor instance',
    objectName: resourceKey,
    fields: [{ key: 'errorName', label: 'Error type' }],
    reason: { label: 'Failure reason' },
  },
  'executor.capacity.integrity_repaired': {
    objectType: 'Execution capacity',
    fields: [{ key: 'report', label: 'Quantity', kind: 'counts' }],
    reason: { label: 'Reason' },
  },
  'executor.attention.raised': {
    objectType: 'Needs attention',
    reason: { label: 'Reason' },
    fields: [
      { key: 'count', label: 'Quantity', kind: 'number' },
      { key: 'latestAt', label: 'Latest at', kind: 'time' },
    ],
  },
  'pricing.model.activated': {
    objectType: 'Model',
    objectName: modelFromMeta,
    idLabel: 'Price publication ID',
    fields: [
      {
        key: 'priceVersionIds',
        label: 'Effective versions',
        kind: 'versionCount',
      },
    ],
  },
  'pricing.model.activation_blocked': {
    objectType: 'Model',
    objectName: modelFromMeta,
    idLabel: 'Price publication ID',
    fields: [{ key: 'lossEndsAt', label: 'Loss deadline', kind: 'time' }],
    reason: { label: 'Reason' },
  },
  'pricing.price_version.activated': {
    ...priceVersion,
    fields: [{ key: 'effectiveAt', label: 'Effective at', kind: 'time' }],
  },
  'pricing.provider_rate.activated': {
    objectType: 'Model',
    objectName: modelFromMeta,
    idLabel: 'Provider rate version ID',
    fields: [{ key: 'version', label: 'Version', kind: 'number' }],
  },
  'pricing.limited_special.activated': limitedSpecial([
    { key: 'startsAt', label: 'Starts at', kind: 'time' },
    { key: 'endsAt', label: 'Ends at', kind: 'time' },
  ]),
  'pricing.limited_special.expired': limitedSpecial(
    [{ key: 'endsAt', label: 'Ends at', kind: 'time' }],
    { label: 'Reason', only: ['WINDOW_MISSED_DURING_DOWNTIME'] }
  ),
  'pricing.limited_special.quote_accepted': {
    ...limitedSpecial([
      {
        key: 'specialPoints',
        previous: 'basePoints',
        label: 'Base → special',
        kind: 'points',
      },
      { key: 'discountPoints', label: 'Discount points', kind: 'points' },
    ]),
    idLabel: 'Quote ID',
  },
}
SPECS['model.key.monitoring.disabled'] = SPECS['model.key.monitoring.enabled']
SPECS['agent.payment_qr.replaced'] = SPECS['agent.payment_qr.uploaded']
SPECS['executor.capacity.integrity_alert'] =
  SPECS['executor.capacity.integrity_repaired']

/** Action names. Codes reuse an existing page key where the confirmed name already exists; the rest are keyed by code. */
const ACTION_LABEL_KEYS: Record<string, string> = {
  'agent.enabled': 'Restore agent qualification',
  'agent.disabled': 'Disable agent qualification',
  'agent.withdrawal.paid': 'Confirm paid',
  'catalog.continuity.published': 'Publish Bundle',
  'model.key.monitoring.enabled': 'Restore model',
  'model.key.monitoring.disabled': 'Disable model',
  'model.tag.created': 'New category',
  'model.tag.renamed': 'Rename category',
  'model.tag.assignments.updated': 'Associate models',
  'pricing.provider_rate.risk_decided': 'Record risk decision',
  'points.activity.stopped': 'Stop activity',
  'points.activity.manual.created': 'Create activity',
  'points.activity.manual.updated': 'Edit manual grant',
  'points.activity.manual.cancelled': 'Cancel plan',
  'points.activity.manual.retry_requested': 'Retry failed customers',
  'points.order_return.posted': 'Return points',
  'provider.credential_group.published': 'Publish provider credential group',
  'provider.credential_group.restored': 'Restore API Key group',
  'provider.website.updated': 'Change website',
  'provider.balance_alert_threshold.updated': 'Set alert',
  'runtime.task_media.checked': 'Check task media',
  'invite.code.created': 'Create invite code',
  'invite.code.copied': 'Copy invite code',
  'invite.code.expiration_extended': 'Extend expiration',
  'invite.code.capacity_expanded': 'Increase capacity',
  'recharge.code.displayed': 'Show codes',
  'recharge.code_batch.unused_downloaded': 'Download unused codes',
  'executor.drain.started': 'Start draining',
  'executor.drain.cancelled': 'Cancel draining',
  'task.execution.admin_frozen_points_released': 'Release frozen points early',
  'task.execution.admin_manual_result_requested': 'Enter a manual result',
  'executor.manual_result.applied': 'Manual result applied',
  'executor.manual_result.failed': 'Manual result not applied',
  'task.provider_cost.settled': 'Settle cost',
  'task.provider_cost.settlement_revoked': 'Revoke settlement',
  'agent.withdrawal.requested': 'Withdrawal request submitted',
  'agent.payment_qr.uploaded': 'Upload QR code',
  'agent.payment_qr.replaced': 'Change QR code',
  'executor.attention.raised': 'Needs attention',
}
/** `task.execution.<status>` is written per execution status; one name covers them all. */
export const TASK_EXECUTION_STATUS_ACTION = 'task.execution.status_changed'

/** Codes Cloud writes as `task.execution.<status>` (task-service recordProviderTaskEvent). */
const TASK_EXECUTION_STATUS_ACTIONS: Record<string, string> = {
  'task.execution.processing': 'PROCESSING',
  'task.execution.succeeded': 'SUCCEEDED',
  'task.execution.confirmed_failed': 'CONFIRMED_FAILED',
  'task.execution.unknown': 'UNKNOWN',
}

/** Registered actions in the order of the appendix, used by the action filter. */
export const AUDIT_ACTIONS = [
  ...Object.keys(SPECS),
  ...Object.keys(TASK_EXECUTION_STATUS_ACTIONS),
]

/** The filter option name; status actions share one name, so the status tells them apart. */
export function auditActionOptionLabel(action: string, t: TFunction): string {
  const name = t(auditActionLabelKey(action) ?? action)
  const status = TASK_EXECUTION_STATUS_ACTIONS[action]
  return status ? `${name} · ${t(executionLabels[status] ?? status)}` : name
}

export function auditActionLabelKey(action: string): string | null {
  if (ACTION_LABEL_KEYS[action]) return ACTION_LABEL_KEYS[action]
  if (SPECS[action]) return action
  if (action.startsWith('task.execution.')) return TASK_EXECUTION_STATUS_ACTION
  return null
}

function specFor(action: string): ActionSpec | undefined {
  if (SPECS[action]) return SPECS[action]
  return action.startsWith('task.execution.') ? taskEvent : undefined
}

/** Section titles of the execution settings page, by policy kind. */
const EXECUTION_POLICY_LABEL_KEYS: Record<string, string> = {
  GLOBAL_LIMITS: 'Global execution limits',
  CREDENTIAL_GROUP_POLICY: 'Credential group execution policy',
  LIMIT_RULES: 'Limit rules',
  CREDENTIAL_GROUP_LIMITS: 'Limit rules',
  ERROR_MAPPING: 'Provider error mappings',
}

const ACTOR_LABEL_KEYS: Record<string, string> = {
  PLATFORM_ADMIN: 'Platform administrator',
  SUPER_ADMIN: 'Super Admin',
  CUSTOMER: 'Customer',
  SYSTEM: 'System',
}

export function auditActorText(event: AuditEvent, t: TFunction): string {
  const workerId = text(event.publicMetadata.workerId)
  if (event.actorType === 'SYSTEM' && workerId) {
    return `${t('Executor instance')} · ${workerId}`
  }
  const role = ACTOR_LABEL_KEYS[event.actorType]
    ? t(ACTOR_LABEL_KEYS[event.actorType])
    : event.actorType
  return event.actorType !== 'SYSTEM' && event.actorUsername
    ? `${role} · ${event.actorUsername}`
    : role
}

/** "Type · readable name"; the type alone when no name is recorded or the row is gone. Unknown types show the raw value. */
export function auditObjectText(
  event: AuditEvent,
  names: CanvasAuditResolvedNames,
  t: TFunction
): string {
  const spec = specFor(event.action)
  const type = spec ? t(spec.objectType) : event.resourceType
  const name = spec?.objectName?.({ event, names })
  if (!name) return type
  const localized =
    event.action === 'execution.policy.published' ? t(name) : name
  return `${type} · ${localized}`
}

export function auditObjectIdLabel(action: string): string | null {
  return specFor(action)?.idLabel ?? null
}

const REASON_VALUE_KEYS: Record<string, string> = {
  RESTORED_DEFAULT: 'Restore default',
  BILLING_UNIT_CHANGED: 'Billing unit changed',
  ADMIN_CONFIRMED_UPSTREAM_FAILED: 'Provider failure confirmed',
  // Why a manual result was not applied: an output retrieval reason, or its result stopped waiting.
  OUTPUT_NOT_AWAITING_RESULT:
    'The result no longer waited: the provider answered first or the points were released',
  PROVIDER_OUTPUT_TOO_LARGE: 'Result file too large',
  PROVIDER_OUTPUT_LOCATION_REJECTED: 'Result address rejected',
  PROVIDER_OUTPUT_DOWNLOAD_FAILED: 'Result download failed',
  PROVIDER_OUTPUT_UNSUPPORTED_MEDIA: 'Result is not usable media',
  PROVIDER_OUTPUT_INVALID: 'Result file invalid',
  OUTPUT_STORAGE_FAILED: 'Result storage failed',
}

export function auditReasonRow(
  event: AuditEvent,
  t: TFunction
): { label: string; value: string } | null {
  const reason = specFor(event.action)?.reason
  if (!reason || !event.reasonCode) return null
  if (reason.only && !reason.only.includes(event.reasonCode)) return null
  if (event.action === 'executor.attention.raised') {
    const messageKey =
      attentionMessageKeys[
        event.reasonCode as keyof typeof attentionMessageKeys
      ]
    if (messageKey) {
      return {
        label: t(reason.label),
        value: t(messageKey, {
          count: Number(event.publicMetadata.count ?? 0),
        }),
      }
    }
  }
  const key = REASON_VALUE_KEYS[event.reasonCode] ?? event.reasonCode
  return {
    label: t(reason.label),
    value: t(key, { defaultValue: event.reasonCode }),
  }
}

export type AuditPreflightDiagnostic = {
  stage: string
  reason: string
  field?: string
  rule?: string
  detail?: string
}

export interface AuditDetailRow {
  label: string
  value: string
  /** Rendered as a labelled internal ID with its own copy button. */
  copy?: boolean
  /** Rendered with the task details' failure diagnosis block. */
  diagnostic?: AuditPreflightDiagnostic
}

const ENUM_LABEL_KEYS: Record<string, Record<string, string>> = {
  executionStatus: executionLabels,
  previousExecutionStatus: executionLabels,
  customerBillingStatus: billingLabels,
  enabled: { true: 'Enabled', false: 'Disabled' },
  previousEnabled: { true: 'Enabled', false: 'Disabled' },
  keyChange: { UNCHANGED: 'Unchanged' },
  principalType: ACTOR_LABEL_KEYS,
  recordType: { BALANCE: 'Back-office balance', TOP_UP: 'Top-up' },
  outcome: {
    PASSED: 'Connection check passed',
    FAILED: 'Connection check failed',
  },
}

/** Recharge-code batch counters, named like the recharge-code statuses. */
const COUNT_LABEL_KEYS: Record<string, string> = {
  redeemedCount: 'Redeemed',
  voidCount: 'Void',
  expiredCount: 'Expired',
}

function enumText(key: string, value: unknown, t: TFunction): string {
  const raw = String(value)
  const mapped = ENUM_LABEL_KEYS[key]?.[raw]
  if (mapped) return t(mapped)
  if (key === 'status' || key === 'previousStatus') {
    return t(`Invite status ${raw}`, {
      defaultValue: t(raw, { defaultValue: raw }),
    })
  }
  return t(raw, { defaultValue: raw })
}

function namesFrom(value: unknown, map: Record<string, string>): string | null {
  const ids = Array.isArray(value) ? value.map(String) : []
  if (ids.length === 0) return null
  const resolved = ids.map((id) => map[id]).filter(Boolean)
  return resolved.length === ids.length
    ? resolved.join('、')
    : String(ids.length)
}

function listText(value: unknown, t: TFunction): string | null {
  if (!Array.isArray(value) || value.length === 0) return null
  return value
    .map((entry) =>
      entry && typeof entry === 'object'
        ? String(
            (entry as Record<string, unknown>).displayNameSnapshot ??
              (entry as Record<string, unknown>).id ??
              ''
          )
        : t(String(entry), { defaultValue: String(entry) })
    )
    .join('、')
}

const CONFIG_FIELD_LABEL_KEYS: Record<string, string> = {
  endpoint: 'R2 endpoint',
  inputRetentionHours: 'Input retention hours',
  outputRetentionHours: 'Output retention hours',
  agentFileRetentionHours: 'Payment proof retention hours',
  downloadUrlTtlSeconds: 'Download URL seconds',
  backupRetentionHours: 'Backup retention hours',
}

function valueText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

function configChangeLines(
  action: string,
  value: unknown,
  t: TFunction
): string | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const bucketLabel =
    action === 'runtime.database_backup.published'
      ? 'Backup bucket'
      : 'Task media bucket'
  return value
    .map((entry) => {
      const change = entry as {
        field?: string
        before?: unknown
        after?: unknown
      }
      const field = String(change.field ?? '')
      const label =
        field === 'bucket' ? bucketLabel : CONFIG_FIELD_LABEL_KEYS[field]
      return `${label ? t(label) : field}：${valueText(change.before)} → ${valueText(change.after)}`
    })
    .join('\n')
}

function credentialChangeLines(value: unknown, t: TFunction): string | null {
  if (!Array.isArray(value) || value.length === 0) return null
  return value
    .map((entry) => {
      const change = entry as {
        type?: string
        before?: string | null
        after?: string | null
        displayNameSnapshot?: string
        fromGroup?: string | null
        toGroup?: string | null
      }
      if (change.type === 'KEY_REPLACED') return t('API Key replaced')
      if (change.type === 'GROUP_RENAMED') {
        return `${t('API Key group')}：${change.before ?? '—'} → ${change.after ?? '—'}`
      }
      if (change.displayNameSnapshot) {
        return `${change.displayNameSnapshot}：${change.fromGroup ?? t('Unbound')} → ${change.toGroup ?? t('Unbound')}`
      }
      return t(change.type ?? 'GROUP_UPDATED')
    })
    .join('\n')
}

/** Agent settlement rule fields, labelled and formatted as on the settlement settings page. */
const SETTLEMENT_FIELDS: Record<
  string,
  { label: string; unit: 'rmb' | 'percent' }
> = {
  minWithdrawalMinor: { label: 'Minimum withdrawal amount', unit: 'rmb' },
  maxWithdrawalMinor: {
    label: 'Maximum single withdrawal amount',
    unit: 'rmb',
  },
  taxRateBasisPoints: { label: 'Withholding tax rate', unit: 'percent' },
  expiryShareRateBasisPoints: {
    label: 'Expired-points share ratio',
    unit: 'percent',
  },
}
/** Execution policy fields whose settings-page label is not the field name itself. */
const EXECUTION_FIELD_LABEL_KEYS: Record<string, string> = {
  showSafeErrorDetailsToCustomer: 'Show the upstream reason to customers',
}

function configDiffLines(
  action: string,
  before: unknown,
  after: unknown,
  t: TFunction,
  locale: string | undefined
) {
  const left = (before && typeof before === 'object' ? before : {}) as Record<
    string,
    unknown
  >
  const right = (after && typeof after === 'object' ? after : {}) as Record<
    string,
    unknown
  >
  const settlement = action === 'agent.settlement_policy.published'
  const show = (key: string, value: unknown) => {
    if (value === null || value === undefined) return t('Not configured')
    if (typeof value === 'boolean') return value ? t('Yes') : t('No')
    const unit = settlement ? SETTLEMENT_FIELDS[key]?.unit : undefined
    if (unit === 'rmb') return formatRmbMinor(String(value), locale)
    if (unit === 'percent') {
      return `${formatBusinessNumber(Number(value) / 100)}%`
    }
    return String(value)
  }
  const lines = [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key]))
    .map((key) => {
      const labelKey = settlement
        ? SETTLEMENT_FIELDS[key]?.label
        : (EXECUTION_FIELD_LABEL_KEYS[key] ?? key)
      const label = labelKey ? t(labelKey, { defaultValue: key }) : key
      // Rule lists are compared on the settings page's version history; the log only says they changed.
      const nested = [left[key], right[key]].some(
        (value) => value !== null && typeof value === 'object'
      )
      return nested
        ? `${label}：${t('Changed')}`
        : `${label}：${show(key, left[key])} → ${show(key, right[key])}`
    })
  return lines.length > 0 ? lines.join('\n') : null
}

function countsText(value: unknown, t: TFunction): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, count]) => typeof count === 'number' || typeof count === 'string'
  )
  return entries.length > 0
    ? entries
        .map(
          ([key, count]) =>
            `${COUNT_LABEL_KEYS[key] ? t(COUNT_LABEL_KEYS[key]) : t(key, { defaultValue: key })}：${String(count)}`
        )
        .join('\n')
    : null
}

function formatValue(
  field: FieldSpec,
  value: unknown,
  context: Context & { t: TFunction; locale: string | undefined }
): string | null {
  const { names, t, locale, event } = context
  if (value === null || value === undefined || value === '') return null
  switch (field.kind) {
    case 'number':
      return /^-?\d+$/u.test(String(value))
        ? formatExactPointQuantity(String(value), locale)
        : String(value)
    case 'points':
      return /^-?\d+$/u.test(String(value))
        ? formatExactPointQuantity(String(value), locale)
        : String(value)
    case 'rmbMinor':
      return formatRmbMinor(String(value), locale)
    case 'moneyMinor': {
      const currency = text(event.publicMetadata.currency) ?? 'CNY'
      return currency === 'CNY'
        ? formatRmbMinor(String(value), locale)
        : formatMoneyMinor(String(value), currency)
    }
    case 'rmbYuan':
      return formatRmbYuan(String(value), locale)
    case 'rate':
      return `${formatBusinessPercentFromRate(String(value))}%`
    case 'time':
      return formatCanvasDateTime(String(value))
    case 'bool':
      return value === true || value === 'true' ? t('Yes') : t('No')
    case 'enum':
      return enumText(field.key, value, t)
    case 'count':
      return Array.isArray(value) ? String(value.length) : null
    case 'agentStatus':
      return value === 'ACTIVE' || value === 'DISABLED'
        ? t(agentQualificationLabelKey(value))
        : String(value)
    case 'customer':
      return names.customers[String(value)] ?? null
    case 'agent':
      return names.agents[String(value)] ?? null
    case 'priceGroup':
      return names.priceGroups[String(value)] ?? null
    case 'rechargeOrder':
      return names.rechargeOrders[String(value)] ?? null
    case 'customerModels':
      return namesFrom(value, names.customerModels)
    case 'modelTags':
      return namesFrom(value, names.modelTags)
    case 'list':
      if (field.key === 'changed' && value && typeof value === 'object') {
        const changed = value as { cost?: boolean; price?: boolean }
        const parts = [
          changed.cost ? t('Provider cost') : null,
          changed.price ? t('Customer sale price') : null,
        ].filter(Boolean)
        return parts.length > 0 ? parts.join('、') : null
      }
      return listText(value, t)
    case 'positions':
      return (Array.isArray(value) ? value : [value])
        .map((index) => String(Number(index) + 1))
        .join('、')
    case 'credentialChanges':
      return credentialChangeLines(value, t)
    case 'configChanges':
      return configChangeLines(event.action, value, t)
    case 'counts':
      return countsText(value, t)
    default:
      return typeof value === 'object' ? JSON.stringify(value) : String(value)
  }
}

/** Detail rows listed by the appendix; keys outside it are never shown, and missing keys are skipped. */
export function auditDetailRows(
  event: AuditEvent,
  names: CanvasAuditResolvedNames,
  t: TFunction,
  /** The interface language, such as `zhCN`; converted here because Intl rejects it as written. */
  language: string
): AuditDetailRow[] {
  const spec = specFor(event.action)
  if (!spec?.fields) return []
  const locale = toIntlLocale(language)
  const context = { event, names, t, locale }
  const metadata = event.publicMetadata
  const rows: AuditDetailRow[] = []
  for (const field of spec.fields) {
    if (field.kind === 'pointLot') {
      const id = text(metadata[field.key])
      if (id) rows.push({ label: t(field.label), value: id, copy: true })
      continue
    }
    if (field.key === '$priceVersionGroup') {
      const name = event.resourceId
        ? names.priceVersions[event.resourceId]?.priceGroupName
        : null
      if (name) rows.push({ label: t(field.label), value: name })
      continue
    }
    if (field.key === '$promotionModel') {
      const id =
        event.resourceType === 'PROMOTION_VERSION' && event.resourceId
          ? event.resourceId
          : String(metadata.promotionVersionId)
      const name = names.promotionVersions[id]?.modelName
      if (name) rows.push({ label: t(field.label), value: name })
      continue
    }
    if (field.key === '$counts') {
      const counts = Object.fromEntries(
        Object.entries(metadata).filter(
          ([key, value]) =>
            key.endsWith('Count') &&
            key !== 'downloadCount' &&
            typeof value === 'number'
        )
      )
      const value = countsText(counts, t)
      if (value) rows.push({ label: t(field.label), value })
      continue
    }
    if (field.kind === 'versionCount') {
      // Price versions and provider rates that took effect together.
      const ids = [metadata.priceVersionIds, metadata.providerRateVersionIds]
        .filter(Array.isArray)
        .flat()
      if (ids.length > 0) {
        rows.push({ label: t(field.label), value: String(ids.length) })
      }
      continue
    }
    if (field.kind === 'diagnostic') {
      const diagnostic = metadata[field.key] as
        | Partial<AuditPreflightDiagnostic>
        | null
        | undefined
      if (
        typeof diagnostic?.stage === 'string' &&
        typeof diagnostic.reason === 'string'
      ) {
        rows.push({
          label: t(field.label),
          value: '',
          diagnostic: diagnostic as AuditPreflightDiagnostic,
        })
      }
      continue
    }
    if (field.kind === 'configDiff') {
      const value = configDiffLines(
        event.action,
        metadata[field.previous ?? ''],
        metadata[field.key],
        t,
        locale
      )
      if (value) rows.push({ label: t(field.label), value })
      continue
    }
    const current = formatValue(field, metadata[field.key], context)
    if (field.previous) {
      const earlier = formatValue(
        { ...field, key: field.previous },
        metadata[field.previous],
        context
      )
      if (current === null && earlier === null) continue
      rows.push({
        label: t(field.label),
        value: `${earlier ?? '—'} → ${current ?? '—'}`,
      })
      continue
    }
    if (current !== null) rows.push({ label: t(field.label), value: current })
  }
  return rows
}
