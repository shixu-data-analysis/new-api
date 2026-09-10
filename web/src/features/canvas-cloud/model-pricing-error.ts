/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import {
  getServerErrorCode,
  getServerErrorStatus,
} from '@/lib/server-error-message'

export function pricingLoadErrorTitle(
  error: unknown,
  t: (key: string) => string
): string {
  const status = getServerErrorStatus(error)
  if (status === 401 || status === 403) {
    return t('You are not allowed to view this model pricing.')
  }
  if (status === 404) return t('The requested model was not found or is unavailable.')
  if (status === 409 && getServerErrorCode(error) === 'CONFLICT') {
    return t('This pricing publication does not belong to the selected model.')
  }
  if (status !== null && status >= 500) {
    return t('The pricing service is temporarily unavailable. Please try again.')
  }
  return t('Model pricing could not be loaded')
}

export function pricingPublicationErrorTitle(
  error: unknown,
  t: (key: string) => string
): string {
  if (getServerErrorStatus(error) === 404) {
    return t('The requested pricing publication is unavailable for this model.')
  }
  return pricingLoadErrorTitle(error, t)
}
