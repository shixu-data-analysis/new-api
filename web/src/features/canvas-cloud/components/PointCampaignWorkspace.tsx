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
*/
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'

import { Tabs, TabsContent } from '@/components/ui/tabs'

import { AdminPricing } from './AdminPricing'
import { CampaignManagement } from './CampaignManagement'
import {
  CanvasManagementTabsList,
  CanvasManagementTabsTrigger,
} from './CanvasManagementTabs'
import { PointConversionDashboard } from './PointConversionDashboard'

type PointCampaignWorkspaceProps = Omit<
  ComponentProps<typeof AdminPricing>,
  'mode'
>

export function PointCampaignWorkspace(props: PointCampaignWorkspaceProps) {
  const { t } = useTranslation()
  return (
    <Tabs defaultValue='conversion' className='space-y-4'>
      <CanvasManagementTabsList>
        <CanvasManagementTabsTrigger value='conversion'>
          {t('Point conversion')}
        </CanvasManagementTabsTrigger>
        <CanvasManagementTabsTrigger value='campaigns'>
          {t('Point campaigns')}
        </CanvasManagementTabsTrigger>
        <CanvasManagementTabsTrigger value='specials'>
          {t('Limited-time special')}
        </CanvasManagementTabsTrigger>
      </CanvasManagementTabsList>
      <TabsContent value='conversion' className='mt-0'>
        <PointConversionDashboard />
      </TabsContent>
      <TabsContent value='campaigns' className='mt-0'>
        <CampaignManagement />
      </TabsContent>
      <TabsContent value='specials' className='mt-0'>
        <AdminPricing mode='campaigns' {...props} />
      </TabsContent>
    </Tabs>
  )
}
