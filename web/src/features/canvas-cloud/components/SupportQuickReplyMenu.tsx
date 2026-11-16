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
import { MessageSquareText } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import type { CanvasSupportQuickReplies } from '../types'

/**
 * 快捷回复 in the reply box: both groups of 客服设置, each under its name; a chosen text replaces the draft, which can be
 * sent as it is or edited first. A long text shows two lines and the rest on hover.
 */
export function SupportQuickReplyMenu(props: {
  replies: CanvasSupportQuickReplies
  onPick: (text: string) => void
}) {
  const { t } = useTranslation()
  const groups = [
    { label: t('Conversation replies'), replies: props.replies.conversation },
    { label: t('Failure notices'), replies: props.replies.failureNotice },
  ].filter((group) => group.replies.length > 0)
  if (groups.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type='button' variant='ghost' size='sm' />}
      >
        <MessageSquareText aria-hidden='true' />
        {t('Quick replies')}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='start'
        className='max-h-96 w-96 max-w-[calc(100vw-2rem)] overflow-y-auto'
      >
        {groups.map((group, index) => (
          <DropdownMenuGroup key={group.label}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
            {group.replies.map((reply) => (
              <DropdownMenuItem
                key={reply}
                title={reply}
                className='text-xs leading-5'
                onClick={() => props.onPick(reply)}
              >
                <span className='line-clamp-2 whitespace-normal'>{reply}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
