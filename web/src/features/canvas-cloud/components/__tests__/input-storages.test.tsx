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
import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { connectionCheckReason } from '../../runtime-connection-check'
import type { CanvasRuntimeInputStorage } from '../../types'
import { InputStorages } from '../InputStorages'

const apiMocks = vi.hoisted(() => ({
  publishCanvasTaskMediaStorage: vi.fn(),
  checkCanvasTaskMediaStorage: vi.fn(),
  retireCanvasInputStorage: vi.fn(),
}))
vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...apiMocks,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function storage(
  overrides: Partial<CanvasRuntimeInputStorage> = {}
): CanvasRuntimeInputStorage {
  return {
    id: '85000000-0000-7000-8000-000000000071',
    storageKey: 'oss-hz',
    driver: 'S3',
    driverConfig: {
      region: 'oss-cn-hangzhou',
      forcePathStyle: false,
      contentLock: 'md5',
    },
    version: 2,
    status: 'PUBLISHED',
    endpoint: 'https://oss-cn-hangzhou.example.com',
    bucket: 'media-hz',
    accessKeyId: 'access',
    credentialsConfigured: true,
    inputRetentionHours: 24,
    downloadUrlTtlSeconds: 900,
    reason: 'added',
    effectiveAt: '2026-11-10T00:00:00.000Z',
    createdByPrincipalId: 'admin-id',
    updatedBy: 'Platform Admin',
    createdAt: '2026-11-10T00:00:00.000Z',
    latestCheck: {
      outcome: 'PASSED',
      reasonCode: null,
      checkedBy: 'Platform Admin',
      checkedAt: '2026-11-10T00:01:00.000Z',
    },
    usage: { models: 0, inputs: 0, lastDeleteAfter: null },
    ...overrides,
  }
}

function renderStorages(
  storages: CanvasRuntimeInputStorage[],
  onChanged = vi.fn().mockResolvedValue(undefined)
) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <InputStorages
        defaultStorage={<p>Default storage card</p>}
        storages={storages}
        onChanged={onChanged}
      />
    </QueryClientProvider>
  )
  return onChanged
}

