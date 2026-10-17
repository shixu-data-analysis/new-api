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
import { isCanvasAccessForbidden } from './api'

// Why a Canvas route cannot open. Canvas pages show both inside the application layout instead of leaving for
// the full-screen 403 or 503 pages: "forbidden" means the account lacks access, so retrying cannot help;
// "unavailable" means Cloud could not confirm the session (identity provider down, a token refresh that
// could not finish, a network failure), so the page offers a retry.
export class CanvasRouteFailure extends Error {
  constructor(
    readonly kind: 'forbidden' | 'unavailable',
    options?: { cause: unknown }
  ) {
    super(`Canvas route ${kind}`, options)
    this.name = 'CanvasRouteFailure'
  }
}

export function denyCanvasRoute(): never {
  throw new CanvasRouteFailure('forbidden')
}

export function rejectCanvasRoute(error: unknown): never {
  throw new CanvasRouteFailure(
    isCanvasAccessForbidden(error) ? 'forbidden' : 'unavailable',
    { cause: error }
  )
}
