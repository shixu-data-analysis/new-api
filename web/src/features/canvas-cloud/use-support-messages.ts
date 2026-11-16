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
const POLL_PAGE = 100
// A signed attachment address is renewed this long before it expires, so a later view or download still works.
const RENEW_AHEAD_MILLISECONDS = 60_000

const expiring = (message: CanvasAdminSupportMessage, now: number) => {
  const expiresAt = message.attachment?.urlExpiresAt
  return expiresAt
    ? Date.parse(expiresAt) - now < RENEW_AHEAD_MILLISECONDS
    : false
}

/**
 * One conversation's messages, oldest first: the newest page on open, new messages polled after the last sequence number,
 * and earlier pages on request. A response for another conversation (the selection changed meanwhile) is dropped.
 */
export function useSupportMessages(conversationId: string) {
  const [messages, setMessages] = useState<CanvasAdminSupportMessage[]>([])
  const [hasEarlier, setHasEarlier] = useState(false)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  // Every message up to this one has been read by polling. A sent reply is shown at once but does not move it, so a
  // customer message that arrived between the last poll and the reply is still fetched.
  const polledThrough = useRef(0)
  const shown = useRef<CanvasAdminSupportMessage[]>([])
  const current = useRef(conversationId)
  current.current = conversationId

  /** Adds new messages and replaces known ones (renewed attachment addresses). */
  const merge = useCallback((incoming: CanvasAdminSupportMessage[]) => {
    setMessages((previous) => {
      if (incoming.length === 0) return previous
      const bySeq = new Map(incoming.map((message) => [message.seq, message]))
      const replaced = previous.map((message) => {
        const update = bySeq.get(message.seq)
        if (update) bySeq.delete(message.seq)
        return update ?? message
      })
      // An empty poll keeps the same list, so the thread neither renders again nor moves.
      if (
        bySeq.size === 0 &&
        replaced.every((message, index) => message === previous[index])
      ) {
        return previous
      }
      const next = [...replaced, ...bySeq.values()]
      // Polls and replies append; only earlier pages or a reply overtaken by a poll need sorting.
      const inOrder = next.every(
        (message, index) =>
          index === 0 || (next[index - 1]?.seq ?? 0) < message.seq
      )
      const sorted = inOrder ? next : next.sort((a, b) => a.seq - b.seq)
      shown.current = sorted
      return sorted
    })
  }, [])

  const poll = useCallback(async () => {
    const id = conversationId
    try {
      const page = await getCanvasAdminSupportMessages(id, {
        after: polledThrough.current,
        limit: POLL_PAGE,
      })
      if (current.current !== id) return
      merge(page.messages)
      polledThrough.current = Math.max(
        polledThrough.current,
        ...page.messages.map((message) => message.seq)
      )
      // One request renews the addresses of up to a page of messages from the oldest expiring one.
      const now = Date.now()
      const first = shown.current.find((message) => expiring(message, now))
      if (!first) return
      const renewed = await getCanvasAdminSupportMessages(id, {
        after: first.seq - 1,
        limit: POLL_PAGE,
      })
      if (current.current === id) merge(renewed.messages)
    } catch {
      // A failed poll keeps the thread as it is; the next one tries again.
    }
  }, [conversationId, merge])

  useEffect(() => {
    const controller = new AbortController()
    polledThrough.current = 0
    shown.current = []
    setMessages([])
    setState('loading')
    getCanvasAdminSupportMessages(
      conversationId,
      { limit: PAGE },
      controller.signal
    )
      .then((page) => {
        merge(page.messages)
        polledThrough.current = Math.max(
          0,
          ...page.messages.map((message) => message.seq)
        )
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
      merge(page.messages)
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
    append: merge,
  }
}
