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
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { getServerErrorCode } from '@/lib/server-error-message'

import { openCanvasAdminSupportConversation, supportQueryKeys } from './api'

/**
 * Opens a customer's one conversation for an administrator who writes first (SUPPORT-PROACTIVE-001), from the customer
 * details or from 客服会话. The page reads a conversation that is not on its list by its ID; the answer is stored under
 * that query, so the conversation shows at once while the page refreshes it.
 */
export function useOpenSupportConversation(
  onOpened: (conversationId: string) => void
) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: openCanvasAdminSupportConversation,
    onSuccess: (conversation) => {
      queryClient.setQueryData(
        [...supportQueryKeys.conversations, 'id', conversation.id],
        { page: 1, pageSize: 10, total: 1, items: [conversation] }
      )
      onOpened(conversation.id)
    },
    onError: (error) => {
      toast.error(
        getServerErrorCode(error) === 'SUPPORT_CUSTOMER_INACTIVE'
          ? t('Only an active customer can be messaged')
          : t('Unable to open the conversation. Please try again.')
      )
    },
  })
}
