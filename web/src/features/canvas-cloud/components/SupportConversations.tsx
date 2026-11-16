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
import { useQuery } from '@tanstack/react-query'
import { getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { Settings } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePagination } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useDebounce } from '@/hooks'
import { toIntlLocale } from '@/i18n/languages'
import { cn } from '@/lib/utils'

import {
  getCanvasAdminSupportConversations,
  getCanvasAdminSupportFailureAlerts,
  getCanvasAdminSupportSettings,
  supportQueryKeys,
} from '../api'
import { lastMessagePreview } from '../lib/support-labels'
import type { CanvasAdminSupportConversation } from '../types'
import { SupportFailureAlerts } from './SupportFailureAlerts'
import { SupportSettingsDialog } from './SupportSettingsDialog'
import { SupportThread } from './SupportThread'

const REFRESH_MILLISECONDS = 10_000
const FAILURE_REFRESH_MILLISECONDS = 60_000
const refreshWhileVisible = (milliseconds: number) => () =>
  document.visibilityState === 'visible' ? milliseconds : false
const PAGE_SIZES = [10, 20, 30, 40, 50, 100] as const
const paginationColumns = [{ id: 'conversation' }]

function FilterButton(props: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type='button'
      size='sm'
      variant={props.selected ? 'default' : 'outline'}
      aria-pressed={props.selected}
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  )
}

