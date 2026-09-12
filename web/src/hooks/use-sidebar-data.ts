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
import {
  Activity,
  BarChart3,
  BookOpenCheck,
  Box,
  Boxes,
  CircleDollarSign,
  Cloud,
  CreditCard,
  FileText,
  FlaskConical,
  Key,
  LayoutDashboard,
  ListTodo,
  MessageSquare,
  Radio,
  ServerCog,
  Settings,
  Ticket,
  User,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { SidebarData } from '@/components/layout/types'
import { isCanvasAdministrator } from '@/features/canvas-cloud/access'
import { useCanvasShellSession } from '@/features/canvas-cloud/use-canvas-session'
import { ROLE } from '@/lib/roles'

/**
 * Root navigation groups for the application sidebar.
 *
 * These are shown when the URL does not match any nested sidebar view
 * registered in `layout/lib/sidebar-view-registry.ts`.
 */
export function useSidebarData(): SidebarData {
  const { t } = useTranslation()
  const { canvasSession, isCanvasShell } = useCanvasShellSession()

  if (canvasSession.isPending) return { navGroups: [] }

  if (canvasSession.isSuccess) {
    if (isCanvasAdministrator(canvasSession.data.principalType)) {
      return {
        navGroups: [
          {
            id: 'canvas-admin-operations',
            title: t('Operations'),
            items: [
              {
                title: t('Canvas Dashboard'),
                url: '/canvas-cloud/dashboard',
                icon: BarChart3,
              },
              {
                title: t('Task Records'),
                url: '/canvas-cloud/task-logs',
                icon: ListTodo,
              },
              {
                title: t('Canvas Audit Log'),
                url: '/canvas-cloud/audit',
                icon: BookOpenCheck,
              },
            ],
          },
          {
            id: 'canvas-admin-business',
            title: t('Business'),
            items: [
              {
                title: t('Customer management'),
                url: '/canvas-cloud/customers',
                icon: Users,
              },
              {
                title: t('Activity management'),
                url: '/canvas-cloud/point-campaigns',
                icon: Wallet,
              },
              {
                title: t('Invitation management'),
                url: '/canvas-cloud/invitations',
                icon: UserPlus,
              },
              {
                title: t('Recharge codes'),
                url: '/canvas-cloud/recharge-codes',
                icon: Key,
              },
            ],
          },
          {
            id: 'canvas-admin-models-cost',
            title: t('Models & Cost'),
            items: [
              {
                title: t('Model management'),
                url: '/canvas-cloud/model-management',
                activeUrls: ['/canvas-cloud/model-management/'],
                icon: Boxes,
              },
              {
                title: t('Pricing and point rules'),
                url: '/canvas-cloud/pricing-point-rules',
                icon: CircleDollarSign,
              },
              {
                title: t('Runtime management'),
                url: '/canvas-cloud/runtime',
                activeUrls: [
                  '/canvas-cloud/runtime',
                  '/canvas-cloud/provider-configuration',
                ],
                icon: ServerCog,
              },
            ],
          },
          {
            id: 'account',
            title: t('Account'),
            items: [{ title: t('Profile'), url: '/profile', icon: User }],
          },
        ],
      }
    }
    return {
      navGroups: [
        {
          id: 'canvas',
          title: t('Canvas Cloud'),
          items: [
            {
              title: t('Canvas Usage Overview'),
              url: '/canvas-cloud/overview',
              icon: BarChart3,
            },
            {
              title: t('Redeem Points'),
              url: '/canvas-cloud/recharge',
              icon: Ticket,
            },
            {
              title: t('Available Models'),
              url: '/canvas-cloud/models',
              icon: Box,
            },
            {
              title: t('My Tasks'),
              url: '/canvas-cloud/tasks',
              icon: ListTodo,
            },
            {
              title: t('Point History'),
              url: '/canvas-cloud/consumption',
              icon: FileText,
            },
            ...(canvasSession.data.inviterEnabled
              ? [
                  {
                    title: t('Inviter center'),
                    url: '/canvas-cloud/agent-center',
                    icon: Users,
                  },
                ]
              : []),
          ],
        },
        {
          id: 'account',
          title: t('Account'),
          items: [{ title: t('Profile'), url: '/profile', icon: User }],
        },
      ],
    }
  }

  if (isCanvasShell) {
    return {
      navGroups: [
        {
          id: 'canvas-activation',
          title: t('Canvas Cloud'),
          items: [
            {
              title: t('Canvas Cloud'),
              url: '/canvas-cloud/overview',
              icon: Cloud,
            },
          ],
        },
        {
          id: 'account',
          title: t('Account'),
          items: [{ title: t('Profile'), url: '/profile', icon: User }],
        },
      ],
    }
  }

  return {
    navGroups: [
      {
        id: 'chat',
        title: t('Chat'),
        items: [
          {
            title: t('Playground'),
            url: '/playground',
            icon: FlaskConical,
          },
          {
            title: t('Chat'),
            icon: MessageSquare,
            type: 'chat-presets',
          },
        ],
      },
      {
        id: 'general',
        title: t('General'),
        items: [
          {
            title: t('Overview'),
            url: '/dashboard/overview',
            icon: Activity,
          },
          {
            title: t('Dashboard'),
            url: '/dashboard/models',
            icon: LayoutDashboard,
          },
          {
            title: t('API Keys'),
            url: '/keys',
            icon: Key,
          },
          {
            title: t('Usage Logs'),
            url: '/usage-logs/common',
            icon: FileText,
          },
          {
            title: t('Task Logs'),
            url: '/usage-logs/task',
            activeUrls: ['/usage-logs/drawing'],
            configUrls: ['/usage-logs/drawing', '/usage-logs/task'],
            icon: ListTodo,
          },
        ],
      },
      {
        id: 'personal',
        title: t('Personal'),
        items: [
          {
            title: t('Wallet'),
            url: '/wallet',
            icon: Wallet,
          },
          {
            title: t('Canvas Cloud'),
            url: '/canvas-cloud/overview',
            activeUrls: ['/canvas-cloud'],
            icon: Cloud,
          },
          {
            title: t('Profile'),
            url: '/profile',
            icon: User,
          },
        ],
      },
      {
        id: 'admin',
        title: t('Admin'),
        items: [
          {
            title: t('Channels'),
            url: '/channels',
            icon: Radio,
          },
          {
            title: t('Models'),
            url: '/models/metadata',
            icon: Box,
            requiredRole: ROLE.SUPER_ADMIN,
          },
          {
            title: t('Users'),
            url: '/users',
            icon: Users,
          },
          {
            title: t('Redemption Codes'),
            url: '/redemption-codes',
            icon: Ticket,
          },
          {
            title: t('Subscriptions'),
            url: '/subscriptions',
            icon: CreditCard,
            requiredRole: ROLE.SUPER_ADMIN,
          },
          {
            title: t('System Info'),
            url: '/system-info',
            icon: ServerCog,
            requiredRole: ROLE.SUPER_ADMIN,
          },
          {
            title: t('System Settings'),
            url: '/system-settings/site',
            activeUrls: ['/system-settings'],
            icon: Settings,
          },
        ],
      },
    ],
  }
}
