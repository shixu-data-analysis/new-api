/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

import { NavBadge } from '@/components/layout/components/nav-group'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent } from '@/components/ui/tabs'

import { useExecutionAttentionCount } from '../use-execution-attention'
import { useExecutorDrain } from '../use-executor-drain'
import {
  CanvasManagementTabsList,
  CanvasManagementTabsTrigger,
} from './CanvasManagementTabs'
import { ExecutionSettings } from './ExecutionSettings'
import { NotificationSettings } from './NotificationSettings'
import {
  RuntimeConfiguration,
  type CanvasProviderNavigationTarget,
} from './RuntimeConfiguration'

export type RuntimeManagementView =
  | 'execution'
  | 'provider'
  | 'taskMedia'
  | 'notifications'

export function RuntimeManagement(props: {
  initialView?: RuntimeManagementView
  providerTarget?: CanvasProviderNavigationTarget
  onReturnToModelList?: () => void
  onViewChange?: (view: RuntimeManagementView) => void
}) {
  const { t } = useTranslation()
  const view = props.initialView ?? 'execution'
  const drain = useExecutorDrain()
  const attentionCount = useExecutionAttentionCount()
  return (
    <Tabs
      className='space-y-4'
      value={view}
      onValueChange={(value) =>
        props.onViewChange?.(value as RuntimeManagementView)
      }
    >
      <CanvasManagementTabsList>
        <CanvasManagementTabsTrigger value='execution'>
          {t('Task execution status and limits')}
          {drain.data?.draining ? (
            <Badge variant='secondary' className='ml-2'>
              {t('Draining')}
            </Badge>
          ) : null}
          {attentionCount > 0 ? (
            <NavBadge
              tone='alert'
              label={t('{{count}} items need attention', {
                count: attentionCount,
              })}
            >
              {String(attentionCount)}
            </NavBadge>
          ) : null}
        </CanvasManagementTabsTrigger>
        <CanvasManagementTabsTrigger value='provider'>
          {t('Provider configuration')}
        </CanvasManagementTabsTrigger>
        <CanvasManagementTabsTrigger value='taskMedia'>
          {t('Task media')}
        </CanvasManagementTabsTrigger>
        <CanvasManagementTabsTrigger value='notifications'>
          {t('Notifications')}
        </CanvasManagementTabsTrigger>
      </CanvasManagementTabsList>

      {props.onReturnToModelList && view === 'provider' ? (
        <Button
          type='button'
          variant='outline'
          onClick={props.onReturnToModelList}
        >
          {t('Back to model list')}
        </Button>
      ) : null}

      <TabsContent value='execution'>
        <ExecutionSettings />
      </TabsContent>
      <TabsContent value='provider'>
        <RuntimeConfiguration
          view='provider'
          providerTarget={props.providerTarget}
        />
      </TabsContent>
      <TabsContent value='taskMedia'>
        <RuntimeConfiguration view='taskMedia' />
      </TabsContent>
      <TabsContent value='notifications'>
        <NotificationSettings />
      </TabsContent>
    </Tabs>
  )
}