/** 客户管理 › 客服会话: conversations on the left, the selected one on the right. */
export function SupportConversations(props: {
  /** `failures` opens 失败提醒, the page a failure alert links to. */
  view?: 'failures'
  conversationId?: string
  onConversationChange?: (conversationId?: string) => void
  onOpenCustomer: (customerId: string) => void
}) {
  const { t, i18n } = useTranslation()
  const [filter, setFilter] = useState<'all' | 'pending' | 'failures'>(
    props.view ?? 'all'
  )
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search.trim(), 300)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(20)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const conversations = useQuery({
    queryKey: [
      ...supportQueryKeys.conversations,
      filter,
      debouncedSearch,
      page,
      pageSize,
    ],
    queryFn: ({ signal }) =>
      getCanvasAdminSupportConversations(
        {
          // Not read for 失败提醒: the list is not requested then.
          filter: filter === 'failures' ? 'all' : filter,
          page,
          pageSize,
          ...(debouncedSearch ? { q: debouncedSearch } : {}),
        },
        signal
      ),
    enabled: filter !== 'failures',
    refetchInterval: refreshWhileVisible(REFRESH_MILLISECONDS),
    placeholderData: (previous) => previous,
  })
  const failureAlerts = useQuery({
    queryKey: supportQueryKeys.failureAlerts,
    queryFn: ({ signal }) => getCanvasAdminSupportFailureAlerts(signal),
    refetchInterval: refreshWhileVisible(
      filter === 'failures'
        ? REFRESH_MILLISECONDS
        : FAILURE_REFRESH_MILLISECONDS
    ),
  })
  const conversationsFailed =
    filter !== 'failures' && conversations.isError && !conversations.data
  const showConversations = filter !== 'failures' && !conversationsFailed
  const failureCustomers = (failureAlerts.data?.models ?? []).reduce(
    (sum, model) => sum + model.customers.length,
    0
  )
  const settings = useQuery({
    queryKey: supportQueryKeys.settings,
    // Read once for the quick replies; the dialog edits the same data.
    queryFn: ({ signal }) => getCanvasAdminSupportSettings(signal),
  })
  const rows = conversations.data?.items ?? []
  const total = conversations.data?.total ?? 0
  const paginationTable = useReactTable({
    data: rows,
    columns: paginationColumns,
    rowCount: total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    manualPagination: true,
    state: { pagination: { pageIndex: page - 1, pageSize } },
    onPaginationChange: (updater) => {
      const current = { pageIndex: page - 1, pageSize }
      const next = typeof updater === 'function' ? updater(current) : updater
      setPage(next.pageSize === pageSize ? next.pageIndex + 1 : 1)
      setPageSize(
        PAGE_SIZES.includes(next.pageSize as (typeof PAGE_SIZES)[number])
          ? next.pageSize
          : 20
      )
    },
    getCoreRowModel: getCoreRowModel(),
  })
  const selected: CanvasAdminSupportConversation | null =
    rows.find((row) => row.id === props.conversationId) ??
    (props.conversationId ? null : (rows[0] ?? null))
  const filtered = filter === 'pending' || debouncedSearch !== ''
  const time = (iso: string) => {
    const date = new Date(iso)
    const locale = toIntlLocale(i18n.language)
    return date.toDateString() === new Date().toDateString()
      ? new Intl.DateTimeFormat(locale, {
          hour: '2-digit',
          minute: '2-digit',
        }).format(date)
      : new Intl.DateTimeFormat(locale, {
          month: 'numeric',
          day: 'numeric',
        }).format(date)
  }
  const resetPage = () => setPage(1)

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <Input
          className='w-full min-w-40 sm:w-64'
          type='search'
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            resetPage()
          }}
          placeholder={t('Search customer name or ID')}
          aria-label={t('Search customer name or ID')}
        />
        <div
          className='flex gap-2'
          role='group'
          aria-label={t('Conversation filter')}
        >
          <FilterButton
            selected={filter === 'all'}
            onClick={() => {
              setFilter('all')
              resetPage()
            }}
          >
            {t('All')}
          </FilterButton>
          <FilterButton
            selected={filter === 'pending'}
            onClick={() => {
              setFilter('pending')
              resetPage()
            }}
          >
            {t('Awaiting reply')}
          </FilterButton>
          <FilterButton
            selected={filter === 'failures'}
            onClick={() => setFilter('failures')}
          >
            {t('Failure alerts')}
            {failureCustomers > 0 ? (
              <Badge variant='destructive' className='ms-1 px-1.5'>
                {failureCustomers}
              </Badge>
            ) : null}
          </FilterButton>
        </div>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='sm:ms-auto'
          onClick={() => setSettingsOpen(true)}
        >
          <Settings aria-hidden='true' />
          {t('Support settings')}
        </Button>
      </div>

      {filter === 'failures' && failureAlerts.isError && !failureAlerts.data ? (
        <Card className='p-4'>
          <p className='text-destructive text-sm' role='alert'>
            {t('Unable to load the failure alerts. Please try again.')}
          </p>
          <Button
            className='mt-3 w-fit'
            variant='outline'
            size='sm'
            onClick={() => void failureAlerts.refetch()}
          >
            {t('Retry')}
          </Button>
        </Card>
      ) : null}
      {filter === 'failures' && failureAlerts.data ? (
        <SupportFailureAlerts
          alerts={failureAlerts.data}
          quickReplies={settings.data?.quickReplies.failureNotice ?? []}
          onOpenCustomer={props.onOpenCustomer}
        />
      ) : null}
      {conversationsFailed ? (
        <Card className='p-4'>
          <p className='text-destructive text-sm' role='alert'>
            {t('Unable to load the conversations. Please try again.')}
          </p>
          <Button
            className='mt-3 w-fit'
            variant='outline'
            size='sm'
            onClick={() => void conversations.refetch()}
          >
            {t('Retry')}
          </Button>
        </Card>
      ) : null}
      {showConversations ? (
        <div className='grid items-start gap-4 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]'>
          <div className='min-w-0 space-y-2'>
            <Card className='gap-0 p-2'>
              {conversations.isPending ? (
                <p className='text-muted-foreground p-3 text-sm' role='status'>
                  {t('Loading…')}
                </p>
              ) : null}
              {!conversations.isPending && rows.length === 0 ? (
                <div className='space-y-3 p-3' role='status'>
                  <p className='text-muted-foreground text-sm'>
                    {filtered
                      ? t('No matching conversations')
                      : t('No conversations yet')}
                  </p>
                  {filtered ? (
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => {
                        setFilter('all')
                        setSearch('')
                        resetPage()
                      }}
                    >
                      {t('Clear filters')}
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {rows.length > 0 ? (
                <ul className='grid gap-0.5' aria-label={t('Conversations')}>
                  {rows.map((row) => {
                    const name = row.customer.name ?? t('Customer')
                    const isSelected = selected?.id === row.id
                    return (
                      <li key={row.id}>
                        <button
                          type='button'
                          aria-pressed={isSelected}
                          className={cn(
                            'grid w-full grid-cols-[2.25rem_minmax(0,1fr)_auto] items-start gap-2.5 rounded-xl p-2.5 text-start',
                            isSelected ? 'bg-primary/10' : 'hover:bg-muted/60'
                          )}
                          onClick={() => props.onConversationChange?.(row.id)}
                        >
                          <span
                            aria-hidden='true'
                            className='bg-secondary text-secondary-foreground grid size-9 place-items-center rounded-full text-sm font-semibold'
                          >
                            {[...name][0]}
                          </span>
                          <span className='flex min-w-0 flex-col gap-0.5'>
                            <span className='flex items-baseline gap-1.5'>
                              <span className='truncate font-semibold'>
                                {name}
                              </span>
                              <span className='text-muted-foreground shrink-0 text-xs'>
                                ID {row.customer.userId}
                              </span>
                            </span>
                            <span className='text-muted-foreground truncate text-sm'>
                              {lastMessagePreview(row.lastMessage, t)}
                            </span>
                          </span>
                          <span className='text-muted-foreground flex flex-col items-end gap-1 text-xs whitespace-nowrap'>
                            {row.lastMessage ? (
                              <span>{time(row.lastMessage.createdAt)}</span>
                            ) : null}
                            {row.pending ? (
                              <Badge
                                variant='outline'
                                className='border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                              >
                                {t('Awaiting reply')}
                              </Badge>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </Card>
            {total > 0 ? <DataTablePagination table={paginationTable} /> : null}
          </div>
          {selected ? (
            <div className='min-w-0'>
              <SupportThread
                key={selected.id}
                conversation={selected}
                quickReplies={
                  settings.data?.quickReplies ?? {
                    conversation: [],
                    failureNotice: [],
                  }
                }
                onOpenCustomer={props.onOpenCustomer}
              />
            </div>
          ) : null}
          {!selected && props.conversationId && !conversations.isPending ? (
            <Card className='p-4'>
              <p className='text-muted-foreground text-sm'>
                {t(
                  'This conversation is not on this page. Search for the customer to open it.'
                )}
              </p>
            </Card>
          ) : null}
        </div>
      ) : null}

      {settingsOpen && settings.data ? (
        <SupportSettingsDialog
          settings={settings.data}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </div>
  )
}
