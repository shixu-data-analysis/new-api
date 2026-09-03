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
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader } from '@/components/data-table'
import { SectionPageLayout } from '@/components/layout'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDebounce } from '@/hooks'

import { getCanvasAdminCustomers } from './api'
import { BusinessTerm, BusinessTermText } from './components/BusinessTerm'
import { CanvasColumnFilterField } from './components/CanvasColumnFilterPanel'
import { CanvasServerTable } from './components/CanvasServerTable'
import { CopyableText } from './components/CopyableText'
import type { CanvasAdminCustomerPointBalance } from './types'
import { useServerTableState } from './use-server-table-state'

type CustomerStatus = CanvasAdminCustomerPointBalance['status']

export function CanvasCustomerPointBalances() {
  const { t } = useTranslation()
  const tableState = useServerTableState('createdAt')
  const [status, setStatus] = useState<'' | CustomerStatus>('')
  const [email, setEmail] = useState('')
  const debouncedEmail = useDebounce(email.trim(), 300)
  const customers = useQuery({
    queryKey: [
      'canvas-cloud',
      'admin',
      'customers',
      'balances',
      tableState.query,
      status,
      debouncedEmail,
    ],
    queryFn: ({ signal }) =>
      getCanvasAdminCustomers(
        {
          page: tableState.query.page,
          pageSize: tableState.query.pageSize,
          sortBy: tableState.query.sortBy,
          sortOrder: tableState.query.sortOrder,
          ...(tableState.query.search
            ? { username: tableState.query.search }
            : {}),
          ...(debouncedEmail ? { email: debouncedEmail } : {}),
          ...(status ? { status } : {}),
        },
        signal
      ),
  })

  const columns = useMemo<
    ColumnDef<CanvasAdminCustomerPointBalance, unknown>[]
  >(
    () => [
      {
        id: 'customer',
        accessorKey: 'username',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Username')} />
        ),
        meta: { label: t('Username') },
        cell: ({ row }) => (
          <div className='space-y-1'>
            <CopyableText value={row.original.username ?? '—'} />
            {row.original.emailMasked ? (
              <div className='text-muted-foreground text-xs'>
                {row.original.emailMasked}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        id: 'availablePoints',
        accessorKey: 'availablePoints',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Available points')}
          />
        ),
        meta: { label: t('Available points') },
      },
      {
        id: 'paidAvailablePoints',
        accessorKey: 'paidAvailablePoints',
        enableSorting: false,
        header: () => <BusinessTerm kind='pointBalance' value='PAID' />,
      },
      {
        id: 'bonusAvailablePoints',
        accessorKey: 'bonusAvailablePoints',
        enableSorting: false,
        header: () => <BusinessTerm kind='pointBalance' value='BONUS' />,
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Status')} />
        ),
        meta: { label: t('Status') },
        cell: ({ row }) => (
          <BusinessTerm kind='customerStatus' value={row.original.status} />
        ),
      },
    ],
    [t]
  )

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Canvas Customers')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='space-y-3'>
          <p className='text-muted-foreground text-sm'>
            {t(
              'These balances come from the Canvas point ledger. Paid and bonus points remain separate and New API technical quota is not included.'
            )}
          </p>
          <CanvasServerTable
            data={customers.data?.items ?? []}
            columns={columns}
            total={customers.data?.total ?? 0}
            state={tableState}
            searchLabel={t('Username')}
            loading={customers.isPending || customers.isFetching}
            emptyTitle={t('No Canvas customers')}
            additionalFilters={
              <>
                <CanvasColumnFilterField label={t('Email')}>
                  <Input
                    value={email}
                    placeholder={t('Email')}
                    onChange={(event) => {
                      setEmail(event.target.value)
                      tableState.setPagination((current) => ({
                        ...current,
                        pageIndex: 0,
                      }))
                    }}
                  />
                </CanvasColumnFilterField>
                <CanvasColumnFilterField label={t('Status')}>
                  <Select
                    value={status || 'ALL'}
                    onValueChange={(value) => {
                      setStatus(
                        value === 'ALL' ? '' : (value as CustomerStatus)
                      )
                      tableState.setPagination((current) => ({
                        ...current,
                        pageIndex: 0,
                      }))
                    }}
                  >
                    <SelectTrigger className='w-full' aria-label={t('Status')}>
                      <SelectValue>
                        {status ? (
                          <BusinessTermText
                            kind='customerStatus'
                            value={status}
                          />
                        ) : (
                          t('All statuses')
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='ALL'>{t('All statuses')}</SelectItem>
                      {['ACTIVE', 'SUSPENDED', 'CLOSED'].map((value) => (
                        <SelectItem key={value} value={value}>
                          <BusinessTerm kind='customerStatus' value={value} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CanvasColumnFilterField>
              </>
            }
            hasActiveFilters={Boolean(email || status)}
            activeFilterCount={
              [tableState.search, email, status].filter(Boolean).length
            }
            onResetFilters={() => {
              setStatus('')
              setEmail('')
              tableState.setSearch('')
              tableState.setSorting([{ id: 'createdAt', desc: true }])
              tableState.setPagination((current) => ({
                ...current,
                pageIndex: 0,
              }))
            }}
            getRowId={(item) => item.customerId}
          />
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
