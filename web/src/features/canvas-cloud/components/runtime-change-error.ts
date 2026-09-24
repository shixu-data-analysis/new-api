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

export function runtimeChangeError(
  error: unknown,
  translate: (key: string) => string,
  operation: 'credential' | 'management' | 'load'
) {
  const data = runtimeErrorData(error)
  const code = typeof data?.code === 'string' ? data.code : null
  if (code === 'PREVIEW_STALE') {
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
  return translate('Loading failed. Refresh the configuration and try again.')
}
