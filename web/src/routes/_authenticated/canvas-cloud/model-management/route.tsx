/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { createFileRoute } from '@tanstack/react-router'

import { CanvasRouteError } from '@/features/canvas-cloud/components/CanvasRouteStates'
import { ModelManagementLayout } from '@/features/canvas-cloud/components/ModelManagementLayout'
import { requireCanvasAdministratorRoute } from '@/features/canvas-cloud/route-access'

export const Route = createFileRoute(
  '/_authenticated/canvas-cloud/model-management'
)({
  beforeLoad: requireCanvasAdministratorRoute,
  errorComponent: CanvasRouteError,
  component: ModelManagementLayout,
})
