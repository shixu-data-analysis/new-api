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
import i18next from 'i18next'
import { beforeAll, describe, expect, it } from 'vitest'

import zh from '@/i18n/locales/zh.json'

import {
  auditActionOptionLabel,
  auditDetailRows,
  auditObjectText,
  auditReasonRow,
  type AuditEvent,
} from '../audit-log-format'
import type { CanvasAuditResolvedNames } from '../types'

const names: CanvasAuditResolvedNames = {
  customers: {},
  customerModels: {},
  agents: {},
  rechargeOrders: {},
  priceGroups: {},
  modelTags: {},
  promotionVersions: {},
  campaignGrantPlans: {},
  priceVersions: {},
  providerRateVersions: {},
  providers: {},
  inviteCodes: {},
  rechargeCodes: {},
  rechargeCodeBatches: {},
  principals: {},
}

function event(
  action: string,
  publicMetadata: Record<string, unknown>,
  extra: Partial<AuditEvent> = {}
): AuditEvent {
  return {
    id: '89000000-0000-7000-8000-000000000001',
    occurredAt: '2026-10-11T08:00:00.000Z',
    service: 'canvas-cloud',
    environment: 'test',
    category: 'CONFIGURATION',
    action,
    outcome: 'SUCCESS',
    severity: 'INFO',
    actorPrincipalId: null,
    actorType: 'PLATFORM_ADMIN',
    actorUsername: 'admin',
    requestId: null,
    traceId: null,
    resourceType: 'PROVIDER',
    resourceId: null,
    resourceKey: null,
    reasonCode: null,
    publicMetadata,
    ...extra,
  }
}

const rows = (value: AuditEvent) =>
  Object.fromEntries(
    auditDetailRows(value, names, i18next.t, 'zhCN').map((row) => [
      row.label,
      row.value,
    ])
  )

