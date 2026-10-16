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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent } from '@/components/ui/tabs'

import { getCanvasAgentModelPrices, getCanvasAgentWorkspace } from '../api'
import { AgentCustomerList } from './AgentCustomerList'
import { AgentCustomerOverview } from './AgentCustomerOverview'
import { AgentInviteCodes } from './AgentInviteCodes'
import { AgentModelPricePanel } from './AgentModelPricePanel'
import {
  CanvasManagementTabsList,
  CanvasManagementTabsTrigger,
} from './CanvasManagementTabs'

/** The agent's 我的客户 page: an overview of all customers, then customers, invite codes and current model prices. */
export function AgentCenter() {
  const { t } = useTranslation()
  const [tab, setTab] = useState('customers')
  // Current model prices are read the first time their tab is shown, then kept with their filters.
  const [pricesShown, setPricesShown] = useState(false)
  const workspace = useQuery({
    queryKey: ['canvas-cloud', 'agent-workspace'],
    queryFn: getCanvasAgentWorkspace,
  })
  if (workspace.isPending) return <LoadingState />
  if (workspace.isError) {
    return <ErrorState onRetry={() => void workspace.refetch()} />
  }
  return (
    <div className='space-y-4'>
      <AgentCustomerOverview summary={workspace.data.summary} />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(String(value))
          if (value === 'prices') setPricesShown(true)
        }}
      >
        <CanvasManagementTabsList>
          <CanvasManagementTabsTrigger value='customers'>
            {t('My customers')}
          </CanvasManagementTabsTrigger>
          <CanvasManagementTabsTrigger value='invites'>
            {t('My invite codes')}
          </CanvasManagementTabsTrigger>
          <CanvasManagementTabsTrigger value='prices'>
            {t('Current model prices')}
          </CanvasManagementTabsTrigger>
        </CanvasManagementTabsList>
        <TabsContent value='customers' keepMounted>
          <Card>
            <CardContent>
              <AgentCustomerList source={{ kind: 'agent' }} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value='invites' keepMounted>
          <AgentInviteCodes />
        </TabsContent>
        <TabsContent value='prices' keepMounted>
          <AgentModelPricePanel
            queryKey={['canvas-cloud', 'agent-model-prices']}
            fetchPrices={getCanvasAgentModelPrices}
            enabled={pricesShown}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
