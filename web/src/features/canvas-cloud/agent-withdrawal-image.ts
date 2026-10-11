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
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { resolveAgentWithdrawalImage } from './agent-earnings-api'
import type { AgentWithdrawalFile } from './agent-earnings-types'

export const MAX_AGENT_IMAGE_BYTES = 5 * 1024 * 1024
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const AGENT_IMAGE_ACCEPT = ACCEPTED_TYPES.join(',')

export type AgentImageCheck =
  | { ok: true; base64: string; previewUrl: string }
  | { ok: false; reason: 'type' | 'size' }

/** Reads a chosen image for upload. The server checks the real content again; this only mirrors the type and size rules. */
export async function readAgentImage(file: File): Promise<AgentImageCheck> {
  if (!ACCEPTED_TYPES.includes(file.type)) return { ok: false, reason: 'type' }
  if (file.size > MAX_AGENT_IMAGE_BYTES) return { ok: false, reason: 'size' }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)))
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsDataURL(file)
  })
  return {
    ok: true,
    base64: dataUrl.slice(dataUrl.indexOf(',') + 1),
    previewUrl: dataUrl,
  }
}

/**
 * Opens a stored image (short-lived URL, or bytes read through the Canvas proxy for a local store). Components share the
 * fetched bytes but each owns the object URL it creates, so one closing never revokes another's image. A locally stored
 * payment QR code keeps the same content path across replacements, so its upload ID is part of the identity.
 */
export function useWithdrawalImageUrl(
  file: AgentWithdrawalFile | null | undefined
): { url: string | undefined; isError: boolean } {
  const uploadId = file && 'uploadId' in file ? file.uploadId : undefined
  const image = useQuery({
    queryKey: ['canvas-cloud', 'agent-withdrawal-image', file?.url, uploadId],
    // Runs only while `file` is set (`enabled`).
    queryFn: ({ signal }) =>
      resolveAgentWithdrawalImage(file as AgentWithdrawalFile, signal),
    enabled: Boolean(file),
    staleTime: 60_000,
    gcTime: 0,
  })
  const resolved = image.data
  const [objectUrl, setObjectUrl] = useState<string>()
  useEffect(() => {
    if (resolved?.kind !== 'blob') return undefined
    const url = URL.createObjectURL(resolved.blob)
    setObjectUrl(url)
    return () => {
      URL.revokeObjectURL(url)
      setObjectUrl(undefined)
    }
  }, [resolved])
  return {
    url: resolved?.kind === 'remote' ? resolved.url : objectUrl,
    isError: image.isError,
  }
}
