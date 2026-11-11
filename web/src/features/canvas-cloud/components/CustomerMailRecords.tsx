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
import { type ReactNode, useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import {
  customerNoticeQueryKeys,
  getCustomerMailFailures,
  getCustomerMails,
  getPointsExpiryReminder,
  getPointsExpiryReminderPreview,
  sendTestCustomerMail,
  setPointsExpiryReminder,
  type CustomerMailBatch,
  type CustomerMailKind,
} from '../customer-notices-api'
import { formatCanvasDateTimeMinutes } from '../formatters'
import {
  MAIL_FAILURE_REASON_KEYS,
  MAIL_KIND_KEYS,
  MAIL_KINDS,
  mailFailureMessageKey,
} from '../lib/customer-mail-messages'
import { useServerTableState } from '../use-server-table-state'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { CanvasServerTable } from './CanvasServerTable'
import { CanvasStatusBadge } from './CanvasStatusBadge'

const REMINDER_DAYS = [3, 7, 15, 30] as const

/**
 * One send's outcome in one line: still sending, all sent, or how many failed. Customers with no email address had
 * nothing to send to, so they are counted beside the result, not as failures.
 */
function MailResult(props: { batch: CustomerMailBatch }) {
  const { t } = useTranslation()
  const { batch } = props
  const reachable = batch.recipients - batch.skipped
  const noAddress =
    batch.skipped > 0 && reachable > 0 ? (
      <span className='text-muted-foreground text-xs'>
        {t('{{count}} more with no email address', { count: batch.skipped })}
      </span>
    ) : null
  let badge: ReactNode
  if (batch.recipients === 0) {
    badge = (
      <CanvasStatusBadge
        status='OFFLINE'
        label={t(
          batch.kind === 'POINTS_EXPIRY' ? 'No one to remind' : 'No recipients'
        )}
      />
    )
  } else if (batch.queued > 0) {
    badge = (
      <CanvasStatusBadge
        status='PENDING'
        label={t('{{count}} people · sending', { count: batch.recipients })}
      />
    )
  } else if (reachable === 0) {
    badge = (
      <CanvasStatusBadge
        status='OFFLINE'
        label={t('{{count}} people · no email address', {
          count: batch.skipped,
        })}
      />
    )
  } else if (batch.failed > 0) {
    badge = (
      <CanvasStatusBadge
        status='CONFIRMED_FAILED'
        label={t('{{count}} people · {{failed}} failed', {
          count: reachable,
          failed: batch.failed,
        })}
      />
    )
  } else {
    badge = (
      <CanvasStatusBadge
        status='COMPLETED'
        label={t('{{count}} people · all sent', { count: reachable })}
      />
    )
  }
  return (
    <div className='flex flex-wrap items-center gap-2'>
      {badge}
      {noAddress}
    </div>
  )
}

function useMailColumns(onDetail: (batch: CustomerMailBatch) => void) {
  const { t } = useTranslation()
  return useMemo<ColumnDef<CustomerMailBatch, unknown>[]>(() => {
    return [
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        enableSorting: false,
        enableHiding: false,
        header: () => t('Sent at'),
        cell: ({ row }) => (
          <span className='text-muted-foreground tabular-nums'>
            {formatCanvasDateTimeMinutes(row.original.createdAt)}
          </span>
        ),
        meta: { label: t('Sent at') },
      },
      {
        id: 'kind',
        accessorKey: 'kind',
        enableSorting: false,
        header: () => t('Type'),
        cell: ({ row }) => t(MAIL_KIND_KEYS[row.original.kind]),
        meta: { label: t('Type') },
      },
      {
        id: 'subject',
        accessorKey: 'subject',
        enableSorting: false,
        header: () => t('Subject'),
        cell: ({ row }) => (
          <div className='max-w-[28rem] min-w-0'>
            <p className='truncate' title={row.original.subject ?? ''}>
              {row.original.subject ?? '—'}
            </p>
            {row.original.audience === 'ALL_ACTIVE' ? (
              <p className='text-muted-foreground text-xs'>
                {t('Every active customer')}
              </p>
            ) : null}
          </div>
        ),
        meta: { label: t('Subject') },
      },
      {
        id: 'result',
        accessorKey: 'recipients',
        enableSorting: false,
        header: () => t('Result'),
        cell: ({ row }) => <MailResult batch={row.original} />,
        meta: { label: t('Result') },
      },
      {
        id: 'sender',
        accessorKey: 'sender',
        enableSorting: false,
        header: () => t('Sender'),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {row.original.kind === 'POINTS_EXPIRY'
              ? t('System')
              : (row.original.sender ?? '—')}
          </span>
        ),
        meta: { label: t('Sender') },
      },
      {
        id: 'actions',
        enableHiding: false,
        enableSorting: false,
        header: () => t('Actions'),
        cell: ({ row }) =>
          row.original.failed > 0 ? (
            <Button
              variant='ghost'
              size='sm'
              onClick={() => onDetail(row.original)}
            >
              {t('Details')}
            </Button>
          ) : null,
        meta: { label: t('Actions') },
      },
    ]
  }, [onDetail, t])
}

