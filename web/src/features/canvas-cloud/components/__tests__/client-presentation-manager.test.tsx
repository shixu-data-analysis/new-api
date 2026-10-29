/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  CanvasClientPresentation,
  CanvasClientPresentationModel,
} from '../../types'
import { ClientPresentationManager } from '../ClientPresentationManager'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  publish: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('../../api', () => ({
  getCanvasClientPresentation: mocks.get,
  publishCanvasClientPresentation: mocks.publish,
}))
vi.mock('@tanstack/react-router', () => ({
  useBlocker: () => ({ status: 'idle' }),
}))
vi.mock('sonner', () => ({ toast: mocks.toast }))

function model(
  overrides: Partial<CanvasClientPresentationModel>
): CanvasClientPresentationModel {
  return {
    modelKey: 'image.a',
    capability: 'image.generate',
    providerName: 'DK relay',
    displayName: 'Alpha',
    description: 'Alpha description',
    tags: [],
    customerVisible: true,
    iconKey: null,
    iconColor: null,
    badgeIds: [],
    position: 1,
    ...overrides,
  }
}

function presentation(revision = 3): CanvasClientPresentation {
  return {
    revision,
    badges: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Official',
        color: 'green',
      },
      { id: '22222222-2222-4222-8222-222222222222', name: 'Hot', color: 'red' },
      {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'New',
        color: 'blue',
      },
    ],
    models: [
      model({
        modelKey: 'image.a',
        displayName: 'Alpha',
        iconKey: 'openai',
        iconColor: 'green',
      }),
      model({ modelKey: 'image.gpt', displayName: 'GPT Image', position: 2 }),
      model({
        modelKey: 'image.hidden',
        displayName: 'Hidden one',
        customerVisible: false,
        position: null,
      }),
      model({
        modelKey: 'video.a',
        capability: 'video.generate',
        displayName: 'Veo',
      }),
    ],
    categories: [],
    categoryOrders: [],
    categoryDefaults: [],
    iconVisibility: { categories: true, models: true },
  }
}

function renderManager(initialModelKey?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const element = (modelKey?: string) => (
    <QueryClientProvider client={client}>
      <ClientPresentationManager initialModelKey={modelKey} />
    </QueryClientProvider>
  )
  const result = render(element(initialModelKey))
  // The model list jump changes initialModelKey of the mounted page.
  return {
    ...result,
    openModel: (modelKey: string) => result.rerender(element(modelKey)),
  }
}

async function showHiddenModelsOnly(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('combobox', { name: 'Customer display' }))
  await user.click(
    await screen.findByRole('option', { name: 'Hidden from customers' })
  )
  expect(rowNames()).toEqual(['image.hidden'])
}

const list = () => screen.getAllByRole('list')[0] as HTMLElement
const rowNames = () =>
  within(list())
    .getAllByRole('listitem')
    .map((item) => item.getAttribute('data-model-key'))

