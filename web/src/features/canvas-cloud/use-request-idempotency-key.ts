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
import { useRef } from 'react'

/**
 * One Idempotency-Key per distinct request. A retry of the same content after an unknown outcome (no response or a server
 * error) reuses the key, so a request the server already committed is replayed instead of created again. New content, a
 * success or a definite rejection (a 4xx response) starts a new key. The key is created only when a request is sent.
 */
export function useRequestIdempotencyKey(create: () => string) {
  const current = useRef<{ key: string; fingerprint: string } | null>(null)
  return {
    keyFor(fingerprint: string): string {
      if (current.current?.fingerprint !== fingerprint) {
        current.current = { key: create(), fingerprint }
      }
      return current.current.key
    },
    settle(error?: unknown) {
      if (error === undefined || isDefiniteRejection(error)) {
        current.current = null
      }
    },
    reset() {
      current.current = null
    },
  }
}

export function isDefiniteRejection(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response
    ?.status
  return status !== undefined && status >= 400 && status < 500
}
