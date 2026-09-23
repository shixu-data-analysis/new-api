import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, RotateCcw, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { bootstrapCanvasSuperAdmin } from '@/features/canvas-cloud/api'
import { canvasSessionQueryKey } from '@/features/canvas-cloud/use-canvas-session'
import { ROLE } from '@/lib/roles'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import {
  canvasAdminProvisioningQueryKey,
  useCanvasAdminProvisioningQuery,
} from './canvas-admin-provisioning-query'

export function CanvasSuperAdminProvisioningPanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((state) => state.auth.user)
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const isRoot = currentUser?.role === ROLE.SUPER_ADMIN
  const provisioningQuery = useCanvasAdminProvisioningQuery(isRoot)

  const bootstrapMutation = useMutation({
    mutationFn: bootstrapCanvasSuperAdmin,
    onSuccess: async () => {
      setConfirmationOpen(false)
      toast.success(t('Canvas super administrator initialized successfully'))
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: canvasAdminProvisioningQueryKey,
        }),
        queryClient.invalidateQueries({ queryKey: canvasSessionQueryKey }),
      ])
    },
    onError: () => {
      toast.error(t('Failed to initialize the Canvas super administrator'))
    },
  })

  if (!isRoot) return null

  if (provisioningQuery.isPending) {
    return (
      <ProvisioningPanelShell aria-label={t('Canvas administrator access')}>
        <LoaderCircle
          className='text-muted-foreground size-5 shrink-0 animate-spin'
          aria-hidden='true'
        />
        <p className='text-muted-foreground text-sm' role='status'>
          {t('Loading Canvas administrator status...')}
        </p>
      </ProvisioningPanelShell>
    )
  }

  if (provisioningQuery.isError || !provisioningQuery.data) {
    return (
      <ProvisioningPanelShell aria-label={t('Canvas administrator access')}>
        <ShieldAlert
          className='text-destructive size-5 shrink-0'
          aria-hidden='true'
        />
        <div className='min-w-0 flex-1'>
          <p className='text-sm font-medium'>
            {t('Failed to load Canvas administrator status. Retry')}
          </p>
        </div>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() => provisioningQuery.refetch()}
        >
          <RotateCcw aria-hidden='true' />
          {t('Retry')}
        </Button>
      </ProvisioningPanelShell>
    )
  }

  const status = provisioningQuery.data.status
  const isCurrentRoot =
    status.currentRootExternalId === status.superAdminExternalId

  if (status.bootstrapStatus === 'CONFLICT') {
    return (
      <ProvisioningPanelShell
        aria-label={t('Canvas administrator access')}
        className='border-destructive/40'
      >
        <ShieldAlert
          className='text-destructive size-5 shrink-0'
          aria-hidden='true'
        />
        <div className='min-w-0 flex-1'>
          <p className='text-destructive text-sm font-medium'>
            {t('Canvas super administrator initialization conflict')}
          </p>
          <p className='text-muted-foreground mt-0.5 text-xs'>
            {t(
              'Resolve the Canvas super administrator conflict before granting platform administrator access'
            )}
          </p>
        </div>
      </ProvisioningPanelShell>
    )
  }

  if (status.bootstrapStatus === 'COMPLETE') {
    return (
      <ProvisioningPanelShell
        aria-label={t('Canvas administrator access')}
        className='border-emerald-500/35 bg-emerald-500/5'
      >
        <ShieldCheck
          className='size-5 shrink-0 text-emerald-600 dark:text-emerald-400'
          aria-hidden='true'
        />
        <p className='min-w-0 flex-1 text-sm font-medium'>
          {isCurrentRoot
            ? t('Canvas super administrator initialized')
            : t('Canvas super administrator initialized by another root user')}
        </p>
      </ProvisioningPanelShell>
    )
  }

  const actionLabel = t('Initialize Canvas super administrator once')

  return (
    <>
      <ProvisioningPanelShell
        aria-label={t('Canvas administrator access')}
        className='border-primary/35 bg-primary/5'
      >
        <ShieldAlert
          className='text-primary size-5 shrink-0'
          aria-hidden='true'
        />
        <div className='min-w-0 flex-1'>
          <p className='text-sm font-medium'>{actionLabel}</p>
          <p className='text-muted-foreground mt-0.5 text-xs'>
            {t(
              'This one-time action grants your current root account full Canvas administration access. Confirm only if this is the intended account.'
            )}
          </p>
        </div>
        <Button
          type='button'
          size='sm'
          disabled={bootstrapMutation.isPending}
          onClick={() => setConfirmationOpen(true)}
        >
          {actionLabel}
        </Button>
      </ProvisioningPanelShell>

      <ConfirmDialog
        open={confirmationOpen}
        onOpenChange={setConfirmationOpen}
        title={actionLabel}
        desc={t(
          'This one-time action grants your current root account full Canvas administration access. Confirm only if this is the intended account.'
        )}
        confirmText={
          bootstrapMutation.isPending ? t('Processing...') : actionLabel
        }
        destructive
        isLoading={bootstrapMutation.isPending}
        handleConfirm={() => bootstrapMutation.mutate()}
      />
    </>
  )
}

function ProvisioningPanelShell(
  props: React.ComponentPropsWithoutRef<'section'>
) {
  return (
    <section
      {...props}
      className={cn(
        'bg-card flex shrink-0 flex-col items-start gap-2 rounded-lg border px-3 py-2.5 sm:flex-row sm:items-center',
        props.className
      )}
    />
  )
}
