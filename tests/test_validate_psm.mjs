import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validator = path.join(repoRoot, "scripts", "psm", "validate_psm.py");
const fixture = path.join(repoRoot, "examples", "local-first-documents");

function runValidator(args, cwd = repoRoot) {
  return spawnSync("python3", [validator, ...args], {
    cwd,
    encoding: "utf8"
  });
}

function writeProjectFile(projectRoot, projectName, projectKey, implementationRoots) {
  const implementationSection = implementationRoots.length === 0
    ? "implementation_roots: []"
    : `implementation_roots:\n${implementationRoots.map((item) => `  - ${item}`).join("\n")}`;

  writeFileSync(path.join(projectRoot, "PROJECT.md"), `---
type: project
id: PROJECT
project_key: ${projectKey}
method: psm
method_version: 0.2
${implementationSection}
---

# ${projectName}

## Purpose

Describe why this project exists.

## Outcomes

- Deliver one observable result.

## Scope

- Descriptor discovery.

## Non-Goals

- Lifecycle transitions.

## Principles

- Keep durable state in repository files.

## Constraints

- None.

## Success

- Project descriptors remain deterministic.
`, "utf8");
}

function createMultiProjectHost(projects) {
  const sandboxRoot = mkdtempSync(path.join(tmpdir(), "psm-multi-project-"));
  const target = path.join(sandboxRoot, "workspace");
  mkdirSync(path.join(target, ".git"), { recursive: true });

  for (const project of projects) {
    const projectRoot = path.join(target, "planning", project.slug);
    cpSync(path.join(fixture, "planning"), projectRoot, { recursive: true });
    writeProjectFile(projectRoot, project.projectName, project.projectKey, project.implementationRoots);
  }

  return target;
}

