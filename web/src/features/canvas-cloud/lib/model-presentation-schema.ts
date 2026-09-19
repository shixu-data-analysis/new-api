/*
Copyright (C) 2023-2026 QuantumNous
*/
import * as z from 'zod'

export const modelPresentationSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Required')
    .max(191, 'Name must be 191 characters or fewer'),
  description: z
    .string()
    .trim()
    .max(500, 'Description must be 500 characters or fewer'),
})

export type ModelPresentationFormValues = z.infer<
  typeof modelPresentationSchema
>

export function hasModelPresentationChanges(
  values: ModelPresentationFormValues,
  original: Pick<ModelPresentationFormValues, 'displayName' | 'description'>
) {
  return (
    values.displayName.trim() !== original.displayName.trim() ||
    values.description.trim() !== original.description.trim()
  )
}
