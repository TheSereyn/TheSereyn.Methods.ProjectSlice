import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validator = path.join(repoRoot, "scripts", "psm", "validate_psm.py");
const agentsRoot = path.join(repoRoot, ".github", "agents");
const fixtureRoot = path.join(repoRoot, "examples", "orchestration-local-first-documents");
const contracts = JSON.parse(readFileSync(path.join(fixtureRoot, "specialist-agents.json"), "utf8"));

function readAgent(agentFile) {
    const filePath = path.join(repoRoot, agentFile);
    assert.ok(existsSync(filePath), `Missing agent file ${agentFile}`);
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
        const value = line.slice(separator + 1).trim();
        frontmatter[key] = parseValue(value);
    }

    return frontmatter;
}

function parseValue(value) {
    if (value.startsWith("[") && value.endsWith("]")) {
        const inner = value.slice(1, -1).trim();
        if (!inner) {
            return [];
        }
        return inner.split(",").map((item) => item.trim().replace(/^"|"$/g, ""));
    }

    if (value === "true") {
        return true;
    }

    if (value === "false") {
        return false;
    }

    return value.replace(/^"|"$/g, "");
}

function sectionExists(content, heading) {
    return new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "m").test(content);
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

function matchesScope(filePath, pattern) {
    if (pattern.endsWith("/**")) {
        const prefix = pattern.slice(0, -3);
        return filePath === prefix.slice(0, -1) || filePath.startsWith(prefix);
    }

    return filePath === pattern;
}

function runValidator(args) {
    return spawnSync("python3", [validator, ...args], {
        cwd: repoRoot,
        encoding: "utf8"
    });
}

function copyBaseFixture() {
    const sandboxRoot = mkdtempSync(path.join(tmpdir(), "psm-phase4-"));
    const target = path.join(sandboxRoot, "repo");
    cpSync(path.join(fixtureRoot, "base"), target, { recursive: true });
    return target;
}

function applyOverlay(target, overlayPath) {
    cpSync(path.join(fixtureRoot, overlayPath), target, { recursive: true });
}

test("specialist agents expose explicit Phase 4 contracts", () => {
    const requiredSections = [
        "Purpose",
        "Selected scope",
        "You may modify",
        "Read first",
        "Common skills",
        "Escalate when",
        "Complete when"
    ];

    for (const contract of contracts.specialists) {
        const content = readAgent(contract.file);
        const frontmatter = parseFrontmatter(content);

        assert.equal(frontmatter.name, contract.agent, `Agent name mismatch for ${contract.agent}`);
        assert.equal(frontmatter["user-invocable"], false, `${contract.agent} must not be user invocable`);
        assert.deepEqual([...frontmatter.tools].sort(), [...contract.tools].sort(), `Tool list mismatch for ${contract.agent}`);

        for (const heading of requiredSections) {
            assert.ok(sectionExists(content, heading), `Missing '${heading}' section for ${contract.agent}`);
        }

        for (const skillName of contract.expectedSkills) {
            assert.match(content, new RegExp(`` + skillName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ``), `Missing common skill ${skillName} for ${contract.agent}`);
        }

        for (const phrase of contract.escalationPhrases) {
            assert.match(content, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Missing escalation guidance '${phrase}' for ${contract.agent}`);
        }

        for (const phrase of contract.scopePhrases ?? []) {
            assert.match(content, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Missing scope guidance '${phrase}' for ${contract.agent}`);
        }
    }
});

test("specialist agent fixture overlays stay within declared write scopes", () => {
    for (const contract of contracts.specialists) {
        const files = listRelativeFiles(path.join(fixtureRoot, contract.overlay)).sort();
        assert.deepEqual(files, [...contract.allowedChanges].sort(), `Unexpected changed files for ${contract.agent}`);

        for (const file of files) {
            assert.ok(
                contract.writeScopePatterns.some((pattern) => matchesScope(file, pattern)),
                `${contract.agent} changed '${file}' outside its declared write scope`
            );
        }
    }
});

test("specialist agent scenarios validate independently against the fixture repo", () => {
    for (const contract of contracts.specialists) {
        const target = copyBaseFixture();

        for (const prerequisite of contract.prerequisiteOverlays) {
            applyOverlay(target, prerequisite);
        }

        applyOverlay(target, contract.overlay);

        const validateResult = runValidator(["validate", target, "--strict"]);
        assert.equal(validateResult.status, 0, `${contract.agent} fixture failed validation\n${validateResult.stdout}${validateResult.stderr}`);

        switch (contract.agent) {
            case "psm-project-shaper": {
                const milestoneResult = runValidator(["milestone", "M-002", target]);
                assert.equal(milestoneResult.status, 0, milestoneResult.stdout + milestoneResult.stderr);
                assert.match(milestoneResult.stdout, /S-004 — Synchronize documents between devices \[planned\]/);
                break;
            }
            case "psm-slice-planner": {
                const traceResult = runValidator(["trace", "S-002", target]);
                assert.equal(traceResult.status, 0, traceResult.stdout + traceResult.stderr);
                assert.match(traceResult.stdout, /Status: ready/);
                break;
            }
            case "psm-implementer": {
                const traceResult = runValidator(["trace", "S-002", target]);
                assert.equal(traceResult.status, 0, traceResult.stdout + traceResult.stderr);
                assert.match(traceResult.stdout, /Reconciliation Notes\n- Pending\./);
                break;
            }
            case "psm-verifier": {
                const traceResult = runValidator(["trace", "S-002", target]);
                assert.equal(traceResult.status, 0, traceResult.stdout + traceResult.stderr);
                assert.match(traceResult.stdout, /dotnet test --filter FindSavedDocument/);
                break;
            }
            case "psm-reconciler": {
                const traceResult = runValidator(["trace", "S-002", target]);
                assert.equal(traceResult.status, 0, traceResult.stdout + traceResult.stderr);
                assert.match(traceResult.stdout, /planning\/system\/search\.md/);
                break;
            }
            default:
                throw new Error(`Unhandled specialist agent ${contract.agent}`);
        }
    }
});

test("specialist agent files stay within the dedicated agent directory", () => {
    const agentFiles = contracts.specialists.map((contract) => contract.file);

    for (const file of agentFiles) {
        assert.ok(file.startsWith(".github/agents/"), `Agent file must stay under .github/agents: ${file}`);
        assert.ok(existsSync(path.join(agentsRoot, path.basename(file))), `Missing expected agent file ${file}`);
    }
});