describe('Input storages', () => {
  beforeAll(() =>
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  )
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
  })

  it('puts the add action above every storage and shows each storage card the same way', () => {
    renderStorages([storage({ storageKey: 'cn-east', driver: 'QINIU' })])
    const add = screen.getByRole('button', { name: 'Add storage' })
    const defaultCard = screen.getByText('Default storage card')
    const storageTitle = screen.getByText('cn-east')
    expect(
      add.compareDocumentPosition(defaultCard) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      defaultCard.compareDocumentPosition(storageTitle) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    for (const text of [
      'Qiniu',
      'Bucket',
      'Updated by',
      'In use',
      'Connection check',
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
    expect(
      screen.getByRole('button', { name: 'Check connection' })
    ).toBeInTheDocument()
  })

  it('adds an S3 storage with its addressing, upload address and content lock, then checks it', async () => {
    apiMocks.publishCanvasTaskMediaStorage.mockResolvedValue({
      id: 'version-new',
    })
    apiMocks.checkCanvasTaskMediaStorage.mockResolvedValue({
      outcome: 'PASSED',
      reasonCode: null,
      checkedBy: 'a',
      checkedAt: '2026-11-10T00:00:00.000Z',
    })
    const onChanged = renderStorages([])
    fireEvent.click(screen.getByRole('button', { name: 'Add storage' }))
    const form = screen.getByRole('form', { name: 'Add storage' })
    const fill = (label: string, value: string) =>
      fireEvent.change(within(form).getByLabelText(label), {
        target: { value },
      })
    fill('Name', 'oss-hz')
    fill('Bucket', 'media-hz')
    fill('Endpoint', 'https://oss-cn-hangzhou.example.com')
    fill('Region', 'oss-cn-hangzhou')
    fill('Upload address (optional)', 'https://accelerate.example.com')
    fill('Access key ID', 'access')
    fill('Secret access key', 'secret')
    fill('Content lock', 'md5')
    fireEvent.click(screen.getByRole('button', { name: 'In the host' }))
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() =>
      expect(apiMocks.publishCanvasTaskMediaStorage).toHaveBeenCalledOnce()
    )
    expect(apiMocks.publishCanvasTaskMediaStorage.mock.calls[0]?.[0]).toEqual({
      storageKey: 'oss-hz',
      driver: 'S3',
      driverConfig: {
        region: 'oss-cn-hangzhou',
        forcePathStyle: false,
        uploadEndpoint: 'https://accelerate.example.com',
        contentLock: 'md5',
      },
      endpoint: 'https://oss-cn-hangzhou.example.com',
      mediaBucket: 'media-hz',
      mediaCredentials: { accessKeyId: 'access', secretAccessKey: 'secret' },
      inputRetentionHours: 24,
      downloadUrlTtlSeconds: 900,
    })
    // The published version is checked at once, so models can only pick a storage that passed.
    await waitFor(() =>
      expect(apiMocks.checkCanvasTaskMediaStorage).toHaveBeenCalledWith(
        'version-new',
        expect.anything()
      )
    )
    expect(onChanged).toHaveBeenCalled()
  })

  it('adds a Qiniu storage with its upload address and without S3-only settings', async () => {
    apiMocks.publishCanvasTaskMediaStorage.mockResolvedValue({
      id: 'version-qiniu',
    })
    apiMocks.checkCanvasTaskMediaStorage.mockResolvedValue({
      outcome: 'PASSED',
      reasonCode: null,
      checkedBy: 'a',
      checkedAt: '2026-11-10T00:00:00.000Z',
    })
    renderStorages([])
    fireEvent.click(screen.getByRole('button', { name: 'Add storage' }))
    fireEvent.click(screen.getByRole('button', { name: 'Qiniu' }))
    expect(
      screen.queryByRole('group', { name: 'Bucket name position' })
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Content lock')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Upload address')).toHaveValue(
      'https://upload.qiniup.com'
    )
    for (const [label, value] of [
      ['Name', 'cn-east'],
      ['Bucket', 'media-east'],
      ['Endpoint', 'https://s3.cn-east-1.qiniucs.com'],
      ['Region', 'cn-east-1'],
      ['Access key ID', 'access'],
      ['Secret access key', 'secret'],
    ] as const) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } })
    }
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() =>
      expect(apiMocks.publishCanvasTaskMediaStorage).toHaveBeenCalledOnce()
    )
    expect(
      apiMocks.publishCanvasTaskMediaStorage.mock.calls[0]?.[0]
    ).toMatchObject({
      storageKey: 'cn-east',
      driver: 'QINIU',
      driverConfig: {
        region: 'cn-east-1',
        uploadEndpoint: 'https://upload.qiniup.com',
      },
    })
  })

  it('refuses to add a storage without credentials', async () => {
    renderStorages([])
    fireEvent.click(screen.getByRole('button', { name: 'Add storage' }))
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    expect(
      await screen.findByText('A new storage needs its credentials')
    ).toBeInTheDocument()
    expect(apiMocks.publishCanvasTaskMediaStorage).not.toHaveBeenCalled()
  })

  it('deletes an unused storage after confirmation and keeps a used one undeletable', async () => {
    apiMocks.retireCanvasInputStorage.mockResolvedValue({
      storageKey: 'oss-hz',
    })
    renderStorages([
      storage(),
      storage({
        id: 'used',
        storageKey: 'cn-east',
        usage: { models: 2, inputs: 37, lastDeleteAfter: null },
      }),
    ])
    const deletes = screen.getAllByRole('button', { name: 'Delete' })
    expect(deletes[1]).toBeDisabled()
    expect(deletes[1]?.parentElement).toHaveAttribute(
      'title',
      'Models or inputs still use this storage'
    )
    expect(screen.getByText('2 models · 37 inputs')).toBeInTheDocument()
    fireEvent.click(deletes[0] as HTMLElement)
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Delete',
      })
    )
    await waitFor(() =>
      expect(apiMocks.retireCanvasInputStorage).toHaveBeenCalledWith(
        'oss-hz',
        expect.anything()
      )
    )
  })

  it('says a refused key or policy apart from a connection that could not be verified', () => {
    const translate = (key: string) => key
    expect(connectionCheckReason('STORAGE_ACCESS_DENIED', translate)).toBe(
      'The storage refused access. Check the key and its permission policy.'
    )
    expect(connectionCheckReason('STORAGE_CONNECTION_FAILED', translate)).toBe(
      'The storage connection could not be verified'
    )
  })
})
