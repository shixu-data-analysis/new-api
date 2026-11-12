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

import { AdminAnnouncements } from './AdminAnnouncements'
import { AdminConventionVersions } from './AdminConventionVersions'
import {
  CanvasManagementTabsList,
  CanvasManagementTabsTrigger,
} from './CanvasManagementTabs'

// 运营 › 系统公告: announcements and, since COMMUNITY-CONVENTION-001, the community convention. Only the open tab puts its
// actions in the title row.
export function SystemAnnouncementsPage(props: {
  titleActionSlot?: HTMLElement | null
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState('announcements')
  return (
    <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
      <CanvasManagementTabsList>
        <CanvasManagementTabsTrigger value='announcements'>
          {t('Announcements')}
        </CanvasManagementTabsTrigger>
        <CanvasManagementTabsTrigger value='convention'>
          {t('Community convention')}
        </CanvasManagementTabsTrigger>
      </CanvasManagementTabsList>
      <TabsContent value='announcements'>
        <AdminAnnouncements
          titleActionSlot={
            tab === 'announcements' ? props.titleActionSlot : null
          }
        />
      </TabsContent>
      <TabsContent value='convention'>
        <AdminConventionVersions
          titleActionSlot={tab === 'convention' ? props.titleActionSlot : null}
        />
      </TabsContent>
    </Tabs>
  )
}
