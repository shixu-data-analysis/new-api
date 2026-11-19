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
import type { ReactNode } from 'react'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/**
 * A dialog holding one form: the title stays on top, the body the caller lays out scrolls between, and the actions stay
 * at the bottom. The content has no padding of its own so the body can scroll edge to edge; the shared DialogFooter pulls
 * itself out over a padded content with negative margins, so here they are taken back, or it would stick out of the dialog.
 */
export function CanvasFormDialog(props: {
  title: ReactNode
  /** Asked to close (Escape, the close button, a click outside); the caller decides, for example not while saving. */
  onRequestClose: () => void
  onSubmit: () => void
  /** The scrolling part; the caller gives it `min-h-0 flex-1 overflow-y-auto px-6 py-4` where it scrolls. */
  children: ReactNode
  footer: ReactNode
  footerClassName?: string
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => (open ? undefined : props.onRequestClose())}
    >
      <DialogContent className='flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-lg'>
        <DialogHeader className='px-6 pt-6 pb-3'>
          <DialogTitle>{props.title}</DialogTitle>
        </DialogHeader>
        <form
          className='flex min-h-0 flex-1 flex-col'
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            props.onSubmit()
          }}
        >
          {props.children}
          <DialogFooter
            className={cn(
              'mx-0 mb-0 border-t px-6 py-4',
              props.footerClassName
            )}
          >
            {props.footer}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
