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
import { afterEach, describe, expect, it, vi } from 'vitest'

import { copyToClipboard } from './copy-to-clipboard'

describe('copyToClipboard fallback', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('selects the text inside the open dialog, where a modal keeps focus', async () => {
    // The Desktop customer center view denies the clipboard permission, so the API call rejects.
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi
          .fn()
          .mockRejectedValue(new DOMException('', 'NotAllowedError')),
      },
    })
    document.body.innerHTML =
      '<div role="dialog"><button type="button">Copy</button></div>'
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    dialog.querySelector('button')?.focus()
    let selectedIn: Element | null = null
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => {
        selectedIn = (document.activeElement as HTMLTextAreaElement)
          .parentElement
        return (document.activeElement as HTMLTextAreaElement).value === 'abc'
      }),
    })

    await expect(copyToClipboard('abc')).resolves.toBe(true)
    expect(selectedIn).toBe(dialog)
    expect(dialog.querySelector('textarea')).toBeNull()
  })
})
