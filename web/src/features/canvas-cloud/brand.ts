/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

const localizedNames: Record<string, string> = {
  'zh-CN': '像素喵片场',
  'zh-TW': '像素喵片場',
  en: 'PixMiao Studio',
  ja: 'PixMiao Studio',
  fr: 'PixMiao Studio',
  ru: 'PixMiao Studio',
  vi: 'PixMiao Studio',
}

export const canvasCompactName = 'PixMiao'

const canvasProductNames = new Set([
  ...Object.values(localizedNames),
  '灵猫工坊',
  '靈貓工坊',
  'LingCat Studio',
])

export function getCanvasProductName(language: string): string {
  if (language === 'zhCN') return localizedNames['zh-CN']
  if (language === 'zhTW') return localizedNames['zh-TW']
  return (
    localizedNames[language] ??
    localizedNames[language.split('-')[0]] ??
    localizedNames.en
  )
}

export function isCanvasProductName(value: string): boolean {
  return canvasProductNames.has(value.trim())
}

export function isCanvasBrandContext(
  systemName: string,
  pathname: string,
  redirect?: string | null
): boolean {
  const normalizedSystemName = systemName.trim()
  return (
    isCanvasProductName(normalizedSystemName) ||
    normalizedSystemName === '' ||
    normalizedSystemName === 'New API' ||
    pathname.startsWith('/canvas-cloud/') ||
    redirect?.startsWith('/canvas-cloud/') === true
  )
}
