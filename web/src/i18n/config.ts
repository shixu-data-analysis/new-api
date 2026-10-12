/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import i18n, { type BackendModule, type ResourceKey } from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import { convertDetectedLanguage } from './languages'
import en from './locales/en.json'
import zhCN from './locales/zh.json'

// Simplified Chinese (most users) and English (the fallback) ship in the main bundle. The other languages are
// separate files loaded the first time they are used, so a first visit downloads only the language it shows.
export const resources = {
  en,
  zhCN,
} as const

type LocaleModule = { default: Record<string, ResourceKey> }

export const onDemandLanguages: Record<string, () => Promise<LocaleModule>> = {
  fr: () => import('./locales/fr.json'),
  ru: () => import('./locales/ru.json'),
  ja: () => import('./locales/ja.json'),
  vi: () => import('./locales/vi.json'),
  zhTW: () => import('./locales/zh-TW.json'),
}

// With two parameters, i18next takes the returned promise as the result of the read.
const onDemandBackend: BackendModule = {
  type: 'backend',
  init() {},
  read(language, namespace) {
    const load = onDemandLanguages[language]
    return load
      ? load().then((locale) => locale.default[namespace] ?? {})
      : Promise.resolve({})
  },
}

/** Resolves when the detected language can be shown; a failed load falls back to English. */
export const i18nReady = i18n
  .use(onDemandBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    // Languages missing from `resources` come from the backend above.
    partialBundledLanguages: true,
    fallbackLng: 'en',
    supportedLngs: ['en', 'zhCN', 'fr', 'ru', 'ja', 'vi', 'zhTW'],
    load: 'currentOnly',
    nsSeparator: false, // Allow literal colons in keys (e.g., URLs, labels)
    debug: import.meta.env.DEV,
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      // Browsers report `zh-CN`/`zh-TW`/`zh`; map them onto our `zhCN`/`zhTW`
      // codes (non-Chinese codes pass through for normal supportedLngs matching).
      convertDetectedLanguage,
    },
  })

export default i18n
