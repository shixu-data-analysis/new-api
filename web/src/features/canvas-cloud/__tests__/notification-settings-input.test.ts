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
import { describe, expect, it } from 'vitest'

import {
  eventsOfAddress,
  notificationSettingsInput,
} from '../notification-settings-input'
import type { CanvasNotificationSettings } from '../types'

const settings: CanvasNotificationSettings = {
  version: 4,
  addresses: [
    {
      id: 'hook',
      name: '运营群',
      type: 'WECOM',
      hint: 'qyapi.weixin.qq.com/…a1f3',
    },
    { id: 'mail', name: '运维邮箱', type: 'EMAIL', hint: 'o***@example.com' },
  ],
  events: {
    'support.pending': {
      category: 'SUPPORT',
      enabled: true,
      addressIds: ['hook'],
    },
    'availability.missing': {
      category: 'MODEL',
      enabled: false,
      addressIds: ['hook', 'mail'],
    },
  },
  addressTypes: ['WECOM', 'FEISHU', 'EMAIL'],
  lastDeliveries: {},
}

describe('NOTIFICATIONS-001 settings sent on each change', () => {
  it('saves several new rows under one name, each used for the chosen events', () => {
    const input = notificationSettingsInput(settings, {
      kind: 'addresses',
      name: ' 财务群 ',
      rows: [
        {
          id: 'new-1',
          type: 'FEISHU',
          value: ' https://open.feishu.cn/hook/1 ',
        },
        { id: 'new-2', type: 'EMAIL', value: 'pay@example.com' },
      ],
      removed: [],
      events: ['availability.missing'],
    })
    expect(input.expectedVersion).toBe(4)
    expect(input.addresses).toEqual([
      { id: 'hook', name: '运营群', type: 'WECOM' },
      { id: 'mail', name: '运维邮箱', type: 'EMAIL' },
      {
        id: 'new-1',
        name: '财务群',
        type: 'FEISHU',
        url: 'https://open.feishu.cn/hook/1',
      },
      { id: 'new-2', name: '财务群', type: 'EMAIL', email: 'pay@example.com' },
    ])
    expect(input.events['availability.missing'].addressIds).toEqual([
      'hook',
      'mail',
      'new-1',
      'new-2',
    ])
    expect(input.events['support.pending'].addressIds).toEqual(['hook'])
  })

  it('keeps a saved address left empty and moves it off the events no longer chosen', () => {
    const input = notificationSettingsInput(settings, {
      kind: 'addresses',
      name: '运营群',
      rows: [{ id: 'hook', type: 'DINGTALK', value: '' }],
      removed: [],
      events: ['support.pending'],
    })
    expect(input.addresses[0]).toEqual({
      id: 'hook',
      name: '运营群',
      type: 'DINGTALK',
    })
    expect(input.events['availability.missing'].addressIds).toEqual(['mail'])
    expect(input.events['support.pending'].addressIds).toEqual(['hook'])
  })

  it('drops a deleted address from every event, and changes only what the change names', () => {
    const deleted = notificationSettingsInput(settings, {
      kind: 'delete',
      addressId: 'hook',
    })
    expect(deleted.addresses.map((address) => address.id)).toEqual(['mail'])
    expect(deleted.events['support.pending'].addressIds).toEqual([])
    const toggled = notificationSettingsInput(settings, {
      kind: 'toggle',
      eventId: 'availability.missing',
      enabled: true,
    })
    expect(toggled.events['availability.missing']).toEqual({
      enabled: true,
      addressIds: ['hook', 'mail'],
    })
    expect(settings.events['support.pending'].addressIds).toEqual(['hook'])
  })

  it('names the events that send to an address', () => {
    expect(eventsOfAddress(settings, 'hook')).toEqual([
      'support.pending',
      'availability.missing',
    ])
    expect(eventsOfAddress(settings, 'mail')).toEqual(['availability.missing'])
  })
})
