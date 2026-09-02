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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, FileJson2, FolderUp, ShieldAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { StaticDataTable } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import {
  planCanvasModelCatalogBundle,
  publishCanvasModelCatalogBundle,
} from '../api'
import { buildCatalogBundle } from '../catalogBundleReader'
import type { CanvasModelCatalogBundle, CanvasModelCatalogPlan } from '../types'
import { CatalogModelPreview } from './CatalogModelPreview'
import { PricingActionConfirmation } from './PricingActionConfirmation'
import { PublishedModelCatalog } from './PublishedModelCatalog'

function errorDetails(error: unknown): { message: string; details: string[] } {
  if (error && typeof error === 'object') {
    const data = (error as { response?: { data?: unknown } }).response?.data as
      | { message?: unknown; diagnostics?: unknown }
      | undefined
    const details = Array.isArray(data?.diagnostics)
      ? data.diagnostics.map((item) => {
          const diagnostic = item as {
            sourceFile?: unknown
            jsonPath?: unknown
            recommendation?: unknown
          }
          return [
            diagnostic.sourceFile,
            diagnostic.jsonPath,
            diagnostic.recommendation,
          ]
            .filter(
              (value): value is string =>
                typeof value === 'string' && value.length > 0
            )
            .join(' · ')
        })
      : []
    if (typeof data?.message === 'string') {
      return { message: data.message, details }
    }
  }
  return {
    message:
      error instanceof Error ? error.message : 'Bundle validation failed',
    details: [],
  }
}

