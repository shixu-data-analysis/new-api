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
import { createFileRoute, redirect } from '@tanstack/react-router'
import z from 'zod'

import { CanvasCloud } from '@/features/canvas-cloud'
import { isCanvasSectionAllowed } from '@/features/canvas-cloud/access'
import {
  getCanvasSession,
  isCanvasInviteRegistrationRequired,
} from '@/features/canvas-cloud/api'

export const invalidCanvasCloudUuidSearchValue = '__invalid_canvas_cloud_uuid__'

const optionalUuidSearch = z
  .string()
  .uuid()
  .optional()
  .catch(invalidCanvasCloudUuidSearchValue)

export const canvasCloudSearchSchema = z.object({
  customerId: optionalUuidSearch,
  customerName: z.string().trim().min(1).max(191).optional().catch(undefined),
  orderId: optionalUuidSearch,
  orderNumber: z.string().trim().min(1).max(191).optional().catch(undefined),
  providerId: optionalUuidSearch,
  credentialGroupId: optionalUuidSearch,
  credentialGroupVersionId: optionalUuidSearch,
  modelId: optionalUuidSearch,
  publicationId: optionalUuidSearch,
})

function isInvalidUuidSearchValue(value: string | undefined) {
  return value === invalidCanvasCloudUuidSearchValue
}

function withoutInvalidUuidSearchValues(
  search: z.output<typeof canvasCloudSearchSchema>
) {
  return Object.fromEntries(
    Object.entries(search).filter(([, value]) => !isInvalidUuidSearchValue(value))
  )
}

export const Route = createFileRoute('/_authenticated/canvas-cloud/$section')({
  beforeLoad: async ({ params, search }) => {
    let session
    try {
      session = await getCanvasSession()
    } catch (error) {
      if (isCanvasInviteRegistrationRequired(error)) return
      throw redirect({ to: '/403' })
    }

    if (
      !isCanvasSectionAllowed(
        session.principalType,
        params.section,
        session.inviterEnabled
      )
    ) {
      throw redirect({ to: '/403' })
    }
    const legacyPricingSection =
      params.section === 'pricing' || params.section === 'catalog'
    if (!legacyPricingSection) {
      if (Object.values(search).some(isInvalidUuidSearchValue)) {
        throw redirect({
          to: '/canvas-cloud/$section',
          params: { section: params.section },
          search: withoutInvalidUuidSearchValues(search),
          replace: true,
        })
      }
      return
    }
    if (isInvalidUuidSearchValue(search.modelId)) {
      throw redirect({
        to: '/canvas-cloud/model-management',
        search: { legacyError: 'invalid-model' },
        replace: true,
      })
    }
    if (isInvalidUuidSearchValue(search.publicationId)) {
      throw redirect({
        to: '/canvas-cloud/model-management',
        search: { legacyError: 'invalid-publication' },
        replace: true,
      })
    }
    const modelId = z.string().uuid().safeParse(search.modelId)
    const publicationId = search.publicationId
      ? z.string().uuid().safeParse(search.publicationId)
      : undefined
    if (search.publicationId && !search.modelId) {
      throw redirect({
        to: '/canvas-cloud/model-management',
        search: { legacyError: 'missing-model' },
        replace: true,
      })
    }
    if (!modelId.success) {
      throw redirect({
        to: '/canvas-cloud/model-management',
        search: {},
        replace: true,
      })
    }
    throw redirect({
      to: '/canvas-cloud/model-management/$modelId/pricing',
      params: { modelId: modelId.data },
      search: publicationId?.success
        ? { tab: 'history', publicationId: publicationId.data }
        : {},
      replace: true,
    })
  },
  validateSearch: canvasCloudSearchSchema,
  component: CanvasCloud,
})
