/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { cloneElement, useId, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

import { formatCanvasDateTime } from '../formatters'
import { connectionCheckReason } from '../runtime-connection-check'
import type { CanvasRuntimeConnectionCheck } from '../types'
import { BusinessTermText } from './BusinessTerm'

/** The title of a storage card: its name, then its type, status and version, the same for the default and every other storage. */
export function StorageCardHeader(props: {
  title: string
  storage: { driver: 'S3' | 'QINIU'; status: string; version: number }
}) {
  const { t } = useTranslation()
  return (
    <CardHeader>
      <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1'>
        <CardTitle>{props.title}</CardTitle>
        <Badge variant='secondary'>
          {props.storage.driver === 'QINIU' ? t('Qiniu') : t('S3 compatible')}
        </Badge>
        <Badge variant='secondary'>
          <BusinessTermText kind='configStatus' value={props.storage.status} />
        </Badge>
        <Badge variant='secondary'>
          {t('Version')} {props.storage.version}
        </Badge>
      </div>
    </CardHeader>
  )
}

export function StorageSummary(props: {
  item: {
    version: number
    status: string
    endpoint: string
    bucket: string
    updatedBy: string
    createdAt: string
    latestCheck: CanvasRuntimeConnectionCheck | null
  }
  details: string
  /** What still uses an input storage; the default storage has no such count. */
  usage?: string
  checking: boolean
  editing: boolean
  onCheck: () => void
  onEdit: () => void
  /** Deletes the storage; without it no delete action is shown. */
  onDelete?: () => void
  deleteDisabledReason?: string
}) {
  const { t } = useTranslation()
  return (
    <div className='space-y-5 text-sm'>
      <dl className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
        <div className='bg-muted/30 min-w-0 rounded-lg p-3 xl:col-span-2'>
          <dt className='text-muted-foreground text-xs'>{t('Endpoint')}</dt>
          <dd className='mt-1 font-medium break-all'>{props.item.endpoint}</dd>
        </div>
        <div className='bg-muted/30 min-w-0 rounded-lg p-3'>
          <dt className='text-muted-foreground text-xs'>{t('Bucket')}</dt>
          <dd className='mt-1 font-medium break-all'>{props.item.bucket}</dd>
        </div>
        <div
          className={`bg-muted/30 min-w-0 rounded-lg p-3 ${props.usage === undefined ? 'md:col-span-2' : ''}`}
        >
          <dt className='text-muted-foreground text-xs'>
            {t('Retention and download')}
          </dt>
          <dd className='mt-1 font-medium'>{props.details}</dd>
        </div>
        {props.usage !== undefined && (
          <div className='bg-muted/30 min-w-0 rounded-lg p-3'>
            <dt className='text-muted-foreground text-xs'>{t('In use')}</dt>
            <dd className='mt-1 font-medium'>{props.usage}</dd>
          </div>
        )}
        <div className='bg-muted/30 min-w-0 rounded-lg p-3'>
          <dt className='text-muted-foreground text-xs'>{t('Updated by')}</dt>
          <dd className='mt-1 font-medium'>
            {props.item.updatedBy} ·{' '}
            {formatCanvasDateTime(props.item.createdAt)}
          </dd>
        </div>
      </dl>
      <div className='bg-muted/30 flex flex-col gap-3 rounded-lg px-4 py-3 sm:flex-row sm:items-center sm:justify-between'>
        <dl className='min-w-0 text-xs'>
          <ConnectionCheck
            label={t('Connection check')}
            value={props.item.latestCheck}
          />
        </dl>
        <div className='flex shrink-0 flex-wrap gap-2'>
          {props.onDelete && (
            <span title={props.deleteDisabledReason}>
              <Button
                size='sm'
                variant='ghost'
                className='text-destructive hover:text-destructive'
                disabled={Boolean(props.deleteDisabledReason)}
                onClick={props.onDelete}
              >
                {t('Delete')}
              </Button>
            </span>
          )}
          <Button
            size='sm'
            variant='outline'
            disabled={props.checking}
            onClick={props.onCheck}
          >
            {t('Check connection')}
          </Button>
          <Button
            size='sm'
            aria-expanded={props.editing}
            onClick={props.onEdit}
          >
            {t('Update configuration')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function Field(props: {
  label: string
  error?: unknown
  children: ReactElement<{
    id?: string
    'aria-describedby'?: string
    'aria-invalid'?: boolean
  }>
}) {
  const { t } = useTranslation()
  const generatedId = useId()
  const controlId = props.children.props.id ?? `field-${generatedId}`
  const errorId = `${controlId}-error`
  const hasError = Boolean(props.error)
  const control = cloneElement(props.children, {
    id: controlId,
    'aria-invalid': hasError || undefined,
    'aria-describedby': hasError
      ? errorId
      : props.children.props['aria-describedby'],
  })
  return (
    <div className='min-w-0 space-y-1'>
      <Label className='block' htmlFor={controlId}>
        {props.label}
      </Label>
      <span className='block font-normal'>{control}</span>
      {hasError && (
        <div id={errorId} className='text-destructive text-xs' role='alert'>
          {t(String(props.error))}
        </div>
      )}
    </div>
  )
}

function ConnectionCheck(props: {
  label: string
  value: CanvasRuntimeConnectionCheck | null
}) {
  const { t } = useTranslation()
  let statusClass = 'text-muted-foreground'
  if (props.value?.outcome === 'PASSED') {
    statusClass = 'text-emerald-600 dark:text-emerald-400'
  }
  if (props.value?.outcome === 'FAILED') statusClass = 'text-destructive'
  let statusLabel = t('Not checked')
  if (props.value?.outcome === 'PASSED') statusLabel = t('Passed')
  if (props.value?.outcome === 'FAILED') statusLabel = t('Failed')
  return (
    <div>
      <dt className='text-muted-foreground'>{props.label}</dt>
      <dd>
        <span className={statusClass}>{statusLabel}</span>
        {props.value && (
          <>
            {' '}
            · {formatCanvasDateTime(props.value.checkedAt)}
            {props.value.checkedBy ? ` · ${props.value.checkedBy}` : ''}
          </>
        )}
        {props.value?.outcome === 'FAILED' && (
          <span className='text-muted-foreground block'>
            {connectionCheckReason(props.value.reasonCode, t)}
          </span>
        )}
      </dd>
    </div>
  )
}
