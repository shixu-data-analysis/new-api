/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { ExecutionSettings } from './ExecutionSettings'
import {
  RuntimeConfiguration,
  type CanvasProviderNavigationTarget,
} from './RuntimeConfiguration'

export type RuntimeManagementView = 'execution' | 'provider' | 'storage'

export function RuntimeManagement(props: {
  initialView?: RuntimeManagementView
  providerTarget?: CanvasProviderNavigationTarget
}) {
  const { t } = useTranslation()
  return (
    <Tabs defaultValue={props.initialView ?? 'execution'} className='space-y-4'>
      <Card>
        <CardHeader>
          <CardTitle>{t('Runtime management')}</CardTitle>
          <CardDescription>
            {t(
              'Monitor executor capacity, manage provider credential groups, and maintain storage through separate operational boundaries.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TabsList className='h-10 w-full max-w-full flex-nowrap justify-start gap-1 overflow-x-auto overflow-y-hidden p-1'>
            <TabsTrigger
              value='execution'
              className='h-8 min-h-8 flex-none px-3'
            >
              {t('Execution overview')}
            </TabsTrigger>
            <TabsTrigger
              value='provider'
              className='h-8 min-h-8 flex-none px-3'
            >
              {t('Provider configuration')}
            </TabsTrigger>
            <TabsTrigger value='storage' className='h-8 min-h-8 flex-none px-3'>
              {t('Storage and backups')}
            </TabsTrigger>
          </TabsList>
        </CardContent>
      </Card>

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
