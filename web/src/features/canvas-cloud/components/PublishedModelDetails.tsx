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
        {t('Technical information')}
      </summary>
      <div className='mt-2 min-w-0 space-y-3 text-xs [overflow-wrap:anywhere]'>
        <div>
          <span className='text-muted-foreground'>
            {t('API provider code')}:{' '}
          </span>
          {model.provider.code || t('Not recorded')}
        </div>
        <div className='min-w-0'>
          <div className='text-muted-foreground mb-1'>
            {t('Upstream model ID')}
          </div>
          {model.modelIds.length === 0 && <div>{t('Not recorded')}</div>}
          <div className='space-y-1'>
            {model.modelIds.map((entry) => (
              <div
                key={`${entry.quality ?? ''}:${entry.modelId}`}
                className='flex min-w-0 gap-1.5'
              >
                {entry.quality !== null && (
                  <span className='shrink-0'>{entry.quality} →</span>
                )}
                <span className='min-w-0 [overflow-wrap:anywhere]'>
                  {entry.modelId || t('Not recorded')}
                </span>
              </div>
            ))}
          </div>
        </div>
        <details className='min-w-0'>
          <summary className='cursor-pointer'>
            {t('Original catalog configuration')}
          </summary>
          <pre className='bg-muted/50 mt-2 max-h-64 max-w-full overflow-auto rounded p-3 text-xs whitespace-pre'>
            {JSON.stringify(model.publicCatalogSnapshot, null, 2)}
          </pre>
        </details>
      </div>
    </details>
  )
}
