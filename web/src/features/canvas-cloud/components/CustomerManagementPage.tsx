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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Tabs, TabsContent } from '@/components/ui/tabs'

import { AdminPointAdjustments } from './AdminPointAdjustments'
import {
  CanvasManagementTabsList,
  CanvasManagementTabsTrigger,
} from './CanvasManagementTabs'
import { CustomerMailRecords } from './CustomerMailRecords'
import { SupportConversations } from './SupportConversations'

// 业务 › 客户管理: the customers, their support conversations (SUPPORT-CHAT-001) and, since COMMUNITY-CONVENTION-001, the
// mails sent to them. The customer list stays mounted on the other tabs: its title action (发邮件给全部有效客户) stays in
// the title row, and its selection and filters survive a switch. A Webhook alert links straight to one conversation.
export function CustomerManagementPage(props: {
  customerId?: string
  onCustomerChange?: (customerId?: string) => void
  orderId?: string
  pointLotId?: string
  titleActionSlot?: HTMLElement | null
  tab?: 'support'
  supportView?: 'failures'
  supportConversationId?: string
  onSupportChange?: (support: {
    open: boolean
    conversationId?: string
  }) => void
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState(
    props.tab === 'support' ? 'support' : 'customers'
  )
  const changeTab = (value: string) => {
    setTab(value)
    props.onSupportChange?.({
      open: value === 'support',
      ...(value === 'support' && props.supportConversationId
        ? { conversationId: props.supportConversationId }
        : {}),
    })
  }
  return (
    <Tabs value={tab} onValueChange={(value) => changeTab(String(value))}>
      <CanvasManagementTabsList>
        <CanvasManagementTabsTrigger value='customers'>
          {t('Customer list')}
        </CanvasManagementTabsTrigger>
        <CanvasManagementTabsTrigger value='support'>
          {t('Support conversations')}
        </CanvasManagementTabsTrigger>
        <CanvasManagementTabsTrigger value='mails'>
          {t('Email records')}
        </CanvasManagementTabsTrigger>
      </CanvasManagementTabsList>
      <TabsContent value='customers' keepMounted>
        <AdminPointAdjustments
          customerId={props.customerId}
          onCustomerChange={props.onCustomerChange}
          orderId={props.orderId}
          pointLotId={props.pointLotId}
          titleActionSlot={props.titleActionSlot}
        />
      </TabsContent>
      <TabsContent value='support'>
        <SupportConversations
          view={props.supportView}
          conversationId={props.supportConversationId}
          onConversationChange={(conversationId) =>
            props.onSupportChange?.({
              open: true,
              ...(conversationId ? { conversationId } : {}),
            })
          }
          onOpenCustomer={(customerId) => {
            changeTab('customers')
            props.onCustomerChange?.(customerId)
          }}
        />
      </TabsContent>
      <TabsContent value='mails'>
        <CustomerMailRecords />
      </TabsContent>
    </Tabs>
  )
}
