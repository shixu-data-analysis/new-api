/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { toIntlLocale } from '@/i18n/languages'

export function formatMonitoringPercent(
  value: number | null,
  language: string,
  t: (key: string) => string
) {
  if (value === null) return t('No data')
  return new Intl.NumberFormat(toIntlLocale(language), {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value)
}
export function formatMonitoringDateTime(value: string, language: string) {
  return new Intl.DateTimeFormat(toIntlLocale(language), {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value))
}
