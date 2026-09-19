/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useTranslation } from 'react-i18next'

import type { CanvasAdminTestingModel } from '../types'

export function PublishedModelDetails({
  model,
}: {
  model: CanvasAdminTestingModel
}) {
  const { t } = useTranslation()

  return (
    <details className='min-w-0'>
      <summary className='text-primary cursor-pointer text-xs'>
        {t('Original catalog configuration')}
      </summary>
      <pre className='bg-muted/50 mt-2 max-h-64 max-w-full overflow-auto rounded p-3 text-xs whitespace-pre'>
        {JSON.stringify(model.publicCatalogSnapshot, null, 2)}
      </pre>
    </details>
  )
}
