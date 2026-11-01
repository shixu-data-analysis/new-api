/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { CurrentCatalogView } from '../../catalog-edit-types'

export type ExportedFile = { path: string; content: unknown }

export interface AdminChangedFile {
  path: string
  /** The objects in it that the admin changed or added. */
  items: string[]
}

const ADMIN_CONTRACT_VERSION = /-admin\.\d+$/

/** Which exported files hold admin changes, as the Cloud source records say. */
export function adminChangedFiles(
  files: ExportedFile[],
  catalog: Pick<CurrentCatalogView, 'bundle' | 'sources'>
): AdminChangedFile[] {
  const { bundle, sources } = catalog
  const changed = new Map<string, string[]>()
  const add = (path: string, item: string) =>
    changed.set(path, [...(changed.get(path) ?? []), item])
  for (const provider of bundle.providers) {
    if (sources.providers[provider.id] === 'ADMIN') {
      add('providers.json', provider.id)
    }
  }
  for (const model of bundle.models) {
    if (sources.models[model.productKey] === 'ADMIN') {
      add('models.json', model.productKey)
    }
  }
  for (const channel of bundle.channels) {
    if (sources.channels[channel.id] !== 'ADMIN') continue
    add('channels.json', channel.id)
    const { id, version } = channel.adapterProfile
    const profile = files.find((file) => {
      const content = file.content as { id?: unknown; version?: unknown }
      return (
        file.path.startsWith('profiles/') &&
        content.id === id &&
        content.version === version
      )
    })
    if (!profile) continue
    add(profile.path, channel.id)
    const [contractName, contractVersion] = String(
      (profile.content as { api?: unknown }).api
    ).split('@')
    // A Channel edit can leave its contract as it was: only one the admin wrote has an admin version.
    if (!contractVersion || !ADMIN_CONTRACT_VERSION.test(contractVersion)) {
      continue
    }
    const contract = files.find(
      (file) =>
        file.path.endsWith(`/${contractName}.openapi.json`) &&
        (file.content as { info?: { version?: unknown } }).info?.version ===
          contractVersion
    )
    if (contract) add(contract.path, channel.id)
  }
  return files.flatMap((file) => {
    const items = changed.get(file.path)
    return items ? [{ path: file.path, items }] : []
  })
}
