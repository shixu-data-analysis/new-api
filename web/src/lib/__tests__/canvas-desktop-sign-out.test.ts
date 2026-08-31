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
import { describe, expect, test } from 'vitest'

import { createCanvasDesktopSignOutUrl } from '../canvas-desktop-sign-out'

describe('Canvas Desktop sign-out request', () => {
  test('creates only the fixed same-origin request for a full random state', () => {
    const state = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq'
    expect(
      createCanvasDesktopSignOutUrl(state, 'https://account.canvas.example')
    ).toBe(
      `https://account.canvas.example/canvas-desktop/sign-out?state=${state}`
    )
    expect(
      createCanvasDesktopSignOutUrl('short', 'https://account.canvas.example')
    ).toBeNull()
    expect(
      createCanvasDesktopSignOutUrl(null, 'https://account.canvas.example')
    ).toBeNull()
  })
})
