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
import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'

import {
  judgeModelAvailabilityRule,
  modelAvailabilityErrorKey,
  probeFailureKey,
  testModelAvailabilityList,
  testModelAvailabilityRequest,
  type AvailabilityProvider,
  type CustomRule,
  type JudgeResult,
  type ListRule,
  type ListTestResult,
  type ProbeRequestShape,
  type RequestEvidence,
  type RequestRule,
  type ResponseRow,
  type RowJudgement,
  type StoredResponse,
} from '../model-availability-api'
import {
  probedUpstreamIds,
  probePathIssue,
  requestIssues,
  requestPreview,
  requestsPerDay,
  ruleIssues,
  type RequestIssues,
} from '../model-availability-rules'

type EditableRow = ResponseRow & { key: number }

function JudgementText(props: { judgement: RowJudgement | undefined }) {
  const { t } = useTranslation()
  const { judgement } = props
  if (!judgement) return null
  if (judgement.result === 'COST_RISK') {
    return <>{t('Success or timeout: it may have been charged')}</>
  }
  if (judgement.result === 'UNDETERMINED') return <>{t('No rule matched')}</>
  return (
    <>
      {t(
        judgement.result === 'MISSING'
          ? 'Rule {{row}} says gone'
          : 'Rule {{row}} says available',
        { row: judgement.rowIndex + 1 }
      )}
    </>
  )
}

const REJECTION_LABELS: Record<string, string> = {
  COST_RISK:
    'A request succeeded or timed out, so it may have started generating. Use an error the provider rejects at once.',
  NO_ANSWER: 'A request got no answer. Send it again.',
  SAME_RESPONSE:
    'Both answers are the same, so this request cannot tell the models apart. Try another wrong value.',
  WRONG_RESULT:
    'The results must be available for the first model and gone for the second.',
}

function FieldError(props: { id: string; issue: string | undefined }) {
  const { t } = useTranslation()
  if (!props.issue) return null
  return (
    <p id={props.id} role='alert' className='text-destructive text-sm'>
      {t(props.issue, {
        model: '{{model}}',
        interpolation: { escapeValue: false },
      })}
    </p>
  )
}

function answerText(
  response: StoredResponse | undefined,
  t: ReturnType<typeof useTranslation>['t']
): string {
  if (!response) return ''
  if (response.notSent) {
    return t('Not sent: the first request may already have been charged.')
  }
  if (response.timedOut) return t('No answer within the wait')
  if (response.status === null) return t('The network failed')
  return `HTTP ${response.status} ${response.body.slice(0, 500)}`
}

