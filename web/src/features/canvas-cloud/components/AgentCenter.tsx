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
import { useMutation, useQuery } from '@tanstack/react-query'
import { Copy, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import { getCanvasAgentWorkspace, revealCanvasCode } from '../api'
import { BusinessTerm } from './BusinessTerm'

export function AgentCenter() {
  const { t } = useTranslation()
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const workspace = useQuery({
    queryKey: ['canvas-cloud', 'agent-workspace'],
    queryFn: getCanvasAgentWorkspace,
  })
  const reveal = useMutation({
    mutationFn: (input: { id: string; action: 'DISPLAY' | 'COPY' }) =>
      revealCanvasCode('agent-invite', input.id, input.action).then(
        (result) => ({ ...result, ...input })
      ),
    onSuccess: async (result) => {
      if (result.action === 'COPY') {
        await navigator.clipboard.writeText(result.code)
        toast.success(t('Invite code copied'))
        return
      }
      setRevealed((current) => ({ ...current, [result.id]: result.code }))
    },
    onError: () => toast.error(t('Invite code could not be revealed')),
  })
  if (workspace.isPending) return <LoadingState />
  if (workspace.isError) {
    return <ErrorState onRetry={() => void workspace.refetch()} />
  }
  const data = workspace.data
  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader>
          <CardTitle>{data.profile.internalName}</CardTitle>
          <CardDescription>{t('Inviter')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Badge variant='secondary'>{t('Enabled')}</Badge>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('My invite codes')}</CardTitle>
          <CardDescription>
            {t('Codes stay masked until an audited display or copy action.')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='overflow-x-auto'>
            <table className='w-full min-w-[700px] text-left text-sm'>
              <thead>
                <tr>
                  <th className='py-2'>{t('Invite code')}</th>
                  <th>{t('Status')}</th>
                  <th>{t('Used / Capacity')}</th>
                  <th>{t('Activated customers')}</th>
                  <th>{t('Expires')}</th>
                  <th>{t('Action')}</th>
                </tr>
              </thead>
              <tbody>
                {data.invites.map((invite) => (
                  <tr key={invite.id} className='border-t'>
                    <td className='py-2 font-mono'>
                      {revealed[invite.id] ?? invite.maskedCode}
                    </td>
                    <td>{t(`Invite status ${invite.status}`)}</td>
                    <td>
                      {invite.consumedCount} / {invite.maxRegistrations}
                    </td>
                    <td>{invite.activatedCustomers}</td>
                    <td>
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: 'medium',
                      }).format(new Date(invite.expiresAt))}
                    </td>
                    <td>
                      <div className='flex gap-1'>
                        <Button
                          size='sm'
                          variant='outline'
                          aria-label={t(
                            revealed[invite.id]
                              ? 'Hide invite code'
                              : 'Show invite code'
                          )}
                          aria-pressed={Boolean(revealed[invite.id])}
                          onClick={() => {
                            if (revealed[invite.id]) {
                              setRevealed((current) => {
                                const next = { ...current }
                                delete next[invite.id]
                                return next
                              })
                              return
                            }
                            reveal.mutate({ id: invite.id, action: 'DISPLAY' })
                          }}
                        >
                          {revealed[invite.id] ? <EyeOff /> : <Eye />}
                        </Button>
                        <Button
                          size='sm'
                          variant='outline'
                          aria-label={t('Copy invite code')}
                          onClick={() =>
                            reveal.mutate({ id: invite.id, action: 'COPY' })
                          }
                        >
                          <Copy />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('My customers')}</CardTitle>
          <CardDescription>
            {t('Customers activated through invite codes assigned to you.')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='overflow-x-auto'>
            <table className='w-full min-w-[680px] text-left text-sm'>
              <thead>
                <tr>
                  <th className='py-2'>{t('Customer')}</th>
                  <th>{t('New API user ID')}</th>
                  <th>{t('Email')}</th>
                  <th>{t('Status')}</th>
                  <th>{t('Activated at')}</th>
                </tr>
              </thead>
              <tbody>
                {data.customers.map((customer) => (
                  <tr key={customer.id} className='border-t'>
                    <td className='py-2'>{customer.username ?? '—'}</td>
                    <td>{customer.newApiUserId}</td>
                    <td>{customer.emailMasked ?? '—'}</td>
                    <td>
                      <BusinessTerm
                        kind='customerStatus'
                        value={customer.status}
                      />
                    </td>
                    <td>
                      {customer.activatedAt
                        ? new Intl.DateTimeFormat(undefined, {
                            dateStyle: 'medium',
                          }).format(new Date(customer.activatedAt))
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
