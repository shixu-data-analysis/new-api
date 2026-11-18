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
import type {
  CanvasNotificationAddressType,
  CanvasNotificationSettings,
  CanvasNotificationSettingsInput,
} from './types'

// NOTIFICATIONS-001: every change on 运行管理 › 通知 saves the whole settings at once, from the version it was made on (a
// dialog's, the one it opened on), so a change made elsewhere meanwhile is refused instead of overwritten. A saved address goes back by id only; Cloud keeps its
// Webhook or email unless a new one is entered.

export interface NotificationAddressDraft {
  /** A saved address's id, or a new one made on the page. */
  id: string
  type: CanvasNotificationAddressType
  /** The Webhook or email typed now; empty keeps the saved one. */
  value: string
}

export type NotificationChange =
  | {
      kind: 'addresses'
      name: string
      rows: NotificationAddressDraft[]
      /** Addresses of the edited one that were removed from its dialog. */
      removed: string[]
      /** The events the rows are used for; null leaves each event's choice as it is. */
      events: string[] | null
    }
  | { kind: 'delete'; addressId: string }
  | { kind: 'event'; eventId: string; addressIds: string[] }
  | { kind: 'toggle'; eventId: string; enabled: boolean }

/** The typed Webhook or email under its field; nothing when it is left empty, so the saved one is kept. */
function typedValue(row: NotificationAddressDraft): {
  url?: string
  email?: string
} {
  const value = row.value.trim()
  if (!value) return {}
  return row.type === 'EMAIL' ? { email: value } : { url: value }
}

export function notificationSettingsInput(
  settings: CanvasNotificationSettings,
  change: NotificationChange
): CanvasNotificationSettingsInput {
  let addresses: CanvasNotificationSettingsInput['addresses'] =
    settings.addresses.map(({ id, name, type }) => ({ id, name, type }))
  const events = Object.fromEntries(
    Object.entries(settings.events).map(([id, event]) => [
      id,
      { enabled: event.enabled, addressIds: [...event.addressIds] },
    ])
  )
  if (change.kind === 'addresses') {
    const dropped = new Set(change.removed)
    addresses = addresses.filter((address) => !dropped.has(address.id))
    for (const row of change.rows) {
      const entry = {
        id: row.id,
        name: change.name.trim(),
        type: row.type,
        ...typedValue(row),
      }
      const index = addresses.findIndex((address) => address.id === row.id)
      if (index === -1) addresses.push(entry)
      else addresses[index] = entry
    }
    const rowIds = change.rows.map((row) => row.id)
    for (const [id, event] of Object.entries(events)) {
      const kept = event.addressIds.filter(
        (addressId) => !dropped.has(addressId)
      )
      if (change.events === null) {
        events[id] = { ...event, addressIds: kept }
        continue
      }
      const others = kept.filter((addressId) => !rowIds.includes(addressId))
      events[id] = {
        ...event,
        addressIds: change.events.includes(id)
          ? [...others, ...rowIds]
          : others,
      }
    }
  }
  if (change.kind === 'delete') {
    addresses = addresses.filter((address) => address.id !== change.addressId)
    for (const event of Object.values(events)) {
      event.addressIds = event.addressIds.filter(
        (id) => id !== change.addressId
      )
    }
  }
  if (change.kind === 'event' && events[change.eventId]) {
    events[change.eventId].addressIds = change.addressIds
  }
  if (change.kind === 'toggle' && events[change.eventId]) {
    events[change.eventId].enabled = change.enabled
  }
  return { expectedVersion: settings.version, addresses, events }
}

/** The events that send to an address, for 用于 and for the address dialog. */
export function eventsOfAddress(
  settings: CanvasNotificationSettings,
  addressId: string
): string[] {
  return Object.entries(settings.events)
    .filter(([, event]) => event.addressIds.includes(addressId))
    .map(([id]) => id)
}
