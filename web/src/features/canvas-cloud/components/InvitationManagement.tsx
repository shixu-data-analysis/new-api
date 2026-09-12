/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { getRouteApi, useBlocker } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import type { CanvasInvitationExactFilter } from '../types'
import { AgentManagement } from './AgentManagement'
import { CanvasStatusBadge } from './CanvasStatusBadge'
import { InviteCodeManagement } from './InviteCodeManagement'

const route = getRouteApi('/_authenticated/canvas-cloud/invitations')

export type InvitationNavigationGuard = {
  when: boolean
  discard: () => void
}

export function InvitationNavigationProtection(props: {
  guards: InvitationNavigationGuard[]
}) {
  const { t } = useTranslation()
  const when = props.guards.some((guard) => guard.when)
  const blocker = useBlocker({ condition: when })
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (blocker.status === 'blocked') setOpen(true)
  }, [blocker.status])
  useEffect(() => {
    if (!when) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [when])
  return (
    <ConfirmDialog
      open={open}
      title={t('Unsaved changes')}
      desc={t('You have unsaved changes. Are you sure you want to leave?')}
      confirmText={t('Leave')}
      cancelBtnText={t('Stay')}
      destructive
      handleConfirm={() => {
        props.guards
          .filter((guard) => guard.when)
          .forEach((guard) => guard.discard())
        setOpen(false)
        blocker.proceed?.()
      }}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) blocker.reset?.()
      }}
    />
  )
}

export function InvitationManagement() {
  const { t } = useTranslation()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const tab = search.tab ?? 'codes'
  const [codeExactFilter, setCodeExactFilter] =
    useState<CanvasInvitationExactFilter | null>(null)
  const [inviterExactFilter, setInviterExactFilter] =
    useState<CanvasInvitationExactFilter | null>(null)
  const [guards, setGuards] = useState<
    Record<string, InvitationNavigationGuard>
  >({})
  const updateGuard = useCallback(
    (key: string, guard: InvitationNavigationGuard) => {
      setGuards((current) =>
        current[key]?.when === guard.when &&
        current[key]?.discard === guard.discard
          ? current
          : { ...current, [key]: guard }
      )
    },
    []
  )
  const handleCodeExactFilter = useCallback(
    (filter: CanvasInvitationExactFilter | null) => setCodeExactFilter(filter),
    []
  )
  const handleInviterExactFilter = useCallback(
    (filter: CanvasInvitationExactFilter | null) =>
      setInviterExactFilter(filter),
    []
  )

  const selectTab = (nextTab: 'codes' | 'inviters') => {
    void navigate({
      to: '/canvas-cloud/invitations',
      search: nextTab === 'codes' ? { tab: 'codes' } : { tab: 'inviters' },
    })
  }

  return (
    <Tabs
      className='space-y-4'
      value={tab}
      onValueChange={(value) => selectTab(value as 'codes' | 'inviters')}
    >
      <InvitationNavigationProtection guards={Object.values(guards)} />
      <TabsList aria-label={t('Invitation management')}>
        <TabsTrigger value='codes'>{t('Invite codes')}</TabsTrigger>
        <TabsTrigger value='inviters'>{t('Inviters')}</TabsTrigger>
      </TabsList>
      <TabsContent keepMounted value='codes' className='min-w-0'>
        {search.inviterPrincipalId ? (
          <div className='flex flex-wrap items-center gap-2'>
            {codeExactFilter ? (
              <p className='text-muted-foreground flex min-w-0 items-center gap-1 text-sm'>
                {t('Invite codes are precisely filtered by {{username}}.', {
                  username: codeExactFilter.username,
                })}
                <CanvasStatusBadge
                  status={codeExactFilter.status}
                  label={t(
                    codeExactFilter.status === 'ACTIVE' ? 'Enabled' : 'Disabled'
                  )}
                />
              </p>
            ) : null}
            <Button
              type='button'
              variant='outline'
              onClick={() =>
                void navigate({
                  to: '/canvas-cloud/invitations',
                  search: { tab: 'codes' },
                  replace: true,
                })
              }
            >
              {t('Clear precise location')}
            </Button>
          </div>
        ) : null}
        <InviteCodeManagement
          inviterPrincipalId={search.inviterPrincipalId}
          onExactFilterChange={handleCodeExactFilter}
          onNavigationGuardChange={(guard) => updateGuard('codes', guard)}
          onClearPreciseLocation={() =>
            void navigate({
              to: '/canvas-cloud/invitations',
              search: { tab: 'codes' },
            })
          }
          onViewInviter={(agent) =>
            void navigate({
              to: '/canvas-cloud/invitations',
              search: { tab: 'inviters', principalId: agent.principalId },
            })
          }
        />
      </TabsContent>
      <TabsContent keepMounted value='inviters' className='min-w-0'>
        {search.principalId ? (
          <div className='flex flex-wrap items-center gap-2'>
            {inviterExactFilter ? (
              <p className='text-muted-foreground flex min-w-0 items-center gap-1 text-sm'>
                {t('Inviters are precisely filtered by {{username}}.', {
                  username: inviterExactFilter.username,
                })}
                <CanvasStatusBadge
                  status={inviterExactFilter.status}
                  label={t(
                    inviterExactFilter.status === 'ACTIVE'
                      ? 'Enabled'
                      : 'Disabled'
                  )}
                />
              </p>
            ) : null}
            <Button
              type='button'
              variant='outline'
              onClick={() =>
                void navigate({
                  to: '/canvas-cloud/invitations',
                  search: { tab: 'inviters' },
                  replace: true,
                })
              }
            >
              {t('Clear precise location')}
            </Button>
          </div>
        ) : null}
        <AgentManagement
          principalId={search.principalId}
          onExactFilterChange={handleInviterExactFilter}
          onNavigationGuardChange={(guard) => updateGuard('agents', guard)}
          onClearPreciseLocation={() =>
            void navigate({
              to: '/canvas-cloud/invitations',
              search: { tab: 'inviters' },
            })
          }
          onViewInviteCodes={(agent) =>
            void navigate({
              to: '/canvas-cloud/invitations',
              search: { tab: 'codes', inviterPrincipalId: agent.principalId },
            })
          }
        />
      </TabsContent>
    </Tabs>
  )
}