test("valid example fixture passes strict validation", () => {
  const result = runValidator(["validate", fixture, "--strict"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /PSM validation passed/);
});

test("next-id reports the next slice identifier", () => {
  const result = runValidator(["next-id", "slice", fixture]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout.trim(), "S-004");
});

test("status reports the current milestone and next slice", () => {
  const result = runValidator(["status", fixture]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Project status for Local-First Documents/);
  assert.match(result.stdout, /Current milestone: M-001 \[active\] \(1\/3 done\)/);
  assert.match(result.stdout, /Next slice: S-002 — Find saved document \[ready\]/);
  assert.match(result.stdout, /Untriaged Inbox items: 1/);
});

test("trace shows requirement and task relationships for a slice", () => {
  const result = runValidator(["trace", "S-002", fixture]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Trace for S-002 — Find saved document/);
  assert.match(result.stdout, /Depends on: S-001/);
  assert.match(result.stdout, /S-002\.R1 -> S-002\.T1/);
  assert.match(result.stdout, /S-002\.T2: implements S-002\.R3; depends on S-002\.T1/);
});

test("milestone shows slice composition and remaining work", () => {
  const result = runValidator(["milestone", "M-001", fixture]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Milestone M-001 — M-001 — Walking Skeleton/);
  assert.match(result.stdout, /Slices: total 3, done 1, ready 1, active 0, blocked 0, planned 1/);
  assert.match(result.stdout, /S-003 — Export document \[planned\]/);
});

test("duplicate roadmap IDs fail validation", () => {
  const sandboxRoot = mkdtempSync(path.join(tmpdir(), "psm-validate-"));
  const target = path.join(sandboxRoot, "fixture");
  cpSync(fixture, target, { recursive: true });

  const roadmapPath = path.join(target, "planning", "ROADMAP.md");
  writeFileSync(
    roadmapPath,
    readFileSync(roadmapPath, "utf8") + "\n| S-001 | Duplicate row | Duplicate | Duplicate | — | M-001 | planned | — |\n",
    "utf8"
  );

  const result = runValidator(["validate", target]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /duplicate roadmap slice ID: S-001/);
});

test("uncovered requirements fail validation", () => {
  const sandboxRoot = mkdtempSync(path.join(tmpdir(), "psm-coverage-"));
  const target = path.join(sandboxRoot, "fixture");
  cpSync(fixture, target, { recursive: true });

  const specPath = path.join(target, "planning", "specs", "S-002-find-saved-document", "spec.md");
  writeFileSync(
    specPath,
    readFileSync(specPath, "utf8") + "\n### S-002.R4 — Empty query\n\nAn empty query shows no results.\n",
    "utf8"
  );

  const result = runValidator(["validate", target]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /requirement S-002.R4 has no implementing task/);
});

test("projects parses spec-style implementation roots metadata", () => {
  const target = createMultiProjectHost([
    { projectName: "Workspace Host", projectKey: "workspace-host", implementationRoots: ["."], slug: "workspace-host" },
    { projectName: "Product A", projectKey: "product-a", implementationRoots: ["repos/product-a", "repos/shared/auth"], slug: "product-a" }
  ]);

  const result = runValidator(["projects", target, "--json"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const output = JSON.parse(result.stdout);
  assert.equal(output.projects.length, 2);
  assert.deepEqual(output.projects.map((project) => project.projectKey), ["product-a", "workspace-host"]);
  assert.deepEqual(output.projects[0].implementationRoots, ["repos/product-a", "repos/shared/auth"]);
  assert.deepEqual(output.projects[1].implementationRoots, ["."]);
});

test("validate --all discovers nested plan roots under planning", () => {
  const target = createMultiProjectHost([
    { projectName: "Identity Service", projectKey: "identity-service", implementationRoots: ["repos/identity-service"], slug: "identity/service" },
    { projectName: "Site Content", projectKey: "site-content", implementationRoots: ["repos/site-content"], slug: "site/content" }
  ]);

  const result = runValidator(["validate", target, "--all"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /planning\/identity\/service/);
  assert.match(result.stdout, /planning\/site\/content/);
});

test("duplicate project keys fail validation across discovered roots", () => {
  const target = createMultiProjectHost([
    { projectName: "Workspace Host", projectKey: "shared-key", implementationRoots: ["."], slug: "workspace-host" },
    { projectName: "Product A", projectKey: "shared-key", implementationRoots: ["repos/product-a"], slug: "product-a" }
  ]);

  const result = runValidator(["validate", target, "--all"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /duplicate project key: shared-key/);
});

test("unsafe implementation roots fail validation", () => {
  const target = createMultiProjectHost([
    { projectName: "Workspace Host", projectKey: "workspace-host", implementationRoots: ["../outside"], slug: "workspace-host" },
    { projectName: "Product A", projectKey: "product-a", implementationRoots: ["repos/product-a"], slug: "product-a" }
  ]);

  const result = runValidator(["validate", target, "--all"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /implementation root must stay within the host root: \..\/outside/);
});

test("drive-letter absolute implementation roots fail validation", () => {
  const target = createMultiProjectHost([
    { projectName: "Workspace Host", projectKey: "workspace-host", implementationRoots: ["C:/repo/app"], slug: "workspace-host" },
    { projectName: "Product A", projectKey: "product-a", implementationRoots: ["repos/product-a"], slug: "product-a" }
  ]);

  const result = runValidator(["validate", target, "--all"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /implementation root must be relative to the host root: C:\/repo\/app/);
});

test("implementation_roots must use list syntax", () => {
  const target = createMultiProjectHost([
    { projectName: "Workspace Host", projectKey: "workspace-host", implementationRoots: ["repos/workspace-host"], slug: "workspace-host" },
    { projectName: "Product A", projectKey: "product-a", implementationRoots: ["repos/product-a"], slug: "product-a" }
  ]);

  const projectPath = path.join(target, "planning", "workspace-host", "PROJECT.md");
  writeFileSync(
    projectPath,
    readFileSync(projectPath, "utf8").replace("implementation_roots:\n  - repos/workspace-host", "implementation_roots: repos/workspace-host"),
    "utf8"
  );

  const result = runValidator(["validate", target, "--all"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /implementation_roots must be a list of paths/);
});