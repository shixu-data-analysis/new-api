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
import { Copy, Plus, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import {
  getCanvasAdminRechargeCodes,
  issueCanvasAdminRechargeCodes,
} from './api'
import { BusinessTerm } from './components/BusinessTerm'
import { cnyToMinor } from './recharge-code-amount'
import type { CanvasIssuedRechargeCodes } from './types'

function formatCny(value: string): string {
  const minor = BigInt(value)
  return `¥${minor / 100n}.${(minor % 100n).toString().padStart(2, '0')}`
}

function formatDate(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : '—'
}

export function CanvasRechargeCodes() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('10')
  const [count, setCount] = useState('1')
  const [issued, setIssued] = useState<CanvasIssuedRechargeCodes | null>(null)
  const inventory = useQuery({
    queryKey: ['canvas-cloud', 'admin-recharge-codes'],
    queryFn: getCanvasAdminRechargeCodes,
  })
  const issue = useMutation({
    mutationFn: issueCanvasAdminRechargeCodes,
    onSuccess: async (result) => {
      setIssued(result)
      toast.success(t('Canvas recharge codes created'))
      await queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'admin-recharge-codes'],
      })
    },
  })
  const amountMinor = cnyToMinor(amount)
  const parsedCount = Number(count)
  const validCount =
    Number.isInteger(parsedCount) && parsedCount >= 1 && parsedCount <= 100
  const canSubmit =
    name.trim().length >= 1 &&
    name.trim().length <= 20 &&
    amountMinor !== null &&
    validCount &&
    !issue.isPending

  const copyCodes = async () => {
    if (!issued?.codes.length) return
    await navigator.clipboard.writeText(
      issued.codes.map((item) => item.code).join('\n')
    )
    toast.success(t('Recharge codes copied'))
  }

  const submit = () => {
    if (amountMinor === null || !validCount) return
    issue.mutate({ name: name.trim(), amountMinor, count: parsedCount })
  }

  const renderInventory = () => {
    if (inventory.isPending) return <LoadingState />
    if (inventory.isError) {
      return <ErrorState onRetry={() => void inventory.refetch()} />
    }
    if (inventory.data.length === 0) {
      return <EmptyState title={t('No Canvas recharge codes')} bordered />
    }
    return (
      <div className='overflow-x-auto rounded-xl border'>
        <table className='w-full min-w-[760px] text-left text-sm'>
          <thead className='bg-muted/60 text-muted-foreground'>
            <tr>
              {[
                t('Name'),
                t('Code'),
                t('Status'),
                t('Amount'),
                t('Points'),
                t('Created'),
                t('Expires'),
                t('Redeemed'),
              ].map((header) => (
                <th key={header} className='px-3 py-2 font-medium'>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className='divide-y'>
            {inventory.data.map((item) => (
              <tr key={item.id} className='hover:bg-muted/30'>
                <td className='px-3 py-2'>{item.name}</td>
                <td className='px-3 py-2 font-mono'>{item.maskedCode}</td>
                <td className='px-3 py-2'>
                  <BusinessTerm kind='rechargeCodeStatus' value={item.status} />
                </td>
                <td className='px-3 py-2'>{formatCny(item.amountMinor)}</td>
                <td className='px-3 py-2'>{item.points}</td>
                <td className='px-3 py-2'>{formatDate(item.createdAt)}</td>
                <td className='px-3 py-2'>{formatDate(item.expiresAt)}</td>
                <td className='px-3 py-2'>{formatDate(item.redeemedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('Canvas Recharge Codes')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button
          variant='outline'
          size='sm'
          onClick={() => void inventory.refetch()}
        >
          <RefreshCw />
          {t('Refresh')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='space-y-4'>
          <Card>
            <CardHeader>
              <CardTitle>{t('Create Canvas recharge codes')}</CardTitle>
              <CardDescription>
                {t(
                  'Create one-time CNY codes for the configured store. Customers redeem these exact codes on the Canvas recharge page.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className='grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem_auto] md:items-end'>
              <div className='space-y-1.5'>
                <Label htmlFor='canvas-code-name'>{t('Name')}</Label>
                <Input
                  id='canvas-code-name'
                  maxLength={20}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t('Enter recharge code name')}
                />
              </div>
              <div className='space-y-1.5'>
                <Label htmlFor='canvas-code-amount'>{t('Amount (CNY)')}</Label>
                <Input
                  id='canvas-code-amount'
                  inputMode='decimal'
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
                <p className='text-muted-foreground text-xs'>
                  {t(
                    '1 CNY equals 50 Canvas Points; the amount must produce whole points.'
                  )}
                </p>
              </div>
              <div className='space-y-1.5'>
                <Label htmlFor='canvas-code-count'>{t('Quantity')}</Label>
                <Input
                  id='canvas-code-count'
                  inputMode='numeric'
                  value={count}
                  onChange={(event) => setCount(event.target.value)}
                />
              </div>
              <Button disabled={!canSubmit} onClick={submit}>
                <Plus />
                {t('Create codes')}
              </Button>
            </CardContent>
          </Card>

          {issued?.created && issued.codes.length > 0 && (
            <Card className='border-amber-500/50'>
              <CardHeader>
                <CardTitle>{t('Copy these codes now')}</CardTitle>
                <CardDescription>
                  {t(
                    'Plaintext codes are shown only once and are not stored. Save them before leaving this page.'
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-3'>
                <pre className='bg-muted max-h-72 overflow-auto rounded-lg p-3 font-mono text-sm'>
                  {issued.codes.map((item) => item.code).join('\n')}
                </pre>
                <Button variant='outline' onClick={() => void copyCodes()}>
                  <Copy />
                  {t('Copy all codes')}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t('Canvas recharge code inventory')}</CardTitle>
              <CardDescription>
                {t(
                  'External shop payments are not recorded until a future shop integration is implemented.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>{renderInventory()}</CardContent>
          </Card>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
