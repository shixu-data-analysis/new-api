/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useQueryClient } from '@tanstack/react-query'
import { Outlet, useLocation } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'

import { ModelManagementNavigationProvider } from '../model-management-navigation'

export function ModelManagementLayout() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const pathname = useLocation({ select: (location) => location.pathname })
  let title = t('Model management')
  if (pathname.includes('/monitoring/')) {
    title = t('Runtime monitoring')
  } else if (pathname.endsWith('/pricing')) {
    title = t('Model pricing')
  }
  return (
    <ModelManagementNavigationProvider>
      <SectionPageLayout fluid={false}>
        <SectionPageLayout.Title>{title}</SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <Button
            variant='outline'
            size='sm'
            onClick={() =>
              void queryClient
                .invalidateQueries({ queryKey: ['canvas-cloud'] })
                .then(() => toast.success(t('Canvas data refreshed')))
            }
          >
            <RefreshCw aria-hidden='true' />
            {t('Refresh')}
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <div className='min-w-0'>
            <Outlet />
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>
    </ModelManagementNavigationProvider>
  )
}
