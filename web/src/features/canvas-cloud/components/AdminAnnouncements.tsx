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
import { useEffect, useId, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTableColumnHeader } from '@/components/data-table'
import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  announcementQueryKeys,
  deleteCanvasAdminAnnouncements,
  getCanvasAdminAnnouncements,
  getCanvasAnnouncementRetention,
  getCanvasAnnouncementTags,
} from '../api'
import { formatCanvasDateTimeMinutes } from '../formatters'
import {
  ANNOUNCEMENT_STATUS_LABEL_KEYS,
  announcementDeleteAfterLabelKey,
} from '../lib/announcement-labels'
import type {
  CanvasAdminAnnouncement,
  CanvasAnnouncementStatus,
} from '../types'
import { useServerTableState } from '../use-server-table-state'
import { AnnouncementEditorDialog } from './AnnouncementEditorDialog'
import { AnnouncementRetentionDialog } from './AnnouncementRetentionDialog'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { CanvasServerTable } from './CanvasServerTable'
import { CanvasStatusBadge } from './CanvasStatusBadge'

const ALL = '__all__'
const statusLabelKeys = ANNOUNCEMENT_STATUS_LABEL_KEYS

type Editing =
  | { kind: 'create' }
  | { kind: 'edit'; announcement: CanvasAdminAnnouncement }