function MailRecords() {
  const { t } = useTranslation()
  const table = useServerTableState<'createdAt'>('createdAt')
  const setPagination = table.setPagination
  const [detail, setDetail] = useState<CustomerMailBatch | null>(null)
  const [kind, setKind] = useState<CustomerMailKind | ''>('')
  useEffect(() => {
    setPagination((value) =>
      value.pageIndex === 0 ? value : { ...value, pageIndex: 0 }
    )
  }, [kind, setPagination])
  const query = {
    ...(kind ? { kind } : {}),
    page: table.query.page,
    pageSize: table.query.pageSize,
  }
  const mails = useQuery({
    queryKey: [...customerNoticeQueryKeys.mails, query],
    queryFn: ({ signal }) => getCustomerMails(query, signal),
    // Mails go out a minute at a time; a send in progress refreshes its counts.
    refetchInterval: (current) =>
      current.state.data?.items.some((item) => item.queued > 0)
        ? 15_000
        : false,
  })
  const columns = useMailColumns(setDetail)
  return (
    <>
      <CanvasServerTable
        data={mails.data?.items ?? []}
        columns={columns}
        total={mails.data?.total ?? 0}
        state={table}
        loading={mails.isPending || mails.isFetching}
        error={mails.isError}
        onRetry={() => void mails.refetch()}
        emptyTitle={t('No mails sent yet')}
        filteredEmptyTitle={t('No matching results')}
        additionalFilters={
          <DataTableColumnFilterField label={t('Type')}>
            <Select
              value={kind || 'ALL'}
              onValueChange={(value) =>
                setKind(value === 'ALL' ? '' : (value as CustomerMailKind))
              }
            >
              <SelectTrigger className='w-full' aria-label={t('Type')}>
                <CanvasLocalizedSelectValue
                  value={kind}
                  emptyLabelKey='All types'
                  displayValue={kind ? t(MAIL_KIND_KEYS[kind]) : undefined}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='ALL'>{t('All types')}</SelectItem>
                {MAIL_KINDS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(MAIL_KIND_KEYS[value])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </DataTableColumnFilterField>
        }
        hasActiveFilters={Boolean(kind)}
        onResetFilters={() => setKind('')}
        getRowId={(row) => row.id}
      />
      {detail ? (
        <MailFailuresDialog batch={detail} onClose={() => setDetail(null)} />
      ) : null}
    </>
  )
}

function MailFailuresDialog(props: {
  batch: CustomerMailBatch
  onClose: () => void
}) {
  const { t } = useTranslation()
  const failures = useQuery({
    queryKey: [...customerNoticeQueryKeys.mails, props.batch.id, 'failures'],
    queryFn: ({ signal }) => getCustomerMailFailures(props.batch.id, signal),
  })
  return (
    <Dialog open onOpenChange={(open) => (!open ? props.onClose() : undefined)}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t('Send failures')}</DialogTitle>
          <DialogDescription>
            {t('{{time}} · {{count}} people, {{failed}} failed', {
              time: formatCanvasDateTimeMinutes(props.batch.createdAt),
              count: props.batch.recipients,
              failed: props.batch.failed,
            })}
          </DialogDescription>
        </DialogHeader>
        <div className='max-h-[50vh] overflow-auto rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Username')}</TableHead>
                <TableHead>{t('Email')}</TableHead>
                <TableHead>{t('Reason')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(failures.data?.items ?? []).map((item) => (
                <TableRow key={item.customerId}>
                  <TableCell>{item.username ?? '—'}</TableCell>
                  <TableCell className='text-muted-foreground'>
                    {item.emailMasked ?? '—'}
                  </TableCell>
                  <TableCell>
                    {t(MAIL_FAILURE_REASON_KEYS[item.reason] ?? 'Unknown')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {failures.isError ? (
            <p className='text-destructive p-3 text-sm'>
              {t('Unable to load. Please try again.')}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={props.onClose}>
            {t('Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PointsExpiryReminderCard() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const reminder = useQuery({
    queryKey: customerNoticeQueryKeys.reminder,
    queryFn: ({ signal }) => getPointsExpiryReminder(signal),
  })
  const save = useMutation({
    mutationFn: setPointsExpiryReminder,
    onSuccess: async (result) => {
      queryClient.setQueryData(customerNoticeQueryKeys.reminder, result)
      toast.success(t('Saved'))
    },
    onError: () => toast.error(t('Unable to save. Please try again.')),
  })
  const settings = reminder.data
  let reminderSummary = t('Loading...')
  if (settings) {
    reminderSummary = t(
      'Every day at 10:00, to customers with points expiring within {{days}} days. Each batch of points is reminded once.',
      { days: settings.daysBefore }
    )
  } else if (reminder.isError) {
    reminderSummary = t('Unable to load. Please try again.')
  }
  return (
    <Card size='sm'>
      <CardContent className='flex flex-wrap items-center justify-between gap-3'>
        <div className='min-w-0 space-y-1'>
          <p id='points-expiry-reminder-title' className='font-medium'>
            {t('Points expiry reminder')}
          </p>
          <p className='text-muted-foreground text-sm'>{reminderSummary}</p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Switch
            aria-labelledby='points-expiry-reminder-title'
            checked={settings?.enabled ?? false}
            disabled={!settings || save.isPending}
            onCheckedChange={(enabled) =>
              settings &&
              save.mutate({ enabled, daysBefore: settings.daysBefore })
            }
          />
          <Button
            variant='outline'
            size='sm'
            disabled={!settings}
            onClick={() => setSettingsOpen(true)}
          >
            {t('Settings')}
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setPreviewOpen(true)}
          >
            {t('Preview')}
          </Button>
        </div>
      </CardContent>
      {settingsOpen && settings ? (
        <ReminderSettingsDialog
          daysBefore={settings.daysBefore}
          saving={save.isPending}
          onSave={(daysBefore) =>
            save.mutate(
              { enabled: settings.enabled, daysBefore },
              { onSuccess: () => setSettingsOpen(false) }
            )
          }
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      {previewOpen ? (
        <ReminderPreviewDialog onClose={() => setPreviewOpen(false)} />
      ) : null}
    </Card>
  )
}

function ReminderSettingsDialog(props: {
  daysBefore: number
  saving: boolean
  onSave: (days: number) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const [days, setDays] = useState(props.daysBefore)
  return (
    <Dialog
      open
      onOpenChange={(open) =>
        !open && !props.saving ? props.onClose() : undefined
      }
    >
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('Points expiry reminder')}</DialogTitle>
          <DialogDescription className='sr-only'>
            {t('How many days before expiry the mail goes out.')}
          </DialogDescription>
        </DialogHeader>
        <fieldset className='space-y-2'>
          <legend className='text-sm font-medium'>
            {t('Remind this many days before')}
          </legend>
          <div className='flex flex-wrap gap-4'>
            {REMINDER_DAYS.map((value) => (
              <label key={value} className='flex items-center gap-2 text-sm'>
                <input
                  type='radio'
                  name={`${id}-days`}
                  checked={days === value}
                  onChange={() => setDays(value)}
                />
                {t('{{count}} days', { count: value })}
              </label>
            ))}
          </div>
        </fieldset>
        <DialogFooter>
          <Button
            variant='outline'
            disabled={props.saving}
            onClick={props.onClose}
          >
            {t('Cancel')}
          </Button>
          <Button disabled={props.saving} onClick={() => props.onSave(days)}>
            {t('Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// The mail's own HTML in the shared card, shown in a sandboxed frame so its inline styles stay apart from the admin's.
function mailPreviewDocument(html: string, brand: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#F3F4F6;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif}</style></head><body><div style="max-width:600px;margin:24px auto;padding:32px 32px 28px;background:#fff;border:1px solid #E5E7EB;border-radius:12px;font-size:15px;line-height:24px;color:#374151"><div style="margin:0 0 28px;font-size:20px;line-height:28px;font-weight:700;color:#111827">${brand}</div>${html}<div style="margin-top:24px;border-bottom:1px dashed #E5E7EB"></div><p style="margin:16px 0 0;font-size:12px;line-height:20px;color:#9CA3AF">此邮件由系统自动发送，请勿直接回复。</p></div></body></html>`
}

function ReminderPreviewDialog(props: { onClose: () => void }) {
  const { t } = useTranslation()
  const preview = useQuery({
    queryKey: [...customerNoticeQueryKeys.reminder, 'preview'],
    queryFn: ({ signal }) => getPointsExpiryReminderPreview(signal),
  })
  const test = useMutation({
    mutationFn: () => sendTestCustomerMail({ kind: 'POINTS_EXPIRY' }),
    onSuccess: (result) =>
      toast.success(
        result.addressMasked
          ? t('Test mail sent to {{address}}', {
              address: result.addressMasked,
            })
          : t('Test mail sent')
      ),
    onError: (error) => toast.error(t(mailFailureMessageKey(error))),
  })
  const brand = t('Canvas Cloud')
  return (
    <Dialog open onOpenChange={(open) => (!open ? props.onClose() : undefined)}>
      <DialogContent className='sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>{t('Preview')}</DialogTitle>
          <DialogDescription>
            {preview.data
              ? t('Subject: {{subject}}', {
                  subject: `${t('【{{brand}}】', { brand })}${preview.data.subject}`,
                })
              : t('Sample data, not a real customer.')}
          </DialogDescription>
        </DialogHeader>
        {preview.data ? (
          <iframe
            title={t('Points expiry reminder')}
            sandbox=''
            className='h-[60vh] w-full rounded-lg border'
            srcDoc={mailPreviewDocument(preview.data.html, brand)}
          />
        ) : null}
        {preview.isError ? (
          <p className='text-destructive text-sm'>
            {t('Unable to load. Please try again.')}
          </p>
        ) : null}
        <DialogFooter className='sm:justify-between'>
          <Button
            variant='outline'
            disabled={test.isPending}
            onClick={() => test.mutate()}
          >
            {t('Send a test mail to me')}
          </Button>
          <Button variant='outline' onClick={props.onClose}>
            {t('Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// COMMUNITY-CONVENTION-001: 客户管理 › 邮件记录. Every mail sent to customers, from the customer list or by the daily
// points expiry reminder, under the reminder's settings.
export function CustomerMailRecords() {
  return (
    <div className='space-y-4'>
      <PointsExpiryReminderCard />
      <MailRecords />
    </div>
  )
}
