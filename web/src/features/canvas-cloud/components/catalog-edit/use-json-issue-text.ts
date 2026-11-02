/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

import type { JsonIssue } from '../../catalog-json-fill'

/** Translates an issue, with the issue of one item inside it. */
export function useJsonIssueText() {
  const { t } = useTranslation()
  const text = (issue: JsonIssue): string =>
    t(issue.key, {
      ...issue.values,
      ...(issue.inner ? { issue: text(issue.inner) } : {}),
    })
  return text
}