export function AdminAnnouncements(props: {
  titleActionSlot?: HTMLElement | null
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const fieldId = useId()
  const table = useServerTableState<'publishedAt' | 'status'>('publishedAt')
  const { setPagination } = table
  const [status, setStatus] = useState<CanvasAnnouncementStatus | ''>('')
  const [tagId, setTagId] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [editing, setEditing] = useState<Editing | null>(null)
  const [retentionOpen, setRetentionOpen] = useState(false)
  const [deleting, setDeleting] = useState<CanvasAdminAnnouncement[] | null>(
    null
  )

  const query = {
    ...table.query,
    ...(status ? { status } : {}),
    ...(tagId ? { tagId } : {}),
  }
  const queryIdentity = JSON.stringify(query)
  useEffect(() => {
    setPagination((value) =>
      value.pageIndex === 0 ? value : { ...value, pageIndex: 0 }
    )
  }, [status, tagId, setPagination])
  // A selection belongs to the rows on screen: another page, filter or sort starts a new one.
  useEffect(() => setSelected(new Set()), [queryIdentity])

  const announcements = useQuery({
    queryKey: [...announcementQueryKeys.all, query],
    queryFn: ({ signal }) => getCanvasAdminAnnouncements(query, signal),
  })
  const tags = useQuery({
    queryKey: announcementQueryKeys.tags,
    queryFn: getCanvasAnnouncementTags,
  })
  const retention = useQuery({
    queryKey: announcementQueryKeys.retention,
    queryFn: getCanvasAnnouncementRetention,
  })
  const rows = useMemo(
    () => announcements.data?.items ?? [],
    [announcements.data]
  )
  const visibleDays = retention.data?.visibleDays

  const remove = useMutation({
    mutationFn: (items: CanvasAdminAnnouncement[]) =>
      deleteCanvasAdminAnnouncements(items.map((item) => item.id)),
    onSuccess: async (result) => {
      setDeleting(null)
      setSelected(new Set())
      toast.success(
        t('Deleted {{count}} announcements', { count: result.deleted })
      )
      await queryClient.invalidateQueries({
        queryKey: announcementQueryKeys.all,
      })
    },
    onError: () =>
      toast.error(t('Unable to delete the announcements. Please try again.')),
  })

  const columns = useMemo<ColumnDef<CanvasAdminAnnouncement, unknown>[]>(() => {
    const pageIds = rows.map((row) => row.id)
    const allSelected =
      pageIds.length > 0 && pageIds.every((id) => selected.has(id))
    const someSelected = pageIds.some((id) => selected.has(id))
    const toggle = (ids: string[], checked: boolean) =>
      setSelected((value) => {
        const next = new Set(value)
        for (const id of ids) {
          if (checked) next.add(id)
          else next.delete(id)
        }
        return next
      })
    return [
      {
        id: 'select',
        enableHiding: false,
        enableSorting: false,
        header: () => (
          <Checkbox
            aria-label={t('Select all on this page')}
            checked={allSelected}
            indeterminate={someSelected && !allSelected}
            onCheckedChange={(checked) => toggle(pageIds, checked)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={t('Select {{title}}', { title: row.original.title })}
            checked={selected.has(row.original.id)}
            onCheckedChange={(checked) => toggle([row.original.id], checked)}
          />
        ),
        size: 48,
      },
      {
        id: 'publishedAt',
        accessorKey: 'publishedAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Publish time')} />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground tabular-nums'>
            {formatCanvasDateTimeMinutes(row.original.publishedAt)}
          </span>
        ),
        meta: { label: t('Publish time') },
      },
      {
        id: 'announcement',
        accessorFn: (row) => row.title,
        enableHiding: false,
        enableSorting: false,
        header: () => t('Announcement'),
        cell: ({ row }) => (
          <div className='max-w-[32rem] min-w-0'>
            <p className='truncate font-medium' title={row.original.title}>
              {row.original.title}
            </p>
            {row.original.body ? (
              <p
                className='text-muted-foreground truncate text-xs'
                title={row.original.body}
              >
                {row.original.body.replaceAll(/\s*\n\s*/g, ' ')}
              </p>
            ) : null}
          </div>
        ),
        meta: { label: t('Announcement') },
      },
      {
        id: 'tag',
        accessorFn: (row) => row.tag?.name ?? '',
        enableSorting: false,
        header: () => t('Tag'),
        cell: ({ row }) =>
          row.original.tag ? (
            <span
              className='model-badge'
              data-model-color={row.original.tag.color}
            >
              {row.original.tag.name}
            </span>
          ) : (
            <span className='text-muted-foreground'>—</span>
          ),
        meta: { label: t('Tag') },
      },
      {
        id: 'reminder',
        accessorFn: (row) => row.autoPopup,
        enableSorting: false,
        header: () => t('Reminder'),
        cell: ({ row }) => (
          <span className='text-muted-foreground whitespace-nowrap'>
            {t(row.original.autoPopup ? 'Pop up once' : 'Dot only')}
          </span>
        ),
        meta: { label: t('Reminder') },
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Status')} />
        ),
        cell: ({ row }) => (
          <CanvasStatusBadge
            status={row.original.status}
            label={t(statusLabelKeys[row.original.status])}
          />
        ),
        meta: { label: t('Status') },
      },
      {
        id: 'actions',
        enableHiding: false,
        enableSorting: false,
        header: () => t('Actions'),
        cell: ({ row }) => (
          <div className='flex gap-1 whitespace-nowrap'>
            <Button
              variant='ghost'
              size='sm'
              onClick={() =>
                setEditing({ kind: 'edit', announcement: row.original })
              }
            >
              {t('Edit')}
            </Button>
            <Button
              variant='ghost'
              size='sm'
              className='text-destructive'
              onClick={() => setDeleting([row.original])}
            >
              {t('Delete')}
            </Button>
          </div>
        ),
        meta: { label: t('Actions') },
      },
    ]
  }, [rows, selected, t])

  const selectedRows = rows.filter((row) => selected.has(row.id))
  const retentionLabel = retention.data
    ? t('Visible time and cleanup: last {{days}} days · {{cleanup}}', {
        days: retention.data.visibleDays,
        cleanup: t(
          announcementDeleteAfterLabelKey(retention.data.deleteAfterOfflineDays)
        ),
      })
    : t('Visible time and cleanup')
  const deletingOne = deleting?.length === 1 ? deleting[0] : undefined
  const filters = (
    <>
      <DataTableColumnFilterField
        label={t('Status')}
        htmlFor={`${fieldId}-status`}
      >
        <Select
          value={status || ALL}
          onValueChange={(value) =>
            setStatus(
              !value || value === ALL ? '' : (value as CanvasAnnouncementStatus)
            )
          }
        >
          <SelectTrigger id={`${fieldId}-status`} className='w-full'>
            <CanvasLocalizedSelectValue
              value={status || ALL}
              valueLabelKey={status ? statusLabelKeys[status] : 'All statuses'}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('All statuses')}</SelectItem>
            {(Object.keys(statusLabelKeys) as CanvasAnnouncementStatus[]).map(
              (value) => (
                <SelectItem key={value} value={value}>
                  {t(statusLabelKeys[value])}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      </DataTableColumnFilterField>
      <DataTableColumnFilterField label={t('Tag')} htmlFor={`${fieldId}-tag`}>
        <Select
          value={tagId || ALL}
          onValueChange={(value) =>
            setTagId(!value || value === ALL ? '' : value)
          }
        >
          <SelectTrigger id={`${fieldId}-tag`} className='w-full'>
            <SelectValue>
              {(value: string) =>
                value === ALL
                  ? t('All tags')
                  : (tags.data?.items.find((tag) => tag.id === value)?.name ??
                    t('Unknown'))
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('All tags')}</SelectItem>
            {(tags.data?.items ?? []).map((tag) => (
              <SelectItem key={tag.id} value={tag.id}>
                {tag.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </DataTableColumnFilterField>
    </>
  )

  return (
    <div className='space-y-3'>
      {props.titleActionSlot
        ? createPortal(
            <>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setRetentionOpen(true)}
                disabled={!retention.data}
              >
                {retentionLabel}
              </Button>
              <Button size='sm' onClick={() => setEditing({ kind: 'create' })}>
                {t('Publish announcement')}
              </Button>
            </>,
            props.titleActionSlot
          )
        : null}
      {retention.isError ? (
        <ErrorState
          className='min-h-0'
          title={t('Unable to load the visible time settings')}
          onRetry={() => void retention.refetch()}
        />
      ) : null}
      <CanvasServerTable
        data={rows}
        columns={columns}
        total={announcements.data?.total ?? 0}
        state={table}
        loading={announcements.isPending || announcements.isFetching}
        error={announcements.isError}
        onRetry={() => void announcements.refetch()}
        emptyTitle={t('No announcements')}
        filteredEmptyTitle={t('No matching results')}
        searchLabel={t('Title or body')}
        additionalFilters={filters}
        hasActiveFilters={Boolean(status || tagId)}
        activeFilterCount={[status, tagId].filter(Boolean).length}
        onResetFilters={() => {
          setStatus('')
          setTagId('')
        }}
        selectionActions={
          selectedRows.length ? (
            <Button
              variant='outline'
              size='sm'
              className='text-destructive'
              onClick={() => setDeleting(selectedRows)}
            >
              {t('Delete selected ({{count}})', { count: selectedRows.length })}
            </Button>
          ) : null
        }
        getRowId={(row) => row.id}
      />
      {visibleDays !== undefined ? (
        <p className='text-muted-foreground text-sm'>
          {t(
            'Customers see only announcements published in the last {{days}} days; older ones go offline automatically and stay here, where you can filter them by status and delete them.',
            { days: visibleDays }
          )}
        </p>
      ) : null}
      {editing ? (
        <AnnouncementEditorDialog
          announcement={
            editing.kind === 'edit' ? editing.announcement : undefined
          }
          onClose={() => setEditing(null)}
        />
      ) : null}
      {retentionOpen && retention.data ? (
        <AnnouncementRetentionDialog
          retention={retention.data}
          onClose={() => setRetentionOpen(false)}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) =>
          !open && !remove.isPending ? setDeleting(null) : undefined
        }
        destructive
        isLoading={remove.isPending}
        title={
          deletingOne
            ? t('Delete this announcement?')
            : t('Delete the {{count}} selected announcements?', {
                count: deleting?.length ?? 0,
              })
        }
        desc={
          deletingOne
            ? t(
                '“{{title}}” will be deleted. Customers will no longer see it and it cannot be restored; the operation log keeps its title, body, publish time and deletion time.',
                { title: deletingOne.title }
              )
            : t(
                'Customers will no longer see them and they cannot be restored; the operation log keeps the title, body, publish time and deletion time of each.'
              )
        }
        confirmText={t('Delete')}
        handleConfirm={() => deleting && remove.mutate(deleting)}
      />
    </div>
  )
}
