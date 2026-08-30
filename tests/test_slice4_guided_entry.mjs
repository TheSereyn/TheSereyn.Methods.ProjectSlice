import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(readFileSync(path.join(repoRoot, "examples", "orchestration-local-first-documents", "guided-entry.json"), "utf8"));
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const toolkitYaml = readFileSync(path.join(repoRoot, "toolkit.yaml"), "utf8");

function readText(relativePath) {
    const absolutePath = path.join(repoRoot, relativePath);
    assert.ok(existsSync(absolutePath), `Missing file ${relativePath}`);
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

test("multi-project capability packages the coordinator entry assets", () => {
    assert.ok(packageJson.files.includes("capabilities"), "package.json must publish capability assets");

    for (const entry of contract.toolkitEntries) {
        assert.ok(existsSync(path.join(repoRoot, entry.source)), `Missing capability asset source ${entry.source}`);
        assert.match(toolkitYaml, new RegExp(entry.source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `toolkit.yaml is missing source ${entry.source}`);
        assert.match(toolkitYaml, new RegExp(entry.destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `toolkit.yaml is missing destination ${entry.destination}`);
    }
});

test("work-on-project prompt selects the coordinator and documents the visible handoff", () => {
    const content = readText(contract.promptFile);
    const frontmatter = parseFrontmatter(content);

    assert.equal(frontmatter.agent, contract.promptAgent);
    assert.deepEqual(frontmatter.tools, contract.promptTools);

    for (const field of contract.contextEnvelopeFields) {
        assert.match(content, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Missing prompt context field ${field}`);
    }

    for (const snippet of contract.promptMustMention) {
        assert.match(content, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Missing prompt snippet '${snippet}'`);
    }
});

test("project selection skill defines context resolution and ordinary-chat fallback", () => {
    const content = readText(contract.skillFile);

    assert.match(content, /^---[\s\S]+^---/m, "Missing skill frontmatter");
    assert.match(content, /name:\s*"?psm-select-project-context"?/, "Skill name mismatch");
    assert.match(content, /description:\s*.+/, "Missing skill description");
    assert.match(content, /^# /m, "Missing skill title");

    for (const section of contract.skillSections) {
        assert.ok(sectionExists(content, section), `Missing skill section ${section}`);
    }

    for (const field of contract.contextEnvelopeFields) {
        assert.match(content, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Missing skill context field ${field}`);
    }

    for (const snippet of contract.skillMustMention) {
        assert.match(content, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), `Missing skill snippet '${snippet}'`);
    }
});