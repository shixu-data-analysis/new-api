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
import type { CanvasAdminSupportMessage } from '../types'

type Translate = (key: string, options?: Record<string, unknown>) => string

function messageBody(message: CanvasAdminSupportMessage, t: Translate): string {
  if (message.kind === 'IMAGE') {
    return t('[Image]')
  }
  if (message.kind === 'LOG') {
    return t('[Diagnostic log]')
  }
  return message.text ?? ''
}

/** The list preview names who spoke last, so a replied conversation reads as replied without a status. */
export function lastMessagePreview(
  message: CanvasAdminSupportMessage | null,
  t: Translate
): string {
  if (!message) {
    return ''
  }
  const body = messageBody(message, t)
  if (message.sender === 'ADMIN') {
    return t('{{name}}: {{text}}', {
      name: message.adminName ?? t('Administrator'),
      text: body,
    })
  }
  if (message.sender === 'SYSTEM') {
    return t('System notice: {{text}}', { text: body })
  }
  return body
}

/** A time line goes before the first message and after each gap of five minutes or more, as in the customer's chat. */
const TIME_GROUP_GAP_MILLISECONDS = 5 * 60_000

export function startsTimeGroup(
  previous: CanvasAdminSupportMessage | undefined,
  message: CanvasAdminSupportMessage
): boolean {
  if (!previous) {
    return true
  }
  return (
    Date.parse(message.createdAt) - Date.parse(previous.createdAt) >=
    TIME_GROUP_GAP_MILLISECONDS
  )
}

/** 今天 22:57, 昨天 22:57, or 11/14 21:40 for an earlier day. */
export function supportTimeLabel(
  iso: string,
  locale: string | undefined,
  t: Translate,
  now = new Date()
): string {
  const date = new Date(iso)
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === now.toDateString()) {
    return t('Today {{time}}', { time })
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return t('Yesterday {{time}}', { time })
  }
  const day = new Intl.DateTimeFormat(locale, {
    month: 'numeric',
    day: 'numeric',
  }).format(date)
  return `${day} ${time}`
}
