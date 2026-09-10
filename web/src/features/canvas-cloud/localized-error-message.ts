/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

type LocalizedError = {
  sanitizedMessage?: string | null
  messages?: Record<string, string> | null
} | null | undefined

/**
 * Select a server-sanitized failure reason without exposing an upstream error.
 * Keep the details view's established fallback order for every task surface.
 */
export function getLocalizedErrorMessage(
  error: LocalizedError,
  language: string
) {
  if (!error) return null
  if (error.sanitizedMessage?.trim()) return error.sanitizedMessage.trim()

  let normalized = language
  if (language === 'zhCN' || language === 'zh-CN') normalized = 'zh'
  if (language === 'zhTW') normalized = 'zh-TW'
  const localized = [language, normalized, 'en']
    .map((locale) => error.messages?.[locale])
    .find((message): message is string => Boolean(message?.trim()))
  if (localized) return localized.trim()
  return (
    Object.values(error.messages ?? {}).find(
      (value): value is string =>
        typeof value === 'string' && value.trim().length > 0
    ) ?? null
  )
}
