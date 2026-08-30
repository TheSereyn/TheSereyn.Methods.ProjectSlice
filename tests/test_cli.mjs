import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(repoRoot, "examples", "local-first-documents");

function runCli(args) {
    return spawnSync("node", ["bin/psm.js", ...args], {
        cwd: repoRoot,
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

- psm projects reports deterministic project descriptors.
`, "utf8");
}

function createMultiProjectHost(projects = [
    { slug: "product-a", projectName: "Product A", projectKey: "product-a", implementationRoots: ["repos/product-a"] },
    { slug: "product-b", projectName: "Product B", projectKey: "product-b", implementationRoots: ["repos/product-b", "repos/shared/auth"] }
]) {
    const sandboxRoot = mkdtempSync(path.join(tmpdir(), "psm-projects-"));
    const target = path.join(sandboxRoot, "workspace");
    mkdirSync(path.join(target, ".git"), { recursive: true });

    for (const project of projects) {
        const projectRoot = path.join(target, "planning", project.slug);
        cpSync(path.join(fixtureRoot, "planning"), projectRoot, { recursive: true });
        writeProjectFile(projectRoot, project.projectName, project.projectKey, project.implementationRoots);
    }

    return target;
}

function createNestedImplementationHost() {
    const sandboxRoot = mkdtempSync(path.join(tmpdir(), "psm-nested-host-"));
    const target = path.join(sandboxRoot, "workspace");
    mkdirSync(path.join(target, ".git"), { recursive: true });
    cpSync(path.join(fixtureRoot, "planning"), path.join(target, "planning"), { recursive: true });
    writeProjectFile(path.join(target, "planning"), "Local-First Documents", "local-first-documents", ["repos/product-a"]);
    mkdirSync(path.join(target, ".psm"), { recursive: true });
    writeFileSync(path.join(target, ".psm", "manifest.json"), JSON.stringify({
        schemaVersion: 2,
        name: "@thesereyn/psm",
        version: "0.1.0-alpha.3",
        planRoots: [
            {
                root: "planning",
                projectName: "Local-First Documents",
                templatedFiles: [],
                initializedAt: null,
                updatedAt: null
            }
        ],
        packages: {
            "@thesereyn/psm": {
                version: "0.1.0-alpha.3",
                source: "npm",
                sourceType: "self",
                sourceRef: "current-package",
                manifest: "toolkit.yaml",
                repoManagedFiles: [],
                managedFileHashes: {},
                instructions: null,
                planRoots: ["planning"],
                installedAt: null,
                updatedAt: null
            }
        }
    }, null, 2) + "\n", "utf8");
    mkdirSync(path.join(target, "repos", "product-a", ".git"), { recursive: true });
    return {
        target,
        nestedRepo: path.join(target, "repos", "product-a")
    };
}

function createSameRepoSubdirectoryHost() {
    const sandboxRoot = mkdtempSync(path.join(tmpdir(), "psm-subdir-host-"));
    const target = path.join(sandboxRoot, "workspace");
    mkdirSync(path.join(target, ".git"), { recursive: true });
    cpSync(path.join(fixtureRoot, "planning"), path.join(target, "planning"), { recursive: true });
    writeProjectFile(path.join(target, "planning"), "Local-First Documents", "local-first-documents", ["src"]);
    mkdirSync(path.join(target, ".psm"), { recursive: true });
    writeFileSync(path.join(target, ".psm", "manifest.json"), JSON.stringify({
        schemaVersion: 2,
        name: "@thesereyn/psm",
        version: "0.1.0-alpha.3",
        planRoots: [
            {
                root: "planning",
                projectName: "Local-First Documents",
                templatedFiles: [],
                initializedAt: null,
                updatedAt: null
            }
        ],
        packages: {
            "@thesereyn/psm": {
                version: "0.1.0-alpha.3",
                source: "npm",
                sourceType: "self",
                sourceRef: "current-package",
                manifest: "toolkit.yaml",
                repoManagedFiles: [],
                managedFileHashes: {},
                instructions: null,
                planRoots: ["planning"],
                installedAt: null,
                updatedAt: null
            }
        }
    }, null, 2) + "\n", "utf8");
    mkdirSync(path.join(target, "apps", "site", "docs"), { recursive: true });
    return {
        target,
        subdirectory: path.join(target, "apps", "site", "docs")
    };
}

test("inspect lists the bundle surface", () => {
    const result = runCli(["inspect"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Managed assets: 7/);
    assert.match(result.stdout, /Plan templates: 1/);
    assert.match(result.stdout, /Instruction file: \.github\/copilot-instructions\.md \(default mode: preserve\)/);
    assert.match(result.stdout, /\.github\/hooks/);
    assert.match(result.stdout, /\.github\/prompts/);
});

test("init bootstraps a repository and doctor validates it", () => {
    const sandboxRoot = mkdtempSync(path.join(tmpdir(), "psm-cli-"));
    const target = path.join(sandboxRoot, "demo-project");
    mkdirSync(target, { recursive: true });
    mkdirSync(path.join(target, ".git"), { recursive: true });

    const initResult = runCli(["init", target, "--name", "Demo Project"]);
    assert.equal(initResult.status, 0, initResult.stderr || initResult.stdout);
    assert.match(initResult.stdout, /From .*demo-project, run python3 scripts\/psm\/validate_psm\.py validate planning --strict/);
    assert.ok(existsSync(path.join(target, "planning", "PROJECT.md")));
    assert.ok(existsSync(path.join(target, ".psm", "manifest.json")));
    assert.ok(existsSync(path.join(target, "scripts", "psm", "validate_psm.py")));
    assert.ok(existsSync(path.join(target, ".github", "hooks", "10-psm-session-start.json")));
    assert.ok(existsSync(path.join(target, ".github", "prompts", "project-status.prompt.md")));

    const projectFile = readFileSync(path.join(target, "planning", "PROJECT.md"), "utf8");
    assert.match(projectFile, /Demo Project/);

    const manifest = JSON.parse(readFileSync(path.join(target, ".psm", "manifest.json"), "utf8"));
    assert.equal(manifest.planRoots[0].root, "planning");

    const doctorResult = runCli(["doctor", target]);
    assert.equal(doctorResult.status, 0, doctorResult.stderr || doctorResult.stdout);
    assert.match(doctorResult.stdout, /OK  validator planning/);
});

test("init preserves an existing copilot instructions file by default", () => {
    const sandboxRoot = mkdtempSync(path.join(tmpdir(), "psm-instructions-"));
    const target = path.join(sandboxRoot, "existing-project");
    mkdirSync(path.join(target, ".git"), { recursive: true });
    mkdirSync(path.join(target, ".github"), { recursive: true });
    writeFileSync(path.join(target, ".github", "copilot-instructions.md"), "Existing repo instructions.\n", "utf8");

    const initResult = runCli(["init", target, "--name", "Existing Project"]);
    assert.equal(initResult.status, 0, initResult.stderr || initResult.stdout);
    assert.equal(readFileSync(path.join(target, ".github", "copilot-instructions.md"), "utf8"), "Existing repo instructions.\n");
    assert.ok(existsSync(path.join(target, ".psm", "copilot-instructions.snippet.md")));
    assert.match(initResult.stdout, /Manual instructions merge: \.psm\/copilot-instructions\.snippet\.md/);

    const doctorResult = runCli(["doctor", target]);
    assert.equal(doctorResult.status, 0, doctorResult.stderr || doctorResult.stdout);
    assert.match(doctorResult.stdout, /WARN  copilot instructions merge required/);
});

test("init merge appends one managed block and cleans up stale merge snippets", () => {
    const sandboxRoot = mkdtempSync(path.join(tmpdir(), "psm-instructions-merge-"));
    const target = path.join(sandboxRoot, "existing-project");
    const instructionsPath = path.join(target, ".github", "copilot-instructions.md");
    const snippetPath = path.join(target, ".psm", "copilot-instructions.snippet.md");

    mkdirSync(path.join(target, ".git"), { recursive: true });
    mkdirSync(path.join(target, ".github"), { recursive: true });
    writeFileSync(instructionsPath, "Existing repo instructions.\n", "utf8");

    const preserveResult = runCli(["init", target, "--name", "Existing Project"]);
    assert.equal(preserveResult.status, 0, preserveResult.stderr || preserveResult.stdout);
    assert.ok(existsSync(snippetPath));

    const mergeResult = runCli(["init", target, "--name", "Existing Project", "--instructions-mode", "merge"]);
    assert.equal(mergeResult.status, 0, mergeResult.stderr || mergeResult.stdout);

    const mergedInstructions = readFileSync(instructionsPath, "utf8");
    assert.match(mergedInstructions, /^Existing repo instructions\./);
    assert.equal((mergedInstructions.match(/PSM-INSTRUCTIONS:BEGIN/g) ?? []).length, 1);
    assert.equal(existsSync(snippetPath), false);

    const doctorAfterMerge = runCli(["doctor", target]);
    assert.equal(doctorAfterMerge.status, 0, doctorAfterMerge.stderr || doctorAfterMerge.stdout);
    assert.doesNotMatch(doctorAfterMerge.stdout, /copilot instructions merge required/);

    writeFileSync(snippetPath, "stale merge artifact\n", "utf8");
    const preserveAfterMerge = runCli(["init", target, "--name", "Existing Project"]);
    assert.equal(preserveAfterMerge.status, 0, preserveAfterMerge.stderr || preserveAfterMerge.stdout);
    assert.equal(existsSync(snippetPath), false);

    const mergeAgain = runCli(["init", target, "--name", "Existing Project", "--instructions-mode", "merge"]);
    assert.equal(mergeAgain.status, 0, mergeAgain.stderr || mergeAgain.stdout);

    const mergedAgainInstructions = readFileSync(instructionsPath, "utf8");
    assert.equal((mergedAgainInstructions.match(/PSM-INSTRUCTIONS:BEGIN/g) ?? []).length, 1);
});

test("CLI exposes status, trace, and milestone for an example fixture", () => {
    const statusResult = runCli(["status", fixtureRoot]);
    assert.equal(statusResult.status, 0, statusResult.stderr || statusResult.stdout);
    assert.match(statusResult.stdout, /Project status for Local-First Documents/);

    const traceResult = runCli(["trace", "S-002", fixtureRoot]);
    assert.equal(traceResult.status, 0, traceResult.stderr || traceResult.stdout);
    assert.match(traceResult.stdout, /Trace for S-002 — Find saved document/);

    const milestoneResult = runCli(["milestone", "M-001", fixtureRoot]);
    assert.equal(milestoneResult.status, 0, milestoneResult.stderr || milestoneResult.stdout);
    assert.match(milestoneResult.stdout, /Milestone M-001 — M-001 — Walking Skeleton/);
});

test("init supports an alternate plan root under planning and validates it", () => {
    const sandboxRoot = mkdtempSync(path.join(tmpdir(), "psm-plan-root-"));
    const target = path.join(sandboxRoot, "multi-plan-project");
    mkdirSync(path.join(target, ".git"), { recursive: true });

    const initResult = runCli(["init", target, "--planning-root", "planning/site-content", "--name", "Site Content"]);
    assert.equal(initResult.status, 0, initResult.stderr || initResult.stdout);
    assert.match(initResult.stdout, /validate planning\/site-content --strict/);
    assert.ok(existsSync(path.join(target, "planning", "site-content", "PROJECT.md")));
    assert.equal(existsSync(path.join(target, "planning", "PROJECT.md")), false);

    const validateResult = runCli(["validate", target, "--planning-root", "planning/site-content", "--strict"]);
    assert.equal(validateResult.status, 0, validateResult.stderr || validateResult.stdout);

    const nextIdResult = runCli(["next-id", "slice", target, "--planning-root", "planning/site-content"]);
    assert.equal(nextIdResult.status, 0, nextIdResult.stderr || nextIdResult.stdout);
    assert.equal(nextIdResult.stdout.trim(), "S-002");
});

test("init supports more than one target repository in one invocation", () => {
    const sandboxRoot = mkdtempSync(path.join(tmpdir(), "psm-multi-target-"));
    const firstTarget = path.join(sandboxRoot, "repo-one");
    const secondTarget = path.join(sandboxRoot, "repo-two");
    mkdirSync(path.join(firstTarget, ".git"), { recursive: true });
    mkdirSync(path.join(secondTarget, ".git"), { recursive: true });

    const initResult = runCli(["init", firstTarget, secondTarget]);
    assert.equal(initResult.status, 0, initResult.stderr || initResult.stdout);
    assert.ok(existsSync(path.join(firstTarget, "planning", "PROJECT.md")));
    assert.ok(existsSync(path.join(secondTarget, "planning", "PROJECT.md")));
});

test("projects lists a filesystem-discovered example repo", () => {
    const result = runCli(["projects", fixtureRoot]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Projects for/);
    assert.match(result.stdout, /local-first-documents/);
    assert.match(result.stdout, /Plan root: planning/);
    assert.match(result.stdout, /Implementation roots: none/);
});

test("projects --json returns multiple descriptors with implementation roots", () => {
    const target = createMultiProjectHost();

    const result = runCli(["projects", target, "--json"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const output = JSON.parse(result.stdout);
    assert.equal(output.projects.length, 2);
    assert.deepEqual(output.projects.map((project) => project.projectKey), ["product-a", "product-b"]);
    assert.deepEqual(output.projects.map((project) => project.planRoot), ["planning/product-a", "planning/product-b"]);
    assert.deepEqual(output.projects[0].implementationRoots, ["repos/product-a"]);
    assert.deepEqual(output.projects[1].implementationRoots, ["repos/product-b", "repos/shared/auth"]);
    assert.equal(output.projects[0].projectKeySource, "explicit");
});

test("projects discovers nested plan roots under planning", () => {
    const target = createMultiProjectHost([
        { slug: "identity/service", projectName: "Identity Service", projectKey: "identity-service", implementationRoots: ["repos/identity-service"] },
        { slug: "site/content", projectName: "Site Content", projectKey: "site-content", implementationRoots: ["repos/site-content"] }
    ]);

    const result = runCli(["projects", target, "--json"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const output = JSON.parse(result.stdout);
    assert.deepEqual(output.projects.map((project) => project.planRoot), ["planning/identity/service", "planning/site/content"]);
    assert.deepEqual(output.projects.map((project) => project.projectKey), ["identity-service", "site-content"]);
});

test("projects discovers the planning host when invoked from a nested implementation repo", () => {
    const { nestedRepo } = createNestedImplementationHost();

    const result = runCli(["projects", nestedRepo, "--json"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const output = JSON.parse(result.stdout);
    assert.equal(output.projects.length, 1);
    assert.equal(output.projects[0].projectKey, "local-first-documents");
    assert.equal(output.projects[0].planRoot, "planning");
    assert.deepEqual(output.projects[0].implementationRoots, ["repos/product-a"]);
});

test("projects discovers the planning host when invoked from a same-repository subdirectory", () => {
    const { subdirectory } = createSameRepoSubdirectoryHost();

    const result = runCli(["projects", subdirectory, "--json"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const output = JSON.parse(result.stdout);
    assert.equal(output.projects.length, 1);
    assert.equal(output.projects[0].projectKey, "local-first-documents");
    assert.equal(output.projects[0].planRoot, "planning");
    assert.deepEqual(output.projects[0].implementationRoots, ["src"]);
});