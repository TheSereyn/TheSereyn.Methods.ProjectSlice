import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validator = path.join(repoRoot, "scripts", "psm", "validate_psm.py");
const fixtureRoot = path.join(repoRoot, "examples", "local-first-documents");
const pmContract = JSON.parse(readFileSync(path.join(repoRoot, "examples", "orchestration-local-first-documents", "project-manager.json"), "utf8"));
const coordinatorContract = JSON.parse(readFileSync(path.join(repoRoot, "examples", "orchestration-local-first-documents", "project-coordinator.json"), "utf8"));
const specialistContracts = JSON.parse(readFileSync(path.join(repoRoot, "examples", "orchestration-local-first-documents", "specialist-agents.json"), "utf8"));
const boundaryFixture = JSON.parse(readFileSync(path.join(repoRoot, "examples", "orchestration-local-first-documents", "multi-project-boundaries.json"), "utf8"));

function runValidator(args, cwd = repoRoot) {
    return spawnSync("python3", [validator, ...args], {
        cwd,
        encoding: "utf8"
    });
}

function runCli(args) {
    return spawnSync("node", ["bin/psm.js", ...args], {
        cwd: repoRoot,
        encoding: "utf8"
    });
}

function setProjectMetadata(projectRoot, projectKey, implementationRoots) {
    const projectPath = path.join(projectRoot, "PROJECT.md");
    const projectBody = readFileSync(projectPath, "utf8").replace(/^---\n[\s\S]*?\n---\n/, "");
    const implementationSection = implementationRoots.length === 0
        ? "implementation_roots: []"
        : `implementation_roots:\n${implementationRoots.map((item) => `  - ${item}`).join("\n")}`;

    writeFileSync(projectPath, `---
type: project
id: PROJECT
project_key: ${projectKey}
method: psm
method_version: 0.2
${implementationSection}
---

${projectBody.replace(/^#\s+.+$/m, `# ${projectKey}`)}`, "utf8");
}

function createMultiProjectHost() {
    const sandboxRoot = mkdtempSync(path.join(tmpdir(), "psm-phase3-multi-"));
    const target = path.join(sandboxRoot, "repo");
    mkdirSync(path.join(target, ".git"), { recursive: true });

    const projectOneRoot = path.join(target, "planning", "product-a");
    const projectTwoRoot = path.join(target, "planning", "product-b");
    cpSync(path.join(fixtureRoot, "planning"), projectOneRoot, { recursive: true });
    cpSync(path.join(fixtureRoot, "planning"), projectTwoRoot, { recursive: true });

    setProjectMetadata(projectOneRoot, "product-a", ["repos/product-a"]);
    setProjectMetadata(projectTwoRoot, "product-b", ["repos/product-b"]);

    mkdirSync(path.join(target, "repos", "product-a", "src"), { recursive: true });
    mkdirSync(path.join(target, "repos", "product-b", "src"), { recursive: true });
    writeFileSync(path.join(target, "repos", "product-a", "src", "search.txt"), "product-a\n", "utf8");
    writeFileSync(path.join(target, "repos", "product-b", "src", "search.txt"), "product-b\n", "utf8");

    return target;
}

function pathWithinRoot(filePath, rootPath) {
    return filePath === rootPath || filePath.startsWith(`${rootPath}/`);
}

test("multi-project fixture validates and exposes duplicate local slice IDs across projects", () => {
    const target = createMultiProjectHost();

    const validateResult = runValidator(["validate", target, "--all"]);
    assert.equal(validateResult.status, 0, validateResult.stdout + validateResult.stderr);

    const projectsResult = runCli(["projects", target, "--json"]);
    assert.equal(projectsResult.status, 0, projectsResult.stderr || projectsResult.stdout);

    const descriptors = JSON.parse(projectsResult.stdout).projects;
    assert.deepEqual(descriptors.map((descriptor) => descriptor.projectKey), ["product-a", "product-b"]);
    assert.deepEqual(descriptors.map((descriptor) => descriptor.implementationRoots[0]), ["repos/product-a", "repos/product-b"]);

    const roadmapA = readFileSync(path.join(target, "planning", "product-a", "ROADMAP.md"), "utf8");
    const roadmapB = readFileSync(path.join(target, "planning", "product-b", "ROADMAP.md"), "utf8");
    assert.match(roadmapA, /\bS-002\b/);
    assert.match(roadmapB, /\bS-002\b/);
});

test("ambiguous multi-project prompts remain coordinator-routed and leave planning state unchanged", () => {
    const target = createMultiProjectHost();
    const projectOneRoadmapPath = path.join(target, "planning", "product-a", "ROADMAP.md");
    const projectTwoRoadmapPath = path.join(target, "planning", "product-b", "ROADMAP.md");
    const projectOneInboxPath = path.join(target, "planning", "product-a", "INBOX.md");
    const projectTwoInboxPath = path.join(target, "planning", "product-b", "INBOX.md");
    const beforeProjectOneRoadmap = readFileSync(projectOneRoadmapPath, "utf8");
    const beforeProjectTwoRoadmap = readFileSync(projectTwoRoadmapPath, "utf8");
    const beforeProjectOneInbox = readFileSync(projectOneInboxPath, "utf8");
    const beforeProjectTwoInbox = readFileSync(projectTwoInboxPath, "utf8");

    const projectsResult = runCli(["projects", target, "--json"]);
    assert.equal(projectsResult.status, 0, projectsResult.stderr || projectsResult.stdout);
    const descriptors = JSON.parse(projectsResult.stdout).projects;
    assert.equal(descriptors.length, 2);

    const ambiguousRoute = pmContract.multiProjectBoundaryRoutes.find((route) => route.intent === "ambiguous-project-local-request");
    assert.ok(ambiguousRoute, "Missing ambiguous-project-local-request boundary route");

    for (const scenario of boundaryFixture.ambiguousScenarios) {
        assert.equal(scenario.route, ambiguousRoute.route);
        assert.equal(scenario.fallback, ambiguousRoute.fallback);
        assert.deepEqual(scenario.expectedWrites, [], `Scenario ${scenario.id} must stop before writes`);
        const duplicateMatches = descriptors.filter((descriptor) => {
            const roadmap = readFileSync(path.join(target, descriptor.planRoot, "ROADMAP.md"), "utf8");
            return new RegExp(`\\b${scenario.duplicateLocalId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(roadmap);
        });
        assert.equal(duplicateMatches.length, 2, `Scenario ${scenario.id} should be ambiguous across both projects`);
    }

    assert.equal(readFileSync(projectOneRoadmapPath, "utf8"), beforeProjectOneRoadmap);
    assert.equal(readFileSync(projectTwoRoadmapPath, "utf8"), beforeProjectTwoRoadmap);
    assert.equal(readFileSync(projectOneInboxPath, "utf8"), beforeProjectOneInbox);
    assert.equal(readFileSync(projectTwoInboxPath, "utf8"), beforeProjectTwoInbox);
});

test("portfolio fallback stays user-visible and leaves project-local state untouched", () => {
    const target = createMultiProjectHost();
    const portfolioRoute = pmContract.multiProjectBoundaryRoutes.find((route) => route.intent === "portfolio-status");
    assert.ok(portfolioRoute, "Missing portfolio-status boundary route");
    assert.equal(boundaryFixture.portfolioFallback.route, portfolioRoute.route);
    assert.equal(boundaryFixture.portfolioFallback.fallback, portfolioRoute.fallback);
    assert.deepEqual(boundaryFixture.portfolioFallback.expectedWrites, []);

    const beforeProjectOneRoadmap = readFileSync(path.join(target, "planning", "product-a", "ROADMAP.md"), "utf8");
    const beforeProjectTwoRoadmap = readFileSync(path.join(target, "planning", "product-b", "ROADMAP.md"), "utf8");

    assert.equal(readFileSync(path.join(target, "planning", "product-a", "ROADMAP.md"), "utf8"), beforeProjectOneRoadmap);
    assert.equal(readFileSync(path.join(target, "planning", "product-b", "ROADMAP.md"), "utf8"), beforeProjectTwoRoadmap);
});

test("status --all reports compact portfolio status per project without planning writes", () => {
    const target = createMultiProjectHost();
    const projectOneRoadmapPath = path.join(target, "planning", "product-a", "ROADMAP.md");
    const projectTwoRoadmapPath = path.join(target, "planning", "product-b", "ROADMAP.md");
    const projectOneInboxPath = path.join(target, "planning", "product-a", "INBOX.md");
    const projectTwoInboxPath = path.join(target, "planning", "product-b", "INBOX.md");
    const beforeProjectOneRoadmap = readFileSync(projectOneRoadmapPath, "utf8");
    const beforeProjectTwoRoadmap = readFileSync(projectTwoRoadmapPath, "utf8");
    const beforeProjectOneInbox = readFileSync(projectOneInboxPath, "utf8");
    const beforeProjectTwoInbox = readFileSync(projectTwoInboxPath, "utf8");

    const result = runCli(["status", target, "--all"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Portfolio status/);
    assert.match(result.stdout, /Project\s+Milestone\s+Active slice\s+Next action/);
    assert.match(result.stdout, /product-a\s+M-001\s+none\s+implement/);
    assert.match(result.stdout, /product-b\s+M-001\s+none\s+implement/);

    assert.equal(readFileSync(projectOneRoadmapPath, "utf8"), beforeProjectOneRoadmap);
    assert.equal(readFileSync(projectTwoRoadmapPath, "utf8"), beforeProjectTwoRoadmap);
    assert.equal(readFileSync(projectOneInboxPath, "utf8"), beforeProjectOneInbox);
    assert.equal(readFileSync(projectTwoInboxPath, "utf8"), beforeProjectTwoInbox);
});

test("status --all rejects mixed root and nested plan layouts instead of hiding nested projects", () => {
    const target = createMultiProjectHost();
    cpSync(path.join(target, "planning", "product-a", "PROJECT.md"), path.join(target, "planning", "PROJECT.md"));
    cpSync(path.join(target, "planning", "product-a", "ROADMAP.md"), path.join(target, "planning", "ROADMAP.md"));
    cpSync(path.join(target, "planning", "product-a", "INBOX.md"), path.join(target, "planning", "INBOX.md"));
    cpSync(path.join(target, "planning", "product-a", "specs"), path.join(target, "planning", "specs"), { recursive: true });

    const result = runCli(["status", target, "--all"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /Mixed plan layout is not supported/);
});

test("qualified cross-project IDs resolve duplicate local slice IDs to one project descriptor", () => {
    const target = createMultiProjectHost();
    const projectsResult = runCli(["projects", target, "--json"]);
    assert.equal(projectsResult.status, 0, projectsResult.stderr || projectsResult.stdout);
    const descriptors = JSON.parse(projectsResult.stdout).projects;

    for (const reference of coordinatorContract.qualifiedReferenceExamples ?? []) {
        const [projectKey, localId] = reference.split(":");
        assert.ok(localId, `Expected qualified reference with ':' in ${reference}`);
        const resolved = descriptors.filter((descriptor) => descriptor.projectKey === projectKey);
        assert.equal(resolved.length, 1, `Qualified reference should resolve one project for ${reference}`);
        const roadmap = readFileSync(path.join(target, resolved[0].planRoot, "ROADMAP.md"), "utf8");
        assert.match(roadmap, new RegExp(`\\b${localId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`));
    }
});

test("selected implementation changes stay within the chosen plan root and implementation roots during PM delegation", () => {
    const target = createMultiProjectHost();
    const projectsResult = runCli(["projects", target, "--json"]);
    assert.equal(projectsResult.status, 0, projectsResult.stderr || projectsResult.stdout);
    const descriptors = JSON.parse(projectsResult.stdout).projects;
    const [selectedProjectKey, localId] = boundaryFixture.delegationScenario.prompt.replace(/^Implement\s+/, "").replace(/\.$/, "").split(":");
    assert.equal(localId, "S-002");
    const selected = descriptors.find((descriptor) => descriptor.projectKey === selectedProjectKey);
    assert.ok(selected, "Missing product-a descriptor");

    const implementationRoute = pmContract.delegations.find((route) => route.intent === "implementation");
    assert.ok(implementationRoute, "Missing implementation delegation route");
    assert.equal(implementationRoute.route, boundaryFixture.delegationScenario.route);

    const implementerContract = specialistContracts.specialists.find((contract) => contract.agent === implementationRoute.route);
    assert.ok(implementerContract, "Missing implementer specialist contract");

    const changedFiles = [...boundaryFixture.delegationScenario.resultFiles];

    const tasksPath = path.join(target, changedFiles[0]);
    writeFileSync(tasksPath, `${readFileSync(tasksPath, "utf8")}\n- Scoped implementation note.\n`, "utf8");
    const codePath = path.join(target, changedFiles[1]);
    writeFileSync(codePath, `${readFileSync(codePath, "utf8")}updated\n`, "utf8");

    for (const changedFile of changedFiles) {
        const withinPlanRoot = pathWithinRoot(changedFile, selected.planRoot);
        const withinImplementationRoot = selected.implementationRoots.some((root) => pathWithinRoot(changedFile, root));
        assert.ok(withinPlanRoot || withinImplementationRoot, `Changed file outside selected scope: ${changedFile}`);
        assert.equal(implementerContract.agent, "psm-implementer");
        assert.equal(pathWithinRoot(changedFile, "planning/product-b"), false, `Changed sibling plan root unexpectedly: ${changedFile}`);
        assert.equal(pathWithinRoot(changedFile, "repos/product-b"), false, `Changed sibling implementation root unexpectedly: ${changedFile}`);
    }

    const validateResult = runValidator(["validate", target, "--all"]);
    assert.equal(validateResult.status, 0, validateResult.stdout + validateResult.stderr);
});

test("coordinator contract scenarios apply no project-local writes in a multi-project host", () => {
    const target = createMultiProjectHost();
    const beforeProjectOneRoadmap = readFileSync(path.join(target, "planning", "product-a", "ROADMAP.md"), "utf8");
    const beforeProjectTwoRoadmap = readFileSync(path.join(target, "planning", "product-b", "ROADMAP.md"), "utf8");
    const beforeProjectOneInbox = readFileSync(path.join(target, "planning", "product-a", "INBOX.md"), "utf8");
    const beforeProjectTwoInbox = readFileSync(path.join(target, "planning", "product-b", "INBOX.md"), "utf8");

    for (const scenario of coordinatorContract.scenarios ?? []) {
        assert.deepEqual(scenario.allowedChanges, [], `Coordinator scenario ${scenario.id} must not declare project-local writes`);
    }

    assert.equal(readFileSync(path.join(target, "planning", "product-a", "ROADMAP.md"), "utf8"), beforeProjectOneRoadmap);
    assert.equal(readFileSync(path.join(target, "planning", "product-b", "ROADMAP.md"), "utf8"), beforeProjectTwoRoadmap);
    assert.equal(readFileSync(path.join(target, "planning", "product-a", "INBOX.md"), "utf8"), beforeProjectOneInbox);
    assert.equal(readFileSync(path.join(target, "planning", "product-b", "INBOX.md"), "utf8"), beforeProjectTwoInbox);
});