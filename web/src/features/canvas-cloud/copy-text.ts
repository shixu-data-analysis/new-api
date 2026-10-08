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
import { toast } from 'sonner'

import { copyToClipboard } from '@/lib/copy-to-clipboard'

/**
 * Copies text for a Canvas page and tells the user whether it worked. The shared helper falls back to the
 * classic copy command where the clipboard API is missing or denied (plain HTTP, the Desktop customer
 * center view), so a copy button never fails silently.
 */
export async function copyText(
  text: string,
  messages: { copied: string; failed: string }
): Promise<boolean> {
  const copied = await copyToClipboard(text)
  if (copied) toast.success(messages.copied)
  else toast.error(messages.failed)
  return copied
}
