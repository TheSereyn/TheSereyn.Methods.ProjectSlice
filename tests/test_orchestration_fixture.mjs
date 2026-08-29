import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validator = path.join(repoRoot, "scripts", "psm", "validate_psm.py");
const fixtureRoot = path.join(repoRoot, "examples", "orchestration-local-first-documents");
const workflow = JSON.parse(readFileSync(path.join(fixtureRoot, "workflow.json"), "utf8"));

function runValidator(args) {
    return spawnSync("python3", [validator, ...args], {
        cwd: repoRoot,
        encoding: "utf8"
    });
}

function copyBaseFixture() {
    const sandboxRoot = mkdtempSync(path.join(tmpdir(), "psm-orchestration-"));
    const target = path.join(sandboxRoot, "repo");
    cpSync(path.join(fixtureRoot, workflow.base), target, { recursive: true });
    return target;
}

function applyOverlay(target, overlayPath) {
    cpSync(path.join(fixtureRoot, overlayPath), target, { recursive: true });
}

function listRelativeFiles(root, current = "") {
    const entries = [];

    for (const name of readdirSync(root)) {
        const absolute = path.join(root, name);
        const relative = current ? path.posix.join(current, name) : name;
        const stats = statSync(absolute);

        if (stats.isDirectory()) {
            entries.push(...listRelativeFiles(absolute, relative));
            continue;
        }

        entries.push(relative.replaceAll("\\", "/"));
    }

    return entries;
}

function stageById(id) {
    const stage = workflow.stages.find((item) => item.id === id);
    assert.ok(stage, `Missing stage ${id}`);
    return stage;
}

test("orchestration overlays stay within declared role-owned files", () => {
    for (const stage of workflow.stages) {
        const files = listRelativeFiles(path.join(fixtureRoot, stage.overlay)).sort();
        assert.deepEqual(files, [...stage.allowedChanges].sort(), `Unexpected file set for stage ${stage.id}`);
    }
});

test("orchestration fixture progresses from planning through reconciliation", () => {
    const target = copyBaseFixture();

    let result = runValidator(["validate", target, "--strict"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);

    result = runValidator(["status", target]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Next slice: S-002 — Find saved document \[planned\]/);
    assert.match(result.stdout, /Untriaged Inbox items: 0/);

    result = runValidator(["milestone", "M-001", target]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Slices: total 3, done 1, ready 0, active 0, blocked 0, planned 2/);

    applyOverlay(target, stageById("slice-planner").overlay);
    result = runValidator(["validate", target, "--strict"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);

    result = runValidator(["trace", "S-002", target]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Status: ready/);
    assert.match(result.stdout, /S-002\.R2 -> S-002\.T1/);

    result = runValidator(["status", target]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Next slice: S-002 — Find saved document \[ready\]/);
    assert.match(result.stdout, /Untriaged Inbox items: 1/);

    applyOverlay(target, stageById("project-manager-active").overlay);
    result = runValidator(["status", target]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Active slices: S-002 — Find saved document/);
    assert.match(result.stdout, /Next slice: S-003 — Export document \[planned\]/);

    applyOverlay(target, stageById("implementer").overlay);
    result = runValidator(["validate", target, "--strict"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);

    applyOverlay(target, stageById("verifier").overlay);
    result = runValidator(["trace", "S-002", target]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /dotnet test --filter FindSavedDocument/);
    assert.match(result.stdout, /Manual demonstration: create two documents/);

    applyOverlay(target, stageById("reconciler").overlay);
    result = runValidator(["validate", target, "--strict"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);

    result = runValidator(["status", target]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Next slice: S-003 — Export document \[planned\]/);
    assert.match(result.stdout, /S-002 — Find saved document/);

    result = runValidator(["milestone", "M-001", target]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Slices: total 3, done 2, ready 0, active 0, blocked 0, planned 1/);

    result = runValidator(["trace", "S-002", target]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /planning\/system\/search\.md/);
});