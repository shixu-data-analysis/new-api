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
import { t as translate } from 'i18next'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { getCanvasAdminSupportMessages } from './api'
import type { CanvasAdminSupportMessage } from './types'

const POLL_MILLISECONDS = 10_000
const PAGE = 50

/**
 * One conversation's messages, oldest first: the newest page on open, new messages polled after the last sequence number,
 * and earlier pages on request. A response for another conversation (the selection changed meanwhile) is dropped.
 */
export function useSupportMessages(conversationId: string) {
  const [messages, setMessages] = useState<CanvasAdminSupportMessage[]>([])
  const [hasEarlier, setHasEarlier] = useState(false)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  const lastSeq = useRef(0)
  const current = useRef(conversationId)
  current.current = conversationId

  const merge = useCallback(
    (incoming: CanvasAdminSupportMessage[], where: 'start' | 'end') => {
      setMessages((previous) => {
        const known = new Set(previous.map((message) => message.seq))
        const fresh = incoming.filter((message) => !known.has(message.seq))
        // An empty poll keeps the same list, so the thread neither renders again nor moves.
        if (fresh.length === 0) return previous
        const next =
          where === 'end' ? [...previous, ...fresh] : [...fresh, ...previous]
        lastSeq.current = Math.max(
          lastSeq.current,
          ...next.map((message) => message.seq)
        )
        return next
      })
    },
    []
  )

  const poll = useCallback(async () => {
    const id = conversationId
    try {
      const page = await getCanvasAdminSupportMessages(id, {
        after: lastSeq.current,
        limit: 100,
      })
      if (current.current === id) merge(page.messages, 'end')
    } catch {
      // A failed poll keeps the thread as it is; the next one tries again.
    }
  }, [conversationId, merge])

  useEffect(() => {
    const controller = new AbortController()
    lastSeq.current = 0
    setMessages([])
    setState('loading')
    getCanvasAdminSupportMessages(
      conversationId,
      { limit: PAGE },
      controller.signal
    )
      .then((page) => {
        merge(page.messages, 'end')
        setHasEarlier(page.hasEarlier)
        setState('ready')
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('error')
      })
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void poll()
    }, POLL_MILLISECONDS)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [conversationId, merge, poll])

  const loadEarlier = async () => {
    const id = conversationId
    const first = messages[0]?.seq
    if (!first) return
    setLoadingEarlier(true)
    try {
      const page = await getCanvasAdminSupportMessages(id, {
        before: first,
        limit: PAGE,
      })
      if (current.current !== id) return
      merge(page.messages, 'start')
      setHasEarlier(page.hasEarlier)
    } catch {
      toast.error(translate('Unable to load earlier messages'))
    } finally {
      setLoadingEarlier(false)
    }
  }

  return {
    messages,
    hasEarlier,
    state,
    loadingEarlier,
    loadEarlier,
    append: (sent: CanvasAdminSupportMessage[]) => merge(sent, 'end'),
  }
}
