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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, RotateCcw, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { grantCanvasPlatformAdmin } from '@/features/canvas-cloud/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { isUserDeleted, USER_STATUS } from '../constants'
import type { User } from '../types'
import {
  canvasAdminProvisioningQueryKey,
  useCanvasAdminProvisioningQuery,
} from './canvas-admin-provisioning-query'
import { useUsers } from './users-provider'

interface CanvasAdminProvisioningActionProps {
  user: User
}

function isCustomerAccountNotEligible(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return false
  }

  return (
    (error as { response?: { data?: { code?: unknown } } }).response?.data
      ?.code === 'CUSTOMER_ACCOUNT_NOT_ELIGIBLE'
  )
}

export function CanvasAdminProvisioningAction(
  props: CanvasAdminProvisioningActionProps
) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((state) => state.auth.user)
  const { triggerRefresh } = useUsers()
  const [confirmationOpen, setConfirmationOpen] = useState(false)

  const isVisible =
    currentUser?.role === ROLE.SUPER_ADMIN && props.user.role === ROLE.ADMIN
  const provisioningQuery = useCanvasAdminProvisioningQuery(isVisible)

  const provisioningMutation = useMutation({
    mutationFn: () => grantCanvasPlatformAdmin(props.user.username),
    onSuccess: async () => {
      setConfirmationOpen(false)
      toast.success(
        t('Canvas platform administrator access granted successfully')
      )
      await queryClient.invalidateQueries({
        queryKey: canvasAdminProvisioningQueryKey,
      })
      triggerRefresh()
    },
    onError: async (error) => {
      setConfirmationOpen(false)
      if (isCustomerAccountNotEligible(error)) {
        toast.error(
          t(
            'Customer accounts cannot receive Canvas administrator access. Create a separate administrator account.'
          )
        )
        return
      }
      toast.error(t('Failed to grant Canvas administrator access'))
    },
  })

  if (!isVisible) return null

  if (provisioningQuery.isPending) {
    return (
      <span
        className='text-muted-foreground inline-flex items-center gap-1.5 text-sm'
        role='status'
      >
        <LoaderCircle className='size-4 animate-spin' aria-hidden='true' />
        {t('Loading Canvas administrator status...')}
      </span>
    )
  }

  if (provisioningQuery.isError || !provisioningQuery.data) {
    return (
      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={() => provisioningQuery.refetch()}
      >
        <RotateCcw aria-hidden='true' />
        {t('Failed to load Canvas administrator status. Retry')}
      </Button>
    )
  }

  const externalId = String(props.user.id)
  const isProvisionedPlatformAdmin =
    provisioningQuery.data.principals.items.some(
      (administrator) =>
        administrator.principalType === 'PLATFORM_ADMIN' &&
        administrator.externalId === externalId
    )
  const isProvisioningReady =
    provisioningQuery.data.status.bootstrapStatus === 'COMPLETE' &&
    provisioningQuery.data.status.currentRootExternalId ===
      provisioningQuery.data.status.superAdminExternalId

  if (isProvisionedPlatformAdmin) {
    return (
      <span className='text-muted-foreground inline-flex items-center gap-1.5 text-sm'>
        <ShieldCheck aria-hidden='true' />
        {t('Canvas platform administrator access granted')}
      </span>
    )
  }

  const isDeletedCandidate = isUserDeleted(props.user)
  const isDisabledCandidate = props.user.status !== USER_STATUS.ENABLED
  const actionLabel = t('Complete administrator setup')
  const canGrantPlatformAdmin =
    isProvisioningReady && !isDisabledCandidate && !isDeletedCandidate
  let targetBlockedReason: string | null = null
  if (isDeletedCandidate) {
    targetBlockedReason = t(
      'Deleted users cannot receive Canvas administrator access'
    )
  } else if (isDisabledCandidate) {
    targetBlockedReason = t(
      'Enable this user before granting Canvas administrator access'
    )
  }
  let grantBlockedReason: string | null = null
  if (!isProvisioningReady) {
    if (provisioningQuery.data.status.bootstrapStatus === 'REQUIRED') {
      grantBlockedReason = t(
        'Initialize the Canvas super administrator before granting platform administrator access'
      )
    } else if (provisioningQuery.data.status.bootstrapStatus === 'CONFLICT') {
      grantBlockedReason = t(
        'Resolve the Canvas super administrator conflict before granting platform administrator access'
      )
    } else {
      grantBlockedReason = t(
        'Only the initialized Canvas super administrator can grant platform administrator access'
      )
    }
  }

  return (
    <>
      <Button
        type='button'
        variant='outline'
        size='sm'
        disabled={provisioningMutation.isPending || !canGrantPlatformAdmin}
        onClick={() => setConfirmationOpen(true)}
      >
        {actionLabel}
      </Button>
      {targetBlockedReason && (
        <p className='text-muted-foreground mt-1 text-xs'>
          {targetBlockedReason}
        </p>
      )}
      {grantBlockedReason && (
        <p className='text-muted-foreground mt-1 text-xs'>
          {grantBlockedReason}
        </p>
      )}
      <ConfirmDialog
        open={confirmationOpen}
        onOpenChange={setConfirmationOpen}
        title={actionLabel}
        desc={t(
          'Complete administrator setup for {{username}}? This grants Canvas platform management access.',
          { username: props.user.username }
        )}
        confirmText={
          provisioningMutation.isPending ? t('Processing...') : actionLabel
        }
        isLoading={provisioningMutation.isPending}
        handleConfirm={() => {
          if (canGrantPlatformAdmin) provisioningMutation.mutate()
        }}
      />
    </>
  )
}