describe('operation log value names', () => {
  beforeAll(async () => {
    i18next.addResourceBundle('zhCN', 'translation', zh.translation, true, true)
    await i18next.changeLanguage('zhCN')
  })

  it('names balance records and connection checks like their own pages', () => {
    expect(
      rows(event('provider.balance_record.added', { recordType: 'TOP_UP' }))
    ).toMatchObject({ 类型: '充值' })
    expect(
      rows(
        event('runtime.task_media.checked', {
          environment: 'uat',
          outcome: 'PASSED',
        })
      )
    ).toMatchObject({ 检查结果: '连接检查通过' })
  })

  it('names recharge-code batch counters with the recharge-code statuses', () => {
    expect(
      rows(
        event('recharge.code_batch.unused_downloaded', {
          downloadCount: 3,
          redeemedCount: 2,
          voidCount: 1,
        })
      ).数量
    ).toBe('已使用：2\n已作废：1')
  })

  it('shows the agent qualification status, not the invite-code status', () => {
    expect(
      rows(
        event('customer.inviter_capability.granted', {
          username: 'agent_wang',
          status: 'ACTIVE',
        })
      ).状态
    ).toBe(i18next.t('Agent status ACTIVE'))
  })

  it('counts both price versions and provider rates that took effect together', () => {
    expect(
      rows(
        event('pricing.model.activated', {
          priceVersionIds: ['a', 'b'],
          providerRateVersionIds: ['c'],
        })
      )
    ).toMatchObject({ 同时生效的版本数量: '3' })
  })

  it('names execution policies by their settings section and never shows a raw kind', () => {
    expect(
      auditObjectText(
        event('execution.policy.published', { kind: 'GLOBAL_LIMITS' }),
        names,
        i18next.t
      )
    ).toBe('执行策略 · 全局执行限额')
    expect(
      auditObjectText(
        event('execution.policy.published', { kind: 'CHANNEL_POLICY' }),
        names,
        i18next.t
      )
    ).toBe('执行策略')
  })

  it('explains an attention hint with the runtime page sentence instead of its type code', () => {
    const hint = event(
      'executor.attention.raised',
      { count: 3 },
      {
        actorType: 'SYSTEM',
        resourceKey: 'OUTPUT_TOO_LARGE',
        reasonCode: 'OUTPUT_TOO_LARGE',
      }
    )
    expect(auditObjectText(hint, names, i18next.t)).toBe('需要关注')
    expect(auditReasonRow(hint, i18next.t)?.value).toBe(
      i18next.t(
        '{{count}} tasks in the last 24 hours failed because the result file was too large',
        { count: 3 }
      )
    )
  })

  it('names manual result requests and outcomes by their own actions, with the 1-based result position', () => {
    const requested = event(
      'task.execution.admin_manual_result_requested',
      {
        outputIndex: 1,
        reason: '服务商后台可见',
        resultOrigin: 'https://cdn.example.com',
      },
      { resourceType: 'TASK', reasonCode: 'ADMIN_MANUAL_RESULT' }
    )
    expect(rows(requested)).toMatchObject({
      结果位置: '2',
      原因: '服务商后台可见',
      文件所在网站: 'https://cdn.example.com',
    })
    const failed = event(
      'executor.manual_result.failed',
      { outputIndex: 0 },
      {
        actorType: 'SYSTEM',
        resourceType: 'TASK',
        reasonCode: 'PROVIDER_OUTPUT_UNSUPPORTED_MEDIA',
      }
    )
    expect(auditObjectText(failed, names, i18next.t)).toBe('任务')
    expect(auditReasonRow(failed, i18next.t)?.value).toBe('结果不是可用的媒体')
    expect(
      auditReasonRow(
        { ...failed, reasonCode: 'OUTPUT_NOT_AWAITING_RESULT' },
        i18next.t
      )?.value
    ).toBe('不用补录了：服务商已返回结果，或积分已释放')
  })

  it('labels settlement rule changes like the settlement settings page, with money and percent units', () => {
    expect(
      rows(
        event('agent.settlement_policy.published', {
          version: 2,
          previous: { minWithdrawalMinor: 5000, taxRateBasisPoints: 0 },
          next: { minWithdrawalMinor: 10000, taxRateBasisPoints: 800 },
        })
      ).修改内容
    ).toBe(
      `${i18next.t('Minimum withdrawal amount')}：¥50 → ¥100\n${i18next.t('Withholding tax rate')}：0% → 8%`
    )
  })

  it('names catalog publications, exports and alert settings instead of showing their codes', () => {
    expect(auditActionOptionLabel('catalog.admin.published', i18next.t)).toBe(
      '发布目录修改'
    )
    expect(auditActionOptionLabel('catalog.exported', i18next.t)).toBe(
      '导出当前目录为目录包'
    )
    expect(
      auditActionOptionLabel('model.availability.settings_updated', i18next.t)
    ).toBe('修改下架预警设置')
    expect(auditActionOptionLabel('catalog.model.retired', i18next.t)).toBe(
      '删除模型'
    )
    expect(auditActionOptionLabel('catalog.channel.retired', i18next.t)).toBe(
      '删除接口配置'
    )
    expect(
      rows(
        event('catalog.real_call.sent', {
          modelKey: 'acme.video.one',
          upstreamModelId: 'one',
          method: 'POST',
          path: '/v1/videos',
          credentialGroup: '主账号',
          status: 200,
          timedOut: false,
          poll: false,
        })
      )
    ).toEqual({
      '上游模型 ID': 'one',
      请求方法: 'POST',
      路径: '/v1/videos',
      'API Key 组': '主账号',
      查询请求: '否',
      'HTTP 状态': '200',
      已超时: '否',
    })
    expect(
      rows(
        event('catalog.admin.published', {
          models: [{ productKey: 'acme.video.one', version: '1.0.0-admin.1' }],
          channels: [{ key: 'acme.video', version: '1.0.0-admin.2' }],
          providers: ['acme'],
        })
      )
    ).toEqual({
      模型: 'acme.video.one',
      接口配置: 'acme.video',
      'API 服务商': 'acme',
    })
    expect(
      rows(
        event('catalog.exported', {
          bundleVersion: 'export.20261103.010000',
          models: 82,
          channels: 25,
        })
      )
    ).toEqual({
      目录包版本: 'export.20261103.010000',
      模型: '82',
      接口配置: '25',
    })
    expect(
      rows(
        event('model.availability.settings_updated', {
          version: 4,
          before: {
            autoProbeEnabled: false,
            intervalHours: 6,
            threshold: 2,
            alertEmails: [],
          },
          after: {
            autoProbeEnabled: true,
            intervalHours: 6,
            threshold: 3,
            alertEmails: ['a***@x.com'],
          },
          changedProviders: [{ providerId: 'p1' }],
        })
      )
    ).toEqual({
      版本: '4',
      修改内容: '自动探测：否 → 是\n连续几次才产生预警：2 → 3\n通知邮箱：有变化',
      '规则有变的 API 服务商数': '1',
    })
  })

  it('names execution policy fields by their settings labels and only flags changed rule lists', () => {
    expect(
      rows(
        event('execution.policy.published', {
          kind: 'ERROR_MAPPING',
          version: 3,
          before: { requestTimeoutMs: 1000, rules: [{ id: 'a' }] },
          after: {
            requestTimeoutMs: 2000,
            rules: [{ id: 'b' }],
            showSafeErrorDetailsToCustomer: false,
          },
        })
      ).修改内容
    ).toBe(
      [
        `${i18next.t('requestTimeoutMs')}：1000 → 2000`,
        `${i18next.t('rules')}：${i18next.t('Changed')}`,
        `${i18next.t('Show the upstream reason to customers')}：${i18next.t('Not configured')} → ${i18next.t('No')}`,
      ].join('\n')
    )
  })

  it('hands a preflight diagnosis to the shared failure diagnosis block', () => {
    const diagnostic = {
      stage: 'BODY_TEMPLATE',
      reason: 'BODY_TEMPLATE_INVALID',
    }
    const detail = auditDetailRows(
      event(
        'executor.task.attempt_failed',
        { workerId: 'worker-1', attempt: 1, preflightDiagnostic: diagnostic },
        { actorType: 'SYSTEM', resourceType: 'TASK' }
      ),
      names,
      i18next.t,
      'zhCN'
    )
    expect(detail.find((row) => row.diagnostic)?.diagnostic).toEqual(diagnostic)
  })
})
