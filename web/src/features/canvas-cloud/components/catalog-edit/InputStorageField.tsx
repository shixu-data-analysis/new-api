/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

import { getCanvasRuntimeConfiguration } from '../../api'
import { EditField } from './EditFields'

/**
 * The task-media storage that holds a model's inputs (release.execution.inputStorage). Only storages that are published and passed
 * their latest connection check can be chosen; a stored name that no longer qualifies stays shown so the draft is not changed silently.
 */
export function InputStorageField(props: {
  value: string | undefined
  onChange: (storageKey: string | undefined) => void
}) {
  const { t } = useTranslation()
  const runtime = useQuery({
    queryKey: ['canvas-cloud', 'runtime-configuration'],
    queryFn: getCanvasRuntimeConfiguration,
  })
  const usable = (runtime.data?.inputStorages ?? [])
    .filter((storage) => storage.latestCheck?.outcome === 'PASSED')
    .map((storage) => storage.storageKey)
  const options =
    props.value && !usable.includes(props.value)
      ? [...usable, props.value]
      : usable
  return (
    <EditField
      label={t('Input storage')}
      help={t('Affects only materials uploaded afterwards')}
    >
      {(id, describedBy) => (
        <NativeSelect
          id={id}
          aria-describedby={describedBy}
          value={props.value ?? ''}
          onChange={(event) => props.onChange(event.target.value || undefined)}
        >
          <NativeSelectOption value=''>
            {t('Default storage')}
          </NativeSelectOption>
          {options.map((storageKey) => (
            <NativeSelectOption key={storageKey} value={storageKey}>
              {storageKey}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
    </EditField>
  )
}
