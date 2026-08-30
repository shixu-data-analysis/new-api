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
import { useState } from 'react'
import { useForm } from 'react-hook-form'
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

import { getCanvasAgents, provisionCanvasAgent } from '../api'
import { PricingActionConfirmation } from './PricingActionConfirmation'

interface AgentFormValues {
  newApiUserId: string
  internalName: string
  reason: string
}

function agentCreationFailureCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const data = (error as { response?: { data?: unknown } }).response?.data
  if (!data || typeof data !== 'object') return null
  const code = (data as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

export function AgentManagement() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const form = useForm<AgentFormValues>({
    defaultValues: {
      newApiUserId: '',
      internalName: '',
      reason: '',
    },
  })
  const values = form.watch()
  const [confirming, setConfirming] = useState(false)
  const agents = useQuery({
    queryKey: ['canvas-cloud', 'agents'],
    queryFn: getCanvasAgents,
  })
  const create = useMutation({
    mutationFn: () =>
      provisionCanvasAgent({
        newApiUserId: form.getValues('newApiUserId'),
        internalName: form.getValues('internalName').trim(),
        status: 'ACTIVE',
        reason: form.getValues('reason').trim(),
      }),
    onSuccess: async () => {
      setConfirming(false)
      form.reset()
      toast.success(t('Invitation ability enabled'))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['canvas-cloud', 'agents'] }),
        queryClient.invalidateQueries({
          queryKey: ['canvas-cloud', 'invite-code-options'],
        }),
      ])
    },
    onError: (error) => {
      const reason = (() => {
        switch (agentCreationFailureCode(error)) {
          case 'INVITER_CAPABILITY_ALREADY_GRANTED':
            return t('This customer already has invitation ability.')
          case 'CUSTOMER_REQUIRED':
            return t(
              'Only an active Canvas customer can receive invitation ability.'
            )
          case 'VALIDATION_FAILED':
            return t(
              'Only an existing, enabled common New API user can become an inviter. Administrators and root users are not eligible.'
            )
          case 'NOT_FOUND':
            return t(
              'The selected New API user no longer exists. Refresh the page and check the user ID.'
            )
          case 'IDENTITY_PROVIDER_UNAVAILABLE':
            return t(
              'New API could not verify this user right now. Confirm the user ID exists, then try again later.'
            )
          case 'UNAUTHORIZED':
            return t(
              'Your administrator session is no longer authorized. Refresh the page and sign in again.'
            )
          case 'IDEMPOTENCY_CONFLICT':
            return t(
              'This creation request conflicts with an earlier attempt. Refresh the page before trying again.'
            )
          default:
            return t(
              'The request could not be completed. Refresh the page and try again.'
            )
        }
      })()
      toast.error(t('Invitation ability could not be enabled'), {
        description: reason,
      })
    },
  })
  if (agents.isPending) return <LoadingState />
  if (agents.isError) {
    return (
      <ErrorState
        onRetry={() => {
          void agents.refetch()
        }}
      />
    )
  }
  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader>
          <CardTitle>{t('Enable invitation ability')}</CardTitle>
          <CardDescription>
            {t(
              'Add invitation ability to an existing Canvas customer without removing customer access.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              noValidate
              className='grid items-start gap-3 md:grid-cols-[minmax(10rem,0.7fr)_minmax(12rem,1fr)_minmax(14rem,1.2fr)_auto]'
              onSubmit={form.handleSubmit(
                () => setConfirming(true),
                () => toast.error(t('Please fix the highlighted fields'))
              )}
            >
              <FormField
                control={form.control}
                name='newApiUserId'
                rules={{
                  required: t('Enter a New API user ID'),
                  pattern: {
                    value: /^[1-9]\d*$/,
                    message: t('New API user ID must be a positive integer'),
                  },
                }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('New API user ID')}</FormLabel>
                    <FormControl>
                      <Input {...field} inputMode='numeric' />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Use the New API user ID of an existing active Canvas customer.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='reason'
                rules={{
                  validate: (value) =>
                    value.trim().length > 0 || t('Enter an approval reason'),
                  maxLength: {
                    value: 500,
                    message: t('Reason must not exceed 500 characters'),
                  },
                }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Approval reason')}</FormLabel>
                    <FormControl>
                      <Input {...field} maxLength={500} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='internalName'
                rules={{
                  validate: (value) =>
                    value.trim().length > 0 || t('Enter an inviter name'),
                  maxLength: {
                    value: 128,
                    message: t('Inviter name must not exceed 128 characters'),
                  },
                }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Inviter name')}</FormLabel>
                    <FormControl>
                      <Input {...field} maxLength={128} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                className='mt-0 w-full md:mt-7 md:w-auto'
                type='submit'
                disabled={create.isPending}
              >
                {t('Enable invitation ability')}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      <div className='overflow-x-auto rounded-xl border'>
        <table className='w-full min-w-[560px] text-left text-sm'>
          <thead className='bg-muted/60'>
            <tr>
              <th className='px-3 py-2'>{t('Inviter')}</th>
              <th className='px-3 py-2'>{t('New API user ID')}</th>
              <th className='px-3 py-2'>{t('Status')}</th>
            </tr>
          </thead>
          <tbody className='divide-y'>
            {agents.data.map((agent) => (
              <tr key={agent.principalId}>
                <td className='px-3 py-2'>{agent.internalName}</td>
                <td className='px-3 py-2'>{agent.newApiUserId}</td>
                <td className='px-3 py-2'>
                  <Badge
                    variant={
                      agent.status === 'ACTIVE' ? 'secondary' : 'outline'
                    }
                  >
                    {t(agent.status === 'ACTIVE' ? 'Enabled' : 'Disabled')}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PricingActionConfirmation
        open={confirming}
        title={t('Enable invitation ability for this customer?')}
        description={t(
          'The customer keeps all customer pages, wallet, points, recharge, models, and tasks. The inviter center appears only after this confirmed grant.'
        )}
        confirmLabel={t('Confirm creation')}
        pending={create.isPending}
        details={[
          { label: t('New API user ID'), value: values.newApiUserId },
          { label: t('Inviter name'), value: values.internalName.trim() },
          { label: t('Approval reason'), value: values.reason.trim() },
        ]}
        onOpenChange={setConfirming}
        onConfirm={() => create.mutate()}
      />
    </div>
  )
}
