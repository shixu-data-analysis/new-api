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
import type { CanvasNotificationAddressType } from './types'

// NOTIFICATIONS-001: Cloud names addresses, events and categories by ID only; the page names them here. An ID this page
// does not know yet is shown as it is, so a new event from Cloud is still listed.

export const NOTIFICATION_ADDRESS_TYPE_LABELS: Record<
  CanvasNotificationAddressType,
  string
> = {
  WECOM: 'WeCom',
  DINGTALK: 'DingTalk',
  FEISHU: 'Feishu',
  SLACK: 'Slack',
  JSON: 'Generic JSON',
  EMAIL: 'Email',
}

const EVENT_LABELS: Record<string, { name: string; when: string }> = {
  'support.pending': {
    name: 'New support message',
    when: 'A customer sends a message; at most once per conversation every 10 minutes',
  },
  'support.reminder': {
    name: 'Support message unanswered',
    when: 'Still no reply 30 minutes later',
  },
  'support.failures': {
    name: 'Model failure alert',
    when: 'One customer fails on one model as often as set in Support settings',
  },
  'availability.missing': {
    name: 'Models gone from a provider list',
    when: 'Missing from the list as many times in a row as set in Model availability alert settings',
  },
  'availability.paused': {
    name: 'Probing paused',
    when: 'A probe request succeeded or timed out, so it may have been charged',
  },
  'balance.low': {
    name: 'API provider balance low',
    when: 'The estimated balance falls below its alert threshold; at most once per provider a day',
  },
}

const CATEGORY_LABELS: Record<string, string> = {
  SUPPORT: 'Support',
  MODEL: 'Models',
  PROVIDER: 'API providers',
}

export const NOTIFICATION_FAILURE_LABELS: Record<string, string> = {
  URL_REJECTED: 'The Webhook address is not allowed',
  NETWORK: 'The Webhook could not be reached',
  TIMEOUT: 'The Webhook did not answer in time',
  HTTP_STATUS: 'The Webhook answered with an error',
  BOT_ERROR:
    'The bot refused the message; check the address and its security settings',
  NOT_CONFIGURED: 'Mail is not set up in this environment',
  RATE_LIMITED: 'Too many mails; it is tried again later',
  REJECTED: 'The mail server refused the mail',
  UNREACHABLE: 'The mail service could not be reached',
  NO_ADDRESS: 'The mail has no address',
}

/** The translation key of each event's name, for the operation log. */
export const NOTIFICATION_EVENT_NAME_LABELS: Record<string, string> =
  Object.fromEntries(
    Object.entries(EVENT_LABELS).map(([id, label]) => [id, label.name])
  )

type Translate = (key: string) => string

export const notificationEventName = (id: string, t: Translate) =>
  EVENT_LABELS[id] ? t(EVENT_LABELS[id].name) : id

export const notificationEventWhen = (id: string, t: Translate) =>
  EVENT_LABELS[id] ? t(EVENT_LABELS[id].when) : ''

export const notificationCategoryName = (id: string, t: Translate) =>
  CATEGORY_LABELS[id] ? t(CATEGORY_LABELS[id]) : id

export const notificationFailure = (reason: string, t: Translate) =>
  t(NOTIFICATION_FAILURE_LABELS[reason] ?? 'Not delivered')
