type ExecutionTargetIdentity = {
  upstreamModelId: string
  parameterCombinations: ReadonlyArray<{ label: string }>
}

export function executionTargetSpecifications(
  target: ExecutionTargetIdentity,
  t: (key: string) => string
) {
  return target.parameterCombinations
    .map((combination) => combination.label)
    .filter(Boolean)
    .map((label) => t(label))
    .join(' · ')
}

export function executionTargetLabel(
  target: ExecutionTargetIdentity,
  t: (key: string) => string
) {
  const specifications = executionTargetSpecifications(target, t)
  return specifications
    ? `${specifications} · ${target.upstreamModelId}`
    : target.upstreamModelId
}
