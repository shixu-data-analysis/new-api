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
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { ROLE } from '@/lib/roles'

import { manageUser } from '../api'
import { ERROR_MESSAGES, USER_STATUS, isUserDeleted } from '../constants'
import { getUserActionMessage } from '../lib/user-actions'
import type { User } from '../types'
import { CanvasAdminProvisioningAction } from './canvas-admin-provisioning-action'
import { useUsers } from './users-provider'

interface CanvasRootUserActionProps {
  user: User
}

export function CanvasRootUserAction(props: CanvasRootUserActionProps) {
  const { t } = useTranslation()
  const { triggerRefresh } = useUsers()
  const [isPending, setIsPending] = useState(false)

  if (isUserDeleted(props.user) || props.user.role === ROLE.SUPER_ADMIN) {
    return null
  }

  if (
    props.user.status !== USER_STATUS.DISABLED &&
    props.user.role === ROLE.ADMIN
  ) {
    return <CanvasAdminProvisioningAction user={props.user} />
  }

  if (props.user.status !== USER_STATUS.DISABLED) return null

  const action = 'enable'
  const label = t('Enable')

  const handleAction = async () => {
    setIsPending(true)
    try {
      const result = await manageUser(props.user.id, action)
      if (!result.success) {
        toast.error(
          result.message || t('Failed to {{action}} user', { action })
        )
        return
      }
      toast.success(t(getUserActionMessage(action)))
      triggerRefresh()
    } catch {
      toast.error(t(ERROR_MESSAGES.UNEXPECTED))
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Button
      type='button'
      variant='outline'
      size='sm'
      disabled={isPending}
      onClick={handleAction}
    >
      {isPending ? t('Processing...') : label}
    </Button>
  )
}
