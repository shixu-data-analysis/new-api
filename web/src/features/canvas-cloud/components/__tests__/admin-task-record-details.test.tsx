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
  getCanvasTaskPointLedger: vi.fn(),
}))
const calls = vi.hoisted(() => ({ getCanvasTaskCalls: vi.fn() }))
vi.mock('../../api', () => api)
vi.mock('../../task-call-api', () => calls)

const task = {
  id: '01a09f34-3392-7448-b39e-d6106e62ccca',
  customerId: 'customer-1',
  customerName: 'UAT customer',
  customerModelId: 'model-1',
  modelName: 'GPT Image 2 Pro',
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
  parameters: {
    quality: '2K',
    aspectRatio: '9:16',
    batchSize: 2,
    hiddenSecret: 'never',
  },
  multiResultMode: 'FANOUT',
  failureLocation: 'PROVIDER_RESPONSE',
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
  errorCode: null,
  errorRuleId: null,
  errorRuleVersion: null,
  sanitizedError: null,
  sanitizedRequest: { model: 'gpt-image-2-pro' },
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
    expect(await screen.findByText(task.id)).toHaveClass('break-all')
    expect(screen.getByText('Customer').closest('dl')).toHaveClass(
      'sm:grid-cols-2'
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
    expect(screen.getByText('Fanout generation (fanout)')).toBeVisible()
    expect(screen.getByText('9:16')).toBeVisible()
    expect(screen.queryByText('hiddenSecret')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(calls.getCanvasTaskCalls).toHaveBeenCalledWith(
        task.id,
        { page: 1, pageSize: 20 },
        expect.any(AbortSignal)
      )
    )
  })

  it('renders one expandable provider-call table with merged response facts', async () => {
    mount()
    const details = await screen.findByRole('button', { name: 'Details' })
    expect(screen.getByText('202 → 200')).toBeVisible()
    fireEvent.click(details)
    expect(screen.getByRole('button', { name: 'Hide details' })).toBeVisible()
    expect(await screen.findByText('call-long-id')).toHaveClass('break-all')
    expect(screen.getByText('executor-01')).toBeVisible()
    fireEvent.click(screen.getByText('Sent upstream request (sanitized)'))
    expect(screen.getAllByText(/gpt-image-2-pro/).length).toBeGreaterThan(0)
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
    if (!lastDetailButton)
      throw new Error('Point record details button is missing')
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

  it('keeps unknown failure location hidden and non-failed details collapsed', async () => {
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
    ).toHaveAttribute('aria-expanded', 'false')
    expect(calls.getCanvasTaskCalls).not.toHaveBeenCalled()
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

    expect(await screen.findByText('确认失败')).toBeVisible()
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