export function ModelAvailabilityRuleDialog(props: {
  provider: AvailabilityProvider
  rule: CustomRule | null
  intervalHours: number
  onCancel: () => void
  onApply: (rule: CustomRule, untested: boolean) => void
}) {
  const { t } = useTranslation()
  const { provider, rule } = props
  const list = rule?.type === 'LIST' ? rule : null
  const request = rule?.type === 'REQUEST' ? rule : null
  const nextRowKey = useRef(0)
  const editable = (row: ResponseRow): EditableRow => {
    nextRowKey.current += 1
    return { ...row, key: nextRowKey.current }
  }
  const emptyRow = (verdict: ResponseRow['verdict']) =>
    editable({ status: null, path: '', op: 'CONTAINS', value: '', verdict })

  const [type, setType] = useState<CustomRule['type']>(rule?.type ?? 'LIST')
  const [listPath, setListPath] = useState(list?.path ?? '/v1/models')
  const [listAuth, setListAuth] = useState<ListRule['auth']>(
    list?.auth ?? 'API_KEY'
  )
  const [field, setField] = useState(list?.modelIdField ?? 'data[].id')
  const [method, setMethod] = useState<RequestRule['method']>(
    request?.method ?? 'POST'
  )
  const [path, setPath] = useState(request?.path ?? '')
  const [auth, setAuth] = useState<RequestRule['auth']>(
    request?.auth ?? 'API_KEY'
  )
  const [template, setTemplate] = useState(
    request?.template ?? '{"model":"{{model}}"}'
  )
  const [timeoutSeconds, setTimeoutSeconds] = useState(
    String(request?.timeoutSeconds ?? 15)
  )
  const [rows, setRows] = useState<EditableRow[]>(() =>
    request?.rows.length
      ? request.rows.map(editable)
      : [emptyRow('MISSING'), emptyRow('AVAILABLE')]
  )
  const models = probedUpstreamIds(provider.models, auth)
  const [pickedModel, setAvailableModel] = useState('')
  // A model that this API Key choice cannot reach cannot be the one tested.
  const availableModel = models.includes(pickedModel)
    ? pickedModel
    : (models[0] ?? '')
  const [missingModel, setMissingModel] = useState('canvas-probe-no-such-model')
  const [acknowledged, setAcknowledged] = useState(false)
  const [evidence, setEvidence] = useState<RequestEvidence | null>(null)
  const [judged, setJudged] = useState<JudgeResult | null>(null)
  const [confirmUntested, setConfirmUntested] = useState(false)
  const [listResult, setListResult] = useState<ListTestResult | null>(null)
  const [issues, setIssues] = useState<RequestIssues>({})
  const [message, setMessage] = useState('')

  const listRule = (): ListRule => ({
    type: 'LIST',
    path: listPath,
    auth: listAuth,
    modelIdField: field,
  })
  const shape = (): ProbeRequestShape => ({
    type: 'REQUEST',
    method,
    path,
    auth,
    template: method === 'POST' ? template : null,
    timeoutSeconds: Number(timeoutSeconds),
  })
  const plainRows = (): ResponseRow[] =>
    rows.map(({ key: _key, ...row }) => row)
  const requestRule = (): RequestRule => ({ ...shape(), rows: plainRows() })
  // A changed request has no answers yet; a changed row is judged again from the stored ones without sending.
  const resetAnswers = () => {
    setEvidence(null)
    setJudged(null)
    setConfirmUntested(false)
    setIssues({})
  }
  const failed = (error: unknown) =>
    setMessage(
      t(
        modelAvailabilityErrorKey(error) ??
          'The request failed. Check the fields and try again.'
      )
    )

  const testList = useMutation({
    mutationFn: () =>
      testModelAvailabilityList({
        providerId: provider.providerId,
        source: 'CUSTOM',
        rule: listRule(),
      }),
    onSuccess: (result) => {
      setListResult(result)
      setMessage('')
    },
    onError: failed,
  })
  const send = useMutation({
    mutationFn: () =>
      testModelAvailabilityRequest({
        providerId: provider.providerId,
        request: shape(),
        availableModel,
        missingModel,
        acknowledgedCost: true,
      }),
    onSuccess: (result) => {
      setEvidence(result)
      setJudged(null)
      setMessage('')
    },
    onError: failed,
  })
  const judge = useMutation({
    mutationFn: () =>
      judgeModelAvailabilityRule({
        providerId: provider.providerId,
        rule: requestRule(),
      }),
    onSuccess: (result) => {
      setJudged(result)
      setMessage('')
    },
    onError: failed,
  })

  const listPathIssue = probePathIssue(listPath)
  const testListRule = () => {
    if (!listPathIssue) testList.mutate()
  }
  const sendRequests = () => {
    const found = requestIssues(shape())
    setIssues(found)
    if (Object.keys(found).length === 0) send.mutate()
  }
  const judgeRule = () => {
    const found = ruleIssues(shape(), plainRows())
    setIssues(found)
    if (Object.keys(found).length === 0) judge.mutate()
  }
  const applyList = () => {
    if (!listResult?.ok) {
      setMessage(
        t(
          'Test the rule first. A rule that cannot read the list cannot be used.'
        )
      )
      return
    }
    props.onApply(listRule(), false)
  }
  const applyRequest = () => {
    const found = ruleIssues(shape(), plainRows())
    setIssues(found)
    if (Object.keys(found).length > 0) return
    if (judged?.sent && judged.verdict.usable) {
      props.onApply(requestRule(), false)
      return
    }
    if (judged?.sent || evidence) {
      setMessage(
        t(
          'Judge the stored answers first. The rule must tell the two models apart.'
        )
      )
      return
    }
    if (provider.pause) {
      setMessage(t('A paused provider must send a new test before it resumes.'))
      return
    }
    if (!confirmUntested) {
      setMessage(
        t(
          'Send a test, or confirm below that you are using the rule without one.'
        )
      )
      return
    }
    props.onApply(requestRule(), true)
  }
  const updateRow = (key: number, change: Partial<ResponseRow>) => {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...change } : row))
    )
    setJudged(null)
  }
  const answers = evidence ?? (judged?.sent ? judged.evidence : null)

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onCancel()
      }}
    >
      <DialogContent className='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>
            {t('Custom rule · {{name}}', { name: provider.providerName })}
          </DialogTitle>
          <DialogDescription>
            {provider.pause
              ? t(
                  'Probing is paused. Check the cost in the provider console, change the request to an error the provider rejects at once, then test it.'
                )
              : t('Use Read a model list whenever this provider has any list.')}
          </DialogDescription>
        </DialogHeader>
        <div className='max-h-[60vh] space-y-4 overflow-y-auto pe-1'>
          <div className='space-y-1'>
            <Label htmlFor='rule-type'>{t('Method')}</Label>
            <NativeSelect
              id='rule-type'
              value={type}
              onChange={(event) => {
                setType(event.target.value as CustomRule['type'])
                setMessage('')
              }}
            >
              <NativeSelectOption value='LIST'>
                {t('Read a model list')}
              </NativeSelectOption>
              <NativeSelectOption value='REQUEST'>
                {t('Try each model (may be charged)')}
              </NativeSelectOption>
            </NativeSelect>
          </div>

          {type === 'LIST' ? (
            <div className='space-y-3'>
              <div className='grid gap-3 sm:grid-cols-2'>
                <div className='space-y-1'>
                  <Label htmlFor='rule-list-path'>{t('Path')}</Label>
                  <Input
                    id='rule-list-path'
                    value={listPath}
                    aria-invalid={Boolean(listPathIssue)}
                    aria-describedby='rule-list-path-error'
                    onChange={(event) => {
                      setListPath(event.target.value)
                      setListResult(null)
                    }}
                  />
                  <FieldError id='rule-list-path-error' issue={listPathIssue} />
                </div>
                <div className='space-y-1'>
                  <Label htmlFor='rule-list-auth'>{t('API Key')}</Label>
                  <NativeSelect
                    id='rule-list-auth'
                    value={listAuth}
                    onChange={(event) => {
                      setListAuth(event.target.value as ListRule['auth'])
                      setListResult(null)
                    }}
                  >
                    <NativeSelectOption value='API_KEY'>
                      {t('Send the API Key')}
                    </NativeSelectOption>
                    <NativeSelectOption value='NONE'>
                      {t('No API Key')}
                    </NativeSelectOption>
                  </NativeSelect>
                </div>
              </div>
              <div className='space-y-1'>
                <Label htmlFor='rule-list-field'>
                  {t('Where the model ID is')}
                </Label>
                <Input
                  id='rule-list-field'
                  className='font-mono'
                  value={field}
                  onChange={(event) => {
                    setField(event.target.value)
                    setListResult(null)
                  }}
                />
                <p className='text-muted-foreground text-sm'>
                  {t(
                    'The field that holds the model ID in the provider answer. [] means every item of an array, for example data[].id.'
                  )}
                </p>
              </div>
              <Button
                variant='outline'
                disabled={testList.isPending}
                onClick={testListRule}
              >
                {testList.isPending ? t('Testing...') : t('Test rule')}
              </Button>
              {listResult?.results.map((result) => (
                <div
                  key={result.credentialGroupName ?? 'provider'}
                  className='rounded-md border p-2 text-sm'
                >
                  <p className={result.ok ? '' : 'text-destructive'}>
                    {result.credentialGroupName
                      ? `${result.credentialGroupName}: `
                      : ''}
                    {result.ok
                      ? t('Read {{count}} models', { count: result.count })
                      : t(probeFailureKey(result.reason))}
                  </p>
                  <p className='text-muted-foreground font-mono text-xs break-all'>
                    {result.ok ? result.samples.join(', ') : result.snippet}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className='space-y-3'>
              <div className='grid gap-3 sm:grid-cols-3'>
                <div className='space-y-1'>
                  <Label htmlFor='rule-method'>{t('Request method')}</Label>
                  <NativeSelect
                    id='rule-method'
                    value={method}
                    onChange={(event) => {
                      setMethod(event.target.value as RequestRule['method'])
                      resetAnswers()
                    }}
                  >
                    <NativeSelectOption value='POST'>POST</NativeSelectOption>
                    <NativeSelectOption value='GET'>GET</NativeSelectOption>
                  </NativeSelect>
                </div>
                <div className='space-y-1'>
                  <Label htmlFor='rule-auth'>{t('API Key')}</Label>
                  <NativeSelect
                    id='rule-auth'
                    value={auth}
                    onChange={(event) => {
                      setAuth(event.target.value as RequestRule['auth'])
                      resetAnswers()
                    }}
                  >
                    <NativeSelectOption value='API_KEY'>
                      {t('Send the API Key')}
                    </NativeSelectOption>
                    <NativeSelectOption value='NONE'>
                      {t('No API Key')}
                    </NativeSelectOption>
                  </NativeSelect>
                </div>
                <div className='space-y-1'>
                  <Label htmlFor='rule-timeout'>
                    {t('Wait at most (seconds)')}
                  </Label>
                  <Input
                    id='rule-timeout'
                    inputMode='numeric'
                    value={timeoutSeconds}
                    aria-invalid={Boolean(issues.timeoutSeconds)}
                    aria-describedby='rule-timeout-error'
                    onChange={(event) => setTimeoutSeconds(event.target.value)}
                  />
                  <FieldError
                    id='rule-timeout-error'
                    issue={issues.timeoutSeconds}
                  />
                </div>
              </div>
              <div className='space-y-1'>
                <Label htmlFor='rule-path'>{t('Path')}</Label>
                <Input
                  id='rule-path'
                  className='font-mono'
                  value={path}
                  aria-invalid={Boolean(issues.path)}
                  aria-describedby='rule-path-error'
                  onChange={(event) => {
                    setPath(event.target.value)
                    resetAnswers()
                  }}
                />
                <FieldError id='rule-path-error' issue={issues.path} />
              </div>
              {method === 'POST' ? (
                <div className='space-y-1'>
                  <Label htmlFor='rule-template'>
                    {t('The deliberately wrong request content')}
                  </Label>
                  <Textarea
                    id='rule-template'
                    className='font-mono'
                    value={template}
                    aria-invalid={Boolean(issues.template)}
                    aria-describedby='rule-template-error'
                    onChange={(event) => {
                      setTemplate(event.target.value)
                      resetAnswers()
                    }}
                  />
                  <FieldError
                    id='rule-template-error'
                    issue={issues.template}
                  />
                </div>
              ) : null}

              <div className='space-y-2 rounded-md border p-3'>
                <p className='text-sm font-medium'>
                  {t('Step 1: send a request and see the answers')}
                </p>
                <div className='grid gap-3 sm:grid-cols-2'>
                  <div className='space-y-1'>
                    <Label htmlFor='rule-available'>
                      {t('A model known to work')}
                    </Label>
                    <NativeSelect
                      id='rule-available'
                      value={availableModel}
                      onChange={(event) =>
                        setAvailableModel(event.target.value)
                      }
                    >
                      {models.map((model) => (
                        <NativeSelectOption key={model} value={model}>
                          {model}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className='space-y-1'>
                    <Label htmlFor='rule-missing'>
                      {t('A removed or made-up model')}
                    </Label>
                    <Input
                      id='rule-missing'
                      value={missingModel}
                      onChange={(event) => setMissingModel(event.target.value)}
                    />
                  </div>
                </div>
                <div className='space-y-1'>
                  <p className='text-sm font-medium'>
                    {t('Requests to be sent')}
                  </p>
                  {[availableModel, missingModel].map((model) => (
                    <pre
                      key={model}
                      className='bg-muted overflow-x-auto rounded-md p-2 font-mono text-xs whitespace-pre-wrap'
                    >
                      {requestPreview(shape(), model)}
                    </pre>
                  ))}
                </div>
                <Label className='font-normal'>
                  <Checkbox
                    checked={acknowledged}
                    onCheckedChange={(value) => setAcknowledged(Boolean(value))}
                  />
                  {t(
                    'I understand this sends 2 real requests that may be charged. Once used, it sends about {{count}} requests a day.',
                    {
                      count: requestsPerDay(models.length, props.intervalHours),
                    }
                  )}
                </Label>
                <Button
                  variant='outline'
                  disabled={!acknowledged || send.isPending}
                  onClick={sendRequests}
                >
                  {send.isPending
                    ? t('Sending...')
                    : t('Send requests and see the answers')}
                </Button>
                {answers ? (
                  <div className='space-y-1'>
                    {[answers.availableModel, answers.missingModel].map(
                      (model, index) => (
                        <div key={model} className='rounded-md border p-2'>
                          <p className='font-mono text-xs'>{model}</p>
                          <p className='text-muted-foreground font-mono text-xs break-all'>
                            {answerText(answers.responses[index], t)}
                          </p>
                          {judged?.sent ? (
                            <p className='text-sm'>
                              <JudgementText
                                judgement={judged.verdict.judgements[index]}
                              />
                            </p>
                          ) : null}
                        </div>
                      )
                    )}
                  </div>
                ) : null}
              </div>

              <div className='space-y-2 rounded-md border p-3'>
                <p className='text-sm font-medium'>
                  {t('Step 2: how to read the answer')}
                </p>
                <p className='text-muted-foreground text-sm'>
                  {t(
                    'Rules match from the top. Fields are written as above, for example error.message is message inside error. An answer no rule matches counts as a failed probe, not as gone.'
                  )}
                </p>
                {rows.map((row) => (
                  <div
                    key={row.key}
                    className='grid items-center gap-2 sm:grid-cols-[5rem_1fr_6rem_1fr_6rem_auto]'
                  >
                    <Input
                      aria-label={t('HTTP status')}
                      placeholder={t('Any')}
                      inputMode='numeric'
                      value={row.status ?? ''}
                      onChange={(event) =>
                        updateRow(row.key, {
                          status: event.target.value
                            ? Number(event.target.value)
                            : null,
                        })
                      }
                    />
                    <Input
                      aria-label={t('Field')}
                      className='font-mono'
                      placeholder='error.message'
                      value={row.path}
                      onChange={(event) =>
                        updateRow(row.key, { path: event.target.value })
                      }
                    />
                    <NativeSelect
                      aria-label={t('Match')}
                      value={row.op}
                      onChange={(event) =>
                        updateRow(row.key, {
                          op: event.target.value as ResponseRow['op'],
                        })
                      }
                    >
                      <NativeSelectOption value='CONTAINS'>
                        {t('Contains')}
                      </NativeSelectOption>
                      <NativeSelectOption value='EQUALS'>
                        {t('Equals')}
                      </NativeSelectOption>
                    </NativeSelect>
                    <Input
                      aria-label={t('Value')}
                      value={row.value}
                      onChange={(event) =>
                        updateRow(row.key, { value: event.target.value })
                      }
                    />
                    <NativeSelect
                      aria-label={t('Means')}
                      value={row.verdict}
                      onChange={(event) =>
                        updateRow(row.key, {
                          verdict: event.target.value as ResponseRow['verdict'],
                        })
                      }
                    >
                      <NativeSelectOption value='MISSING'>
                        {t('Gone')}
                      </NativeSelectOption>
                      <NativeSelectOption value='AVAILABLE'>
                        {t('Available')}
                      </NativeSelectOption>
                    </NativeSelect>
                    <Button
                      variant='ghost'
                      size='sm'
                      disabled={rows.length <= 2}
                      onClick={() => {
                        setRows((current) =>
                          current.filter((item) => item.key !== row.key)
                        )
                        setJudged(null)
                      }}
                    >
                      {t('Remove')}
                    </Button>
                  </div>
                ))}
                <FieldError id='rule-rows-error' issue={issues.rows} />
                <div className='flex flex-wrap gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() =>
                      setRows((current) => [...current, emptyRow('MISSING')])
                    }
                  >
                    {t('Add rule')}
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={judge.isPending}
                    onClick={judgeRule}
                  >
                    {t('Judge with the stored answers')}
                  </Button>
                </div>
                {judged?.sent === false ? (
                  <p className='text-muted-foreground text-sm'>
                    {t(
                      judged.inProgress
                        ? 'This request was sent and has not answered yet. Wait for it, then try again.'
                        : 'This request has not been sent yet.'
                    )}
                  </p>
                ) : null}
                {judged?.sent && !judged.verdict.usable ? (
                  <p role='alert' className='text-destructive text-sm'>
                    {t(REJECTION_LABELS[judged.verdict.reason ?? ''] ?? '')}
                  </p>
                ) : null}
                {judged?.sent && judged.verdict.usable ? (
                  <p role='status' className='text-sm'>
                    {t('The rule tells the two models apart.')}
                  </p>
                ) : null}
              </div>

              {!answers && !provider.pause ? (
                <Label className='font-normal'>
                  <Checkbox
                    checked={confirmUntested}
                    onCheckedChange={(value) =>
                      setConfirmUntested(Boolean(value))
                    }
                  />
                  {t(
                    'Use it without a test. A wrong rule may read a removed model as available, with no warning.'
                  )}
                </Label>
              ) : null}
            </div>
          )}
        </div>
        {message ? (
          <p role='alert' className='text-destructive text-sm'>
            {message}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant='outline' onClick={props.onCancel}>
            {t('Cancel')}
          </Button>
          <Button onClick={type === 'LIST' ? applyList : applyRequest}>
            {t('Apply to settings')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
