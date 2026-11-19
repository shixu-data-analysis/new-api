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
import { describe, expect, it } from 'vitest'

import type { ProbeRequestShape, ResponseRow } from '../model-availability-api'
import {
  probedUpstreamIds,
  probePathIssue,
  requestPreview,
  requestsPerDay,
  requestIssues,
  ruleIssues,
} from '../model-availability-rules'

const shape: ProbeRequestShape = {
  type: 'REQUEST',
  method: 'POST',
  path: '/v1/videos',
  auth: 'API_KEY',
  template: '{"model":"{{model}}","nested":{"list":["{{model}}"]},"n":1}',
  timeoutSeconds: 15,
}
const row = (status: number | null): ResponseRow => ({
  status,
  path: 'error.message',
  op: 'CONTAINS',
  value: 'x',
  verdict: 'MISSING',
})
const available: ResponseRow = { ...row(400), verdict: 'AVAILABLE' }

describe('the HTTP status of a rule', () => {
  it.each([null, 100, 400, 599])('accepts %s', (status) => {
    expect(ruleIssues(shape, [row(status), available]).rows).toBeUndefined()
  })
  it.each([0, 99, 600, 400.5, Number.NaN])('rejects %s', (status) => {
    expect(ruleIssues(shape, [row(status), available]).rows).toBe(
      'An HTTP status must be a whole number from 100 to 599, or empty.'
    )
  })
})

describe('the request preview', () => {
  it('builds the body as Cloud does, so a model name with a quote stays valid JSON', () => {
    const lines = requestPreview(shape, 'quote"model\\x').split('\n')
    expect(lines[0]).toBe('POST /v1/videos')
    expect(lines[1]).toBe('Authorization: Bearer ***')
    expect(JSON.parse(lines[2] ?? '')).toEqual({
      model: 'quote"model\\x',
      nested: { list: ['quote"model\\x'] },
      n: 1,
    })
  })
  it('shows a body that is not JSON yet as it was typed', () => {
    expect(requestPreview({ ...shape, template: '{broken' }, 'm')).toContain(
      '{broken'
    )
  })
  it('encodes the model in a path and sends no body for GET', () => {
    const preview = requestPreview(
      { ...shape, method: 'GET', auth: 'NONE', path: '/m/{{model}}' },
      'a/b'
    )
    expect(preview).toBe('GET /m/a%2Fb')
  })
})

describe('how many requests a rule sends', () => {
  const models = [
    { modelKey: 'a', displayName: 'A', upstreamIds: ['a1', 'a2'], bound: true },
    { modelKey: 'b', displayName: 'B', upstreamIds: ['b1'], bound: false },
  ]
  it('reaches only bound models with a Key, and every model without one', () => {
    expect(probedUpstreamIds(models, 'API_KEY')).toEqual(['a1', 'a2'])
    expect(probedUpstreamIds(models, 'NONE')).toEqual(['a1', 'a2', 'b1'])
  })
  it('multiplies by the rounds of a day', () => {
    expect(requestsPerDay(2, 3)).toBe(16)
    expect(requestsPerDay(2, 5)).toBe(10)
  })
})

describe('credentials in the request content', () => {
  const issue = (template: string) =>
    requestIssues({
      type: 'REQUEST',
      method: 'POST',
      path: '/v1/images',
      auth: 'NONE',
      template,
      timeoutSeconds: 15,
    }).template

  it.each(['token', 'access_token', 'Access-Token', 'password', 'secret'])(
    'refuses a %s field, however deep',
    (field) => {
      const refused = 'The request content must not contain credentials.'
      expect(issue(JSON.stringify({ model: '{{model}}', [field]: 'x' }))).toBe(
        refused
      )
      expect(
        issue(
          JSON.stringify({ model: '{{model}}', nested: [{ [field]: 'x' }] })
        )
      ).toBe(refused)
    }
  )

  it.each(['"\\u0061pi_key"', '"authoriz\\u0061tion"', '"\\u0074oken"'])(
    'sees through the escaped field name %s',
    (field) => {
      expect(issue(`{"model":"{{model}}","nested":{${field}:"x"}}`)).toBe(
        'The request content must not contain credentials.'
      )
    }
  )

  it('sees through an escaped placeholder', () => {
    expect(issue('{"model":"{{mod\\u0065l}}"}')).toBeUndefined()
  })

  it.each(['/m/{{model}}?%6bey=abc', '/m/%73k-abcdef/{{model}}'])(
    'sees through the escaped path %s',
    (path) => {
      expect(probePathIssue(path)).toBe(
        'The path must not contain credentials.'
      )
    }
  )

  it('keeps an ordinary field that only resembles one', () => {
    expect(
      issue(JSON.stringify({ model: '{{model}}', max_tokens: 1 }))
    ).toBeUndefined()
  })
})

describe('a rule path', () => {
  it.each([
    '/v1/models?api_key=abc',
    '/models?key=abc',
    '/m?x=1&access_token=abc',
    '/m/sk-abcdef/models',
  ])('keeps a credential out of %s', (path) => {
    expect(probePathIssue(path)).toBe('The path must not contain credentials.')
  })
  it('accepts an ordinary path', () => {
    expect(probePathIssue('/api/model-router/v1/public/models')).toBeUndefined()
    expect(probePathIssue('https://x.example/v1')).toBe(
      'The path must start with / and contain no host.'
    )
  })
})
