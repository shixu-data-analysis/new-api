/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { Badge } from '@/components/ui/badge'

function variantForStatus(
  status: string
): 'secondary' | 'destructive' | 'outline' | 'warning' {
  if (
    [
      'ACTIVE',
      'APPROVED',
      'CODE_ACTIVATED',
      'COMPLETED',
      'COST_CONFIRMED',
      'PAID',
      'POINTS_PROCESSED',
      'PUBLISHED',
      'RECOVERED',
      'RECONCILED',
      'RUNNING',
      'SETTLED',
      'SUCCEEDED',
    ].includes(status)
  ) {
    return 'secondary'
  }

  if (
    [
      'CANCELLED',
      'CLOSED',
      'CONFIRMED_FAILED',
      'DISPUTED',
      'RELEASED_FAILED',
      'RELEASED_TIMEOUT',
      'REVOKED',
      'REJECTED',
      'SUSPENDED',
      'VOID',
    ].includes(status)
  ) {
    return 'destructive'
  }

  if (
    [
      'DISABLED',
      'EXPIRED',
      'REDEEMED',
      'REFUNDED',
      'RETIRED',
      'STOPPED',
      'UNKNOWN',
      'WAIVED',
    ].includes(status)
  ) {
    return 'outline'
  }

  return 'warning'
}

export function CanvasStatusBadge(props: { label: string; status: string }) {
  return <Badge variant={variantForStatus(props.status)}>{props.label}</Badge>
}
