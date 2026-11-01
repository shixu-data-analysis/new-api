import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { collapsePromptWhitespaceIssue, idempotencyHeaderIssue, isPromptReferenceFormat, REQUEST_VALIDATOR_VECTORS_SHA256, resolveCatalogRequest, validateCatalogRequest } from "@pixmiao/model-catalog/request-validator";
const root = dirname(fileURLToPath(import.meta.url));
const vectorBytes = readFileSync(resolve(root, "tests/request-validator-vectors.json"));
assert.equal(createHash("sha256").update(vectorBytes).digest("hex"), REQUEST_VALIDATOR_VECTORS_SHA256);
const vectors = JSON.parse(vectorBytes.toString("utf8"));
for (const vector of vectors.normalizationVectors) test(vector.name, () => {
  const resolved = resolveCatalogRequest({ interaction: vector.interaction, parameterBindings: vector.parameterBindings, request: vector.request });
  assert.deepEqual(resolved.request, vector.expectedRequest);
  assert.deepEqual(resolved.issues, vector.issues);
  if (vector.validationIssues) assert.deepEqual(validateCatalogRequest({ interaction: vector.interaction, request: resolved.request }).issues, vector.validationIssues);
});
for (const vector of vectors.vectors) test(vector.name, () => {
  const result = validateCatalogRequest({ interaction: vector.interaction ?? vectors.interaction, request: vector.request });
  assert.deepEqual(result.issues.map((entry) => entry.code), vector.codes);
  if (vector.issues) assert.deepEqual(result.issues, vector.issues);
});
for (const vector of vectors.profileRequestOptionVectors.promptReferenceFormats) test("prompt reference format: " + vector.name, () => {
  assert.equal(isPromptReferenceFormat(vector.value), vector.valid);
});
for (const vector of vectors.profileRequestOptionVectors.idempotencyHeaders) test("idempotency header: " + vector.name, () => {
  assert.equal(idempotencyHeaderIssue(vector.value, vector.workflow, vector.credentialHeader) === undefined, vector.valid);
});
for (const vector of vectors.profileRequestOptionVectors.collapsePromptWhitespace) test("collapse prompt whitespace: " + vector.name, () => {
  assert.equal(collapsePromptWhitespaceIssue(vector.value, vector.kind) === undefined, vector.valid);
});
