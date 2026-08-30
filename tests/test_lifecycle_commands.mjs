import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    assert.match(result.stdout, /@thesereyn\/psm v0\.1\.0-alpha\.3/);
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

    assert.equal(lock.packages["@thesereyn/psm"].sourceType, "path");
    assert.equal(path.resolve(target, lock.packages["@thesereyn/psm"].sourceRef), path.resolve(source));
    assert.ok(Array.isArray(manifest.packages["@thesereyn/psm"].repoManagedFiles));
    assert.equal(manifest.packages["@thesereyn/psm"].instructions.file, ".github/copilot-instructions.md");
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
    writeFileSync(sourceToolkit, readFileSync(sourceToolkit, "utf8").replace("version: 0.1.0-alpha.3", "version: 0.1.0-alpha.4"), "utf8");

    const updateResult = runCli(["update", target]);
    assert.equal(updateResult.status, 0, updateResult.stderr || updateResult.stdout);
    assert.match(updateResult.stdout, /Updated package @thesereyn\/psm to v0\.1\.0-alpha\.4/);

    const targetPrompt = readFileSync(path.join(target, ".github", "prompts", "project-status.prompt.md"), "utf8");
    assert.match(targetPrompt, /Updated from source package\./);

    const lock = JSON.parse(readFileSync(path.join(target, ".psm", "lock.json"), "utf8"));
    assert.equal(lock.packages["@thesereyn/psm"].version, "0.1.0-alpha.4");
});

