/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import * as z from 'zod'

// Bounds mirror the Cloud task-policy publication contract.
export const taskPolicySchema = z.object({
  quoteTtlSeconds: z
    .string()
    .regex(/^\d+$/, 'Enter a whole number from 1 to 86400')
    .refine(
      (value) => Number(value) >= 1 && Number(value) <= 86400,
      'Enter a whole number from 1 to 86400'
    )
    .optional(),
  paidExpiryDays: z
    .string()
    .regex(/^\d+$/, 'Enter a whole number from 1 to 3650')
    .refine(
      (value) => Number(value) >= 1 && Number(value) <= 3650,
      'Enter a whole number from 1 to 3650'
    )
    .optional(),
  bonusFailureGraceDays: z
    .string()
    .regex(/^\d+$/, 'Enter a whole number from 1 to 365')
    .refine(
      (value) => Number(value) >= 1 && Number(value) <= 365,
      'Enter a whole number from 1 to 365'
    )
    .optional(),
})
export type TaskPolicyValues = z.infer<typeof taskPolicySchema>
