import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hookRunner = path.join(repoRoot, "scripts", "psm", "hook_runner.mjs");
const fixtureRoot = path.join(repoRoot, "examples", "orchestration-local-first-documents");
const contract = JSON.parse(readFileSync(path.join(fixtureRoot, "phase6-automation.json"), "utf8"));

function readText(relativePath) {
    const filePath = path.join(repoRoot, relativePath);
    assert.ok(existsSync(filePath), `Missing file ${relativePath}`);
    return readFileSync(filePath, "utf8");
}

function parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(match, "Missing YAML frontmatter");
    const frontmatter = {};
    for (const rawLine of match[1].split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) {
            continue;
        }
        const separator = line.indexOf(":");
        assert.notEqual(separator, -1, `Invalid frontmatter line: ${line}`);
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^"|"$/g, "");
        frontmatter[key] = value;
    }
    return frontmatter;
}

function copyBaseFixture() {
    const sandboxRoot = mkdtempSync(path.join(tmpdir(), "psm-phase6-"));
    const target = path.join(sandboxRoot, "repo");
    cpSync(path.join(fixtureRoot, "base"), target, { recursive: true });
    cpSync(path.join(repoRoot, "scripts"), path.join(target, "scripts"), { recursive: true });
    return target;
}

function copyNestedImplementationHost() {
    const target = copyBaseFixture();
    mkdirSync(path.join(target, ".psm"), { recursive: true });
    writeFileSync(path.join(target, ".psm", "manifest.json"), JSON.stringify({
        schemaVersion: 2,
        name: "@thesereyn/psm",
        version: "0.1.0-alpha.2",
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
                version: "0.1.0-alpha.2",
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

function copySameRepoSubdirectoryHost() {
    const target = copyBaseFixture();
    mkdirSync(path.join(target, ".psm"), { recursive: true });
    writeFileSync(path.join(target, ".psm", "manifest.json"), JSON.stringify({
        schemaVersion: 2,
        name: "@thesereyn/psm",
        version: "0.1.0-alpha.2",
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
                version: "0.1.0-alpha.2",
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
    const subdirectory = path.join(target, "apps", "site", "docs");
    mkdirSync(subdirectory, { recursive: true });
    return { target, subdirectory };
}

function runHook(mode, payload, cwd = repoRoot) {
    return spawnSync("node", [hookRunner, mode], {
        cwd,
        encoding: "utf8",
        input: JSON.stringify(payload)
    });
}

test("phase 6 hooks are packaged as valid repository hook files", () => {
    for (const hook of contract.hooks) {
        const content = readText(hook.file);
        const json = JSON.parse(content);
        assert.equal(json.version, 1, `Unexpected hook version for ${hook.file}`);
        assert.ok(json.hooks[hook.event], `Missing hook event ${hook.event} in ${hook.file}`);
        const [entry] = json.hooks[hook.event];
        assert.equal(entry.type, "command");
        assert.equal(entry.command, hook.runner);
        if (hook.matcher) {
            assert.equal(entry.matcher, hook.matcher);
        }
    }
});

test("phase 6 prompt shortcuts exist with the expected frontmatter and guidance", () => {
    for (const prompt of contract.prompts) {
        const content = readText(prompt.file);
        const frontmatter = parseFrontmatter(content);
        assert.equal(frontmatter.agent, prompt.agent, `Unexpected prompt agent in ${prompt.file}`);
        assert.match(frontmatter.description, new RegExp(prompt.description.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        for (const snippet of prompt.mustMention) {
            assert.match(content, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Missing '${snippet}' in ${prompt.file}`);
        }
    }
});

test("phase 6 runtime and portability docs describe supported topologies and fallbacks", () => {
    for (const document of contract.docs ?? []) {
        const content = readText(document.file);
        for (const snippet of document.mustMention) {
            assert.match(content, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Missing '${snippet}' in ${document.file}`);
        }
    }
});

test("session-start hook injects Project Slice Method context for a bootstrapped plan root", () => {
    const target = copyBaseFixture();
    const result = runHook("session-start", {
        cwd: target,
        source: "new"
    });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    const output = JSON.parse(result.stdout);
    assert.match(output.additionalContext, /This repository uses Project Slice Method\./);
    assert.match(output.additionalContext, /Discovered plan roots:/);
    assert.match(output.additionalContext, /Next slice: S-002 — Find saved document/);
});

test("session-start hook discovers the outer planning host from a nested implementation repo", () => {
    const { nestedRepo } = copyNestedImplementationHost();
    const result = runHook("session-start", {
        cwd: nestedRepo,
        source: "new"
    });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    const output = JSON.parse(result.stdout);
    assert.match(output.additionalContext, /This repository uses Project Slice Method\./);
    assert.match(output.additionalContext, /Discovered plan roots:/);
    assert.match(output.additionalContext, /Next slice: S-002 — Find saved document/);
});

test("session-start hook discovers the planning host from a same-repository subdirectory", () => {
    const { subdirectory } = copySameRepoSubdirectoryHost();
    const result = runHook("session-start", {
        cwd: subdirectory,
        source: "new"
    });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    const output = JSON.parse(result.stdout);
    assert.match(output.additionalContext, /This repository uses Project Slice Method\./);
    assert.match(output.additionalContext, /Discovered plan roots:/);
    assert.match(output.additionalContext, /Next slice: S-002 — Find saved document/);
});

test("pre-tool-use hook blocks destructive repository commands and allows benign ones", () => {
    const denyResult = runHook("pre-tool-use", {
        toolName: "bash",
        toolArgs: {
            command: "git reset --hard HEAD"
        }
    });

    assert.equal(denyResult.status, 0, denyResult.stdout + denyResult.stderr);
    const denyOutput = JSON.parse(denyResult.stdout);
    assert.equal(denyOutput.permissionDecision, "deny");
    assert.match(denyOutput.permissionDecisionReason, /destructive repository commands/);

    const allowResult = runHook("pre-tool-use", {
        toolName: "bash",
        toolArgs: {
            command: "git status"
        }
    });

    assert.equal(allowResult.status, 0, allowResult.stdout + allowResult.stderr);
    const allowOutput = JSON.parse(allowResult.stdout);
    assert.equal(allowOutput.permissionDecision, "allow");
});

test("agent-stop hook allows valid planning state and blocks invalid planning state", () => {
    const validTarget = copyBaseFixture();
    const validResult = runHook("agent-stop", {
        cwd: validTarget,
        stopReason: "end_turn"
    });

    assert.equal(validResult.status, 0, validResult.stdout + validResult.stderr);
    const validOutput = JSON.parse(validResult.stdout);
    assert.equal(validOutput.decision, "allow");

    const invalidTarget = copyBaseFixture();
    const roadmapPath = path.join(invalidTarget, "planning", "ROADMAP.md");
    writeFileSync(
        roadmapPath,
        readFileSync(roadmapPath, "utf8") + "\n| S-001 | Duplicate row | Duplicate | Duplicate | — | M-001 | planned | — |\n",
        "utf8"
    );

    const invalidResult = runHook("agent-stop", {
        cwd: invalidTarget,
        stopReason: "end_turn"
    });

    assert.equal(invalidResult.status, 0, invalidResult.stdout + invalidResult.stderr);
    const invalidOutput = JSON.parse(invalidResult.stdout);
    assert.equal(invalidOutput.decision, "block");
    assert.match(invalidOutput.reason, /PSM structural validation failed after the last turn/);
    assert.match(invalidOutput.reason, /duplicate roadmap slice ID/);
});