export function AdminModelCatalog() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [bundle, setBundle] = useState<CanvasModelCatalogBundle | null>(null)
  const [plan, setPlan] = useState<CanvasModelCatalogPlan | null>(null)
  const [failure, setFailure] = useState<{
    message: string
    details: string[]
  } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [search, setSearch] = useState('')
  const [action, setAction] = useState('ALL')
  const [sort, setSort] = useState<
    'resourceType' | 'key' | 'action' | 'currentVersion' | 'proposedVersion'
  >('resourceType')
  const [descending, setDescending] = useState(false)
  const [page, setPage] = useState(1)
  const planner = useMutation({
    mutationFn: planCanvasModelCatalogBundle,
    onSuccess: setPlan,
    onError: (error) => setFailure(errorDetails(error)),
  })
  const publisher = useMutation({
    mutationFn: publishCanvasModelCatalogBundle,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'admin-testing-models'],
      })
      setConfirming(false)
      toast.success(t('Model catalog published'))
    },
    onError: (error) => {
      setConfirming(false)
      setFailure(errorDetails(error))
    },
  })

  async function selectFolder(files: FileList | null) {
    setPlan(null)
    setBundle(null)
    setFailure(null)
    if (!files?.length) return
    try {
      const next = await buildCatalogBundle([...files])
      setBundle(next)
      planner.mutate(next)
    } catch (error) {
      setFailure(errorDetails(error))
    }
  }

  const counts: Array<[string, number]> = bundle
    ? [
        [t('Providers'), bundle.providers.length],
        [t('Channels'), bundle.channels.length],
        [t('Models'), bundle.models.length],
        [t('OpenAPI contracts'), bundle.openapiContracts.length],
        [t('Adapter profiles'), bundle.adapterProfiles.length],
      ]
    : []
  const filteredChanges = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return [...(plan?.changes ?? [])]
      .filter(
        (change) =>
          (action === 'ALL' || change.action === action) &&
          (!query ||
            `${change.resourceType} ${change.key}`
              .toLocaleLowerCase()
              .includes(query))
      )
      .sort((left, right) => {
        const compared =
          typeof left[sort] === 'number' && typeof right[sort] === 'number'
            ? left[sort] - right[sort]
            : String(left[sort] ?? '').localeCompare(String(right[sort] ?? ''))
        return descending ? -compared : compared
      })
  }, [action, descending, plan?.changes, search, sort])
  const pageCount = Math.max(1, Math.ceil(filteredChanges.length / 20))
  const visibleChanges = filteredChanges.slice(
    (Math.min(page, pageCount) - 1) * 20,
    Math.min(page, pageCount) * 20
  )
  const publishableChanges = (plan?.changes ?? []).filter(
    (change) => change.action === 'CREATE' || change.action === 'CREATE_VERSION'
  )
  const changedModels = (plan?.models ?? []).filter(
    (model) => model.action !== 'NO_OP'
  )
  const canPublish =
    plan?.action === 'PUBLISH' &&
    !plan.blocking &&
    publishableChanges.length > 0
  let planDescription = t(
    'Validation passed. Review the client model preview and every database change before publishing.'
  )
  if (plan?.blocking) {
    planDescription = t(
      'Publication is blocked. Fix every conflict and upload the Bundle again.'
    )
  } else if (plan?.action === 'REPLAY') {
    planDescription = t(
      'This exact Bundle is already published. No new publication is required.'
    )
  } else if (plan?.action === 'NO_CHANGES') {
    planDescription = t(
      'All catalog resources are unchanged. No new publication will be created.'
    )
  }
  function changeSort(next: typeof sort) {
    if (sort === next) setDescending((value) => !value)
    else {
      setSort(next)
      setDescending(false)
    }
    setPage(1)
  }
  return (
    <div className='space-y-4'>
      <Tabs defaultValue='published'>
        <TabsList className='h-auto max-w-full flex-wrap justify-start gap-1'>
          <TabsTrigger value='published'>{t('Published models')}</TabsTrigger>
          <TabsTrigger value='import'>{t('Import and publish')}</TabsTrigger>
        </TabsList>
        <TabsContent value='published' className='mt-4'>
          <PublishedModelCatalog />
        </TabsContent>
        <TabsContent value='import' className='mt-4 space-y-4'>
          <Card>
            <CardHeader>
              <CardTitle>{t('Model catalog Bundle')}</CardTitle>
              <CardDescription>
                {t(
                  'Upload the complete Bundle folder. Canvas Cloud validates every referenced JSON file before showing a publication plan.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <label className='hover:bg-muted/40 focus-within:ring-ring flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center transition-colors focus-within:ring-2 sm:p-8'>
                <FolderUp
                  className='text-muted-foreground size-8'
                  aria-hidden='true'
                />
                <span className='font-medium'>{t('Choose Bundle folder')}</span>
                <span className='text-muted-foreground text-sm'>
                  {t(
                    'The folder must contain manifest.json and every file referenced by it.'
                  )}
                </span>
                <Input
                  className='sr-only'
                  type='file'
                  multiple
                  aria-label={t('Choose Bundle folder')}
                  ref={(node) => {
                    if (node) node.setAttribute('webkitdirectory', '')
                  }}
                  onChange={(event) => void selectFolder(event.target.files)}
                />
              </label>
              {failure && (
                <div
                  role='alert'
                  className='border-destructive/40 bg-destructive/5 text-destructive flex gap-3 rounded-lg border p-3 text-sm'
                >
                  <ShieldAlert className='mt-0.5 size-4 shrink-0' />
                  <div>
                    <div>{t(failure.message)}</div>
                    {failure.details.length > 0 && (
                      <ul className='mt-2 list-disc space-y-1 pl-4'>
                        {failure.details.map((detail) => (
                          <li key={detail}>{detail}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          {bundle && (
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <FileJson2 className='size-5' />
                  {bundle.bundleId}
                </CardTitle>
                <CardDescription>
                  {t('Bundle version')}: {bundle.bundleVersion}
                </CardDescription>
              </CardHeader>
              <CardContent className='grid gap-3 sm:grid-cols-2 lg:grid-cols-5'>
                {counts.map(([label, value]) => (
                  <div
                    key={label}
                    className='bg-muted/40 rounded-lg border p-3'
                  >
                    <div className='text-muted-foreground text-xs'>{label}</div>
                    <div className='mt-1 text-xl font-semibold tabular-nums'>
                      {value}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {planner.isPending && (
            <Card size='sm'>
              <CardContent className='text-muted-foreground text-sm'>
                {t('Validating Bundle and calculating changes...')}
              </CardContent>
            </Card>
          )}
          {plan && (
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <CheckCircle2 className='size-5 text-emerald-600' />
                  {t('Validation and publication plan')}
                </CardTitle>
                <CardDescription>{planDescription}</CardDescription>
              </CardHeader>
              <CardContent className='space-y-4'>
                {plan.diagnostics.length > 0 && (
                  <div
                    role='alert'
                    className='border-destructive/40 bg-destructive/5 text-destructive rounded-lg border p-3 text-sm'
                  >
                    <ul className='list-disc space-y-1 pl-4'>
                      {plan.diagnostics.map((diagnostic) => (
                        <li
                          key={`${diagnostic.code}:${diagnostic.sourceFile}:${diagnostic.jsonPath}`}
                        >
                          {[
                            diagnostic.sourceFile,
                            diagnostic.jsonPath,
                            diagnostic.recommendation,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <Tabs defaultValue='models'>
                  <TabsList className='h-auto max-w-full flex-wrap justify-start gap-1'>
                    <TabsTrigger value='models'>
                      {t('Client model preview')} ({plan.models.length})
                    </TabsTrigger>
                    <TabsTrigger value='changes'>
                      {t('Database plan')} ({plan.changes.length})
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value='models' className='mt-4'>
                    <CatalogModelPreview models={plan.models} />
                  </TabsContent>
                  <TabsContent value='changes' className='mt-4 space-y-4'>
                    <div className='grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]'>
                      <Input
                        value={search}
                        onChange={(event) => {
                          setSearch(event.target.value)
                          setPage(1)
                        }}
                        aria-label={t('Search')}
                        placeholder={t('Search')}
                      />
                      <select
                        className='border-input bg-background h-9 rounded-md border px-3 text-sm'
                        value={action}
                        aria-label={t('Action')}
                        onChange={(event) => {
                          setAction(event.target.value)
                          setPage(1)
                        }}
                      >
                        <option value='ALL'>{t('All')}</option>
                        {[
                          'CREATE',
                          'REUSE',
                          'CREATE_VERSION',
                          'NO_OP',
                          'CONFLICT',
                        ].map((value) => (
                          <option key={value} value={value}>
                            {t(value)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <StaticDataTable tableClassName='min-w-[720px]'>
                      <TableHeader>
                        <TableRow>
                          <TableHead>
                            <Button
                              variant='ghost'
                              size='sm'
                              onClick={() => changeSort('resourceType')}
                            >
                              {t('Resource type')}
                            </Button>
                          </TableHead>
                          <TableHead>
                            <Button
                              variant='ghost'
                              size='sm'
                              onClick={() => changeSort('key')}
                            >
                              {t('Key')}
                            </Button>
                          </TableHead>
                          <TableHead>
                            <Button
                              variant='ghost'
                              size='sm'
                              onClick={() => changeSort('action')}
                            >
                              {t('Action')}
                            </Button>
                          </TableHead>
                          <TableHead>
                            <Button
                              variant='ghost'
                              size='sm'
                              onClick={() => changeSort('currentVersion')}
                            >
                              {t('Current version')}
                            </Button>
                          </TableHead>
                          <TableHead>
                            <Button
                              variant='ghost'
                              size='sm'
                              onClick={() => changeSort('proposedVersion')}
                            >
                              {t('Proposed version')}
                            </Button>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleChanges.map((change) => (
                          <TableRow
                            key={`${change.resourceType}:${change.key}`}
                          >
                            <TableCell>{t(change.resourceType)}</TableCell>
                            <TableCell className='max-w-[22rem] break-all'>
                              {change.key}
                            </TableCell>
                            <TableCell className='font-medium'>
                              {t(change.action)}
                            </TableCell>
                            <TableCell className='tabular-nums'>
                              {change.currentVersion ?? '—'}
                            </TableCell>
                            <TableCell className='tabular-nums'>
                              {change.proposedVersion ?? '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </StaticDataTable>
                    <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                      <span className='text-muted-foreground text-sm'>
                        {filteredChanges.length} {t('records')} ·{' '}
                        {Math.min(page, pageCount)} / {pageCount}
                      </span>
                      <div className='flex gap-2'>
                        <Button
                          variant='outline'
                          disabled={page <= 1}
                          onClick={() => setPage((value) => value - 1)}
                        >
                          {t('Previous')}
                        </Button>
                        <Button
                          variant='outline'
                          disabled={page >= pageCount}
                          onClick={() => setPage((value) => value + 1)}
                        >
                          {t('Next')}
                        </Button>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
                <div className='bg-muted/30 flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between'>
                  <div className='text-sm'>
                    <div className='font-medium'>
                      {canPublish
                        ? t(
                            '{{models}} models and {{changes}} resource changes will be published',
                            {
                              models: changedModels.length,
                              changes: publishableChanges.length,
                            }
                          )
                        : t('Nothing needs to be published')}
                    </div>
                    <div className='text-muted-foreground mt-1'>
                      {t(
                        'Unchanged models are reused and never receive a new version.'
                      )}
                    </div>
                  </div>
                  <Button
                    disabled={!canPublish || publisher.isPending}
                    onClick={() => setConfirming(true)}
                  >
                    {t('Review and publish')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
      {bundle && plan && (
        <PricingActionConfirmation
          open={confirming}
          onOpenChange={setConfirming}
          title={t('Publish model catalog Bundle?')}
          description={t(
            'This confirmation publishes immutable catalog versions. Imported models remain hidden from customers until pricing is published.'
          )}
          details={[
            [t('Bundle'), bundle.bundleId],
            [t('Bundle version'), bundle.bundleVersion],
            [t('Models to publish'), String(changedModels.length)],
            [
              t('Resource changes to publish'),
              String(publishableChanges.length),
            ],
            [
              t('Unchanged models skipped'),
              String(plan.models.length - changedModels.length),
            ],
            [t('Plan action'), t(plan.action)],
          ].map(([label, value]) => ({ label, value }))}
          confirmLabel={t('Publish Bundle')}
          pending={publisher.isPending}
          onConfirm={() => publisher.mutate(bundle)}
        />
      )}
    </div>
  )
}
