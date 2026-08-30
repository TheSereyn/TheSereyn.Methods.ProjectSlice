import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(repoRoot, "examples", "orchestration-local-first-documents");
const contract = JSON.parse(readFileSync(path.join(fixtureRoot, "project-coordinator.json"), "utf8"));

function readContract(filePath) {
    const absolutePath = path.join(repoRoot, filePath);
    assert.ok(existsSync(absolutePath), `Missing coordinator contract file ${filePath}`);
    return readFileSync(absolutePath, "utf8");
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

test("project coordinator exposes the packaged multi-project contract", () => {
    const content = readContract(contract.file);
    const frontmatter = parseFrontmatter(content);
    const requiredSections = [
        "Purpose",
        "You may modify",
        "Read first",
        "Common skills",
        "Responsibilities",
        "Escalate when",
        "Complete when",
        "Do not"
    ];

    assert.equal(frontmatter.name, contract.agent);
    assert.equal(frontmatter["user-invocable"], true);
    assert.deepEqual([...frontmatter.tools].sort(), [...contract.tools].sort());

    for (const section of requiredSections) {
        assert.ok(sectionExists(content, section), `Missing '${section}' section`);
    }

    for (const field of contract.contextEnvelopeFields) {
        assert.match(content, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Missing context field ${field}`);
    }

    for (const example of contract.qualifiedReferenceExamples ?? []) {
        assert.match(content, new RegExp(example.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Missing qualified reference example '${example}'`);
    }

    for (const phrase of contract.responsibilityPhrases) {
        assert.match(content, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Missing responsibility phrase '${phrase}'`);
    }

    for (const phrase of contract.forbiddenPhrases) {
        assert.match(content, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Missing forbidden phrase '${phrase}'`);
    }
});

test("project coordinator ships as a capability-managed asset instead of a base install asset", () => {
    assert.equal(contract.fixtureOnly, false);
    assert.equal(contract.capabilityName, "multiProject");
    assert.ok(contract.file.startsWith("capabilities/multi-project/.github/agents/"), "Coordinator contract should be packaged as a multi-project capability asset");
    assert.equal(existsSync(path.join(repoRoot, ".github", "agents", "project-coordinator.agent.md")), false);
    assert.equal(contract.handoffTarget, "psm-project-manager");

    for (const scenario of contract.scenarios ?? []) {
        assert.deepEqual(scenario.allowedChanges, [], `Coordinator scenario ${scenario.id} must not declare project-local writes`);
    }
});