describe('Client presentation manager', () => {
  beforeEach(() => {
    mocks.get.mockReset()
    mocks.publish.mockReset()
    mocks.toast.success.mockReset()
    mocks.toast.error.mockReset()
    mocks.get.mockResolvedValue(presentation())
  })

  it('lists one generation type with positions, unsorted and hidden markers, and keeps hidden models out of the preview', async () => {
    renderManager()

    expect(
      await screen.findByRole('button', { name: 'Image 3' })
    ).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Video 1' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    expect(screen.queryByRole('button', { name: /^Chat/ })).toBeNull()
    expect(rowNames()).toEqual(['image.a', 'image.gpt', 'image.hidden'])
    const hidden = within(list()).getAllByRole('listitem')[2] as HTMLElement
    expect(within(hidden).getByText('Unsorted')).toBeVisible()
    expect(within(hidden).getByText('Hidden from customers')).toBeVisible()
    const preview = screen.getByRole('complementary', {
      name: 'Client preview',
    })
    expect(within(preview).queryByText('Hidden one')).toBeNull()
    expect(within(preview).getByText('GPT Image')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('All published')
  })

  it('reorders with the move buttons and publishes only the changed order', async () => {
    mocks.publish.mockResolvedValue({
      id: 'p1',
      revision: 4,
      effectiveAt: '2026-10-12T00:00:00.000Z',
    })
    renderManager()
    await screen.findByRole('button', { name: 'Image 3' })

    expect(screen.getByRole('button', { name: 'Move Alpha up' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Move GPT Image up' }))
    expect(rowNames()).toEqual(['image.gpt', 'image.a', 'image.hidden'])
    expect(screen.getByRole('status')).toHaveTextContent(
      'Unpublished: Image order'
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save and publish' }))

    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1))
    expect(mocks.publish).toHaveBeenCalledWith({
      body: {
        expectedRevision: 3,
        models: [],
        orders: [
          {
            capability: 'image.generate',
            modelKeys: ['image.gpt', 'image.a', 'image.hidden'],
          },
        ],
        badges: { created: [], updated: [], deletedIds: [] },
        categories: { created: [], updated: [], deletedIds: [] },
        categoryOrders: [],
        categoryDefaults: [],
      },
      idempotencyKey: expect.stringMatching(/^web-client-presentation-/u),
    })
    await waitFor(() =>
      expect(mocks.toast.success).toHaveBeenCalledWith(
        'Changes to Image order are published. Customers see them after reopening the canvas or reloading the page.'
      )
    )
  })

  it('filters by customer visibility and selects only the filtered models', async () => {
    const user = userEvent.setup()
    renderManager()
    await screen.findByRole('button', { name: 'Image 3' })

    await user.click(screen.getByRole('combobox', { name: 'Customer display' }))
    await user.click(
      await screen.findByRole('option', { name: 'Hidden from customers' })
    )

    expect(rowNames()).toEqual(['image.hidden'])
    expect(
      screen.getByText('1 found. Numbers are positions among all models')
    ).toBeVisible()
    expect(
      screen.getByRole('checkbox', { name: 'Select all 1 results' })
    ).toBeVisible()

    await user.click(screen.getByRole('combobox', { name: 'Customer display' }))
    await user.click(
      await screen.findByRole('option', { name: 'Visible to customers' })
    )
    expect(rowNames()).toEqual(['image.a', 'image.gpt'])
  })

  it('clears the filter that hides a model picked in the preview and opens its editor', async () => {
    const user = userEvent.setup()
    renderManager()
    await screen.findByRole('button', { name: 'Image 3' })
    await showHiddenModelsOnly(user)

    const preview = screen.getByRole('complementary', {
      name: 'Client preview',
    })
    await user.click(within(preview).getByText('GPT Image'))

    expect(rowNames()).toEqual(['image.a', 'image.gpt', 'image.hidden'])
    expect(screen.getByDisplayValue('GPT Image')).toBeVisible()
  })

  it('clears the filter that hides a model opened from the model list and focuses its name', async () => {
    const user = userEvent.setup()
    const { openModel } = renderManager()
    await screen.findByRole('button', { name: 'Image 3' })
    await showHiddenModelsOnly(user)

    openModel('image.gpt')

    await waitFor(() =>
      expect(screen.getByDisplayValue('GPT Image')).toHaveFocus()
    )
    expect(rowNames()).toEqual(['image.a', 'image.gpt', 'image.hidden'])
  })

  it('moves the checked models together to a position from the batch bar, even while searching', async () => {
    const user = userEvent.setup()
    renderManager()
    await screen.findByRole('button', { name: 'Image 3' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Search models' }), {
      target: { value: 'hidden' },
    })
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Select all 1 results' })
    )

    await user.click(screen.getByRole('button', { name: 'Move to…' }))
    await user.type(
      await screen.findByRole('spinbutton', {
        name: 'Target position (1 to 3)',
      }),
      '1'
    )
    await user.click(screen.getByRole('button', { name: 'Move' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Search models' }), {
      target: { value: '' },
    })

    expect(rowNames()).toEqual(['image.hidden', 'image.a', 'image.gpt'])
    expect(mocks.toast.success).toHaveBeenCalledWith(
      'Moved 1 models to position 1. Not published yet.'
    )
  })

  it('limits the batch target so the entered position is where the first moved model lands', async () => {
    const user = userEvent.setup()
    renderManager()
    await screen.findByRole('button', { name: 'Image 3' })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alpha' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select GPT Image' }))

    await user.click(screen.getByRole('button', { name: 'Move to…' }))
    const input = await screen.findByRole('spinbutton', {
      name: 'Target position (1 to 2)',
    })
    await user.type(input, '3')
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled()
    await user.clear(input)
    await user.type(input, '2')
    await user.click(screen.getByRole('button', { name: 'Move' }))

    expect(rowNames()).toEqual(['image.hidden', 'image.a', 'image.gpt'])
    expect(mocks.toast.success).toHaveBeenCalledWith(
      'Moved 2 models to position 2. Not published yet.'
    )
  })

  it('moves one model by typing its new position into the row number', async () => {
    renderManager()
    await screen.findByRole('button', { name: 'Image 3' })

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Change the position of Alpha, now 1',
      })
    )
    const input = screen.getByRole('spinbutton', {
      name: 'Position of Alpha (1 to 3)',
    })
    fireEvent.change(input, { target: { value: '3' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(rowNames()).toEqual(['image.gpt', 'image.hidden', 'image.a'])
    expect(screen.getByRole('status')).toHaveTextContent(
      'Unpublished: Image order'
    )
  })

  it('filters by name or modelKey and moves up over models hidden by the search', async () => {
    renderManager()
    await screen.findByRole('button', { name: 'Image 3' })

    fireEvent.change(screen.getByRole('textbox', { name: 'Search models' }), {
      target: { value: 'h' },
    })
    expect(rowNames()).toEqual(['image.a', 'image.hidden'])
    expect(
      screen.getByText('2 found. Numbers are positions among all models')
    ).toBeVisible()
    expect(
      screen.getByRole('button', {
        name: 'Change the position of Hidden one, now 3',
      })
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Move Alpha up' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Move Hidden one up' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Search models' }), {
      target: { value: '' },
    })

    expect(rowNames()).toEqual(['image.hidden', 'image.a', 'image.gpt'])
  })

  it('keeps the draft and offers a reload after another administrator published first', async () => {
    mocks.publish.mockRejectedValue({
      response: {
        status: 409,
        data: { code: 'CLIENT_PRESENTATION_REVISION_CONFLICT' },
      },
    })
    renderManager('image.gpt')
    const name = await screen.findByLabelText('Client display name *')
    fireEvent.change(name, { target: { value: 'GPT Image Pro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and publish' }))

    expect(
      await screen.findByText(
        'Content was changed by someone else; your changes are not published'
      )
    ).toBeVisible()
    expect(screen.getByLabelText('Client display name *')).toHaveValue(
      'GPT Image Pro'
    )
    expect(
      screen.getByRole('button', { name: 'Save and publish' })
    ).toBeDisabled()

    mocks.get.mockResolvedValue({
      ...presentation(5),
      models: presentation(5).models.map((item) =>
        item.modelKey === 'image.gpt'
          ? { ...item, displayName: 'Changed elsewhere' }
          : item
      ),
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload (discard my changes)' })
    )

    expect(await screen.findByDisplayValue('Changed elsewhere')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('All published')
  })

  it('ignores draft edits while a publication is in flight and then shows the published state', async () => {
    let finish: (value: unknown) => void = () => {}
    mocks.publish.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    renderManager('image.gpt')
    const name = await screen.findByLabelText('Client display name *')
    fireEvent.change(name, { target: { value: 'GPT Image Pro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and publish' }))

    fireEvent.change(screen.getByLabelText('Client display name *'), {
      target: { value: 'Typed while publishing' },
    })
    expect(screen.getByLabelText('Client display name *')).toHaveValue(
      'GPT Image Pro'
    )
    expect(
      screen.getByRole('button', { name: 'Discard changes' })
    ).toBeDisabled()

    mocks.get.mockResolvedValue({
      ...presentation(4),
      models: presentation(4).models.map((item) =>
        item.modelKey === 'image.gpt'
          ? { ...item, displayName: 'GPT Image Pro' }
          : item
      ),
    })
    finish({ id: 'p1', revision: 4, effectiveAt: '2026-10-12T00:00:00.000Z' })
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('All published')
    )
    expect(screen.getByLabelText('Client display name *')).toHaveValue(
      'GPT Image Pro'
    )
  })

  it('keeps the draft and the conflict when reloading the latest content fails', async () => {
    mocks.publish.mockRejectedValue({
      response: {
        status: 409,
        data: { code: 'CLIENT_PRESENTATION_REVISION_CONFLICT' },
      },
    })
    renderManager('image.gpt')
    fireEvent.change(await screen.findByLabelText('Client display name *'), {
      target: { value: 'My draft name' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save and publish' }))
    await screen.findByText(
      'Content was changed by someone else; your changes are not published'
    )

    mocks.get.mockRejectedValue(new Error('offline'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload (discard my changes)' })
    )

    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        'Unable to load the client presentation'
      )
    )
    expect(mocks.toast.success).not.toHaveBeenCalledWith(
      'Latest content loaded'
    )
    expect(screen.getByLabelText('Client display name *')).toHaveValue(
      'My draft name'
    )
    expect(
      screen.getByText(
        'Content was changed by someone else; your changes are not published'
      )
    ).toBeVisible()
  })

  it('numbers badges in click order and disables the rest after two', async () => {
    renderManager('image.gpt')
    await screen.findByLabelText('Client display name *')
    const editor = list().querySelector<HTMLElement>(
      '[data-model-key="image.gpt"]'
    ) as HTMLElement
    const badgeButton = (name: string) =>
      within(editor).getByRole('button', { name: new RegExp(name) })

    fireEvent.click(badgeButton('Hot'))
    fireEvent.click(badgeButton('Official'))

    expect(badgeButton('Hot')).toHaveAttribute('aria-pressed', 'true')
    expect(badgeButton('Hot')).toHaveTextContent('1Hot')
    expect(badgeButton('Official')).toHaveTextContent('2Official')
    expect(badgeButton('New')).toBeDisabled()
  })

  it('selects all search results and colors every model, a model without an icon in its type icon', async () => {
    renderManager()
    await screen.findByRole('button', { name: 'Image 3' })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all 3' }))
    expect(screen.getByText('Selected 3')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Set color' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Color purple' }))

    expect(mocks.toast.success).toHaveBeenCalledWith(
      expect.stringMatching(/for 3 models\. Not published yet\.$/u)
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Unpublished: 3 models'
    )
  })

  it('clears the selection when switching generation type', async () => {
    renderManager()
    await screen.findByRole('button', { name: 'Image 3' })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all 3' }))

    fireEvent.click(screen.getByRole('button', { name: 'Video 1' }))

    expect(rowNames()).toEqual(['video.a'])
    expect(screen.getByText('Select models to set them in bulk')).toBeVisible()
  })
})

