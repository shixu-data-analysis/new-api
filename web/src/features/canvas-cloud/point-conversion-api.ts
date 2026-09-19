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
*/
import { api } from '@/lib/api'

import type {
  CanvasPointConversionQuery,
  CanvasPointConversionReport,
} from './point-conversion-types'

const webBase = '/canvas-api/v1/web'

export async function getCanvasPointConversionReport(
  query: CanvasPointConversionQuery,
  signal?: AbortSignal
): Promise<CanvasPointConversionReport> {
  return (
    await api.get<CanvasPointConversionReport>(
      `${webBase}/admin/point-conversion`,
      { params: query, signal }
    )
  ).data
}
