import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import vectors from '../executor-shared/template-language-v1.vectors.json' with { type: 'json' }
import {
  evaluateTemplate,
  TemplateLanguageError,
} from '../executor-shared/templateLanguageV1'

// The page runs the Executor's own template language in the browser, which has no Node Buffer.
const nodeBuffer = globalThis.Buffer
beforeAll(() => {
  Reflect.deleteProperty(globalThis, 'Buffer')
})
afterAll(() => {
  globalThis.Buffer = nodeBuffer
})

type Vector = {
  name: string
  template: unknown
  output?: unknown
  undefined?: true
  error?: { phase: string; reason: string; field?: string }
}

describe('template language v1 without Node Buffer', () => {
  for (const vector of vectors.cases as Vector[]) {
    it(`matches the shared vector: ${vector.name}`, () => {
      if (vector.error) {
        try {
          evaluateTemplate(vector.template, vectors.context)
          expect.fail('Expected template failure')
        } catch (error) {
          expect(error).toBeInstanceOf(TemplateLanguageError)
          const failure = error as TemplateLanguageError
          expect({
            phase: failure.phase,
            reason: failure.reason,
            field: failure.field,
          }).toEqual(vector.error)
        }
        return
      }
      if (vector.undefined) {
        expect(
          evaluateTemplate(vector.template, vectors.context)
        ).toBeUndefined()
        return
      }
      expect(evaluateTemplate(vector.template, vectors.context)).toEqual(
        vector.output
      )
    })
  }

  it('parses JSON text with json() when Buffer is absent', () => {
    expect(
      evaluateTemplate({ $call: 'json', args: ['{"n":1}'] }, vectors.context)
    ).toEqual({ n: 1 })
  })
})
