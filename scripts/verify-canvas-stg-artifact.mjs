import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(new URL("../.github/workflows/canvas-stg-artifact.yml", import.meta.url), "utf8");

assert.match(workflow, /^\s*pull_request:\s*$/m);
assert.match(workflow, /push:\s*\n\s*branches:\s*\n\s*- stg/);
assert.match(workflow, /^\s*workflow_dispatch:\s*$/m);
assert.match(workflow, /cancel-in-progress: false/);

const publishCondition = workflow.match(/\n  publish:\n    if: >-\n([\s\S]*?)\n    needs: verify/)?.[1];
assert.ok(publishCondition, "publish job must have an explicit trusted-source condition");
assert.match(publishCondition, /github\.repository == 'shixu-data-analysis\/new-api'/);
assert.match(publishCondition, /github\.event_name == 'push'/);
assert.match(publishCondition, /github\.ref == 'refs\/heads\/stg'/);
assert.doesNotMatch(publishCondition, /workflow_dispatch|pull_request/, "manual and pull-request runs must never publish");
assert.match(workflow, /\n  publish:\n[\s\S]*?\n    environment: stg\n/, "publish job must use the protected stg environment");

for (const permission of ["contents: read", "packages: write", "id-token: write", "attestations: write", "artifact-metadata: write"]) {
  assert.match(workflow, new RegExp(`^\\s*${permission}$`, "m"), `missing least-privilege permission: ${permission}`);
}

const actionReferences = [...workflow.matchAll(/^\s*uses:\s+([^@\s]+)@([^\s#]+)/gm)];
assert.ok(actionReferences.length >= 6, "expected checkout, Docker, attestation, and artifact actions");
for (const [, action, reference] of actionReferences) {
  assert.match(reference, /^[a-f0-9]{40}$/, `${action} must be pinned to a full commit SHA`);
}

assert.match(workflow, /image="ghcr\.io\/\$\{repository\}"/);
assert.match(workflow, /tag="stg-\$\{GITHUB_SHA\}"/);
assert.match(workflow, /Immutable tag already exists/);
assert.match(workflow, /Could not prove that .* is unused/);
assert.match(workflow, /docker\/build-push-action@[a-f0-9]{40}/);
assert.match(workflow, /platforms: linux\/amd64/);
assert.match(workflow, /provenance: mode=max/);
assert.match(workflow, /sbom: true/);
assert.match(workflow, /\{\{json \.SBOM\.SPDX\}\}/);
assert.match(workflow, /\{\{json \.Provenance\.SLSA\}\}/);
assert.match(workflow, /actions\/attest@[a-f0-9]{40}/);
assert.match(workflow, /push-to-registry: true/);
assert.match(workflow, /gh attestation verify "oci:\/\/\$\{IMAGE\}@\$\{DIGEST\}"/);
assert.match(workflow, /--signer-workflow "\$GITHUB_REPOSITORY\/\.github\/workflows\/canvas-stg-artifact\.yml"/);
assert.match(workflow, /--source-ref "\$GITHUB_REF"/);
assert.match(workflow, /--source-digest "\$GITHUB_SHA"/);
assert.match(workflow, /stg-candidate\.json/);
assert.match(workflow, /actions\/upload-artifact@[a-f0-9]{40}/);
assert.doesNotMatch(workflow, /terraform apply|kubectl|coolify|docker\.io|calciumion\/new-api|docker hub/i, "Canvas artifact publication must not deploy or alter the upstream Docker Hub release path");

console.log("Pinned New API Canvas STG artifacts use guarded full-SHA GHCR tags, registry digests, BuildKit SBOM/provenance, and GitHub-signed provenance verification without deployment.");
