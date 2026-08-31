/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

const localizedNames: Record<string, string> = {
  'zh-CN': '灵猫工坊',
  'zh-TW': '靈貓工坊',
  en: 'LingCat Studio',
  ja: 'LingCat Studio',
  fr: 'LingCat Studio',
  ru: 'LingCat Studio',
  vi: 'LingCat Studio',
}

const canvasProductNames = new Set(Object.values(localizedNames))

export function getCanvasProductName(language: string): string {
  return (
    localizedNames[language] ??
    localizedNames[language.split('-')[0]] ??
    'LingCat Studio'
  )
}

export function isCanvasProductName(value: string): boolean {
  return canvasProductNames.has(value.trim())
}
