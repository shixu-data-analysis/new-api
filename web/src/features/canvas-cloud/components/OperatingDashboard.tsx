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

import {
  CanvasManagementTabsList,
  CanvasManagementTabsTrigger,
} from './CanvasManagementTabs'
import { PointsContributionPanel } from './PointsContributionPanel'
import { ProviderBalanceAlertBadge } from './ProviderBalanceAlertBadge'
import { ProviderBalancesPanel } from './ProviderBalancesPanel'

/** "Operating dashboard": the administrator home page. Each tab keeps its own filters; the tab is not written to the URL. */
export function OperatingDashboard() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'points' | 'provider-balances'>('points')
  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
      <CanvasManagementTabsList>
        <CanvasManagementTabsTrigger value='points'>
          {t('Points and contribution')}
        </CanvasManagementTabsTrigger>
        <CanvasManagementTabsTrigger value='provider-balances'>
          {t('API provider balances')}
          <ProviderBalanceAlertBadge />
        </CanvasManagementTabsTrigger>
      </CanvasManagementTabsList>
      <TabsContent value='points' keepMounted className='pt-4'>
        <PointsContributionPanel />
      </TabsContent>
      <TabsContent value='provider-balances' className='pt-4'>
        <ProviderBalancesPanel />
      </TabsContent>
    </Tabs>
  )
}
