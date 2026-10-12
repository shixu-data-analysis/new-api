/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
// Tabs of 模型管理, in display order.
export type ModelManagementTab =
  | 'published'
  | 'display'
  | 'import'
  | 'monitoring'

const modelManagementTabs: ModelManagementTab[] = [
  'published',
  'display',
  'import',
  'monitoring',
]

export function isModelManagementTab(
  value: unknown
): value is ModelManagementTab {
  return (modelManagementTabs as unknown[]).includes(value)
}
