import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ChannelDraft } from '../catalog-channel-draft'
import { channelDraftFrom } from '../catalog-channel-draft'
import { withMeasuredAccepts } from '../catalog-channel-materials'
import type { CatalogJson } from '../catalog-edit-types'

// Channels copied from pixmiao-catalog 3ad71fd, so these tests run where only this repository is mounted.
const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'catalog'
)
const read = (file: string): CatalogJson =>
  JSON.parse(readFileSync(path.join(fixtures, file), 'utf8'))

/** A Catalog Channel's Profile and contract, by the Profile's file name. */
export function catalogChannel(name: string) {
  const profile = read(`profiles/${name}.profile.json`)
  const api = String(profile.api).split('@')[0]
  return { profile, contract: read(`openapi/${api}.openapi.json`) }
}

/** A Catalog Channel as the form opens it. */
export function catalogDraft(name: string): ChannelDraft {
  const { profile, contract } = catalogChannel(name)
  return withMeasuredAccepts(channelDraftFrom(profile, contract))
}
