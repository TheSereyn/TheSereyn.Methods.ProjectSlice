import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = path.join(repoRoot, ".github", "skills");

const requiredPhase3Skills = [
    "psm-bootstrap-project",
    "psm-capture-inbox",
    "psm-shape-roadmap",
    "psm-specify-slice",
    "psm-design-slice",
    "psm-decompose-tasks",
    "psm-check-readiness",
    "psm-verify-slice",
    "psm-reconcile-slice",
    "psm-traceability-audit"
];

function readSkill(skillName) {
    const filePath = path.join(skillsRoot, skillName, "SKILL.md");
    assert.ok(existsSync(filePath), `Missing skill file for ${skillName}`);
    return readFileSync(filePath, "utf8");
}

function sectionExists(content, heading) {
    return new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "m").test(content);
}

test("Phase 3 required skills exist with a consistent contract", () => {
    for (const skillName of requiredPhase3Skills) {
        const content = readSkill(skillName);
        assert.match(content, /^---[\s\S]+^---/m, `Missing frontmatter for ${skillName}`);
        assert.match(content, new RegExp(`name:\\s*"?${skillName}"?`), `Frontmatter name mismatch for ${skillName}`);
        assert.match(content, /description:\s*.+/, `Missing description for ${skillName}`);
        assert.match(content, /^# /m, `Missing title heading for ${skillName}`);
        assert.ok(sectionExists(content, "Inputs"), `Missing Inputs section for ${skillName}`);
        assert.ok(sectionExists(content, "Outputs"), `Missing Outputs section for ${skillName}`);
        assert.ok(sectionExists(content, "Procedure"), `Missing Procedure section for ${skillName}`);
        assert.ok(sectionExists(content, "Escalate when"), `Missing Escalate when section for ${skillName}`);
    }
});

test("Traceability audit skill points at the shared validator script", () => {
    const validatorPath = path.join(repoRoot, "scripts", "psm", "validate_psm.py");
    assert.ok(existsSync(validatorPath), "Missing shared validator script");

    const content = readSkill("psm-traceability-audit");
    assert.match(content, /scripts\/psm\/validate_psm\.py/);
    assert.match(content, /status/);
    assert.match(content, /trace/);
    assert.match(content, /milestone/);
    assert.match(content, /coverage/);
    assert.match(content, /next-id/);
});