/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import z from 'zod'

import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { isCanvasAdministrator } from '@/features/canvas-cloud/access'
import { getCanvasSession } from '@/features/canvas-cloud/api'
import { CanvasRouteError } from '@/features/canvas-cloud/components/CanvasRouteStates'
import { InvitationManagement } from '@/features/canvas-cloud/components/InvitationManagement'
import {
  denyCanvasRoute,
  rejectCanvasRoute,
} from '@/features/canvas-cloud/session-failure'
import type { CanvasSession } from '@/features/canvas-cloud/types'

export const invalidInvitationPrincipalId =
  '__invalid_invitation_principal_id__'

const uuid = z.string().uuid().optional().catch(invalidInvitationPrincipalId)

const invitationSearchSchema = z.object({
  tab: z.enum(['codes', 'inviters', 'statements', 'withdrawals']).optional(),
  principalId: uuid,
  inviterPrincipalId: uuid,
  // A statement month carried from the operating dashboard.
  month: z
    .string()
    .regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/u)
    .optional()
    .catch(undefined),
})

export const Route = createFileRoute(
  '/_authenticated/canvas-cloud/invitations'
)({
  validateSearch: invitationSearchSchema,
  beforeLoad: async () => {
    let session: CanvasSession
    try {
      session = await getCanvasSession()
    } catch (error) {
      rejectCanvasRoute(error)
    }
    if (!isCanvasAdministrator(session.principalType)) denyCanvasRoute()
  },
  errorComponent: CanvasRouteError,
  component: InvitationManagementRoute,
})

function InvitationManagementRoute() {
  const { t } = useTranslation()
  const search = Route.useSearch()
  const invalidLocation =
    search.principalId === invalidInvitationPrincipalId ||
    search.inviterPrincipalId === invalidInvitationPrincipalId
  return (
    <SectionPageLayout fluid={false}>
      <SectionPageLayout.Title>
        {t('Invitation management')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        {invalidLocation ? (
          <ErrorState
            title={t('Invalid invitation location')}
            description={t(
              'The invitation location is invalid. Remove the invalid location and try again.'
            )}
          />
        ) : (
          <InvitationManagement />
        )}
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
