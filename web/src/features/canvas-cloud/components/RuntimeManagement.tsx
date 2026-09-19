/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Tabs, TabsContent } from '@/components/ui/tabs'

import {
  CanvasManagementTabsList,
  CanvasManagementTabsTrigger,
} from './CanvasManagementTabs'
import { ExecutionSettings } from './ExecutionSettings'
import {
  RuntimeConfiguration,
  type CanvasProviderNavigationTarget,
} from './RuntimeConfiguration'

export type RuntimeManagementView = 'execution' | 'provider' | 'storage'

export function RuntimeManagement(props: {
  initialView?: RuntimeManagementView
  providerTarget?: CanvasProviderNavigationTarget
  onReturnToModelList?: () => void
  onViewChange?: (view: RuntimeManagementView) => void
}) {
  const { t } = useTranslation()
  const view = props.initialView ?? 'execution'
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
        </CanvasManagementTabsTrigger>
        <CanvasManagementTabsTrigger value='provider'>
          {t('Provider configuration')}
        </CanvasManagementTabsTrigger>
        <CanvasManagementTabsTrigger value='storage'>
          {t('Storage and backups')}
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
      <TabsContent value='storage'>
        <RuntimeConfiguration view='storage' />
      </TabsContent>
    </Tabs>
  )
}
