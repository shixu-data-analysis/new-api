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
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import { getCanvasAdminWorkspace } from './api'
import { BusinessTerm } from './components/BusinessTerm'

export function CanvasCustomerPointBalances() {
  const { t } = useTranslation()
  const workspace = useQuery({
    queryKey: ['canvas-cloud', 'admin-workspace'],
    queryFn: getCanvasAdminWorkspace,
  })

  const content = (() => {
    if (workspace.isPending) return <LoadingState />
    if (workspace.isError)
      return <ErrorState onRetry={() => void workspace.refetch()} />
    if (workspace.data.customers.length === 0) {
      return <EmptyState title={t('No Canvas customers')} bordered />
    }
    return (
      <div className='overflow-x-auto rounded-xl border'>
        <table className='w-full min-w-[720px] text-left text-sm'>
          <thead className='bg-muted/60 text-muted-foreground'>
            <tr>
              <th className='px-3 py-2 font-medium'>{t('Canvas customer')}</th>
              <th className='px-3 py-2 font-medium'>
                {t('New API account ID')}
              </th>
              <th className='px-3 py-2 font-medium'>
                <BusinessTerm kind='pointBalance' value='AVAILABLE' />
              </th>
              <th className='px-3 py-2 font-medium'>
                <BusinessTerm kind='pointBalance' value='PAID' />
              </th>
              <th className='px-3 py-2 font-medium'>
                <BusinessTerm kind='pointBalance' value='BONUS' />
              </th>
              <th className='px-3 py-2 font-medium'>{t('Status')}</th>
            </tr>
          </thead>
          <tbody className='divide-y'>
            {workspace.data.customers.map((customer) => (
              <tr key={customer.customerId} className='hover:bg-muted/30'>
                <td className='px-3 py-2'>
                  <div className='font-medium'>
                    {customer.username ?? t('Unnamed customer')}
                  </div>
                  {customer.emailMasked && (
                    <div className='text-muted-foreground text-xs'>
                      {customer.emailMasked}
                    </div>
                  )}
                </td>
                <td className='px-3 py-2 font-mono'>{customer.newApiUserId}</td>
                <td className='px-3 py-2 tabular-nums'>
                  {customer.availablePoints}
                </td>
                <td className='px-3 py-2 tabular-nums'>
                  {customer.paidAvailablePoints}
                </td>
                <td className='px-3 py-2 tabular-nums'>
                  {customer.bonusAvailablePoints}
                </td>
                <td className='px-3 py-2'>
                  <BusinessTerm kind='customerStatus' value={customer.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  })()

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Canvas Customers')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button
          variant='outline'
          size='sm'
          onClick={() => void workspace.refetch()}
        >
          <RefreshCw />
          {t('Refresh')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <Card>
          <CardHeader>
            <CardTitle>{t('Canvas customer point balances')}</CardTitle>
            <CardDescription>
              {t(
                'These balances come from the Canvas point ledger. Paid and bonus points remain separate and New API technical quota is not included.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>{content}</CardContent>
        </Card>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
