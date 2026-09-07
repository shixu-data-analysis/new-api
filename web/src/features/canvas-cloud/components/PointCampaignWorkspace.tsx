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

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { AdminPricing } from './AdminPricing'
import { CampaignManagement } from './CampaignManagement'
import { PointConversionDashboard } from './PointConversionDashboard'

type PointCampaignWorkspaceProps = Omit<
  ComponentProps<typeof AdminPricing>,
  'mode'
>

export function PointCampaignWorkspace(props: PointCampaignWorkspaceProps) {
  const { t } = useTranslation()
  return (
    <Tabs defaultValue='conversion' className='space-y-4'>
      <TabsList className='h-10 w-full max-w-full flex-nowrap justify-start gap-1 overflow-x-auto overflow-y-hidden p-1'>
        <TabsTrigger className='h-8 min-h-8 flex-none px-3' value='conversion'>
          {t('Point conversion')}
        </TabsTrigger>
        <TabsTrigger className='h-8 min-h-8 flex-none px-3' value='campaigns'>
          {t('Point campaigns')}
        </TabsTrigger>
        <TabsTrigger className='h-8 min-h-8 flex-none px-3' value='specials'>
          {t('Limited-time special')}
        </TabsTrigger>
      </TabsList>
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
