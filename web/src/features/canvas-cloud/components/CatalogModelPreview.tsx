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
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import type { CanvasModelCatalogPlanModel } from '../types'

export function CatalogModelPreview(props: {
  models: CanvasModelCatalogPlanModel[]
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return props.models.filter(
      (model) =>
        !query ||
        `${model.displayName} ${model.productKey} ${model.capability}`
          .toLocaleLowerCase()
          .includes(query)
    )
  }, [props.models, search])
  const pageCount = Math.max(1, Math.ceil(filtered.length / 20))
  const currentPage = Math.min(page, pageCount)
  const visible = filtered.slice((currentPage - 1) * 20, currentPage * 20)

  return (
    <div className='space-y-3'>
      <Input
        className='max-w-md'
        value={search}
        onChange={(event) => {
          setSearch(event.target.value)
          setPage(1)
        }}
        aria-label={t('Search published model preview')}
        placeholder={t('Search model name, key, or capability')}
      />
      <StaticDataTable
        tableClassName='min-w-[920px]'
        columns={[
          {
            id: 'model',
            header: t('Client model'),
            cell: (model: CanvasModelCatalogPlanModel) => (
              <div>
                <div className='font-medium'>{model.displayName}</div>
                <div className='text-muted-foreground mt-1 font-mono text-xs break-all'>
                  {model.productKey}
                </div>
              </div>
            ),
          },
          {
            id: 'capability',
            header: t('Capability'),
            cell: (model: CanvasModelCatalogPlanModel) => t(model.capability),
          },
          {
            id: 'configuration',
            header: t('Client configuration'),
            cell: (model: CanvasModelCatalogPlanModel) => (
              <div>
                <div className='text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs'>
                  <span>
                    {Object.keys(model.publicInteraction.defaultParams).length}{' '}
                    {t('default values')}
                  </span>
                  <span>
                    {Object.keys(model.publicInteraction.paramSchema).length}{' '}
                    {t('client options')}
                  </span>
                  <span>
                    {
                      Object.keys(model.publicInteraction.referenceLimits)
                        .length
                    }{' '}
                    {t('reference rules')}
                  </span>
                </div>
                <details className='mt-2'>
                  <summary className='text-primary cursor-pointer text-xs font-medium select-none'>
                    {t('View client display configuration')}
                  </summary>
                  <pre className='bg-muted/50 mt-2 max-h-64 overflow-auto rounded-md p-3 text-xs'>
                    {JSON.stringify(model.publicInteraction, null, 2)}
                  </pre>
                </details>
              </div>
            ),
          },
          {
            id: 'visibility',
            header: t('Customer visibility'),
            cell: (model: CanvasModelCatalogPlanModel) =>
              model.customerVisibleAfterPublish
                ? t('Visible to customers')
                : t('Internal testing until pricing is published'),
          },
          {
            id: 'result',
            header: t('Publication result'),
            cell: (model: CanvasModelCatalogPlanModel) =>
              model.action === 'NO_OP' ? (
                <Badge variant='secondary'>{t('Unchanged — skipped')}</Badge>
              ) : (
                <div className='space-y-1'>
                  <Badge>{t(model.action)}</Badge>
                  <div className='text-muted-foreground text-xs tabular-nums'>
                    {model.currentVersion ?? '—'} →{' '}
                    {model.proposedVersion ?? '—'}
                  </div>
                </div>
              ),
          },
        ]}
        data={visible}
        getRowKey={(model) => model.productKey}
      />
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <span className='text-muted-foreground text-sm'>
          {filtered.length} {t('models')} · {currentPage} / {pageCount}
        </span>
        <div className='flex gap-2'>
          <Button
            variant='outline'
            disabled={currentPage <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            {t('Previous')}
          </Button>
          <Button
            variant='outline'
            disabled={currentPage >= pageCount}
            onClick={() => setPage((value) => value + 1)}
          >
            {t('Next')}
          </Button>
        </div>
      </div>
    </div>
  )
}
