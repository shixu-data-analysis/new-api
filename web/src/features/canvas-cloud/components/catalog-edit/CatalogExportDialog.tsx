/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMutation, useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { exportCurrentCatalog, getCurrentCatalog } from '../../catalog-edit-api'
import { adminChangedFiles, type ExportedFile } from './catalog-export-changes'

const fileText = (file: ExportedFile) =>
  `${JSON.stringify(file.content, null, 2)}\n`

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

const fileName = (path: string) => path.split('/').at(-1) ?? path
const folderOf = (path: string) => path.split('/').slice(0, -1).join('/')

/** Files by the folder they sit in, the top level first, as the Bundle lays them out. */
function byFolder(files: ExportedFile[]) {
  const folders = new Map<string, ExportedFile[]>()
  for (const file of files) {
    folders.set(folderOf(file.path), [
      ...(folders.get(folderOf(file.path)) ?? []),
      file,
    ])
  }
  return [...folders].sort(([left], [right]) => left.localeCompare(right))
}

/** The live catalog as a Bundle: all of it as a zip laid out like the Catalog repository, or one file at a time. */
export function CatalogExportDialog(props: { onClose: () => void }) {
  const { t } = useTranslation()
  const [viewed, setViewed] = useState<string>()
  const exported = useQuery({
    queryKey: ['canvas-cloud', 'model-catalog', 'export'],
    queryFn: exportCurrentCatalog,
    gcTime: 0,
    staleTime: 0,
  })
  const catalog = useQuery({
    queryKey: ['canvas-cloud', 'model-catalog', 'current'],
    queryFn: getCurrentCatalog,
  })
  const download = useMutation({
    mutationFn: async ({
      bundleId,
      bundleVersion,
      files,
    }: NonNullable<typeof exported.data>) => {
      // Only this button needs it, so the page does not load it.
      const { strToU8, zipSync } = await import('fflate')
      const zip = zipSync(
        Object.fromEntries(
          files.map((file) => [file.path, strToU8(fileText(file))])
        )
      )
      const name = `${bundleId}-${bundleVersion}.zip`
      saveBlob(
        new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }),
        name
      )
      return name
    },
    onSuccess: (name) => toast.success(t('Exported {{file}}', { file: name })),
    onError: () => toast.error(t('The zip file could not be created.')),
  })
  const ready =
    exported.data && catalog.data
      ? { exported: exported.data, catalog: catalog.data }
      : null
  const changedFiles = ready
    ? adminChangedFiles(ready.exported.files, ready.catalog)
    : []
  const current = ready
    ? (ready.exported.files.find((entry) => entry.path === viewed) ??
      ready.exported.files[0])
    : undefined
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent className='max-w-3xl sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>
            {t('Export the current catalog as a Bundle')}
          </DialogTitle>
        </DialogHeader>
        {exported.isPending || catalog.isPending ? (
          <p className='text-sm'>{t('Loading')}</p>
        ) : null}
        {exported.isError || catalog.isError ? (
          <p role='alert' className='text-destructive text-sm'>
            {t(
              'The catalog could not be exported: it does not pass the Catalog checks.'
            )}
          </p>
        ) : null}
        {ready ? (
          <div className='min-w-0 space-y-3 text-sm'>
            <p>
              {t(
                '{{bundleId}} {{version}}: {{models}} models ({{edited}} changed or added in the admin), {{channels}} Channel configurations, {{providers}} API providers. Prices, customer visibility, API Keys and categories are not included.',
                {
                  bundleId: ready.exported.bundleId,
                  version: ready.exported.bundleVersion,
                  models: ready.catalog.bundle.models.length,
                  edited: ready.catalog.bundle.models.filter(
                    (model) =>
                      ready.catalog.sources.models[model.productKey] === 'ADMIN'
                  ).length,
                  channels: ready.catalog.bundle.channels.length,
                  providers: ready.catalog.bundle.providers.length,
                }
              )}
            </p>
            {changedFiles.length ? (
              <div className='space-y-1'>
                <div className='font-medium'>
                  {t('Changed or added in the admin')}
                </div>
                <ul className='space-y-0.5 font-mono text-xs'>
                  {changedFiles.map((entry) => (
                    <li key={entry.path}>
                      <button
                        type='button'
                        className='hover:bg-muted max-w-full rounded-md px-2 py-1 text-left [overflow-wrap:anywhere]'
                        onClick={() => setViewed(entry.path)}
                      >
                        {entry.path}
                        <span className='text-muted-foreground'>
                          {' · '}
                          {entry.items.join(t(', '))}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div
              role='status'
              className='rounded-lg border px-3 py-2.5 font-medium'
            >
              {t('Validation passed')}
            </div>
            <div className='grid min-w-0 gap-3 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]'>
              <div className='max-h-88 space-y-2 overflow-auto font-mono text-xs'>
                {byFolder(ready.exported.files).map(([folder, files]) => (
                  <div key={folder} className='space-y-0.5'>
                    {folder ? (
                      <div className='text-muted-foreground px-2 py-1 font-medium [overflow-wrap:anywhere]'>
                        {folder}/
                      </div>
                    ) : null}
                    <ul className='space-y-0.5'>
                      {files.map((entry) => (
                        <li key={entry.path} className='flex items-start gap-1'>
                          <button
                            type='button'
                            aria-current={
                              entry.path === current?.path ? 'true' : undefined
                            }
                            className={`hover:bg-muted min-w-0 flex-1 rounded-md px-2 py-1 text-left [overflow-wrap:anywhere] ${folder ? 'pl-4' : ''} ${entry.path === current?.path ? 'bg-muted font-semibold' : ''}`}
                            onClick={() => setViewed(entry.path)}
                          >
                            {fileName(entry.path)}
                          </button>
                          <Button
                            type='button'
                            variant='ghost'
                            size='icon-xs'
                            className='shrink-0'
                            aria-label={t('Download {{file}}', {
                              file: entry.path,
                            })}
                            onClick={() =>
                              saveBlob(
                                new Blob([fileText(entry)], {
                                  type: 'application/json',
                                }),
                                fileName(entry.path)
                              )
                            }
                          >
                            <Download aria-hidden='true' className='size-3.5' />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              {current ? (
                <div className='relative min-w-0'>
                  <pre
                    tabIndex={0}
                    aria-label={current.path}
                    className='bg-muted max-h-88 overflow-auto rounded-lg p-2.5 font-mono text-xs/normal'
                  >
                    {fileText(current)}
                  </pre>
                  <CopyButton
                    value={fileText(current)}
                    className='absolute top-2 right-2 size-7'
                    iconClassName='size-3.5'
                    tooltip={t('Copy the current file')}
                  />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant='outline' onClick={props.onClose}>
            {t('Close')}
          </Button>
          <Button
            disabled={!ready || download.isPending}
            onClick={() => {
              if (ready) download.mutate(ready.exported)
            }}
          >
            {t('Download zip')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
