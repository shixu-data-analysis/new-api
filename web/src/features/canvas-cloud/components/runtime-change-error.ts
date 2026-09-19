/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
function runtimeErrorData(error: unknown): Record<string, unknown> | null {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return null
  }
  const response = error.response
  if (
    typeof response !== 'object' ||
    response === null ||
    !('data' in response)
  ) {
    return null
  }
  const data = response.data
  return typeof data === 'object' && data !== null
    ? (data as Record<string, unknown>)
    : null
}

export function isHistoricalBindingConflict(error: unknown): boolean {
  const data = runtimeErrorData(error)
  if (data?.code !== 'PREVIEW_STALE') return false
  const details = data.details
  return (
    typeof details === 'object' &&
    details !== null &&
    'reason' in details &&
    details.reason === 'historicalBinding'
  )
}

export interface HistoricalBindingGroup {
  id: string
  name: string
}

export function historicalBindingGroups(
  error: unknown
): HistoricalBindingGroup[] {
  if (!isHistoricalBindingConflict(error)) return []
  const details = runtimeErrorData(error)?.details
  if (
    typeof details !== 'object' ||
    details === null ||
    !('historicalGroups' in details)
  ) {
    return []
  }
  const groups = details.historicalGroups
  if (!Array.isArray(groups)) return []
  return groups.filter(
    (group): group is HistoricalBindingGroup =>
      typeof group === 'object' &&
      group !== null &&
      typeof group.id === 'string' &&
      group.id.length > 0 &&
      typeof group.name === 'string' &&
      group.name.length > 0
  )
}

export function runtimeChangeError(
  error: unknown,
  translate: (key: string) => string,
  operation: 'credential' | 'management' | 'binding' | 'preview'
) {
  const data = runtimeErrorData(error)
  const code = typeof data?.code === 'string' ? data.code : null
  if (code === 'PREVIEW_STALE') {
    if (isHistoricalBindingConflict(error)) {
      return translate(
        'An older model binding is still active. Open API Key group management and retire it before binding the current version.'
      )
    }
    return translate('Configuration changed. Preview again before confirming.')
  }
  if (code === 'CREDENTIAL_GROUP_VERSION_STALE') {
    return translate(
      'The credential version changed. Refresh and select the current version.'
    )
  }
  if (code === 'MODEL_PROVIDER_MISMATCH') {
    return translate(
      'Some selected models no longer belong to this provider. Review the filters and selection.'
    )
  }
  if (code === 'CREDENTIAL_SCHEME_MISMATCH') {
    return translate(
      'The credential scheme no longer matches every selected model. Update the credential group or selection.'
    )
  }
  if (code === 'NOT_FOUND') {
    return translate(
      'The configuration no longer exists. Refresh and try again.'
    )
  }
  if (code === 'CREDENTIAL_GROUP_HAS_BINDINGS') {
    return translate(
      'Remove all model bindings before archiving this API Key group.'
    )
  }
  if (code === 'CREDENTIAL_GROUP_ACTIVE') {
    return translate('This API Key group is already active.')
  }
  if (code === 'CREDENTIAL_GROUP_ARCHIVED') {
    return translate(
      'This API Key group is archived. Restore it before publishing changes.'
    )
  }
  if (code === 'NO_CHANGES') {
    return translate('There are no API Key group changes to publish.')
  }
  if (code === 'IDEMPOTENCY_CONFLICT') {
    return translate(
      'Another publication used this request identity. Retry from the current configuration.'
    )
  }
  if (operation === 'credential' || operation === 'management') {
    return translate('API Key group publication failed. Retry.')
  }
  if (operation === 'binding') {
    return translate('Model binding publication failed. Retry.')
  }
  return translate('Preview failed. Refresh the configuration and try again.')
}
