/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
export function runtimeChangeError(
  error: unknown,
  translate: (key: string) => string,
  operation: 'credential' | 'binding' | 'preview'
) {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'data' in error.response &&
    typeof error.response.data === 'object' &&
    error.response.data !== null &&
    'code' in error.response.data &&
    typeof error.response.data.code === 'string'
      ? error.response.data.code
      : null
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
  if (operation === 'credential') {
    return translate(
      'Credential publication failed. Check the required schemes and preview again.'
    )
  }
  if (operation === 'binding') {
    return translate(
      'Model binding failed. Refresh the model list and preview the selection again.'
    )
  }
  return translate('Preview failed. Refresh the configuration and try again.')
}