test("add-project previews and adds a second plan root while enabling multi-project state in manifest", () => {
    const source = copyLifecycleSource();
    const target = makeTargetRepo();

    const addResult = runCli(["add", source, target, "--include-plan", "--name", "Lifecycle Demo"]);
    assert.equal(addResult.status, 0, addResult.stderr || addResult.stdout);

    const dryRun = runCli(["add-project", target, "--planning-root", "planning/project-two", "--name", "Project Two", "--dry-run"]);
    assert.equal(dryRun.status, 0, dryRun.stderr || dryRun.stdout);
    assert.match(dryRun.stdout, /Would migrate plan root: planning -> planning\/lifecycle-demo/);
    assert.match(dryRun.stdout, /Would add project plan root: planning\/project-two/);
    assert.match(dryRun.stdout, /Would enable capability: multiProject/);
    assert.match(dryRun.stdout, /Dry run: no files were changed/);
    assert.equal(existsSync(path.join(target, "planning", "project-two", "PROJECT.md")), false);
    assert.ok(existsSync(path.join(target, "planning", "PROJECT.md")));

    const result = runCli(["add-project", target, "--planning-root", "planning/project-two", "--name", "Project Two"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.ok(existsSync(path.join(target, "planning", "lifecycle-demo", "PROJECT.md")));
    assert.ok(existsSync(path.join(target, "planning", "project-two", "PROJECT.md")));
    assert.equal(existsSync(path.join(target, "planning", "PROJECT.md")), false);

    const manifest = JSON.parse(readFileSync(path.join(target, ".psm", "manifest.json"), "utf8"));
    const lock = JSON.parse(readFileSync(path.join(target, ".psm", "lock.json"), "utf8"));
    const projectFile = readFileSync(path.join(target, "planning", "project-two", "PROJECT.md"), "utf8");

    assert.deepEqual(manifest.planRoots.map((entry) => entry.root), ["planning/lifecycle-demo", "planning/project-two"]);
    assert.equal(manifest.capabilities.multiProject.enabled, true);
    assert.ok(typeof manifest.capabilities.multiProject.enabledAt === "string");
    assert.ok(!Object.hasOwn(lock, "capabilities"));
    assert.deepEqual(lock.planRoots, ["planning/lifecycle-demo", "planning/project-two"]);
    assert.match(projectFile, /# Project Two/);
    assert.match(projectFile, /project_key: project-two/);
});

test("add-project installs capability-managed files when multi-project becomes enabled", () => {
    const source = copyLifecycleSource();
    const target = makeTargetRepo();

    const addResult = runCli(["add", source, target, "--include-plan", "--name", "Lifecycle Demo"]);
    assert.equal(addResult.status, 0, addResult.stderr || addResult.stdout);
    assert.equal(existsSync(path.join(target, ".github", "agents", "project-coordinator.agent.md")), false);

    const result = runCli(["add-project", target, "--planning-root", "planning/project-two", "--name", "Project Two"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.ok(existsSync(path.join(target, ".github", "agents", "project-coordinator.agent.md")));
    assert.ok(existsSync(path.join(target, ".github", "prompts", "work-on-project.prompt.md")));
    assert.ok(existsSync(path.join(target, ".github", "skills", "psm-select-project-context", "SKILL.md")));

    const manifest = JSON.parse(readFileSync(path.join(target, ".psm", "manifest.json"), "utf8"));
    assert.ok(manifest.packages["@thesereyn/psm"].repoManagedFiles.includes(".github/agents/project-coordinator.agent.md"));
    assert.ok(manifest.packages["@thesereyn/psm"].repoManagedFiles.includes(".github/prompts/work-on-project.prompt.md"));
});

test("enable multi-project upgrades an existing multi-root host and installs capability-managed files", () => {
    const source = copyLifecycleSource();
    const target = makeTargetRepo();

    const firstAdd = runCli(["add", source, target, "--include-plan", "--name", "Lifecycle Demo"]);
    assert.equal(firstAdd.status, 0, firstAdd.stderr || firstAdd.stdout);

    const secondAdd = runCli(["add", source, target, "--include-plan", "--planning-root", "planning/project-two", "--name", "Project Two"]);
    assert.equal(secondAdd.status, 0, secondAdd.stderr || secondAdd.stdout);

    const beforeManifest = JSON.parse(readFileSync(path.join(target, ".psm", "manifest.json"), "utf8"));
    assert.equal(beforeManifest.capabilities?.multiProject?.enabled, undefined);

    const doctorBefore = runCli(["doctor", target]);
    assert.notEqual(doctorBefore.status, 0);
    assert.match(doctorBefore.stdout + doctorBefore.stderr, /Mixed plan layout is not supported/);
    assert.match(doctorBefore.stdout + doctorBefore.stderr, /multi-project capability not enabled/);

    const dryRun = runCli(["enable", "multi-project", target, "--dry-run"]);
    assert.equal(dryRun.status, 0, dryRun.stderr || dryRun.stdout);
    assert.match(dryRun.stdout, /Would enable capability: multiProject/);
    assert.match(dryRun.stdout, /Managed files to create:/);

    const enableResult = runCli(["enable", "multi-project", target]);
    assert.equal(enableResult.status, 0, enableResult.stderr || enableResult.stdout);
    assert.ok(existsSync(path.join(target, "planning", "lifecycle-demo", "PROJECT.md")));
    assert.equal(existsSync(path.join(target, "planning", "PROJECT.md")), false);
    assert.ok(existsSync(path.join(target, ".github", "agents", "project-coordinator.agent.md")));
    assert.ok(existsSync(path.join(target, ".github", "prompts", "work-on-project.prompt.md")));

    const manifest = JSON.parse(readFileSync(path.join(target, ".psm", "manifest.json"), "utf8"));
    assert.equal(manifest.capabilities.multiProject.enabled, true);
    assert.deepEqual(manifest.planRoots.map((entry) => entry.root), ["planning/lifecycle-demo", "planning/project-two"]);

    const doctorAfter = runCli(["doctor", target]);
    assert.equal(doctorAfter.status, 0, doctorAfter.stderr || doctorAfter.stdout);
    assert.doesNotMatch(doctorAfter.stdout, /multi-project capability not enabled/);

    const secondEnable = runCli(["enable", "multi-project", target]);
    assert.equal(secondEnable.status, 0, secondEnable.stderr || secondEnable.stdout);
    assert.match(secondEnable.stdout, /Capability multiProject is already enabled/);
});

test("diff and sync include capability-managed files after multi-project is enabled", () => {
    const source = copyLifecycleSource();
    const target = makeTargetRepo();

    const addResult = runCli(["add", source, target, "--include-plan", "--name", "Lifecycle Demo"]);
    assert.equal(addResult.status, 0, addResult.stderr || addResult.stdout);

    const addProjectResult = runCli(["add-project", target, "--planning-root", "planning/project-two", "--name", "Project Two"]);
    assert.equal(addProjectResult.status, 0, addProjectResult.stderr || addProjectResult.stdout);

    const capabilityPromptSource = path.join(source, "capabilities", "multi-project", ".github", "prompts", "work-on-project.prompt.md");
    writeFileSync(capabilityPromptSource, `${readFileSync(capabilityPromptSource, "utf8")}Updated capability asset.\n`, "utf8");

    const diffResult = runCli(["diff", target]);
    assert.notEqual(diffResult.status, 0);
    assert.match(diffResult.stdout, /MODIFIED  \.github\/prompts\/work-on-project\.prompt\.md/);

    const syncResult = runCli(["sync", target]);
    assert.equal(syncResult.status, 0, syncResult.stderr || syncResult.stdout);

    const targetPrompt = readFileSync(path.join(target, ".github", "prompts", "work-on-project.prompt.md"), "utf8");
    assert.match(targetPrompt, /Updated capability asset\./);
});

test("disable multi-project updates manifest state without pruning capability-managed files", () => {
    const source = copyLifecycleSource();
    const target = makeTargetRepo();

    const addResult = runCli(["add", source, target, "--include-plan", "--planning-root", "planning/project-one", "--name", "Project One"]);
    assert.equal(addResult.status, 0, addResult.stderr || addResult.stdout);

    const addProjectResult = runCli(["add-project", target, "--planning-root", "planning/project-two", "--name", "Project Two"]);
    assert.equal(addProjectResult.status, 0, addProjectResult.stderr || addProjectResult.stdout);

    rmSync(path.join(target, "planning", "project-two"), { recursive: true, force: true });

    const dryRun = runCli(["disable", "multi-project", target, "--dry-run"]);
    assert.equal(dryRun.status, 0, dryRun.stderr || dryRun.stdout);
    assert.match(dryRun.stdout, /Would disable capability: multiProject/);
    assert.match(dryRun.stdout, /No managed files will be removed/);

    const disableResult = runCli(["disable", "multi-project", target]);
    assert.equal(disableResult.status, 0, disableResult.stderr || disableResult.stdout);

    const manifest = JSON.parse(readFileSync(path.join(target, ".psm", "manifest.json"), "utf8"));
    assert.equal(manifest.capabilities.multiProject.enabled, false);
    assert.deepEqual(manifest.planRoots.map((entry) => entry.root), ["planning/project-one"]);
    assert.ok(existsSync(path.join(target, ".github", "prompts", "work-on-project.prompt.md")));
});

test("add-project rolls back migration and new files when the transition fails", () => {
    const source = copyLifecycleSource();
    const target = makeTargetRepo();

    const addResult = runCli(["add", source, target, "--include-plan", "--name", "Lifecycle Demo"]);
    assert.equal(addResult.status, 0, addResult.stderr || addResult.stdout);

    writeFileSync(path.join(target, ".github", "skills", "psm-select-project-context"), "blocked\n", "utf8");

    const result = runCli(["add-project", target, "--planning-root", "planning/project-two", "--name", "Project Two"]);
    assert.notEqual(result.status, 0);

    const manifest = JSON.parse(readFileSync(path.join(target, ".psm", "manifest.json"), "utf8"));
    assert.ok(existsSync(path.join(target, "planning", "PROJECT.md")));
    assert.equal(existsSync(path.join(target, "planning", "lifecycle-demo", "PROJECT.md")), false);
    assert.equal(existsSync(path.join(target, "planning", "project-two", "PROJECT.md")), false);
    assert.deepEqual(manifest.planRoots.map((entry) => entry.root), ["planning"]);
    assert.equal(manifest.capabilities?.multiProject?.enabled, undefined);
});

test("disable multi-project rejects mixed root and nested plan layouts", () => {
    const source = copyLifecycleSource();
    const target = makeTargetRepo();

    const addResult = runCli(["add", source, target, "--include-plan", "--planning-root", "planning/project-one", "--name", "Project One"]);
    assert.equal(addResult.status, 0, addResult.stderr || addResult.stdout);

    const addProjectResult = runCli(["add-project", target, "--planning-root", "planning/project-two", "--name", "Project Two"]);
    assert.equal(addProjectResult.status, 0, addProjectResult.stderr || addProjectResult.stdout);

    cpSync(path.join(target, "planning", "project-one", "PROJECT.md"), path.join(target, "planning", "PROJECT.md"));
    cpSync(path.join(target, "planning", "project-one", "ROADMAP.md"), path.join(target, "planning", "ROADMAP.md"));
    cpSync(path.join(target, "planning", "project-one", "INBOX.md"), path.join(target, "planning", "INBOX.md"));
    cpSync(path.join(target, "planning", "project-one", "specs"), path.join(target, "planning", "specs"), { recursive: true });

    const result = runCli(["disable", "multi-project", target]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /Mixed plan layout is not supported/);
});

test("add-project is idempotent when the target plan root already exists", () => {
    const source = copyLifecycleSource();
    const target = makeTargetRepo();

    const addResult = runCli(["add", source, target, "--include-plan", "--planning-root", "planning/project-one", "--name", "Project One"]);
    assert.equal(addResult.status, 0, addResult.stderr || addResult.stdout);

    const firstAddProject = runCli(["add-project", target, "--planning-root", "planning/project-two", "--name", "Project Two"]);
    assert.equal(firstAddProject.status, 0, firstAddProject.stderr || firstAddProject.stdout);

    const projectFile = path.join(target, "planning", "project-two", "PROJECT.md");
    writeFileSync(projectFile, `${readFileSync(projectFile, "utf8")}\nUser note.\n`, "utf8");

    const secondAddProject = runCli(["add-project", target, "--planning-root", "planning/project-two", "--name", "Project Two"]);
    assert.equal(secondAddProject.status, 0, secondAddProject.stderr || secondAddProject.stdout);
    assert.match(secondAddProject.stdout, /Project plan root already exists: planning\/project-two/);
    assert.match(readFileSync(projectFile, "utf8"), /User note\./);
});

test("disable then sync preserves stale capability hashes for later prune", () => {
    const source = copyLifecycleSource();
    const target = makeTargetRepo();

    const addResult = runCli(["add", source, target, "--include-plan", "--planning-root", "planning/project-one", "--name", "Project One"]);
    assert.equal(addResult.status, 0, addResult.stderr || addResult.stdout);

    const addProjectResult = runCli(["add-project", target, "--planning-root", "planning/project-two", "--name", "Project Two"]);
    assert.equal(addProjectResult.status, 0, addProjectResult.stderr || addProjectResult.stdout);

    rmSync(path.join(target, "planning", "project-two"), { recursive: true, force: true });

    const disableResult = runCli(["disable", "multi-project", target]);
    assert.equal(disableResult.status, 0, disableResult.stderr || disableResult.stdout);

    const capabilityPrompt = ".github/prompts/work-on-project.prompt.md";
    const manifestBeforeSync = JSON.parse(readFileSync(path.join(target, ".psm", "manifest.json"), "utf8"));
    assert.ok(manifestBeforeSync.packages["@thesereyn/psm"].managedFileHashes[capabilityPrompt]);

    const syncResult = runCli(["sync", target]);
    assert.equal(syncResult.status, 0, syncResult.stderr || syncResult.stdout);

    const manifestAfterSync = JSON.parse(readFileSync(path.join(target, ".psm", "manifest.json"), "utf8"));
    assert.ok(manifestAfterSync.packages["@thesereyn/psm"].managedFileHashes[capabilityPrompt]);

    const pruneResult = runCli(["update", target, "--prune"]);
    assert.equal(pruneResult.status, 0, pruneResult.stderr || pruneResult.stdout);
    assert.match(pruneResult.stdout, /prune\s+\.github\/prompts\/work-on-project\.prompt\.md/);
});

test("enable multi-project fails when a recorded plan root is missing on disk", () => {
    const source = copyLifecycleSource();
    const target = makeTargetRepo();

    const firstAdd = runCli(["add", source, target, "--include-plan", "--planning-root", "planning/project-one", "--name", "Project One"]);
    assert.equal(firstAdd.status, 0, firstAdd.stderr || firstAdd.stdout);

    const secondAdd = runCli(["add", source, target, "--include-plan", "--planning-root", "planning/project-two", "--name", "Project Two"]);
    assert.equal(secondAdd.status, 0, secondAdd.stderr || secondAdd.stdout);

    rmSync(path.join(target, "planning", "project-two"), { recursive: true, force: true });

    const result = runCli(["enable", "multi-project", target]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /Recorded plan root is missing on disk: planning\/project-two/);
});

test("disable multi-project fails when no plan roots remain on disk", () => {
    const source = copyLifecycleSource();
    const target = makeTargetRepo();

    const addResult = runCli(["add", source, target, "--include-plan", "--planning-root", "planning/project-one", "--name", "Project One"]);
    assert.equal(addResult.status, 0, addResult.stderr || addResult.stdout);

    const addProjectResult = runCli(["add-project", target, "--planning-root", "planning/project-two", "--name", "Project Two"]);
    assert.equal(addProjectResult.status, 0, addProjectResult.stderr || addProjectResult.stdout);

    rmSync(path.join(target, "planning", "project-one"), { recursive: true, force: true });
    rmSync(path.join(target, "planning", "project-two"), { recursive: true, force: true });

    const result = runCli(["disable", "multi-project", target]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /multi-project can only be disabled when exactly one plan root remains on disk/);
});

test("multi-project transitions normalize plan roots across all installed packages", () => {
    const sourceOne = copyLifecycleSource("psm-lifecycle-source-one-");
    const sourceTwo = copyLifecycleSource("psm-lifecycle-source-two-");
    writeFileSync(path.join(sourceTwo, "toolkit.yaml"), readFileSync(path.join(sourceTwo, "toolkit.yaml"), "utf8").replace("name: @thesereyn/psm", "name: @thesereyn/psm-extra"), "utf8");
    const target = makeTargetRepo();

    const initPrimary = runCli(["add", sourceOne, target, "--include-plan", "--name", "Lifecycle Demo"]);
    assert.equal(initPrimary.status, 0, initPrimary.stderr || initPrimary.stdout);

    const addSecondaryPackage = runCli(["add", sourceTwo, target]);
    assert.equal(addSecondaryPackage.status, 0, addSecondaryPackage.stderr || addSecondaryPackage.stdout);

    const addProjectResult = runCli(["add-project", target, "--planning-root", "planning/project-two", "--name", "Project Two"]);
    assert.equal(addProjectResult.status, 0, addProjectResult.stderr || addProjectResult.stdout);

    const syncResult = runCli(["sync", target]);
    assert.equal(syncResult.status, 0, syncResult.stderr || syncResult.stdout);

    const manifest = JSON.parse(readFileSync(path.join(target, ".psm", "manifest.json"), "utf8"));
    assert.deepEqual(manifest.planRoots.map((entry) => entry.root), ["planning/lifecycle-demo", "planning/project-two"]);
    assert.deepEqual(manifest.packages["@thesereyn/psm"].planRoots, ["planning/lifecycle-demo", "planning/project-two"]);
    assert.deepEqual(manifest.packages["@thesereyn/psm-extra"].planRoots, ["planning/lifecycle-demo", "planning/project-two"]);
});

test("add-project rolls back partial recreation when a recorded plan root is missing on disk", () => {
    const source = copyLifecycleSource();
    const target = makeTargetRepo();

    const addResult = runCli(["add", source, target, "--include-plan", "--planning-root", "planning/project-one", "--name", "Project One"]);
    assert.equal(addResult.status, 0, addResult.stderr || addResult.stdout);

    const addProjectResult = runCli(["add-project", target, "--planning-root", "planning/project-two", "--name", "Project Two"]);
    assert.equal(addProjectResult.status, 0, addProjectResult.stderr || addProjectResult.stdout);

    rmSync(path.join(target, "planning", "project-two"), { recursive: true, force: true });
    mkdirSync(path.join(target, "planning", "project-two"), { recursive: true });
    writeFileSync(path.join(target, "planning", "project-two", "specs"), "blocked\n", "utf8");

    const rerun = runCli(["add-project", target, "--planning-root", "planning/project-two", "--name", "Project Two"]);
    assert.notEqual(rerun.status, 0);
    assert.equal(existsSync(path.join(target, "planning", "project-two", "PROJECT.md")), false);
    assert.equal(existsSync(path.join(target, "planning", "project-two", "ROADMAP.md")), false);
    assert.equal(existsSync(path.join(target, "planning", "project-two", "INBOX.md")), false);
});