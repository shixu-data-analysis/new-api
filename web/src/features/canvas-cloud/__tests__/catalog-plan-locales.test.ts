import { describe, expect, it } from 'vitest'

import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import ja from '@/i18n/locales/ja.json'
import ru from '@/i18n/locales/ru.json'
import vi from '@/i18n/locales/vi.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

const locales = { en, fr, ja, ru, vi, 'zh-TW': zhTW, zh }

describe('the prompt reference rewrite message', () => {
  // The tokens are literal: a Task sends @图片1 whatever the language of the page, so no locale may translate them.
  it.each(Object.entries(locales))('names the Channel, the literal tokens and the two modes in %s', (_locale, resource) => {
    const message = (resource.translation as Record<string, string>)['catalog.plan.promptReferencesRewritten']
    expect(message).toContain('{{channelId}}')
    expect(message).toContain('@图片1')
    expect(message).toMatch(/(^|[^@])图片1/)
    expect(message).toContain('image-reference')
    expect(message).toContain('first-last-frame')
  })
})
