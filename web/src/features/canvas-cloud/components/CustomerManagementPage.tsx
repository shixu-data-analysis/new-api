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
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { NavBadge } from '@/components/layout/components/nav-group'
import { Tabs, TabsContent } from '@/components/ui/tabs'

import { getCanvasAdminSupportPendingCount, supportQueryKeys } from '../api'
import {
  customersTabOf,
  type CustomersTab,
} from '../customer-management-navigation'
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
  customerDetailTab?: 'agent-statistics'
  titleActionSlot?: HTMLElement | null
  tab?: CustomersTab
  supportView?: 'failures'
  supportConversationId?: string
  /** The tab shown, kept in the address so the page title follows it; a conversation only with 客服会话. */
  onTabChange?: (change: {
    tab?: CustomersTab
    conversationId?: string
  }) => void
}) {
  const { t } = useTranslation()
  // The same query as the sidebar badge, so the tab adds no request.
  const pendingSupport =
    useQuery({
      queryKey: supportQueryKeys.pendingCount,
      queryFn: ({ signal }) => getCanvasAdminSupportPendingCount(signal),
      refetchInterval: 60_000,
    }).data ?? 0
  // The address holds the tab, so back and forward show the tab the title names.
  const tab = props.tab ?? 'customers'
  const changeTab = (value: string) => {
    const shown = customersTabOf(value)
    props.onTabChange?.({
      ...(shown ? { tab: shown } : {}),
      ...(shown === 'support' && props.supportConversationId
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
          {pendingSupport > 0 ? (
            <NavBadge
              tone='alert'
              label={t('{{count}} support conversations are awaiting a reply', {
                count: pendingSupport,
              })}
            >
              {String(pendingSupport)}
            </NavBadge>
          ) : null}
        </CanvasManagementTabsTrigger>
        <CanvasManagementTabsTrigger value='mails'>
          {t('Customer emails')}
        </CanvasManagementTabsTrigger>
      </CanvasManagementTabsList>
      <TabsContent value='customers' keepMounted>
        <AdminPointAdjustments
          customerId={props.customerId}
          onCustomerChange={props.onCustomerChange}
          orderId={props.orderId}
          pointLotId={props.pointLotId}
          customerDetailTab={props.customerDetailTab}
          titleActionSlot={props.titleActionSlot}
          onOpenSupportConversation={(conversationId) => {
            props.onTabChange?.({ tab: 'support', conversationId })
          }}
        />
      </TabsContent>
      <TabsContent value='support'>
        <SupportConversations
          view={props.supportView}
          conversationId={props.supportConversationId}
          onConversationChange={(conversationId) =>
            props.onTabChange?.({
              tab: 'support',
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