describe('Client presentation categories', () => {
  const portrait = {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Portrait',
    iconKey: 'seedance',
    iconColor: 'blue',
    description: 'People first',
  }
  function categorized(): CanvasClientPresentation {
    const base = presentation()
    return {
      ...base,
      models: base.models.map((item) =>
        item.modelKey === 'image.a' ? { ...item, tags: [portrait] } : item
      ),
      categories: [portrait],
      categoryOrders: [{ capability: 'image.generate', tagIds: [portrait.id] }],
      categoryDefaults: [],
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockResolvedValue(categorized())
    mocks.publish.mockResolvedValue({
      id: 'p1',
      revision: 4,
      effectiveAt: '2026-10-18T00:00:00.000Z',
    })
  })

  async function openCategories(user: ReturnType<typeof userEvent.setup>) {
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <ClientPresentationManager />
      </QueryClientProvider>
    )
    await screen.findByRole('button', { name: 'Image 3' })
    await user.click(screen.getByRole('button', { name: 'Categories' }))
  }

  it('creates a category with models and a default, then publishes it with the other settings', async () => {
    const user = userEvent.setup()
    await openCategories(user)
    expect(screen.getByRole('button', { name: 'Edit Portrait' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'New category' }))
    const name = screen.getByLabelText('Category name *')
    expect(name).toHaveFocus()
    expect(
      screen.getByRole('button', { name: 'Save and publish' })
    ).toBeDisabled()
    await user.type(name, 'Scenery')
    await user.type(
      screen.getByLabelText('Category description (optional)'),
      'Wide shots'
    )
    await user.click(screen.getByRole('radio', { name: 'Tongyi Wanxiang' }))
    await user.click(screen.getByRole('button', { name: 'Choose models' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'GPT Image' })
    )
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    await user.click(screen.getByRole('combobox', { name: 'Default category' }))
    await user.click(await screen.findByRole('option', { name: 'Scenery' }))
    expect(screen.getByRole('status')).toHaveTextContent(
      /Unpublished: 1 models.*Categories/u
    )

    await user.click(screen.getByRole('button', { name: 'Save and publish' }))
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1))
    const body = mocks.publish.mock.calls[0]![0].body
    expect(body.categories).toEqual({
      created: [
        {
          ref: 'new-1',
          name: 'Scenery',
          iconKey: 'wan',
          iconColor: 'gray',
          description: 'Wide shots',
        },
      ],
      updated: [],
      deletedIds: [],
    })
    expect(body.models).toEqual([
      expect.objectContaining({ modelKey: 'image.gpt', tags: ['new-1'] }),
    ])
    expect(body.categoryOrders).toEqual([
      { capability: 'image.generate', tagIds: [portrait.id, 'new-1'] },
    ])
    expect(body.categoryDefaults).toEqual([
      { capability: 'image.generate', tagId: 'new-1', untagged: false },
    ])
  })

  it('blocks publishing while a category name repeats another one ignoring case', async () => {
    const user = userEvent.setup()
    await openCategories(user)
    await user.click(screen.getByRole('button', { name: 'New category' }))
    await user.type(screen.getByLabelText('Category name *'), 'portrait ')
    expect(screen.getByLabelText('Category name *')).toHaveAttribute(
      'aria-invalid',
      'true'
    )
    expect(screen.getByText('Category "portrait" already exists')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent(
      '2 categories need a unique name'
    )
    expect(
      screen.getByRole('button', { name: 'Save and publish' })
    ).toBeDisabled()
  })

  it('assigns a category from the model editor like a badge', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <ClientPresentationManager />
      </QueryClientProvider>
    )
    await screen.findByRole('button', { name: 'Image 3' })
    const toggle = within(
      screen.getByRole('group', { name: /^Model categories/u })
    ).getByRole('button', { name: 'Portrait' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await user.click(screen.getByRole('button', { name: 'Save and publish' }))
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1))
    expect(mocks.publish.mock.calls[0]![0].body.models).toEqual([
      expect.objectContaining({ modelKey: 'image.a', tags: [] }),
    ])
  })
})
