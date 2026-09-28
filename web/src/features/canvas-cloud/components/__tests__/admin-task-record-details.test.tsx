import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { useRef } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import ja from '@/i18n/locales/ja.json'
import ru from '@/i18n/locales/ru.json'
import viLocale from '@/i18n/locales/vi.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

import { AdminTaskRecordDetails } from '../AdminTaskRecordDetails'

const api = vi.hoisted(() => ({
  getCanvasAdminTaskRecord: vi.fn(),
  getCanvasAdminTaskInputDownload: vi.fn(),
  getCanvasAdminTaskInputBlob: vi.fn(),
  getCanvasTaskPointLedger: vi.fn(),
  releaseCanvasTaskFrozenPoints: vi.fn(),
}))
const calls = vi.hoisted(() => ({ getCanvasTaskCalls: vi.fn() }))
vi.mock('../../api', () => api)
vi.mock('../../task-call-api', () => calls)

const task = {
  id: '01a09f34-3392-7448-b39e-d6106e62ccca',
  customerId: 'customer-1',
  customerName: 'UAT customer',
  customerModelId: 'model-1',
  displayNameSnapshot: 'GPT Image 2 Pro',
  quotedPoints: '14',
  settledPoints: '7',
  deductedPoints: '7',
  releasedPoints: '7',
  outstandingDebtPoints: '0',
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
  settlementProgress: 'COMPLETED',
  executionStatus: 'SUCCEEDED',
  customerBillingStatus: 'SETTLED',
  billingUnit: null,
  billingFinalizedAt: null,
  unknownDeadlineAt: null,
  earlyReleaseAllowed: false,
  earlyReleaseBlockedReason: null,
  parameters: {
    quality: '2K',
    aspectRatio: '9:16',
    batchSize: 2,
    hiddenSecret: 'never',
  },
  multiResultMode: 'FANOUT',
  failureLocation: 'PROVIDER_RESPONSE',
  inputAssets: [],
  outputs: [],
  upstreamTaskId: null,
  taskError: {
    code: 'PROVIDER_AUTH_FAILED',
    messages: { en: 'Customer-safe text must not be the diagnosis' },
  },
  acceptedAt: '2026-09-14T09:16:33.000Z',
  completedAt: '2026-09-14T09:16:35.000Z',
}
const providerCall = {
  localCallId: 'call-long-id',
  outputIndices: [0],
  callType: 'SUBMIT',
  attemptCount: 1,
  chainState: 'RESPONDED',
  providerName: 'HFSY',
  channelCode: 'Image',
  channelVersion: 3,
  upstreamModelId: 'gpt-image-2-pro',
  credentialGroupName: 'Production images',
  credentialGroupVersion: 4,
  workerId: 'executor-01',
  upstreamRequestId: 'req-1',
  upstreamTaskId: 'upstream-1',
  sentAt: '2026-09-14T09:16:34.000Z',
  startedAt: '2026-09-14T09:16:34.000Z',
  finalRespondedAt: '2026-09-14T09:16:42.000Z',
  initialHttpStatus: 202,
  finalHttpStatus: 200,
  durationMs: 8000,
  canvasErrorCode: null,
  upstreamErrorCode: null,
  errorCategory: null,
  errorRuleId: null,
  errorRuleVersion: null,
  sanitizedError: null,
  sanitizedResponse: null,
  responseFromQuery: false,
  matchedRule: null,
  executionJudgement: null,
  sanitizedRequest: {
    method: 'POST',
    path: '/v1/images/generations',
    query: {},
    contentType: 'application/json',
    body: { model: 'gpt-image-2-pro' },
  },
}
const pointRecord = {
  id: 'point-row-1',
  occurredAt: '2026-09-14T09:16:33.000Z',
  eventType: 'FREEZE',
  outputIndex: 0,
  points: '7',
  lotType: 'PAID',
  sourceLotType: null,
  targetLotType: null,
  ledgerId: 'ledger-1',
  sourceLedgerId: null,
  targetLedgerId: null,
  pointLotId: 'lot-1',
  sourceLotId: null,
  targetLotId: null,
  allocationId: 'allocation-1',
  debtId: null,
  remainingBefore: '100',
  remainingAfter: '100',
  reservedBefore: '0',
  reservedAfter: '7',
  sourceRemainingBefore: null,
  sourceRemainingAfter: null,
  sourceReservedBefore: null,
  sourceReservedAfter: null,
  targetRemainingBefore: null,
  targetRemainingAfter: null,
  targetReservedBefore: null,
  targetReservedAfter: null,
}

