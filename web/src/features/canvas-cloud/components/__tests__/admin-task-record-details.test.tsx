import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import i18next from 'i18next'
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
  requestCanvasTaskManualResult: vi.fn(),
  settleCanvasTaskProviderCost: vi.fn(),
  revokeCanvasTaskProviderCostSettlement: vi.fn(),
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
  manualResultTargets: [],
  manualResults: [],
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
    return (
      <div>
        <AdminTaskRecordDetails taskId={task.id} />
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
      screen.getByText(
        'API provider response · API provider authentication failed'
      )
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
    fireEvent.click(screen.getByRole('tab', { name: 'Sent provider request' }))
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
    fireEvent.click(screen.getByRole('tab', { name: 'Sent provider request' }))
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

  it.each([
    ['PROVIDER_OUTPUT_TOO_LARGE', 'OUTPUT_DOWNLOAD', '结果下载 · 结果文件过大'],
    [
      'PROVIDER_OUTPUT_LOCATION_REJECTED',
      'OUTPUT_DOWNLOAD',
      '结果下载 · 结果地址被拒绝',
    ],
    [
      'PROVIDER_OUTPUT_DOWNLOAD_FAILED',
      'OUTPUT_DOWNLOAD',
      '结果下载 · 结果下载失败',
    ],
    [
      'PROVIDER_OUTPUT_UNSUPPORTED_MEDIA',
      'RESPONSE_PROCESSING',
      '响应处理 · 结果不是可用的媒体',
    ],
    [
      'PROVIDER_OUTPUT_INVALID',
      'RESPONSE_PROCESSING',
      '响应处理 · 结果文件无效',
    ],
    ['OUTPUT_STORAGE_FAILED', 'STORAGE', '存储 · 结果保存失败'],
  ] as const)(
    'names the output retrieval failure %s and its location instead of showing the code',
    async (code, location, expected) => {
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
        failureLocation: location,
        taskError: { code, messages: { en: 'English message' } },
      })
      mount()

      expect(await screen.findByText(expected)).toBeVisible()
      expect(screen.queryByText(code)).not.toBeInTheDocument()
    }
  )

  it('shows the output download location in a non-default language', async () => {
    await i18next.changeLanguage('fr')
    api.getCanvasAdminTaskRecord.mockResolvedValueOnce({
      ...task,
      derivedExecutionStatus: 'CONFIRMED_FAILED',
      failureLocation: 'OUTPUT_DOWNLOAD',
      taskError: { code: 'PROVIDER_OUTPUT_DOWNLOAD_FAILED', messages: null },
    })
    mount()

    expect(
      await screen.findByText(
        'Téléchargement du résultat · Échec du téléchargement du résultat'
      )
    ).toBeVisible()
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
      screen.queryByText('服务商已确认失败，冻结积分已释放。')
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

  // Cloud fills the administrator task error from the failure code alone; the customer still
  // sees the failed result's own message, so the mirror reads the results first.
  it.each([
    ['no task-level error', null],
    ['a code-only task-level error', { code: 'PROVIDER_UNKNOWN_ERROR' }],
  ])(
    'mirrors Canvas Web with the customer message first and the upstream reason below it (%s)',
    async (_name, taskError) => {
      await i18next.changeLanguage('zhCN')
      api.getCanvasAdminTaskRecord.mockResolvedValueOnce({
        ...task,
        derivedExecutionStatus: 'CONFIRMED_FAILED',
        executionStatus: 'CONFIRMED_FAILED',
        customerBillingStatus: 'RELEASED_FAILED',
        releasedPoints: '14',
        billingFinalizedAt: '2026-09-14T09:17:00.000Z',
        taskError,
        outputs: [
          {
            outputIndex: 0,
            quotedPoints: '14',
            settledPoints: null,
            executionStatus: 'CONFIRMED_FAILED',
            billingStatus: 'RELEASED_FAILED',
            error: {
              code: 'PROVIDER_UNKNOWN_ERROR',
              messages: { zhCN: '生成失败，请稍后重试或联系管理员。' },
              upstreamReason: '参考图涉及肖像限制',
            },
            usageSnapshot: null,
            completedAt: '2026-09-14T09:17:00.000Z',
            billingFinalizedAt: '2026-09-14T09:17:00.000Z',
            customerSafeErrorDetail: 'UPSTREAM_ERROR_CODE_PRESENT',
          },
        ],
      })
      mount()

      expect(
        await screen.findByText('生成失败，请稍后重试或联系管理员。')
      ).toBeVisible()
      expect(screen.getByText('服务商原因：参考图涉及肖像限制')).toBeVisible()
      expect(screen.queryByText('服务商返回了错误码。')).not.toBeInTheDocument()
    }
  )

  it.each([
    [
      'one result generating and one queued',
      [false, true],
      'Generating in the cloud',
      ['Result 1 · Generating', 'Result 2 · Queued'],
    ],
    [
      'every unfinished result queued',
      [true, true],
      'Queued',
      ['Result 1 · Queued', 'Result 2 · Queued'],
    ],
  ])(
    'mirrors Canvas Web for %s',
    async (_name, queued, nodeLabel, resultLabels) => {
      api.getCanvasAdminTaskRecord.mockResolvedValueOnce({
        ...task,
        derivedExecutionStatus: 'PROCESSING',
        executionStatus: 'PROCESSING',
        customerBillingStatus: 'FROZEN',
        taskError: null,
        outputs: queued.map((isQueued, outputIndex) => ({
          outputIndex,
          quotedPoints: '7',
          settledPoints: null,
          executionStatus: isQueued ? 'ACCEPTED' : 'PROCESSING',
          billingStatus: 'FROZEN',
          queued: isQueued,
          error: null,
          usageSnapshot: null,
          completedAt: null,
          billingFinalizedAt: null,
          customerSafeErrorDetail: null,
        })),
      })
      mount()

      const customerView = (
        await screen.findAllByText('Task information')
      )[0].closest('div.space-y-4')
      if (!customerView) throw new Error('No customer view')
      expect(
        within(customerView as HTMLElement).getAllByText(nodeLabel)[0]
      ).toBeVisible()
      expect(
        [...customerView.querySelectorAll('li')].map((item) => item.textContent)
      ).toEqual(resultLabels)
    }
  )

  it('leaves no blank row under a submit call that has no cost to show', async () => {
    api.getCanvasAdminTaskRecord.mockResolvedValue({
      ...task,
      providerCost: null,
    })
    mount()

    const callRow = (await screen.findByText('Submit task')).closest('tr')
    const body = callRow?.closest('tbody')
    if (!body) throw new Error('No call table')
    const blankRows = [...body.querySelectorAll('tr')].filter(
      (row) => row.textContent?.trim() === ''
    )
    expect(blankRows).toHaveLength(0)
  })

  it('explains which provider address check stopped a task before it was sent', async () => {
    await i18next.changeLanguage('zhCN')
    api.getCanvasAdminTaskRecord.mockResolvedValueOnce({
      ...task,
      derivedExecutionStatus: 'CONFIRMED_FAILED',
      executionStatus: 'CONFIRMED_FAILED',
      customerBillingStatus: 'RELEASED_FAILED',
      failureLocation: 'EXECUTOR_PREFLIGHT',
      preflightDiagnostic: {
        stage: 'SUBMIT_REQUEST',
        reason: 'PROVIDER_URL_REJECTED',
        detail: 'URL_DNS_UNAVAILABLE',
      },
    })
    mount()

    expect(await screen.findByText('服务商地址检查')).toBeVisible()
    expect(
      screen.getByText(/服务商域名当时无法解析，重新提交通常即可/)
    ).toBeVisible()
    expect(screen.getByText('URL_DNS_UNAVAILABLE')).toBeVisible()
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

    expect(await screen.findByText('No cloud result yet')).toBeVisible()
    expect(
      screen.getByText(/^Points release in about \d+ h( \d+ min)?$/)
    ).toBeVisible()
    expect(
      screen.getByText(
        'If there is still no result by then, the frozen points will be released.'
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

  it('shows the customer that frozen points are being released once the deadline has passed', async () => {
    api.getCanvasAdminTaskRecord.mockResolvedValueOnce({
      ...task,
      derivedExecutionStatus: 'UNKNOWN',
      executionStatus: 'UNKNOWN',
      customerBillingStatus: 'FROZEN',
      releasedPoints: '0',
      deductedPoints: '0',
      unknownDeadlineAt: '2020-01-01T00:00:00.000Z',
      earlyReleaseAllowed: false,
      earlyReleaseBlockedReason: 'ACTIVE_REQUEST_LEASE',
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
    mount()

    expect(await screen.findByText('Releasing points')).toBeVisible()
    expect(screen.getByText(/\(expired\)$/)).toBeVisible()
    expect(screen.getByText('Releasing the frozen points.')).toBeVisible()
    expect(screen.queryByText(/^Points release /)).not.toBeInTheDocument()
  })

  it('counts the customer view down and switches to releasing at the deadline while the drawer stays open', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    try {
      vi.setSystemTime(new Date('2026-10-10T12:00:00.000Z'))
      api.getCanvasAdminTaskRecord.mockResolvedValueOnce({
        ...task,
        derivedExecutionStatus: 'UNKNOWN',
        executionStatus: 'UNKNOWN',
        customerBillingStatus: 'FROZEN',
        releasedPoints: '0',
        deductedPoints: '0',
        unknownDeadlineAt: '2026-10-10T12:02:00.000Z',
        earlyReleaseAllowed: false,
        earlyReleaseBlockedReason: 'ACTIVE_REQUEST_LEASE',
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
      mount()

      expect(await screen.findByText('No cloud result yet')).toBeVisible()
      expect(screen.getByText('Points release in about 2 min')).toBeVisible()

      act(() => vi.advanceTimersByTime(60_000))
      expect(screen.getByText('Points release in about 1 min')).toBeVisible()

      act(() => vi.advanceTimersByTime(70_000))
      expect(screen.getByText('Releasing points')).toBeVisible()
      expect(screen.getByText('Releasing the frozen points.')).toBeVisible()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
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
        'Release 14 frozen points for this task. This does not send a cancellation request to the API provider.'
      )
    ).toBeVisible()
    expect(
      screen.getByText(
        /If the API provider already charged, the platform bears the cost\./
      )
    ).toBeVisible()
    fireEvent.change(screen.getByLabelText('Administrator reason'), {
      target: { value: 'Verified with provider' },
    })
    fireEvent.click(screen.getByText('Failure confirmed with the API provider'))
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

  it('enters a manual result for an eligible result after checking the URL and reason, and shows its record', async () => {
    const unknownOutput = (outputIndex: number) => ({
      outputIndex,
      quotedPoints: '7',
      settledPoints: null,
      executionStatus: 'UNKNOWN',
      billingStatus: 'FROZEN',
      error: null,
      usageSnapshot: null,
      completedAt: null,
      billingFinalizedAt: null,
      customerSafeErrorDetail: null,
    })
    const pendingTask = {
      ...task,
      derivedExecutionStatus: 'UNKNOWN',
      executionStatus: 'UNKNOWN',
      customerBillingStatus: 'FROZEN',
      unknownDeadlineAt: '2099-09-14T09:17:00.000Z',
      earlyReleaseAllowed: true,
      outputs: [unknownOutput(0), unknownOutput(1)],
      manualResultTargets: [
        { outputIndex: 0, upstreamTaskId: 'upstream-a' },
        { outputIndex: 1, upstreamTaskId: 'upstream-b' },
      ],
      manualResults: [
        {
          id: 'manual-1',
          outputIndex: 1,
          upstreamTaskId: 'upstream-b',
          status: 'FAILED',
          resultUrl: 'https://cdn.example.com/page.html',
          reason: 'Found in the provider console',
          failureReasonCode: 'PROVIDER_OUTPUT_UNSUPPORTED_MEDIA',
          requestedBy: { principalId: 'admin-1', displayName: 'Operator' },
          createdAt: '2026-09-14T09:20:00.000Z',
          completedAt: '2026-09-14T09:20:10.000Z',
        },
      ],
    }
    api.getCanvasAdminTaskRecord.mockResolvedValue(pendingTask)
    api.requestCanvasTaskManualResult.mockResolvedValue(pendingTask)
    mount()
    // The record of an earlier attempt shows why it was not applied.
    expect(await screen.findByText('Manual result records')).toBeVisible()
    expect(screen.getByText('Not applied')).toBeVisible()
    expect(screen.getByText('Result is not usable media')).toBeVisible()
    expect(screen.getByText('https://cdn.example.com/page.html')).toBeVisible()
    expect(screen.getByText('upstream-b')).toBeVisible()

    fireEvent.click(
      screen.getByRole('button', { name: 'Enter a manual result' })
    )
    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText(
        /If it passes, the customer gets it and 7 points are deducted\./
      )
    ).toBeVisible()
    // Two results can take a manual result: the dialog says so, and the first is chosen with the Provider task that covers it.
    expect(
      within(dialog).getByText('2 results can be entered, one at a time.')
    ).toBeVisible()
    expect(within(dialog).getByText('upstream-a')).toBeVisible()
    const submit = within(dialog).getByRole('button', {
      name: 'Submit manual result',
    })
    expect(submit).toBeDisabled()
    const confirmation = within(dialog).getByText(
      'I confirm this is the result of this task'
    )
    fireEvent.change(within(dialog).getByLabelText('File URL'), {
      target: { value: 'ftp://cdn.example.com/result.png' },
    })
    fireEvent.click(confirmation)
    fireEvent.click(submit)
    expect(
      within(dialog).getByText(
        'Enter an address starting with http:// or https://.'
      )
    ).toBeVisible()
    // The reason is optional: leaving it empty is no error.
    expect(
      within(dialog).queryByText('Enter a reason.')
    ).not.toBeInTheDocument()
    expect(within(dialog).getByLabelText('File URL')).toHaveAttribute(
      'aria-invalid',
      'true'
    )
    expect(api.requestCanvasTaskManualResult).not.toHaveBeenCalled()

    // An HTTP link copied from a provider console is accepted; Cloud downloads it over HTTPS.
    fireEvent.change(within(dialog).getByLabelText('File URL'), {
      target: { value: ' http://cdn.example.com/result.png ' },
    })
    expect(
      within(dialog).getByText(
        'http addresses are downloaded over https automatically.'
      )
    ).toBeVisible()
    // The confirmation was for the earlier address: another address needs it again.
    expect(submit).toBeDisabled()
    fireEvent.click(confirmation)
    expect(submit).toBeEnabled()
    fireEvent.change(within(dialog).getByLabelText('Reason (optional)'), {
      target: { value: ' Provider support sent the file ' },
    })
    fireEvent.click(submit)
    await waitFor(() =>
      expect(api.requestCanvasTaskManualResult).toHaveBeenCalledWith(
        task.id,
        0,
        {
          url: 'http://cdn.example.com/result.png',
          reason: 'Provider support sent the file',
        }
      )
    )
  })

  it('disables early release while a manual result waits for the executor, and refreshes until it finishes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const waiting = {
      ...task,
      derivedExecutionStatus: 'UNKNOWN',
      executionStatus: 'UNKNOWN',
      customerBillingStatus: 'FROZEN',
      unknownDeadlineAt: '2099-09-14T09:17:00.000Z',
      earlyReleaseAllowed: false,
      earlyReleaseBlockedReason: 'MANUAL_RESULT_PENDING',
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
      manualResultTargets: [],
      manualResults: [
        {
          id: 'manual-1',
          outputIndex: 0,
          upstreamTaskId: 'upstream-a',
          status: 'PENDING',
          resultUrl: 'https://cdn.example.com/result.mp4',
          reason: 'Provider support sent the file',
          failureReasonCode: null,
          requestedBy: { principalId: 'admin-1', displayName: 'Operator' },
          createdAt: '2026-09-14T09:20:00.000Z',
          completedAt: null,
        },
      ],
    }
    api.getCanvasAdminTaskRecord.mockResolvedValue(waiting)
    try {
      mount()
      expect(
        await screen.findByRole('button', {
          name: 'Release frozen points early',
        })
      ).toBeDisabled()
      expect(
        screen.getByText(
          'Points can be released after the manual result finishes.'
        )
      ).toBeVisible()
      expect(screen.getByText('Processing')).toBeVisible()
      expect(
        screen.queryByRole('button', { name: 'Enter a manual result' })
      ).not.toBeInTheDocument()
      expect(api.getCanvasAdminTaskRecord).toHaveBeenCalledTimes(1)

      // The executor applies it: the next refresh shows the result, and refreshing stops.
      api.getCanvasAdminTaskRecord.mockResolvedValue({
        ...waiting,
        derivedExecutionStatus: 'SUCCEEDED',
        executionStatus: 'SUCCEEDED',
        customerBillingStatus: 'SETTLED',
        earlyReleaseBlockedReason: null,
        manualResults: waiting.manualResults.map((manual) => ({
          ...manual,
          status: 'APPLIED',
          completedAt: '2026-09-14T09:20:10.000Z',
        })),
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000)
      })
      expect(api.getCanvasAdminTaskRecord).toHaveBeenCalledTimes(2)
      expect(await screen.findByText('Applied')).toBeInTheDocument()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000)
      })
      expect(api.getCanvasAdminTaskRecord).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the chosen result after a 409 refresh and asks to choose and confirm again when it can no longer take one', async () => {
    const output = (
      outputIndex: number,
      executionStatus: string,
      billingStatus: string
    ) => ({
      outputIndex,
      quotedPoints: '7',
      settledPoints: executionStatus === 'SUCCEEDED' ? '7' : null,
      executionStatus,
      billingStatus,
      error: null,
      usageSnapshot: null,
      completedAt: null,
      billingFinalizedAt: null,
      customerSafeErrorDetail: null,
    })
    const base = {
      ...task,
      derivedExecutionStatus: 'UNKNOWN',
      executionStatus: 'UNKNOWN',
      customerBillingStatus: 'FROZEN',
      unknownDeadlineAt: '2099-09-14T09:17:00.000Z',
      earlyReleaseAllowed: true,
      manualResults: [],
    }
    // Result 1 succeeds while the dialog is open: after the 409 refresh only result 2 can take a manual result.
    api.getCanvasAdminTaskRecord
      .mockResolvedValueOnce({
        ...base,
        outputs: [
          output(0, 'UNKNOWN', 'FROZEN'),
          output(1, 'UNKNOWN', 'FROZEN'),
        ],
        manualResultTargets: [
          { outputIndex: 0, upstreamTaskId: 'upstream-a' },
          { outputIndex: 1, upstreamTaskId: 'upstream-b' },
        ],
      })
      .mockResolvedValue({
        ...base,
        outputs: [
          output(0, 'SUCCEEDED', 'SETTLED'),
          output(1, 'UNKNOWN', 'FROZEN'),
        ],
        manualResultTargets: [{ outputIndex: 1, upstreamTaskId: 'upstream-b' }],
      })
    api.requestCanvasTaskManualResult.mockRejectedValueOnce({
      response: { status: 409 },
    })
    mount()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Enter a manual result' })
    )
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.change(within(dialog).getByLabelText('File URL'), {
      target: { value: 'https://cdn.example.com/first.mp4' },
    })
    fireEvent.click(
      within(dialog).getByText('I confirm this is the result of this task')
    )
    const submit = within(dialog).getByRole('button', {
      name: 'Submit manual result',
    })
    fireEvent.click(submit)
    await waitFor(() =>
      expect(api.requestCanvasTaskManualResult).toHaveBeenCalledWith(
        task.id,
        0,
        { url: 'https://cdn.example.com/first.mp4' }
      )
    )
    // The dialog does not move the file to result 2: it asks for a new choice and a new confirmation.
    expect(
      await within(dialog).findByText(
        'Result 1 can no longer take a manual result. Choose a result and confirm again.'
      )
    ).toBeVisible()
    expect(within(dialog).getByText('Choose a result')).toBeVisible()
    expect(within(dialog).getByRole('checkbox')).not.toBeChecked()
    fireEvent.click(
      within(dialog).getByText('I confirm this is the result of this task')
    )
    expect(submit).toBeDisabled()
    expect(api.requestCanvasTaskManualResult).toHaveBeenCalledTimes(1)
  })

  it('names the only eligible result of a task with several results, with its Provider task ID', async () => {
    const output = (
      outputIndex: number,
      executionStatus: string,
      billingStatus: string
    ) => ({
      outputIndex,
      quotedPoints: '7',
      settledPoints: executionStatus === 'SUCCEEDED' ? '7' : null,
      executionStatus,
      billingStatus,
      error: null,
      usageSnapshot: null,
      completedAt: null,
      billingFinalizedAt: null,
      customerSafeErrorDetail: null,
    })
    api.getCanvasAdminTaskRecord.mockResolvedValue({
      ...task,
      derivedExecutionStatus: 'UNKNOWN',
      executionStatus: 'UNKNOWN',
      customerBillingStatus: 'FROZEN',
      unknownDeadlineAt: '2099-09-14T09:17:00.000Z',
      earlyReleaseAllowed: true,
      outputs: [
        output(0, 'SUCCEEDED', 'SETTLED'),
        output(1, 'UNKNOWN', 'FROZEN'),
      ],
      manualResultTargets: [
        { outputIndex: 1, upstreamTaskId: 'upstream-second' },
      ],
      manualResults: [],
    })
    mount()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Enter a manual result' })
    )
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Result 2')).toBeVisible()
    expect(within(dialog).queryByRole('combobox')).not.toBeInTheDocument()
    expect(within(dialog).getByText('upstream-second')).toBeVisible()
    expect(
      within(dialog).getByText(
        "Use this ID to find the file in the provider's console."
      )
    ).toBeVisible()
    // Submitted without a reason: the request carries none.
    api.requestCanvasTaskManualResult.mockResolvedValue({})
    fireEvent.change(within(dialog).getByLabelText('File URL'), {
      target: { value: 'https://cdn.example.com/second.mp4' },
    })
    fireEvent.click(
      within(dialog).getByText('I confirm this is the result of this task')
    )
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Submit manual result' })
    )
    await waitFor(() =>
      expect(api.requestCanvasTaskManualResult).toHaveBeenCalledWith(
        task.id,
        1,
        { url: 'https://cdn.example.com/second.mp4' }
      )
    )
  })

  it('offers no manual result when no result is eligible', async () => {
    api.getCanvasAdminTaskRecord.mockResolvedValue(task)
    mount()
    expect(await screen.findByText('UAT customer')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Enter a manual result' })
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Manual result records')).not.toBeInTheDocument()
  })

  it('force-ends a processing task with the early-release dialog, counting only its unfinished frozen result', async () => {
    const output = {
      settledPoints: null,
      error: null,
      usageSnapshot: null,
      completedAt: null,
      billingFinalizedAt: null,
      customerSafeErrorDetail: null,
    }
    api.getCanvasAdminTaskRecord.mockResolvedValue({
      ...task,
      derivedExecutionStatus: 'PROCESSING',
      executionStatus: 'PROCESSING',
      customerBillingStatus: 'FROZEN',
      releasedPoints: '0',
      deductedPoints: '0',
      earlyReleaseAllowed: true,
      earlyReleaseBlockedReason: null,
      outputs: [
        {
          ...output,
          outputIndex: 0,
          quotedPoints: '6',
          executionStatus: 'PROCESSING',
          billingStatus: 'FROZEN',
        },
        {
          ...output,
          outputIndex: 1,
          quotedPoints: '6',
          settledPoints: '6',
          executionStatus: 'SUCCEEDED',
          billingStatus: 'SETTLED',
        },
      ],
    })
    mount()
    expect(
      screen.queryByRole('button', { name: 'Release frozen points early' })
    ).not.toBeInTheDocument()
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Force-end and release points',
      })
    )
    expect(
      screen.getByText(
        'End this task and release 6 frozen points for 1 unfinished results. The current execution stops; no cancellation request is sent to the API provider.'
      )
    ).toBeVisible()
    fireEvent.change(screen.getByLabelText('Administrator reason'), {
      target: { value: 'Upstream returned 401 and the task kept processing' },
    })
    fireEvent.click(
      screen.getByText('I understand the impact of this operation')
    )
    const actions = screen.getAllByRole('button', {
      name: 'Force-end and release points',
    })
    api.releaseCanvasTaskFrozenPoints.mockResolvedValueOnce(task)
    fireEvent.click(actions.at(-1) as HTMLElement)

    await waitFor(() =>
      expect(api.releaseCanvasTaskFrozenPoints).toHaveBeenCalledWith(task.id, {
        reason: 'Upstream returned 401 and the task kept processing',
        upstreamFailureConfirmed: false,
      })
    )
    await waitFor(() =>
      expect(
        screen.queryByLabelText('Administrator reason')
      ).not.toBeInTheDocument()
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
        'Release 5 frozen points for this task. This does not send a cancellation request to the API provider.'
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
    fireEvent.click(screen.getByText('Failure confirmed with the API provider'))
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

  it('settles an incomplete call cost beside the call and keeps the input on a conflict', async () => {
    api.getCanvasAdminTaskRecord.mockResolvedValue({
      ...task,
      providerCost: {
        completeness: 'INCOMPLETE',
        incompleteCalls: [
          {
            callId: providerCall.localCallId,
            reason: 'UNKNOWN_RESULT',
            canSettle: true,
          },
        ],
        manualSettlements: [],
      },
    })
    api.settleCanvasTaskProviderCost.mockRejectedValueOnce({
      response: { status: 409 },
    })
    mount()
    expect(
      await screen.findByText(
        'Provider cost: Incomplete cost data · Call result unknown'
      )
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Settle cost' }))
    const amount = await screen.findByLabelText(
      'Amount the API provider actually charged (RMB)'
    )
    fireEvent.change(amount, { target: { value: '0.12345' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm settlement' }))
    expect(
      await screen.findByText(
        'Enter an amount of at least 0 with at most 4 decimal places.'
      )
    ).toBeInTheDocument()
    expect(api.settleCanvasTaskProviderCost).not.toHaveBeenCalled()
    fireEvent.change(amount, { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm settlement' }))
    expect(
      await screen.findByText('The cost status of this call has changed.')
    ).toBeInTheDocument()
    expect(api.settleCanvasTaskProviderCost).toHaveBeenCalledWith(task.id, {
      callId: providerCall.localCallId,
      amountRmb: '0',
    })
    expect(
      screen.getByLabelText('Amount the API provider actually charged (RMB)')
    ).toHaveValue('0')
  })

  it('shows an active manual settlement and offers to revoke it', async () => {
    api.getCanvasAdminTaskRecord.mockResolvedValue({
      ...task,
      providerCost: {
        completeness: 'COMPLETE',
        incompleteCalls: [],
        manualSettlements: [
          {
            providerCostId: 'cost-1',
            callId: providerCall.localCallId,
            status: 'CONFIRMED',
            amountRmb: '0',
            settledAt: '2026-09-26T01:31:00.000Z',
            settledBy: 'Platform admin',
            reason: null,
            canRevoke: true,
          },
        ],
      },
    })
    mount()
    expect(
      await screen.findByText(
        /Settled manually · API provider did not charge · Platform admin/u
      )
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Revoke settlement' }))
    expect(
      await screen.findByText(
        'The call returns to incomplete cost data. The manual cost is kept as voided and no longer counts as recorded cost.'
      )
    ).toBeInTheDocument()
  })
})
