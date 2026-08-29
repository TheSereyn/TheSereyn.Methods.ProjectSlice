import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runCli(args) {
    return spawnSync("node", ["bin/psm.js", ...args], {
        cwd: repoRoot,
        encoding: "utf8"
    });
}

function makeTargetRepo(prefix = "psm-lifecycle-target-") {
    const sandboxRoot = mkdtempSync(path.join(tmpdir(), prefix));
    const target = path.join(sandboxRoot, "repo");
    mkdirSync(path.join(target, ".git"), { recursive: true });
    return target;
}

function copyLifecycleSource(prefix = "psm-lifecycle-source-") {
    const sandboxRoot = mkdtempSync(path.join(tmpdir(), prefix));
    const source = path.join(sandboxRoot, "package");
    cpSync(repoRoot, source, { recursive: true });
    return source;
}

test("inspect can read a local installable package source", () => {
    const source = copyLifecycleSource();
    const result = runCli(["inspect", source]);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /@thesereyn\/project-slice-method v0\.1\.0/);
    assert.match(result.stdout, /Managed assets: 7/);
    assert.match(result.stdout, /Plan templates: 1/);
});

test("add installs a local package source and records lifecycle metadata", () => {
    const source = copyLifecycleSource();
    const target = makeTargetRepo();

    const result = runCli(["add", source, target, "--include-plan", "--name", "Lifecycle Demo"]);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.ok(existsSync(path.join(target, ".github", "prompts", "project-status.prompt.md")));
    assert.ok(existsSync(path.join(target, "planning", "PROJECT.md")));

    const lock = JSON.parse(readFileSync(path.join(target, ".psm", "lock.json"), "utf8"));
    const manifest = JSON.parse(readFileSync(path.join(target, ".psm", "manifest.json"), "utf8"));

    assert.equal(lock.packages["@thesereyn/project-slice-method"].sourceType, "path");
    assert.equal(path.resolve(target, lock.packages["@thesereyn/project-slice-method"].sourceRef), path.resolve(source));
    assert.ok(Array.isArray(manifest.packages["@thesereyn/project-slice-method"].repoManagedFiles));
    assert.equal(manifest.packages["@thesereyn/project-slice-method"].instructions.file, ".github/copilot-instructions.md");
});

test("diff reports modified managed files; sync preserves local edits unless --force", () => {
    const source = copyLifecycleSource();
    const target = makeTargetRepo();

    const addResult = runCli(["add", source, target, "--include-plan", "--name", "Lifecycle Demo"]);
    assert.equal(addResult.status, 0, addResult.stderr || addResult.stdout);

    const managedFile = path.join(target, ".github", "prompts", "project-status.prompt.md");
    const original = readFileSync(managedFile, "utf8");
    const drifted = `${original}\nLifecycle drift.\n`;
    writeFileSync(managedFile, drifted, "utf8");

    const diffResult = runCli(["diff", target]);
    assert.notEqual(diffResult.status, 0);
    assert.match(diffResult.stdout, /MODIFIED  \.github\/prompts\/project-status\.prompt\.md/);

    // sync without --force must preserve the local edit.
    const syncResult = runCli(["sync", target]);
    assert.equal(syncResult.status, 0, syncResult.stderr || syncResult.stdout);
    assert.match(syncResult.stdout, /preserve-local\s+\.github\/prompts\/project-status\.prompt\.md/);
    assert.equal(readFileSync(managedFile, "utf8"), drifted);

    // sync --dry-run must not change anything either.
    const dryRunResult = runCli(["sync", target, "--force", "--dry-run"]);
    assert.equal(dryRunResult.status, 0, dryRunResult.stderr || dryRunResult.stdout);
    assert.match(dryRunResult.stdout, /Dry run: no files were changed/);
    assert.equal(readFileSync(managedFile, "utf8"), drifted);

    // sync --force restores the managed file from the recorded source.
    const forceResult = runCli(["sync", target, "--force"]);
    assert.equal(forceResult.status, 0, forceResult.stderr || forceResult.stdout);
    assert.equal(readFileSync(managedFile, "utf8"), original);

    const cleanDiff = runCli(["diff", target]);
    assert.equal(cleanDiff.status, 0, cleanDiff.stderr || cleanDiff.stdout);
    assert.match(cleanDiff.stdout, /No managed file differences found\./);
});

test("update refreshes a local path package from its source", () => {
    const source = copyLifecycleSource();
    const target = makeTargetRepo();

    const addResult = runCli(["add", source, target, "--include-plan", "--name", "Lifecycle Demo"]);
    assert.equal(addResult.status, 0, addResult.stderr || addResult.stdout);

    const sourcePrompt = path.join(source, ".github", "prompts", "project-status.prompt.md");
    const sourceToolkit = path.join(source, "toolkit.yaml");
    writeFileSync(sourcePrompt, `${readFileSync(sourcePrompt, "utf8")}\nUpdated from source package.\n`, "utf8");
    writeFileSync(sourceToolkit, readFileSync(sourceToolkit, "utf8").replace("version: 0.1.0", "version: 0.1.1"), "utf8");

    const updateResult = runCli(["update", target]);
    assert.equal(updateResult.status, 0, updateResult.stderr || updateResult.stdout);
    assert.match(updateResult.stdout, /Updated package @thesereyn\/project-slice-method to v0\.1\.1/);

    const targetPrompt = readFileSync(path.join(target, ".github", "prompts", "project-status.prompt.md"), "utf8");
    assert.match(targetPrompt, /Updated from source package\./);

    const lock = JSON.parse(readFileSync(path.join(target, ".psm", "lock.json"), "utf8"));
    assert.equal(lock.packages["@thesereyn/project-slice-method"].version, "0.1.1");
});