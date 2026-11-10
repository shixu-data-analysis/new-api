/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { TFunction } from 'i18next'
import { toast } from 'sonner'

import type { CanvasRuntimeConnectionCheck } from './types'

export function connectionCheckReason(
  reasonCode: string | null,
  translate: (key: string) => string
) {
  if (reasonCode === 'PROVIDER_CHECK_REQUIRES_CHANNEL') {
    return translate('A safe provider check requires a bound provider channel')
  }
  if (reasonCode === 'STORAGE_ACCESS_DENIED') {
    return translate(
      'The storage refused access. Check the key and its permission policy.'
    )
  }
  if (reasonCode === 'STORAGE_CONNECTION_FAILED') {
    return translate('The storage connection could not be verified')
  }
  if (reasonCode === 'STORAGE_CONTENT_LOCK_NOT_ENFORCED') {
    return translate(
      'The storage accepted a file that did not match the declared content. Choose another content lock.'
    )
  }
  return reasonCode ?? translate('Connection check failed')
}

/** Shows the outcome of a storage or provider connection check. */
export function reportConnectionCheck(
  result: CanvasRuntimeConnectionCheck,
  t: TFunction
) {
  if (result.outcome === 'PASSED') {
    toast.success(t('Connection check passed'))
    return
  }
  toast.error(
    `${t('{{label}}: ', { label: t('Connection check failed') })}${connectionCheckReason(result.reasonCode, t)}`
  )
}
