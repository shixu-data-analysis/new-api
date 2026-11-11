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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getServerErrorCode } from '@/lib/server-error-message'

import {
  customerNoticeQueryKeys,
  getConventionVersion,
  getConventionVersions,
  publishConventionVersion,
  type ConventionVersionSummary,
} from '../customer-notices-api'
import { formatCanvasDateTimeMinutes } from '../formatters'
import { useServerTableState } from '../use-server-table-state'
import { CanvasServerTable } from './CanvasServerTable'

const BODY_LIMIT = 10000

// COMMUNITY-CONVENTION-001: the 社区公约 tab of 系统公告. Each publication is a new version customers must accept before
// their next task; versions are never edited or deleted.
export function AdminConventionVersions(props: {
  titleActionSlot?: HTMLElement | null
}) {
  const { t } = useTranslation()
  const table = useServerTableState<'version'>('version')
  const [publishing, setPublishing] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)
  const query = { page: table.query.page, pageSize: table.query.pageSize }
  const versions = useQuery({
    queryKey: [...customerNoticeQueryKeys.conventions, query],
    queryFn: ({ signal }) => getConventionVersions(query, signal),
  })
  const rows = useMemo(() => versions.data?.items ?? [], [versions.data])
  const currentId = rows.find((row) => row.current)?.id

  const columns = useMemo<ColumnDef<ConventionVersionSummary, unknown>[]>(
    () => [
      {
        id: 'version',
        accessorKey: 'version',
        enableSorting: false,
        enableHiding: false,
        header: () => t('Version'),
        cell: ({ row }) => (
          <span className='inline-flex items-center gap-2 whitespace-nowrap'>
            {t('Version {{version}}', { version: row.original.version })}
            {row.original.current ? (
              <span className='bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium'>
                {t('Current')}
              </span>
            ) : null}
          </span>
        ),
        meta: { label: t('Version') },
      },
      {
        id: 'publishedAt',
        accessorKey: 'publishedAt',
        enableSorting: false,
        header: () => t('Effective time'),
        cell: ({ row }) => (
          <span className='text-muted-foreground tabular-nums'>
            {formatCanvasDateTimeMinutes(row.original.publishedAt)}
          </span>
        ),
        meta: { label: t('Effective time') },
      },
      {
        id: 'actions',
        enableHiding: false,
        enableSorting: false,
        header: () => t('Actions'),
        cell: ({ row }) => (
          <Button
            variant='ghost'
            size='sm'
            onClick={() => setViewing(row.original.id)}
          >
            {t('View convention')}
          </Button>
        ),
        meta: { label: t('Actions') },
      },
    ],
    [t]
  )

  return (
    <div className='space-y-3'>
      {props.titleActionSlot
        ? createPortal(
            <Button
              size='sm'
              onClick={() => setPublishing(true)}
              disabled={versions.isPending}
            >
              {t('Publish new version')}
            </Button>,
            props.titleActionSlot
          )
        : null}
      <CanvasServerTable
        data={rows}
        columns={columns}
        total={versions.data?.total ?? 0}
        state={table}
        loading={versions.isPending || versions.isFetching}
        error={versions.isError}
        onRetry={() => void versions.refetch()}
        emptyTitle={t('No convention published yet')}
        getRowId={(row) => row.id}
      />
      {publishing ? (
        <PublishConventionDialog
          currentId={currentId}
          onClose={() => setPublishing(false)}
        />
      ) : null}
      {viewing ? (
        <ConventionVersionDialog
          id={viewing}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </div>
  )
}

function ConventionVersionDialog(props: { id: string; onClose: () => void }) {
  const { t } = useTranslation()
  const version = useQuery({
    queryKey: customerNoticeQueryKeys.convention(props.id),
    queryFn: ({ signal }) => getConventionVersion(props.id, signal),
  })
  let description = t('Loading...')
  if (version.data)
    description = t('In force from {{time}}', {
      time: formatCanvasDateTimeMinutes(version.data.publishedAt),
    })
  else if (version.isError)
    description = t('Unable to load the convention. Please try again.')
  return (
    <Dialog open onOpenChange={(open) => (!open ? props.onClose() : undefined)}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>
            {version.data
              ? t('Community convention · version {{version}}', {
                  version: version.data.version,
                })
              : t('Community convention')}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {version.data ? (
          <div className='max-h-[50vh] overflow-auto rounded-lg border p-3 text-sm leading-relaxed whitespace-pre-line'>
            {version.data.body}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant='outline' onClick={props.onClose}>
            {t('Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PublishConventionDialog(props: {
  currentId?: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const id = useId()
  const current = useQuery({
    queryKey: customerNoticeQueryKeys.convention(props.currentId ?? ''),
    queryFn: ({ signal }) =>
      getConventionVersion(props.currentId ?? '', signal),
    enabled: Boolean(props.currentId),
  })
  // Starts from the current text, so a correction does not mean retyping it.
  const [body, setBody] = useState<string | null>(null)
  const text = body ?? current.data?.body ?? ''
  const [tried, setTried] = useState(false)
  const [unchanged, setUnchanged] = useState(false)
  const attempt = useRef<{ body: string; key: string } | null>(null)
  const empty = !text.trim()
  const publish = useMutation({
    mutationFn: () => {
      const trimmed = text.trim()
      // A retry of the same text reuses its idempotency key, so a publication whose response was lost is not repeated.
      if (attempt.current?.body !== trimmed)
        attempt.current = {
          body: trimmed,
          key: `web-convention-${crypto.randomUUID()}`,
        }
      return publishConventionVersion({
        body: trimmed,
        idempotencyKey: attempt.current.key,
      })
    },
    onSuccess: async (result) => {
      toast.success(
        t('Version {{version}} published', { version: result.version })
      )
      await queryClient.invalidateQueries({
        queryKey: customerNoticeQueryKeys.conventions,
      })
      props.onClose()
    },
    onError: (error) => {
      if (getServerErrorCode(error) === 'CONVENTION_UNCHANGED') {
        setUnchanged(true)
        return
      }
      toast.error(t('Unable to publish the convention. Please try again.'))
    },
  })
  const loadingCurrent =
    Boolean(props.currentId) && current.isPending && body === null
  return (
    <Dialog
      open
      onOpenChange={(open) =>
        !open && !publish.isPending ? props.onClose() : undefined
      }
    >
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t('Publish new version')}</DialogTitle>
          <DialogDescription>
            {t(
              'It is in force at once. Every customer must accept it again before submitting tasks.'
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-4'
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            setTried(true)
            if (empty || loadingCurrent) return
            publish.mutate()
          }}
        >
          <div className='space-y-1'>
            <Label htmlFor={`${id}-body`}>{t('Convention text')}</Label>
            <Textarea
              id={`${id}-body`}
              value={text}
              rows={14}
              maxLength={BODY_LIMIT}
              disabled={loadingCurrent}
              aria-required='true'
              aria-invalid={(tried && empty) || unchanged}
              aria-describedby={`${id}-help${(tried && empty) || unchanged ? ` ${id}-error` : ''}`}
              onChange={(event) => {
                setBody(event.target.value)
                setUnchanged(false)
              }}
            />
            <p id={`${id}-help`} className='text-muted-foreground text-xs'>
              {t('Up to 10000 characters. Line breaks are kept.')}
            </p>
            {(tried && empty) || unchanged ? (
              <p
                id={`${id}-error`}
                role='alert'
                className='text-destructive text-xs'
              >
                {t(
                  unchanged
                    ? 'The text is the same as the current version.'
                    : 'Enter the convention text.'
                )}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={publish.isPending}
              onClick={props.onClose}
            >
              {t('Cancel')}
            </Button>
            <Button
              type='submit'
              disabled={publish.isPending || loadingCurrent}
            >
              {t('Publish')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
