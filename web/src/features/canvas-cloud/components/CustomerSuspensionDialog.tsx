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
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { restoreCustomer, suspendCustomer } from '../customer-notices-api'

const REASON_LIMIT = 200

// COMMUNITY-CONVENTION-001: suspending a customer stops every Cloud request of theirs at once; restoring lifts it. Both
// are recorded in the operation log with the reason.
export function CustomerSuspensionDialog(props: {
  customer: { customerId: string; username: string | null }
  action: 'suspend' | 'restore'
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const id = useId()
  const suspending = props.action === 'suspend'
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const reasonMissing = suspending && !reason.trim()
  const change = useMutation({
    mutationFn: () =>
      suspending
        ? suspendCustomer(props.customer.customerId, reason.trim())
        : restoreCustomer(props.customer.customerId, reason.trim()),
    onSuccess: async () => {
      toast.success(t(suspending ? 'Account suspended' : 'Account restored'))
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [
            'canvas-cloud',
            'admin-customer',
            props.customer.customerId,
          ],
        }),
        queryClient.invalidateQueries({
          queryKey: ['canvas-cloud', 'admin', 'customers'],
        }),
      ])
      props.onClose()
    },
    onError: () =>
      toast.error(t('Unable to change the account. Refresh and try again.')),
  })
  const name = props.customer.username ?? '—'
  return (
    <Dialog
      open
      onOpenChange={(open) =>
        !open && !change.isPending ? props.onClose() : undefined
      }
    >
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>
            {t(
              suspending
                ? 'Suspend the account of {{name}}?'
                : 'Restore the account of {{name}}?',
              { name }
            )}
          </DialogTitle>
          <DialogDescription>
            {t(
              suspending
                ? 'The customer can no longer sign in or use the service. Points and work are kept, and you can restore the account at any time.'
                : 'The customer can sign in and use the service again.'
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-4'
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            setTried(true)
            if (reasonMissing) return
            change.mutate()
          }}
        >
          <div className='space-y-1'>
            <Label htmlFor={`${id}-reason`}>
              {t(suspending ? 'Reason' : 'Reason (optional)')}
            </Label>
            <Input
              id={`${id}-reason`}
              value={reason}
              maxLength={REASON_LIMIT}
              aria-required={suspending}
              aria-invalid={tried && reasonMissing}
              aria-describedby={`${id}-help${tried && reasonMissing ? ` ${id}-error` : ''}`}
              onChange={(event) => setReason(event.target.value)}
            />
            <p id={`${id}-help`} className='text-muted-foreground text-xs'>
              {t('Recorded in the operation log.')}
            </p>
            {tried && reasonMissing ? (
              <p
                id={`${id}-error`}
                role='alert'
                className='text-destructive text-xs'
              >
                {t('Enter a reason.')}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={change.isPending}
              onClick={props.onClose}
            >
              {t('Cancel')}
            </Button>
            <Button
              type='submit'
              variant={suspending ? 'destructive' : 'default'}
              disabled={change.isPending}
            >
              {t(suspending ? 'Suspend account' : 'Restore account')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
