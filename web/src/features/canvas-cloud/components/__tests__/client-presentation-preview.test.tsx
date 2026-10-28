/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { PresentationSnapshot } from '../../lib/client-presentation-draft'
import { ClientPresentationPreview } from '../ClientPresentationPreview'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
}))

// One text model that customers cannot see yet (no published price), filed under a category.
function hiddenTextModel(): PresentationSnapshot {
  const byType = <T,>(value: () => T) => ({
    'image.generate': value(),
    'video.generate': value(),
    'chat.generate': value(),
  })
  return {
    models: {
      deepseek: {
        modelKey: 'deepseek',
        capability: 'chat.generate',
        providerName: 'WhatsToken',
        tagIds: ['tag-deepseek'],
        customerVisible: false,
        displayName: 'WT-DeepSeek',
        description: '',
        iconKey: null,
        iconColor: 'gray',
        badgeIds: [],
      },
    },
    orders: { ...byType(() => []), 'chat.generate': ['deepseek'] },
    badges: [],
    categories: [
      {
        id: 'tag-deepseek',
        name: 'DeepSeek',
        iconKey: null,
        iconColor: 'gray',
        description: '',
      },
    ],
    categoryOrders: { ...byType(() => []), 'chat.generate': ['tag-deepseek'] },
    categoryDefaults: byType(() => ({})),
  } as unknown as PresentationSnapshot
}

describe('Client presentation preview', () => {
  it.each(['models', 'categories'] as const)(
    'shows a type without customer-visible models like the canvas: a message, "No category" and no menu (%s)',
    (mode) => {
      render(
        <ClientPresentationPreview
          mode={mode}
          snapshot={hiddenTextModel()}
          capability='chat.generate'
          keys={['deepseek']}
          selected={null}
          onSelect={() => {}}
        />
      )
      expect(
        screen.getByText('No models of this type are visible to customers')
      ).toBeVisible()
      const button = screen.getByRole('button', { name: /No category/u })
      expect(button).toBeDisabled()
      expect(screen.queryByText('(No name)')).toBeNull()
      fireEvent.click(button)
      expect(screen.queryAllByRole('menu')).toHaveLength(
        mode === 'categories' ? 1 : 0
      )
    }
  )
})
