/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import ja from '@/i18n/locales/ja.json'
import ru from '@/i18n/locales/ru.json'
import viLocale from '@/i18n/locales/vi.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

import { CustomerTasks } from '../CustomerTasks'

const apiMocks = vi.hoisted(() => ({
  getCanvasCustomerTasks: vi.fn(),
  getCanvasTaskAssetBlob: vi.fn(),
  getCanvasTaskAssetDownload: vi.fn(),
}))
const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('../../api', () => apiMocks)
vi.mock('sonner', () => ({ toast: toastMocks }))

function renderTasks() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <CustomerTasks />
    </QueryClientProvider>
  )
}

describe('Canvas customer tasks', () => {
  beforeAll(() => {
    for (const [locale, resource] of Object.entries({
      en,
      fr,
      ja,
      ru,
      vi: viLocale,
      zhTW,
      zhCN: zh,
    })) {
      i18next.addResourceBundle(
        locale,
        'translation',
        resource.translation,
        true,
        true
      )
    }
  })
  beforeEach(async () => {
    vi.clearAllMocks()
    apiMocks.getCanvasTaskAssetBlob.mockReset()
    apiMocks.getCanvasTaskAssetDownload.mockReset()
    localStorage.clear()
    await i18next.changeLanguage('en')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:canvas-result'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
    apiMocks.getCanvasCustomerTasks.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 21,
      items: [
        {
          id: '01a09f34-complete-task-id',
          modelName: 'GPT Image 2 Pro',
          derivedExecutionStatus: 'SUCCEEDED',
          executionSummary: {
            expectedResults: 1,
            recordedResults: 1,
            acceptedResults: 0,
            processingResults: 0,
            succeededResults: 1,
            failedResults: 0,
            unknownResults: 0,
            resultsIncomplete: false,
          },
          outputSummaries: [],
          assets: [],
          settlementProgress: 'COMPLETED',
          customerBillingStatus: 'SETTLED',
          allocatedPoints: '7',
          deductedPoints: '7',
          releasedPoints: '0',
          outstandingDebtPoints: '0',
          acceptedAt: '2026-09-14T09:16:00.000Z',
        },
      ],
    })
  })

  it('pages through the customer endpoint, copies the full ID, refreshes only tasks, and exposes no details', async () => {
    renderTasks()
    expect(await screen.findByText('GPT Image 2 Pro')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Copy task ID' }))
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        '01a09f34-complete-task-id'
      )
    )
    expect(
      screen.queryByRole('button', { name: /detail/i })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /download result/i })
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }))
    await waitFor(() =>
      expect(apiMocks.getCanvasCustomerTasks).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.any(AbortSignal)
      )
    )
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() =>
      expect(apiMocks.getCanvasCustomerTasks).toHaveBeenCalledTimes(3)
    )
  })

  it('downloads an available partial-success output through a fresh signed descriptor', async () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    apiMocks.getCanvasCustomerTasks.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: '81000000-0000-7000-8000-000000000001',
          modelName: 'Video model',
          derivedExecutionStatus: 'PARTIAL_SUCCESS',
          executionSummary: {
            expectedResults: 2,
            recordedResults: 2,
            acceptedResults: 0,
            processingResults: 0,
            succeededResults: 1,
            failedResults: 1,
            unknownResults: 0,
            resultsIncomplete: false,
          },
          outputSummaries: [
            {
              outputIndex: 0,
              executionStatus: 'CONFIRMED_FAILED',
              error: { code: 'PROVIDER_UNAVAILABLE', messages: null },
            },
            { outputIndex: 1, executionStatus: 'SUCCEEDED', error: null },
          ],
          assets: [
            {
              assetId: '82000000-0000-7000-8000-000000000001',
              outputIndex: 1,
              mediaType: 'VIDEO',
              mimeType: 'video/mp4',
              sizeBytes: '1024',
              availableUntil: '2026-09-21T09:00:00.000Z',
              downloadPath:
                '/v1/tasks/81000000-0000-7000-8000-000000000001/assets/82000000-0000-7000-8000-000000000001/download',
            },
          ],
          settlementProgress: 'COMPLETED',
          customerBillingStatus: 'SETTLED',
          allocatedPoints: '14',
          deductedPoints: '7',
          releasedPoints: '7',
          outstandingDebtPoints: '0',
          acceptedAt: '2026-09-19T09:16:00.000Z',
        },
      ],
    })
    apiMocks.getCanvasTaskAssetDownload.mockResolvedValue({
      url: 'https://signed.example/result.mp4?signature=opaque',
      expiresAt: '2026-09-19T09:31:00.000Z',
      outputIndex: 1,
      mimeType: 'video/mp4',
      sizeBytes: '1024',
      sha256: 'a'.repeat(64),
    })

    renderTasks()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Download result 2' })
    )
    await waitFor(() =>
      expect(apiMocks.getCanvasTaskAssetDownload).toHaveBeenCalledWith(
        '/v1/tasks/81000000-0000-7000-8000-000000000001/assets/82000000-0000-7000-8000-000000000001/download',
        '81000000-0000-7000-8000-000000000001',
        '82000000-0000-7000-8000-000000000001'
      )
    )
    expect(click).toHaveBeenCalledTimes(1)
    expect(apiMocks.getCanvasTaskAssetBlob).not.toHaveBeenCalled()
    click.mockRestore()
  })

  it('fetches Mock bytes with authentication and reports an expired asset locally', async () => {
    const taskId = '81000000-0000-7000-8000-000000000001'
    const assetId = '82000000-0000-7000-8000-000000000001'
    const downloadPath = `/v1/tasks/${taskId}/assets/${assetId}/download`
    const asset = {
      assetId,
      outputIndex: 0,
      mediaType: 'IMAGE',
      mimeType: 'image/png',
      sizeBytes: '68',
      availableUntil: null,
      downloadPath,
    }
    apiMocks.getCanvasCustomerTasks.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: taskId,
          modelName: 'Image model',
          derivedExecutionStatus: 'SUCCEEDED',
          executionSummary: {
            expectedResults: 1,
            recordedResults: 1,
            acceptedResults: 0,
            processingResults: 0,
            succeededResults: 1,
            failedResults: 0,
            unknownResults: 0,
            resultsIncomplete: false,
          },
          outputSummaries: [],
          assets: [asset],
          settlementProgress: 'COMPLETED',
          customerBillingStatus: 'SETTLED',
          allocatedPoints: '7',
          deductedPoints: '7',
          releasedPoints: '0',
          outstandingDebtPoints: '0',
          acceptedAt: '2026-09-19T09:16:00.000Z',
        },
      ],
    })
    apiMocks.getCanvasTaskAssetDownload.mockResolvedValueOnce({
      url: `/v1/tasks/${taskId}/assets/${assetId}`,
      expiresAt: '2026-09-19T09:31:00.000Z',
      outputIndex: 0,
      mimeType: 'image/png',
      sizeBytes: '68',
      sha256: 'a'.repeat(64),
    })
    apiMocks.getCanvasTaskAssetBlob.mockResolvedValue(
      new Blob(['image'], { type: 'image/png' })
    )
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)

    renderTasks()
    await screen.findByRole('button', {
      name: 'Download result 1',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Download result 1' }))
    await waitFor(() =>
      expect(apiMocks.getCanvasTaskAssetBlob).toHaveBeenCalledWith(
        `/v1/tasks/${taskId}/assets/${assetId}`,
        taskId,
        assetId
      )
    )
    expect(URL.createObjectURL).toHaveBeenCalled()
    await waitFor(() =>
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:canvas-result')
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Download result 1' })
      ).toBeEnabled()
    )

    apiMocks.getCanvasTaskAssetDownload.mockRejectedValueOnce({
      response: { status: 404 },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Download result 1' }))
    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith(
        'The result file is no longer available.'
      )
    )
    click.mockRestore()
  })

  it('sends task and model filters and returns to the first page', async () => {
    renderTasks()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Column filters' })
    )
    const taskInput = await screen.findByPlaceholderText('Task ID')
    fireEvent.change(taskInput, { target: { value: '01a09f34' } })
    fireEvent.change(screen.getByPlaceholderText('Model'), {
      target: { value: 'GPT Image' },
    })
    await waitFor(
      () =>
        expect(apiMocks.getCanvasCustomerTasks).toHaveBeenLastCalledWith(
          expect.objectContaining({
            taskId: '01a09f34',
            model: 'GPT Image',
            page: 1,
          }),
          expect.any(AbortSignal)
        ),
      { timeout: 1500 }
    )
  })

  it.each([
    ['en', 'en'],
    ['fr', 'fr'],
    ['ru', 'ru'],
    ['ja', 'ja'],
    ['vi', 'vi'],
    ['zhCN', 'zhCN'],
    ['zhTW', 'zhTW'],
  ])(
    'uses the safe four-step error fallback in %s without exposing unknown codes',
    async (locale, messageLocale) => {
      await i18next.changeLanguage(locale)
      apiMocks.getCanvasCustomerTasks.mockResolvedValue({
        page: 1,
        pageSize: 20,
        total: 1,
        items: [
          {
            id: `task-${locale}`,
            modelName: 'GPT Image 2 Pro',
            derivedExecutionStatus: 'CONFIRMED_FAILED',
            executionSummary: {
              expectedResults: 4,
              recordedResults: 4,
              acceptedResults: 0,
              processingResults: 0,
              succeededResults: 0,
              failedResults: 4,
              unknownResults: 0,
              resultsIncomplete: false,
            },
            outputSummaries: [
              {
                outputIndex: 0,
                executionStatus: 'CONFIRMED_FAILED',
                error: {
                  code: 'PROVIDER_UNAVAILABLE',
                  messages: {
                    en: 'english-snapshot',
                    [messageLocale]: `localized-${locale}`,
                  },
                },
              },
              {
                outputIndex: 1,
                executionStatus: 'CONFIRMED_FAILED',
                error: {
                  code: 'PROVIDER_UNAVAILABLE',
                  messages: { en: 'english-fallback' },
                },
              },
              {
                outputIndex: 2,
                executionStatus: 'CONFIRMED_FAILED',
                error: { code: 'PROVIDER_RATE_LIMITED', messages: null },
              },
              {
                outputIndex: 3,
                executionStatus: 'CONFIRMED_FAILED',
                error: { code: 'INTERNAL_SECRET_CODE', messages: null },
              },
            ],
            settlementProgress: 'COMPLETED',
            customerBillingStatus: 'SETTLED',
            allocatedPoints: '28',
            deductedPoints: '0',
            releasedPoints: '28',
            outstandingDebtPoints: '0',
            acceptedAt: '2026-09-14T09:16:00.000Z',
          },
        ],
      })
      renderTasks()
      expect(
        await screen.findByText(new RegExp(`localized-${locale}`))
      ).toBeVisible()
      expect(screen.getByText(/english-fallback/)).toBeVisible()
      expect(
        screen.getByText((content) =>
          content.includes(
            i18next.t('The generation service is busy. Please retry later.')
          )
        )
      ).toBeVisible()
      expect(
        screen.getByText((content) =>
          content.includes(
            i18next.t(
              'The task failed. Please retry later or contact an administrator.'
            )
          )
        )
      ).toBeVisible()
      expect(screen.queryByText('INTERNAL_SECRET_CODE')).not.toBeInTheDocument()
      expect(
        screen.queryByText('Customer task error INTERNAL_SECRET_CODE')
      ).not.toBeInTheDocument()
    }
  )
})
