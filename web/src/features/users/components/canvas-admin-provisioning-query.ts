import { useQuery } from '@tanstack/react-query'

import {
  getCanvasAdminProvisioningPrincipals,
  getCanvasAdminProvisioningStatus,
} from '@/features/canvas-cloud/api'

export const canvasAdminProvisioningQueryKey = [
  'canvas',
  'root',
  'admin-provisioning',
] as const

export function useCanvasAdminProvisioningQuery(enabled: boolean) {
  return useQuery({
    queryKey: canvasAdminProvisioningQueryKey,
    queryFn: async ({ signal }) => {
      const [status, principals] = await Promise.all([
        getCanvasAdminProvisioningStatus(signal),
        getCanvasAdminProvisioningPrincipals(signal),
      ])
      return { status, principals }
    },
    enabled,
  })
}
