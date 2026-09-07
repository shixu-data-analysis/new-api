/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with this program.
If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
  DataTableView,
  useDataTable,
} from '@/components/data-table'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import {
  getCanvasAdminTestingModels,
  publishCanvasModelPresentation,
} from '../api'
import type { CanvasAdminTestingModel } from '../types'
import { withCanvasTableColumnSizes } from './canvas-table-layout'
import {
  CanvasColumnFilterField,
  CanvasColumnFilterPanel,
} from './CanvasColumnFilterPanel'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { PricingActionConfirmation } from './PricingActionConfirmation'

function visibilityRank(model: CanvasAdminTestingModel) {
  if (!model.enabled) return 0
  if (!model.resourceEnabled) return 1
  if (model.customerVisible) return 2
  return 1
}

export function PublishedModelCatalog() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [modelId, setModelId] = useState('')
  const [visibility, setVisibility] = useState('ALL')
  const [editing, setEditing] = useState<CanvasAdminTestingModel | null>(null)
  const [toggling, setToggling] = useState<CanvasAdminTestingModel | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const models = useQuery({
    queryKey: ['canvas-cloud', 'admin-testing-models'],
    queryFn: getCanvasAdminTestingModels,
  })
  const publisher = useMutation({
    mutationFn: publishCanvasModelPresentation,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'admin-testing-models'],
      })
      setEditing(null)
      setToggling(null)
      toast.success(t('Model display settings published'))
    },
    onError: () => toast.error(t('Model display settings publication failed')),
  })
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    const idQuery = modelId.trim().toLocaleLowerCase()
    const matches = (models.data ?? []).filter((model) => {
      const providerModelIds = model.modelIds
        .map((entry) => entry.modelId)
        .join('\n')
        .toLocaleLowerCase()
      const visible =
        visibility === 'ALL' ||
        (visibility === 'CUSTOMER'
          ? model.customerVisible
          : !model.customerVisible)
      return (
        visible &&
        (!query || model.name.toLocaleLowerCase().includes(query)) &&
        (!idQuery || providerModelIds.includes(idQuery))
      )
    })
    return matches
  }, [modelId, models.data, search, visibility])
  let visibilityFilterLabel = t('All')
  if (visibility === 'CUSTOMER') {
    visibilityFilterLabel = t('Visible to customers')
  } else if (visibility === 'INTERNAL') {
    visibilityFilterLabel = t('Internal only')
  }
  const startEdit = useCallback((model: CanvasAdminTestingModel) => {
    setDisplayName(model.name)
    setDescription(model.description)
    setEditing(model)
  }, [])
  const columns = useMemo<ColumnDef<CanvasAdminTestingModel, unknown>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (model) => model.name,
        size: 208,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Client model')} />
        ),
        meta: { label: t('Client model') },
        cell: ({ row }) => {
          const model = row.original
          return (
            <div className='whitespace-normal'>
              <div className='font-medium break-words'>{model.name}</div>
              {model.description && (
                <div className='text-muted-foreground mt-1 max-w-md'>
                  {model.description}
                </div>
              )}
              <div className='text-muted-foreground mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 font-mono text-xs'>
                <span>{t('Model ID')}:</span>
                <div className='min-w-0 space-y-0.5'>
                  {model.modelIds.length > 0 ? (
                    model.modelIds.map(({ quality, modelId }) => (
                      <div
                        key={`${quality ?? 'default'}:${modelId}`}
                        className='break-all'
                      >
                        {quality ? `${quality}: ${modelId}` : modelId}
                      </div>
                    ))
                  ) : (
                    <div>—</div>
                  )}
                </div>
              </div>
              <details className='mt-2'>
                <summary className='text-primary cursor-pointer text-xs'>
                  {t('View client display configuration')}
                </summary>
                <pre className='bg-muted/50 mt-2 max-h-64 overflow-auto rounded p-3 text-xs'>
                  {JSON.stringify(model.publicCatalogSnapshot, null, 2)}
                </pre>
              </details>
            </div>
          )
        },
      },
      {
        id: 'capability',
        accessorFn: (model) =>
          typeof model.publicCatalogSnapshot.capability === 'string'
            ? model.publicCatalogSnapshot.capability
            : '',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Capability')} />
        ),
        meta: { label: t('Capability') },
        cell: ({ getValue }) => t(String(getValue() || '—')),
      },
      {
        id: 'version',
        accessorFn: (model) => model.version,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Version')} />
        ),
        meta: { label: t('Version') },
        cell: ({ row }) => (
          <div className='tabular-nums'>
            <div>
              {t('Technical')} v{row.original.version}
            </div>
            {row.original.presentationVersion && (
              <div className='text-muted-foreground mt-1 text-xs'>
                {t('Presentation')} v{row.original.presentationVersion}
              </div>
            )}
          </div>
        ),
      },
      {
        id: 'visibility',
        accessorFn: visibilityRank,
        size: 208,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Customer visibility')}
          />
        ),
        meta: { label: t('Customer visibility') },
        cell: ({ row }) => {
          const model = row.original
          let label = t('Internal testing until pricing is published')
          if (!model.enabled) label = t('Disabled')
          else if (!model.resourceEnabled) {
            label = t('Disabled by technical control')
          } else if (model.customerVisible) {
            label = t('Visible to customers')
          }
          return label
        },
      },
      {
        id: 'pricing',
        accessorFn: (model) =>
          model.totalTargets ? model.pricedTargets / model.totalTargets : 0,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Pricing progress')}
          />
        ),
        meta: { label: t('Pricing progress') },
        cell: ({ row }) => (
          <span className='tabular-nums'>
            {row.original.pricedTargets} / {row.original.totalTargets}
          </span>
        ),
      },
      {
        id: 'actions',
        size: 128,
        header: t('Actions'),
        meta: { label: t('Actions') },
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const model = row.original
          return (
            <div className='flex flex-wrap gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => startEdit(model)}
              >
                {t('Modify basic information')}
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setToggling(model)}
              >
                {model.enabled ? t('Disable') : t('Enable')}
              </Button>
            </div>
          )
        },
      },
    ],
    [startEdit, t]
  )
  const sizedColumns = useMemo(
    () => withCanvasTableColumnSizes(columns),
    [columns]
  )
  const { table } = useDataTable({
    data: filtered,
    columns: sizedColumns,
    getRowId: (model) => model.id,
    columnFilters: [],
    globalFilter: '',
    initialSorting: [{ id: 'name', desc: false }],
    initialPagination: { pageIndex: 0, pageSize: 20 },
    autoResetPageIndex: true,
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Published models')}</CardTitle>
        <CardDescription>
          {t(
            'These are the current database-backed model settings used to build the client catalog.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <DataTableToolbar
          table={table}
          stableGrid
          customSearch={
            <CanvasColumnFilterPanel
              activeCount={
                [
                  search,
                  modelId,
                  visibility === 'ALL' ? '' : visibility,
                ].filter(Boolean).length
              }
            >
              <CanvasColumnFilterField label={t('Client model')}>
                <Input
                  value={search}
                  placeholder={t('Client model')}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </CanvasColumnFilterField>
              <CanvasColumnFilterField label={t('Model ID')}>
                <Input
                  value={modelId}
                  placeholder={t('Model ID')}
                  onChange={(event) => setModelId(event.target.value)}
                />
              </CanvasColumnFilterField>
              <CanvasColumnFilterField label={t('Customer visibility')}>
                <Select
                  value={visibility}
                  onValueChange={(value) => setVisibility(value ?? 'ALL')}
                >
                  <SelectTrigger
                    className='w-full'
                    aria-label={t('Customer visibility')}
                  >
                    <CanvasLocalizedSelectValue
                      value={visibility}
                      displayValue={visibilityFilterLabel}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='ALL'>{t('All')}</SelectItem>
                    <SelectItem value='CUSTOMER'>
                      {t('Visible to customers')}
                    </SelectItem>
                    <SelectItem value='INTERNAL'>
                      {t('Internal only')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </CanvasColumnFilterField>
            </CanvasColumnFilterPanel>
          }
          hasAdditionalFilters={Boolean(
            search || modelId || visibility !== 'ALL'
          )}
          onReset={() => {
            setSearch('')
            setModelId('')
            setVisibility('ALL')
          }}
        />
        <DataTableView
          table={table}
          isLoading={models.isPending}
          tableContainerClassName='overflow-x-auto'
          tableClassName='min-w-max'
          tableBodyRowClassName='align-top'
          applyHeaderSize
          emptyTitle={t('No matching models')}
          emptyDescription={t('No records found. Try adjusting your filters.')}
        />
        <div className='pt-2'>
          <DataTablePagination table={table} />
        </div>
      </CardContent>
      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Modify model basic information')}</DialogTitle>
            <DialogDescription>
              {t(
                'Only client-facing name and description are changed. Technical Bundle fields and pricing remain unchanged.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4'>
            <div>
              <Label htmlFor='model-display-name'>
                {t('Client display name')}
              </Label>
              <Input
                id='model-display-name'
                value={displayName}
                maxLength={191}
                onChange={(event) => setDisplayName(event.target.value)}
              />
              <div className='text-destructive mt-1 text-xs'>
                {!displayName.trim() ? t('Required') : ''}
              </div>
            </div>
            <div>
              <Label htmlFor='model-description'>
                {t('Client description')}
              </Label>
              <Textarea
                id='model-description'
                value={description}
                maxLength={500}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setEditing(null)}>
              {t('Cancel')}
            </Button>
            <Button
              disabled={!editing || !displayName.trim() || publisher.isPending}
              onClick={() =>
                editing &&
                publisher.mutate({
                  modelKey: editing.modelKey,
                  displayName: displayName.trim(),
                  description: description.trim(),
                  enabled: editing.enabled,
                })
              }
            >
              {t('Confirm and publish')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {toggling && (
        <PricingActionConfirmation
          open
          onOpenChange={(open) => !open && setToggling(null)}
          title={
            toggling.enabled
              ? t('Disable this model?')
              : t('Enable this model?')
          }
          description={t(
            'This publishes a new presentation control version. Bundle definitions and historical records are unchanged.'
          )}
          details={[
            { label: t('Model'), value: toggling.name },
            {
              label: t('Result'),
              value: toggling.enabled ? t('Disabled') : t('Enabled'),
            },
          ]}
          confirmLabel={toggling.enabled ? t('Disable') : t('Enable')}
          pending={publisher.isPending}
          onConfirm={() =>
            publisher.mutate({
              modelKey: toggling.modelKey,
              displayName: toggling.name,
              description: toggling.description,
              enabled: !toggling.enabled,
            })
          }
        />
      )}
    </Card>
  )
}