function mount() {
  function View() {
    const ref = useRef<HTMLDivElement | null>(null)
    return (
      <div ref={ref}>
        <AdminTaskRecordDetails taskId={task.id} scrollContainerRef={ref} />
      </div>
    )
  }
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <View />
    </QueryClientProvider>
  )
}

describe('AdminTaskRecordDetails UAT-018', () => {
  beforeAll(async () => {
    await i18next.init({
      lng: 'en',
      resources: { en, zhCN: zh, zhTW, fr, ru, ja, vi: viLocale },
    })
  })
  beforeEach(async () => {
    await i18next.changeLanguage('en')
    vi.clearAllMocks()
    api.getCanvasAdminTaskRecord.mockResolvedValue(task)
    calls.getCanvasTaskCalls.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [providerCall],
    })
    api.getCanvasTaskPointLedger.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [pointRecord],
    })
  })

  it('shows only authoritative main facts and opens failed execution details by default', async () => {
    mount()
    expect((await screen.findAllByText(task.id))[0]).toHaveClass('break-all')
    expect(screen.getByText('Customer').closest('dl')).toHaveClass(
      'grid-cols-2',
      'lg:grid-cols-3'
    )
    expect(
      screen.getByText('Provider response · Provider authentication failed')
    ).toBeVisible()
    expect(
      screen.queryByText('Customer-safe text must not be the diagnosis')
    ).not.toBeInTheDocument()
    expect(screen.getByText('Succeeded 1 · Failed 1')).toBeVisible()
    expect(
      screen.getByText('Partially deducted and partially released')
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Execution details' })
    ).toHaveAttribute('aria-expanded', 'true')
    const parameters = screen.getByText(/"multiResultMode": "fanout"/)
    expect(parameters).toHaveTextContent('"aspectRatio": "9:16"')
    expect(parameters).toHaveTextContent('"quality": "2K"')
    expect(parameters).not.toHaveTextContent('hiddenSecret')
    await waitFor(() =>
      expect(calls.getCanvasTaskCalls).toHaveBeenCalledWith(
        task.id,
        { page: 1, pageSize: 20 },
        expect.any(AbortSignal)
      )
    )
  })

  it('opens the call of an unfinished result by default and can collapse it', async () => {
    mount()
    const hide = await screen.findByRole('button', { name: 'Hide details' })
    expect(screen.getByText('202 → 200')).toBeVisible()
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }))
    expect(screen.getByText('executor-01')).toBeVisible()
    fireEvent.click(hide)
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Sent upstream request' }))
    expect(screen.getAllByText(/gpt-image-2-pro/).length).toBeGreaterThan(0)
  })

  it('shows ordered input media separately and opens a freshly signed URL', async () => {
    const replace = vi.fn()
    const close = vi.fn()
    const popup = {
      opener: window,
      location: { replace },
      close,
    } as unknown as Window
    const open = vi.spyOn(window, 'open').mockReturnValue(popup)
    api.getCanvasAdminTaskRecord.mockResolvedValueOnce({
      ...task,
      inputAssets: [
        {
          assetId: 'asset-image',
          inputIndex: 0,
          inputRole: 'prompt-reference',
          mediaType: 'IMAGE',
          mimeType: 'image/png',
          sizeBytes: '128',
          sha256: 'a'.repeat(64),
          availableUntil: '2026-09-15T09:16:33.000Z',
          downloadPath: `/v1/web/admin/tasks/${task.id}/inputs/asset-image/download`,
        },
        {
          assetId: 'asset-audio',
          inputIndex: 1,
          inputRole: 'audio-reference',
          mediaType: 'AUDIO',
          mimeType: 'audio/mpeg',
          sizeBytes: '64',
          sha256: 'c'.repeat(64),
          availableUntil: '2026-09-15T09:16:33.000Z',
          downloadPath: `/v1/web/admin/tasks/${task.id}/inputs/asset-audio/download`,
        },
        {
          assetId: 'asset-image-2',
          inputIndex: 2,
          inputRole: 'prompt-reference',
          mediaType: 'IMAGE',
          mimeType: 'image/jpeg',
          sizeBytes: '192',
          sha256: 'd'.repeat(64),
          availableUntil: '2026-09-15T09:16:33.000Z',
          downloadPath: `/v1/web/admin/tasks/${task.id}/inputs/asset-image-2/download`,
        },
        {
          assetId: 'asset-video',
          inputIndex: 3,
          inputRole: 'video-reference',
          mediaType: 'VIDEO',
          mimeType: 'video/mp4',
          sizeBytes: '256',
          sha256: 'b'.repeat(64),
          availableUntil: '2026-09-15T09:16:33.000Z',
          downloadPath: `/v1/web/admin/tasks/${task.id}/inputs/asset-video/download`,
        },
      ],
    })
    calls.getCanvasTaskCalls.mockResolvedValueOnce({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          ...providerCall,
          sanitizedRequest: {
            body: {
              reference_images: [
                'https://storage.example.com/very/long/input/asset-image?X-Amz-Signature=REDACTED',
              ],
              reference_videos: [
                'https://storage.example.com/very/long/input/asset-video?X-Amz-Signature=REDACTED',
              ],
              reference_audios: [
                'https://storage.example.com/very/long/input/asset-audio?X-Amz-Signature=REDACTED',
              ],
              provider_asset: 'asset://remote-asset',
              local_file: 'file:///private/tmp/input.png',
              custom_asset: 'canvas-media://private/input',
              inline_data: 'data:image/png;base64,cG5n',
              safe_relative_path: '/v1/videos/upstream-1/file?quality=hd',
              signed_relative_path:
                '/v1/videos/upstream-1/file?signature=REDACTED',
            },
          },
        },
      ],
    })
    api.getCanvasAdminTaskInputDownload.mockResolvedValueOnce({
      url: 'https://storage.example.com/fresh-signed-input',
      expiresAt: '2026-09-14T09:31:33.000Z',
      inputIndex: 0,
      inputRole: 'prompt-reference',
      mediaType: 'IMAGE',
      mimeType: 'image/png',
      sizeBytes: '128',
      sha256: 'a'.repeat(64),
    })

    mount()
    await screen.findByRole('button', { name: 'Hide details' })
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }))
    expect(screen.getByText('Input media')).toBeVisible()
    expect(screen.getByText('Image 1')).toBeVisible()
    expect(screen.getByText('Audio 1')).toBeVisible()
    expect(screen.getByText('Image 2')).toBeVisible()
    expect(screen.getByText('Video 1')).toBeVisible()
    fireEvent.click(screen.getByRole('tab', { name: 'Sent upstream request' }))
    const requestSnapshot = screen.getByText(/\[provider-url-hidden\]/)
    expect(
      requestSnapshot.textContent?.match(/\[provider-url-hidden\]/g)
    ).toHaveLength(7)
    expect(requestSnapshot).toHaveTextContent(
      '/v1/videos/upstream-1/file?quality=hd'
    )
    expect(requestSnapshot).not.toHaveTextContent('asset://remote-asset')
    expect(requestSnapshot).not.toHaveTextContent(
      'file:///private/tmp/input.png'
    )
    expect(requestSnapshot).not.toHaveTextContent(
      'canvas-media://private/input'
    )
    expect(requestSnapshot).toHaveTextContent('[provider-data-hidden]')
    expect(
      screen.queryByText(/X-Amz-Signature=REDACTED/)
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Image 1' }))
    await waitFor(() =>
      expect(api.getCanvasAdminTaskInputDownload).toHaveBeenCalledWith(
        `/v1/web/admin/tasks/${task.id}/inputs/asset-image/download`,
        task.id,
        'asset-image'
      )
    )
    expect(replace).toHaveBeenCalledWith(
      'https://storage.example.com/fresh-signed-input'
    )
    expect(popup.opener).toBeNull()
    expect(close).not.toHaveBeenCalled()
    open.mockRestore()
  })

  it('loads a filter-free point lifecycle table and expands its identifiers in place', async () => {
    mount()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Point records' })
    )
    expect(await screen.findByText('Freeze')).toBeVisible()
    expect(api.getCanvasTaskPointLedger).toHaveBeenCalledWith(
      task.id,
      { page: 1, pageSize: 20 },
      expect.any(AbortSignal)
    )
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    const detailButtons = screen.getAllByRole('button', { name: 'Details' })
    const lastDetailButton = detailButtons.at(-1)
    if (!lastDetailButton) {
      throw new Error('Point record details button is missing')
    }
    fireEvent.click(lastDetailButton)
    expect(await screen.findByText('ledger-1')).toHaveClass('break-all')
    expect(screen.getByText('allocation-1')).toHaveClass('break-all')
    expect(
      screen.getByText('Point lot available points').parentElement
    ).toHaveTextContent('100 → 100')
  })

  it('uses source and target balances for a grace transfer detail', async () => {
    api.getCanvasTaskPointLedger.mockResolvedValueOnce({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          ...pointRecord,
          id: 'grace-transfer-1',
          eventType: 'GRACE_TRANSFER',
          lotType: null,
          sourceLotType: 'BONUS',
          targetLotType: 'GRACE_BONUS',
          ledgerId: null,
          pointLotId: null,
          sourceLedgerId: 'source-ledger',
          targetLedgerId: 'target-ledger',
          sourceLotId: 'source-lot',
          targetLotId: 'target-lot',
          remainingBefore: null,
          remainingAfter: null,
          reservedBefore: null,
          reservedAfter: null,
          sourceRemainingBefore: '8',
          sourceRemainingAfter: '1',
          sourceReservedBefore: '7',
          sourceReservedAfter: '0',
          targetRemainingBefore: '2',
          targetRemainingAfter: '9',
          targetReservedBefore: '0',
          targetReservedAfter: '7',
        },
      ],
    })
    mount()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Point records' })
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }))

    expect(
      screen.getByText('Source point lot available points').parentElement
    ).toHaveTextContent('8 → 1')
    expect(
      screen.getByText('Source point lot frozen points').parentElement
    ).toHaveTextContent('7 → 0')
    expect(
      screen.getByText('Target point lot available points').parentElement
    ).toHaveTextContent('2 → 9')
    expect(
      screen.getByText('Target point lot frozen points').parentElement
    ).toHaveTextContent('0 → 7')
    expect(
      screen.queryByText('Point lot available points')
    ).not.toBeInTheDocument()
  })

  it('keeps unknown failure location hidden and opens details of an unfinished task', async () => {
    api.getCanvasAdminTaskRecord.mockResolvedValueOnce({
      ...task,
      derivedExecutionStatus: 'PROCESSING',
      failureLocation: null,
      taskError: { code: 'PROVIDER_AUTH_FAILED' },
      completedAt: null,
      deductedPoints: '0',
      releasedPoints: '0',
      settlementProgress: 'PROCESSING',
    })
    mount()
    expect(await screen.findByText('Not completed')).toBeVisible()
    expect(
      screen.queryByText(/Provider authentication failed/)
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Execution details' })
    ).toHaveAttribute('aria-expanded', 'true')
  })

  it('localizes the confirmed-not-sent target DTO without exposing its code or English message', async () => {
    await i18next.changeLanguage('zhCN')
    api.getCanvasAdminTaskRecord.mockResolvedValueOnce({
      ...task,
      derivedExecutionStatus: 'CONFIRMED_FAILED',
      executionSummary: {
        ...task.executionSummary,
        succeededResults: 0,
        failedResults: 1,
      },
      deductedPoints: '0',
      releasedPoints: '14',
      customerBillingStatus: 'RELEASED_FAILED',
      failureLocation: 'EXECUTOR_PREFLIGHT',
      taskError: {
        code: 'EXECUTOR_RESOURCE_CONFIRMED_NOT_SENT',
        messages: { en: 'Generation failed before the request was sent.' },
      },
    })
    mount()

    expect((await screen.findAllByText('确认失败')).length).toBeGreaterThan(0)
    expect(
      screen.getByText('Executor 预检 · Executor 请求确认未发送')
    ).toBeVisible()
    expect(screen.getByText('积分状态').parentElement).toHaveTextContent(
      '已释放'
    )
    expect(
      screen.queryByText('EXECUTOR_RESOURCE_CONFIRMED_NOT_SENT')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Generation failed before the request was sent.')
    ).not.toBeInTheDocument()
  })

  it('uses a localized safe fallback for an unknown error code', async () => {
    await i18next.changeLanguage('zhCN')
    api.getCanvasAdminTaskRecord.mockResolvedValueOnce({
      ...task,
      failureLocation: 'EXECUTOR_PREFLIGHT',
      taskError: { code: 'FUTURE_INTERNAL_CODE', messages: null },
    })
    mount()

    expect(
      await screen.findByText('Executor 预检 · 未知错误分类')
    ).toBeVisible()
    expect(screen.queryByText('FUTURE_INTERNAL_CODE')).not.toBeInTheDocument()
  })

  it('localizes a known preflight failure without exposing its internal code or message', async () => {
    await i18next.changeLanguage('zhCN')
    api.getCanvasAdminTaskRecord.mockResolvedValueOnce({
      ...task,
      failureLocation: 'EXECUTOR_PREFLIGHT',
      taskError: {
        code: 'PROVIDER_PREFLIGHT',
        messages: { en: 'Private validation detail' },
      },
    })
    mount()

    expect(
      await screen.findByText('Executor 预检 · 生成请求准备失败')
    ).toBeVisible()
    expect(screen.queryByText('PROVIDER_PREFLIGHT')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Private validation detail')
    ).not.toBeInTheDocument()
  })

  it('shows the recorded template error and safe field path above task parameters for a failed preflight', async () => {
    await i18next.changeLanguage('zhCN')
    api.getCanvasAdminTaskRecord.mockResolvedValueOnce({
      ...task,
      derivedExecutionStatus: 'CONFIRMED_FAILED',
      failureLocation: 'EXECUTOR_PREFLIGHT',
      taskError: { code: 'PROVIDER_PREFLIGHT', messages: null },
      preflightDiagnostic: {
        stage: 'SUBMIT_REQUEST',
        reason: 'BODY_TEMPLATE_INVALID',
        detail: 'INTEGER_CONVERSION_FAILED',
        field: '/durationSeconds',
      },
    })
    mount()

    expect(await screen.findByText('失败诊断')).toBeVisible()
    expect(screen.getByText(/请求模板无效/)).toBeVisible()
    expect(screen.getByText(/整数转换失败/)).toBeVisible()
    expect(screen.getByText('INTEGER_CONVERSION_FAILED')).toBeVisible()
    expect(screen.getByText('/durationSeconds')).toBeVisible()
    expect(
      screen
        .getByText('失败诊断')
        .compareDocumentPosition(screen.getByText('实际任务参数')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('says a historical preflight task has no finer recorded error without inventing one', async () => {
    await i18next.changeLanguage('zhCN')
    api.getCanvasAdminTaskRecord.mockResolvedValueOnce({
      ...task,
      derivedExecutionStatus: 'CONFIRMED_FAILED',
      failureLocation: 'EXECUTOR_PREFLIGHT',
      preflightDiagnostic: null,
    })
    mount()

    expect(await screen.findByText('该任务未记录更具体的错误')).toBeVisible()
    expect(
      screen.queryByText('INTEGER_CONVERSION_FAILED')
    ).not.toBeInTheDocument()
  })

  it('does not show failure diagnosis for a successful task', async () => {
    api.getCanvasAdminTaskRecord.mockResolvedValueOnce({
      ...task,
      derivedExecutionStatus: 'SUCCEEDED',
      failureLocation: null,
      preflightDiagnostic: null,
    })
    mount()

    expect(
      await screen.findByRole('button', { name: 'Execution details' })
    ).toBeVisible()
    expect(screen.queryByText('Failure diagnosis')).not.toBeInTheDocument()
  })

  it('mirrors Canvas Web after an administrator confirms the remaining result failed', async () => {
    await i18next.changeLanguage('zhCN')
    api.getCanvasAdminTaskRecord.mockResolvedValueOnce({
      ...task,
      derivedExecutionStatus: 'PARTIAL_SUCCESS',
      executionStatus: 'SUCCEEDED',
      customerBillingStatus: 'SETTLED',
      releasedPoints: '7',
      billingFinalizedAt: '2026-09-14T09:17:00.000Z',
      taskError: null,
      outputs: [
        {
          outputIndex: 0,
          quotedPoints: '7',
          settledPoints: '7',
          executionStatus: 'SUCCEEDED',
          billingStatus: 'SETTLED',
          error: null,
          usageSnapshot: null,
          completedAt: '2026-09-14T09:16:50.000Z',
          billingFinalizedAt: '2026-09-14T09:17:00.000Z',
          customerSafeErrorDetail: null,
        },
        {
          outputIndex: 1,
          quotedPoints: '7',
          settledPoints: '0',
          executionStatus: 'CONFIRMED_FAILED',
          billingStatus: 'RELEASED_FAILED',
          error: { code: 'ADMIN_CONFIRMED_UPSTREAM_FAILED', messages: null },
          usageSnapshot: null,
          completedAt: '2026-09-14T09:17:00.000Z',
          billingFinalizedAt: '2026-09-14T09:17:00.000Z',
          customerSafeErrorDetail: null,
        },
      ],
    })
    mount()

    expect(
      await screen.findByText('云端生成部分完成，已保留可用结果，积分已结算')
    ).toBeVisible()
    expect(screen.getByText('结果 2 · 确认失败')).toBeVisible()
    expect(screen.getByText(/^已扣除；已释放 7 积分（/)).toBeVisible()
    expect(
      screen.queryByText('上游已确认失败，冻结积分已释放。')
    ).not.toBeInTheDocument()
    expect(screen.getAllByText(task.id).length).toBeGreaterThan(1)
  })

  it('uses the Canvas Web fallback instead of an English-only message after a timeout release', async () => {
    await i18next.changeLanguage('zhCN')
    api.getCanvasAdminTaskRecord.mockResolvedValueOnce({
      ...task,
      derivedExecutionStatus: 'UNKNOWN',
      executionStatus: 'UNKNOWN',
      customerBillingStatus: 'RELEASED_TIMEOUT',
      releasedPoints: '14',
      billingFinalizedAt: '2026-09-14T09:17:00.000Z',
      taskError: {
        code: 'PROVIDER_BAD_GATEWAY',
        messages: { en: 'English must stay hidden' },
      },
      outputs: [
        {
          outputIndex: 0,
          quotedPoints: '14',
          settledPoints: null,
          executionStatus: 'UNKNOWN',
          billingStatus: 'RELEASED_TIMEOUT',
          error: null,
          usageSnapshot: null,
          completedAt: null,
          billingFinalizedAt: '2026-09-14T09:17:00.000Z',
          customerSafeErrorDetail: null,
        },
      ],
    })
    mount()

    expect(await screen.findByText('云端生成失败，积分已释放')).toBeVisible()
    expect(screen.getByText(/^已释放 14 积分（/)).toBeVisible()
    expect(screen.getByText('生成服务暂不可用。')).toBeVisible()
    expect(
      screen.queryByText('English must stay hidden')
    ).not.toBeInTheDocument()
  })

  it('does not show a failure explanation for an unknown frozen output', async () => {
    api.getCanvasAdminTaskRecord.mockResolvedValueOnce({
      ...task,
      derivedExecutionStatus: 'UNKNOWN',
      executionStatus: 'UNKNOWN',
      customerBillingStatus: 'FROZEN',
      releasedPoints: '0',
      deductedPoints: '0',
      unknownDeadlineAt: '2099-09-14T09:17:00.000Z',
      earlyReleaseAllowed: false,
      earlyReleaseBlockedReason: 'ACTIVE_REQUEST_LEASE',
      outputs: [
        {
          outputIndex: 0,
          quotedPoints: '14',
          settledPoints: null,
          executionStatus: 'UNKNOWN',
          billingStatus: 'FROZEN',
          error: { messages: { en: 'Must remain hidden while pending' } },
          usageSnapshot: null,
          completedAt: null,
          billingFinalizedAt: null,
          customerSafeErrorDetail: 'UPSTREAM_ERROR_CODE_PRESENT',
        },
      ],
    })
    mount()

    expect(await screen.findByText('Confirming cloud result')).toBeVisible()
    expect(
      screen.getByText(
        'If the result is still unconfirmed at the deadline, frozen points will be released automatically.'
      )
    ).toBeVisible()
    expect(screen.getByText('Frozen')).toBeVisible()
    expect(
      screen.queryByText('Must remain hidden while pending')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('The upstream service returned an error code.')
    ).not.toBeInTheDocument()
  })

  it('submits early release and keeps the confirmation state on a 409 refresh', async () => {
    const pendingTask = {
      ...task,
      derivedExecutionStatus: 'UNKNOWN',
      releasedPoints: '0',
      deductedPoints: '0',
      unknownDeadlineAt: '2099-09-14T09:17:00.000Z',
      earlyReleaseAllowed: true,
      earlyReleaseBlockedReason: null,
      outputs: [
        {
          outputIndex: 0,
          quotedPoints: '14',
          settledPoints: null,
          executionStatus: 'UNKNOWN',
          billingStatus: 'FROZEN',
          error: null,
          usageSnapshot: null,
          completedAt: null,
          billingFinalizedAt: null,
          customerSafeErrorDetail: null,
        },
      ],
    }
    api.getCanvasAdminTaskRecord.mockResolvedValue(pendingTask)
    api.releaseCanvasTaskFrozenPoints.mockRejectedValueOnce({
      response: { status: 409 },
    })
    mount()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Release frozen points early' })
    )
    expect(
      screen.getByText(
        'Release 14 frozen points for this task. This does not send a cancellation request to the provider.'
      )
    ).toBeVisible()
    expect(
      screen.getByText(
        /If the provider already charged, the platform bears the cost\./
      )
    ).toBeVisible()
    fireEvent.change(screen.getByLabelText('Administrator reason'), {
      target: { value: 'Verified with provider' },
    })
    fireEvent.click(screen.getByText('Provider failure was confirmed'))
    fireEvent.click(
      screen.getByText('I understand the impact of this operation')
    )
    const actions = screen.getAllByRole('button', {
      name: 'Release frozen points early',
    })
    fireEvent.click(actions.at(-1) as HTMLElement)

    await waitFor(() =>
      expect(api.releaseCanvasTaskFrozenPoints).toHaveBeenCalledWith(task.id, {
        reason: 'Verified with provider',
        upstreamFailureConfirmed: true,
      })
    )
    expect(api.releaseCanvasTaskFrozenPoints).toHaveBeenCalledTimes(1)
    expect(
      await screen.findByText(
        'Task status changed and details were refreshed. Your input was kept and the request was not retried.'
      )
    ).toBeVisible()
    expect(screen.getByLabelText('Administrator reason')).toHaveValue(
      'Verified with provider'
    )
    await waitFor(() =>
      expect(api.getCanvasAdminTaskRecord.mock.calls.length).toBeGreaterThan(1)
    )
  })

  it('offers early release for a legacy frozen task without output rows', async () => {
    api.getCanvasAdminTaskRecord.mockResolvedValueOnce({
      ...task,
      derivedExecutionStatus: 'UNKNOWN',
      executionStatus: 'UNKNOWN',
      customerBillingStatus: 'FROZEN',
      quotedPoints: '5',
      releasedPoints: '0',
      deductedPoints: '0',
      earlyReleaseAllowed: true,
      earlyReleaseBlockedReason: null,
      outputs: [],
    })
    mount()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Release frozen points early' })
    )
    expect(
      screen.getByText(
        'Release 5 frozen points for this task. This does not send a cancellation request to the provider.'
      )
    ).toBeVisible()
  })

  it('keeps the entered early-release confirmation after a request failure', async () => {
    api.getCanvasAdminTaskRecord.mockResolvedValue({
      ...task,
      derivedExecutionStatus: 'UNKNOWN',
      releasedPoints: '0',
      deductedPoints: '0',
      unknownDeadlineAt: '2099-09-14T09:17:00.000Z',
      earlyReleaseAllowed: true,
      earlyReleaseBlockedReason: null,
      outputs: [
        {
          outputIndex: 0,
          quotedPoints: '14',
          settledPoints: null,
          executionStatus: 'UNKNOWN',
          billingStatus: 'FROZEN',
          error: null,
          usageSnapshot: null,
          completedAt: null,
          billingFinalizedAt: null,
          customerSafeErrorDetail: null,
        },
      ],
    })
    api.releaseCanvasTaskFrozenPoints.mockRejectedValueOnce(new Error('boom'))
    mount()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Release frozen points early' })
    )
    fireEvent.change(screen.getByLabelText('Administrator reason'), {
      target: { value: 'Checked upstream result' },
    })
    fireEvent.click(screen.getByText('Provider failure was confirmed'))
    fireEvent.click(
      screen.getByText('I understand the impact of this operation')
    )
    const actions = screen.getAllByRole('button', {
      name: 'Release frozen points early',
    })
    fireEvent.click(actions.at(-1) as HTMLElement)

    expect(
      await screen.findByText('Unable to release frozen points')
    ).toBeVisible()
    expect(screen.getByLabelText('Administrator reason')).toHaveValue(
      'Checked upstream result'
    )
    expect(api.releaseCanvasTaskFrozenPoints).toHaveBeenCalledTimes(1)
  })

  it('has non-empty UAT-018 terminology in all seven locales', () => {
    const keys = [
      'Actual task parameters',
      'Native batch mode',
      'Fanout mode',
      'Provider response',
      'Failure summary',
      'Failure diagnosis',
      'Failure stage',
      'Specific reason',
      'Template error',
      'Field path',
      'Validation rule',
      'No more specific error was recorded for this task',
      'Request template invalid',
      'Integer conversion failed',
      'Input media',
      'Input media is no longer available.',
      'Provider calls',
      'Point action',
      'Convert to grace bonus points',
      'Sent upstream request (sanitized)',
      'Source point lot available points',
      'Source point lot frozen points',
      'Target point lot available points',
      'Target point lot frozen points',
      'Executor request confirmed not sent',
      'Generation request preparation failed',
      'Points released',
      'Hide details',
    ]
    for (const locale of [en, zh, zhTW, fr, ru, ja, viLocale]) {
      for (const key of keys) {
        expect(
          locale.translation[key as keyof typeof locale.translation]
        ).toBeTruthy()
      }
    }
  })
})
