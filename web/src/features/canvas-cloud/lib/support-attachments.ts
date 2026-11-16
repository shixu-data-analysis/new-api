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
import SparkMD5 from 'spark-md5'

// Support reply images (SUPPORT-CHAT-001 spec 4.4): at most 10 MB before compression, sent as one WebP of at most 2048 px on
// the long edge, declared to Cloud by size, SHA-256 and MD5 before the upload.
export const SUPPORT_IMAGE_SOURCE_MAX_BYTES = 10 * 1024 * 1024
export const SUPPORT_IMAGE_MAX_EDGE = 2048
export const SUPPORT_IMAGES_PER_SEND = 9
const WEBP_QUALITY = 0.85

export class SupportImageError extends Error {
  constructor(readonly reason: 'TOO_LARGE' | 'NOT_AN_IMAGE') {
    super(reason)
    this.name = 'SupportImageError'
  }
}

/** The pasted or picked image, scaled down to the long-edge limit and encoded as WebP. */
export async function compressSupportImage(file: Blob): Promise<Blob> {
  if (file.size > SUPPORT_IMAGE_SOURCE_MAX_BYTES) {
    throw new SupportImageError('TOO_LARGE')
  }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new SupportImageError('NOT_AN_IMAGE')
  }
  try {
    const scale = Math.min(
      1,
      SUPPORT_IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height)
    )
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new SupportImageError('NOT_AN_IMAGE')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new SupportImageError('NOT_AN_IMAGE')),
        'image/webp',
        WEBP_QUALITY
      )
    )
  } finally {
    bitmap.close()
  }
}

/**
 * What Cloud asks of an upload: SHA-256 for storage that checks it, MD5 for storage that checks Content-MD5 instead
 * (its contentLock, e.g. Aliyun OSS). Both are sent, so the storage can change without changing this page.
 */
export async function attachmentDigests(
  blob: Blob
): Promise<{ sha256: string; md5: string }> {
  const bytes = await blob.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const sha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')
  return { sha256, md5: SparkMD5.ArrayBuffer.hash(bytes) }
}
