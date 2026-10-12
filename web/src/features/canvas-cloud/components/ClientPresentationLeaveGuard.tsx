/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useBlocker } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'

/**
 * Asks before leaving model management with an unpublished draft. Switching tabs inside
 * the page keeps the draft, so only a different path or a page reload is blocked.
 */
export function ClientPresentationLeaveGuard(props: { when: boolean }) {
  const { t } = useTranslation()
  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) =>
      props.when && current.pathname !== next.pathname,
    enableBeforeUnload: () => props.when,
    withResolver: true,
  })
  return (
    <ConfirmDialog
      open={blocker.status === 'blocked'}
      title={t('Unsaved changes')}
      desc={t(
        'You have unpublished client presentation changes. Leave and discard them?'
      )}
      confirmText={t('Leave')}
      cancelBtnText={t('Stay')}
      destructive
      handleConfirm={() => blocker.proceed?.()}
      onOpenChange={(open) => {
        if (!open) blocker.reset?.()
      }}
    />
  )
}
