/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMutation } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { checkCanvasTaskMediaStorage, retireCanvasInputStorage } from '../api'
import { reportConnectionCheck } from '../runtime-connection-check'
import type {
  CanvasRuntimeConnectionCheck,
  CanvasRuntimeInputStorage,
} from '../types'
import { InputStorageForm } from './InputStorageForm'
import { StorageCardHeader, StorageSummary } from './RuntimeStorageParts'

/** Retention and download, plus how an S3 storage is addressed and locked; Qiniu objects are written once, so neither applies. */
function storageDetails(storage: CanvasRuntimeInputStorage, t: TFunction) {
  const parts = [
    `${t('{{label}}: ', { label: t('Input retention hours') })}${storage.inputRetentionHours}h`,
    `${t('{{label}}: ', { label: t('Download URL seconds') })}${storage.downloadUrlTtlSeconds}s`,
  ]
  if (storage.driver === 'S3') {
    parts.push(
      storage.driverConfig.forcePathStyle
        ? t('Bucket in the path')
        : t('Bucket in the host')
    )
    parts.push(
      `${t('{{label}}: ', { label: t('Content lock') })}${storage.driverConfig.contentLock === 'md5' ? 'MD5' : 'SHA-256'}`
    )
  }
  return parts.join(' · ')
}

/**
 * The task-media storages: the default one (`defaultStorage`, owned by the runtime page) and the others, each holding the inputs
 * of the models that name it, which are added, updated, checked and deleted here. A storage is deleted only when no model and no
 * undeleted input still uses it.
 */
export function InputStorages(props: {
  defaultStorage: ReactNode
  storages: CanvasRuntimeInputStorage[]
  onChanged: () => Promise<unknown>
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<CanvasRuntimeInputStorage | null>(
    null
  )
  const check = useMutation({
    mutationFn: checkCanvasTaskMediaStorage,
    onSuccess: async (result: CanvasRuntimeConnectionCheck) => {
      reportConnectionCheck(result, t)
      await props.onChanged()
    },
    onError: () => toast.error(t('Connection check failed')),
  })
  const retire = useMutation({
    mutationFn: retireCanvasInputStorage,
    onSuccess: async () => {
      toast.success(t('Storage deleted'))
      setDeleting(null)
      await props.onChanged()
    },
    onError: () => toast.error(t('The storage was not deleted')),
  })
  // A published version is checked at once, so a model can choose it only after the check passed.
  const finishEditing = async (publishedVersionId?: string) => {
    setEditing(null)
    if (!publishedVersionId) return
    await props.onChanged()
    check.mutate(publishedVersionId)
  }
  return (
    <>
      <div className='flex justify-end'>
        <Button
          aria-expanded={editing === ''}
          onClick={() => setEditing(editing === '' ? null : '')}
        >
          {t('Add storage')}
        </Button>
      </div>
      {editing === '' && (
        <Card>
          <CardHeader>
            <CardTitle>{t('Add storage')}</CardTitle>
          </CardHeader>
          <CardContent>
            <InputStorageForm onDone={finishEditing} />
          </CardContent>
        </Card>
      )}
      {props.defaultStorage}
      {props.storages.map((storage) => {
        const inUse = storage.usage.models > 0 || storage.usage.inputs > 0
        return (
          <Card key={storage.storageKey}>
            <StorageCardHeader title={storage.storageKey} storage={storage} />
            <CardContent className='space-y-5'>
              <StorageSummary
                item={storage}
                details={storageDetails(storage, t)}
                usage={t(
                  '{{models}} models · {{inputs}} inputs',
                  storage.usage
                )}
                checking={check.isPending}
                editing={editing === storage.storageKey}
                onCheck={() => check.mutate(storage.id)}
                onEdit={() =>
                  setEditing(
                    editing === storage.storageKey ? null : storage.storageKey
                  )
                }
                onDelete={() => setDeleting(storage)}
                {...(inUse
                  ? {
                      deleteDisabledReason: t(
                        'Models or inputs still use this storage'
                      ),
                    }
                  : {})}
              />
              {editing === storage.storageKey && (
                <div className='bg-muted/20 rounded-lg border p-3'>
                  <InputStorageForm storage={storage} onDone={finishEditing} />
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={t('Delete storage {{storage}}?', {
          storage: deleting?.storageKey ?? '',
        })}
        desc={t(
          'The saved keys are no longer used; the files in the bucket are not deleted.'
        )}
        confirmText={t('Delete')}
        destructive
        isLoading={retire.isPending}
        handleConfirm={() => {
          if (deleting) retire.mutate(deleting.storageKey)
        }}
      />
    </>
  )
}
