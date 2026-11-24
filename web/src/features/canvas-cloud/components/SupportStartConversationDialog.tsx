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
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

import { searchCanvasCustomers } from '../customer-search'
import {
  canMessageCustomer,
  useOpenSupportConversation,
} from '../support-open-conversation'
import { SearchSelect } from './SearchSelect'

// A customer who cannot be written to stays listed, not choosable, with the reason (SUPPORT-PROACTIVE-001).
const INACTIVE_HINTS: Partial<Record<string, string>> = {
  SUSPENDED: 'Suspended, cannot be messaged',
  CLOSED: 'Closed, cannot be messaged',
}
const NO_CHOICE = { value: '', label: '' }

/** 客服会话 › 发起会话: choose a customer to open their one conversation and write first. */
export function SupportStartConversationDialog(props: {
  onClose: () => void
  onOpened: (conversationId: string) => void
}) {
  const { t } = useTranslation()
  const fieldId = useId()
  const open = useOpenSupportConversation((conversationId) => {
    props.onClose()
    props.onOpened(conversationId)
  })
  return (
    <Dialog
      open
      onOpenChange={(next) =>
        !next && !open.isPending ? props.onClose() : undefined
      }
    >
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('Start conversation')}</DialogTitle>
          <DialogDescription>
            {t('Choose a customer. An existing conversation opens as it is.')}
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-2'>
          <Label htmlFor={fieldId}>{t('Customer')}</Label>
          <SearchSelect
            id={fieldId}
            value={NO_CHOICE}
            fixedOptions={[]}
            placeholder={t('Search customer name or ID')}
            queryKey='support-start-customers'
            load={async (search, signal) =>
              (await searchCanvasCustomers(search, signal)).map((customer) => ({
                value: customer.customerId,
                label: customer.username ?? customer.customerId,
                // The ID tells apart a customer found by it from one whose name contains the same digits.
                ...(canMessageCustomer(customer.status)
                  ? { hint: `ID ${customer.userId}` }
                  : {
                      hint: t(
                        INACTIVE_HINTS[customer.status] ??
                          'Only an active customer can be messaged'
                      ),
                      disabled: true,
                    }),
              }))
            }
            onChange={(option) => {
              if (!option.disabled && !open.isPending) open.mutate(option.value)
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
