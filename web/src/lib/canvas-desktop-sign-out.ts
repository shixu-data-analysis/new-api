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
const desktopSignOutStorageKey = 'canvas.desktop.sign-out-state'
const desktopSignOutEvent = 'canvas-desktop-sign-out-result'
const desktopStatePattern = /^[A-Za-z0-9_-]{43}$/

interface DesktopSignOutEventDetail {
  state?: unknown
  success?: unknown
  message?: unknown
}

export function isCanvasDesktopView(): boolean {
  try {
    return desktopStatePattern.test(
      window.sessionStorage.getItem(desktopSignOutStorageKey) || ''
    )
  } catch {
    return false
  }
}

export interface DesktopSignOutResult {
  success: boolean
  message?: string
}

export function createCanvasDesktopSignOutUrl(
  state: string | null,
  origin: string
): string | null {
  if (!state || !desktopStatePattern.test(state)) return null
  const target = new URL('/canvas-desktop/sign-out', origin)
  target.searchParams.set('state', state)
  return target.toString()
}

export function requestCanvasDesktopSignOut(): Promise<DesktopSignOutResult> | null {
  let state: string | null = null
  try {
    state = window.sessionStorage.getItem(desktopSignOutStorageKey)
  } catch {
    return null
  }
  const target = createCanvasDesktopSignOutUrl(state, window.location.origin)
  if (!target || !state) return null

  return new Promise((resolve) => {
    let timer = 0
    const handleResult = (event: Event) => {
      const detail = (event as CustomEvent<DesktopSignOutEventDetail>).detail
      if (
        !detail ||
        detail.state !== state ||
        typeof detail.success !== 'boolean'
      ) {
        return
      }
      window.clearTimeout(timer)
      window.removeEventListener(desktopSignOutEvent, handleResult)
      resolve({
        success: detail.success,
        ...(typeof detail.message === 'string'
          ? { message: detail.message }
          : {}),
      })
    }
    timer = window.setTimeout(() => {
      window.removeEventListener(desktopSignOutEvent, handleResult)
      resolve({ success: false })
    }, 20_000)
    window.addEventListener(desktopSignOutEvent, handleResult)
    window.location.assign(target)
  })
}
