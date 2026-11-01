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

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import { exportCurrentCatalog } from '../../catalog-edit-api'

function downloadFile(path: string, content: unknown) {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(content, null, 2)}\n`], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = path.split('/').at(-1) ?? path
  link.click()
  URL.revokeObjectURL(url)
}

type DirectoryWriter = { getDirectoryHandle: (name: string, options: { create: boolean }) => Promise<DirectoryWriter>; getFileHandle: (name: string, options: { create: boolean }) => Promise<{ createWritable: () => Promise<{ write: (text: string) => Promise<void>; close: () => Promise<void> }> }> }

/** Exports the live catalog as a Bundle folder; a browser without folder access downloads files one by one. */
export function CatalogExportDialog(props: { onClose: () => void }) {
  const { t } = useTranslation()
  const [viewed, setViewed] = useState<string>()
  const exported = useQuery({ queryKey: ['canvas-cloud', 'model-catalog', 'export'], queryFn: exportCurrentCatalog, gcTime: 0, staleTime: 0 })
  const picker = (window as unknown as { showDirectoryPicker?: () => Promise<DirectoryWriter> }).showDirectoryPicker
  const save = useMutation({
    mutationFn: async () => {
      const root = await picker!()
      for (const file of exported.data!.files) {
        const parts = file.path.split('/')
        let directory = root
        for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part, { create: true })
        const handle = await directory.getFileHandle(parts.at(-1)!, { create: true })
        const writable = await handle.createWritable()
        await writable.write(`${JSON.stringify(file.content, null, 2)}\n`)
        await writable.close()
      }
    },
    onSuccess: () => toast.success(t('Saved {{count}} files', { count: exported.data?.files.length ?? 0 })),
  })
  const file = exported.data?.files.find((entry) => entry.path === viewed)
  return (
    <Dialog open onOpenChange={(open) => { if (!open) props.onClose() }}>
      <DialogContent className='max-w-3xl'>
        <DialogHeader>
          <DialogTitle>{t('Export the current catalog as a Bundle')}</DialogTitle>
        </DialogHeader>
        {exported.isPending ? <p className='text-sm'>{t('Loading')}</p> : null}
        {exported.isError ? <p role='alert' className='text-destructive text-sm'>{t('The catalog could not be exported: it does not pass the Catalog checks.')}</p> : null}
        {exported.data ? (
          <div className='space-y-3 text-sm'>
            <p className='text-muted-foreground'>{t('Version {{version}}. It holds the live catalog with admin changes; no deleted model and no API Key. Prices, customer visibility and categories stay in Cloud.', { version: exported.data.bundleVersion })}</p>
            <ul className='max-h-60 space-y-1 overflow-auto rounded-lg border p-2 font-mono text-xs'>
              {exported.data.files.map((entry) => (
                <li key={entry.path} className='flex items-center justify-between gap-2'>
                  <button type='button' className='hover:underline' onClick={() => setViewed(entry.path)}>{entry.path}</button>
                  <button type='button' aria-label={t('Download {{file}}', { file: entry.path })} onClick={() => downloadFile(entry.path, entry.content)}>
                    <Download aria-hidden='true' className='size-3.5' />
                  </button>
                </li>
              ))}
            </ul>
            {file ? <pre className='max-h-72 overflow-auto rounded-lg border p-2 font-mono text-xs'>{JSON.stringify(file.content, null, 2)}</pre> : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant='outline' onClick={props.onClose}>{t('Close')}</Button>
          {picker ? <Button disabled={!exported.data || save.isPending} onClick={() => save.mutate()}>{t('Save to a folder')}</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
