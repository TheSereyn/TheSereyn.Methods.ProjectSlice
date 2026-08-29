#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function readPayload() {
    return new Promise((resolve, reject) => {
        let data = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (chunk) => {
            data += chunk;
        });
        process.stdin.on("end", () => {
            try {
                resolve(data.trim() ? JSON.parse(data) : {});
            } catch (error) {
                reject(error);
            }
        });
    });
}

function writeOutput(payload) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function getValue(payload, ...names) {
    for (const name of names) {
        if (Object.prototype.hasOwnProperty.call(payload, name)) {
            return payload[name];
        }
    }

    return undefined;
}

function getCwd(payload) {
    const cwd = getValue(payload, "cwd");
    return typeof cwd === "string" && cwd ? path.resolve(cwd) : process.cwd();
}

function findRepoRoot(startPath) {
    let current = path.resolve(startPath);

    while (true) {
        if (existsSync(path.join(current, ".git")) || existsSync(path.join(current, ".psm", "manifest.json"))) {
            return current;
        }

        const parent = path.dirname(current);
        if (parent === current) {
            return path.resolve(startPath);
        }

        current = parent;
    }
}

function repoRootForPlanRoot(planRoot) {
    const resolved = path.resolve(planRoot);
    if (path.basename(resolved) === "planning") {
        return path.dirname(resolved);
    }

    if (path.basename(path.dirname(resolved)) === "planning") {
        return path.dirname(path.dirname(resolved));
    }

    return findRepoRoot(resolved);
}

function isPlanningRoot(targetPath) {
    return existsSync(path.join(targetPath, "PROJECT.md"))
        && existsSync(path.join(targetPath, "ROADMAP.md"))
        && existsSync(path.join(targetPath, "INBOX.md"))
        && existsSync(path.join(targetPath, "specs"));
}

function findNestedPlanRoots(searchRoot) {
    if (!existsSync(searchRoot)) {
        return [];
    }

    if (isPlanningRoot(searchRoot)) {
        return [searchRoot];
    }

    const roots = [];
    for (const name of readdirSync(searchRoot)) {
        const absolute = path.join(searchRoot, name);
        if (existsSync(absolute) && isDirectory(absolute)) {
            roots.push(...findNestedPlanRoots(absolute));
        }
    }

    return roots;
}

function isDirectory(targetPath) {
    try {
        return readFileSync(targetPath) === undefined;
    } catch {
        try {
            return readdirSync(targetPath) !== undefined;
        } catch {
            return false;
        }
    }
}

function discoverPlanRoots(startPath) {
    const start = path.resolve(startPath);

    if (isPlanningRoot(start)) {
        return [start];
    }

    const directPlanning = path.join(start, "planning");
    if (isPlanningRoot(directPlanning)) {
        return [directPlanning];
    }

    const repoRoot = findRepoRoot(start);
    const manifestPath = path.join(repoRoot, ".psm", "manifest.json");
    if (existsSync(manifestPath)) {
        try {
            const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
            if (Array.isArray(manifest.planRoots)) {
                const roots = manifest.planRoots
                    .filter((item) => item && typeof item.root === "string")
                    .map((item) => path.join(repoRoot, item.root))
                    .filter((item) => isPlanningRoot(item));
                if (roots.length > 0) {
                    return roots;
                }
            }
        } catch {
            // Ignore malformed manifest and fall back to filesystem discovery.
        }
    }

    const defaultPlanning = path.join(repoRoot, "planning");
    if (isPlanningRoot(defaultPlanning)) {
        return [defaultPlanning];
    }

    return findNestedPlanRoots(defaultPlanning);
}

function runValidator(planRoot, ...args) {
    const repoRoot = repoRootForPlanRoot(planRoot);
    const validatorPath = path.join(repoRoot, "scripts", "psm", "validate_psm.py");
    return spawnSync("python3", [validatorPath, ...args, planRoot], {
        cwd: repoRoot,
        encoding: "utf8"
    });
}

let pythonAvailable;

function hasPython() {
    if (pythonAvailable === undefined) {
        const probe = spawnSync("python3", ["--version"], { encoding: "utf8" });
        pythonAvailable = !probe.error && probe.status === 0;
    }
    return pythonAvailable;
}

function validatorProduced(result) {
    // Distinguish "the validator ran and reported findings" from "the validator
    // could not be executed at all" (missing interpreter, spawn error).
    return Boolean(result) && !result.error && result.status !== null;
}

function indentBlock(text) {
    return text
        .trim()
        .split(/\r?\n/)
        .map((line) => `  ${line}`)
        .join("\n");
}

function sessionStart(payload) {
    const planRoots = discoverPlanRoots(getCwd(payload));
    if (planRoots.length === 0) {
        return {};
    }

    const lines = [
        "This repository uses Project Slice Method.",
        "Use the human-facing Project Manager or the prompt shortcuts for normal interaction.",
        "Discovered plan roots:"
    ];

    const pythonReady = hasPython();

    for (const planRoot of planRoots) {
        const repoRoot = repoRootForPlanRoot(planRoot);
        const relativeRoot = path.relative(repoRoot, planRoot) || ".";

        if (!pythonReady) {
            lines.push(`- ${relativeRoot}`);
            continue;
        }

        const result = runValidator(planRoot, "status");

        if (validatorProduced(result) && result.status === 0) {
            lines.push(`- ${relativeRoot}`);
            lines.push(indentBlock(result.stdout));
            continue;
        }

        if (!validatorProduced(result)) {
            lines.push(`- ${relativeRoot}`);
            continue;
        }

        const failure = `${result.stdout}${result.stderr}`.trim() || "validation failed";
        lines.push(`- ${relativeRoot}: validation needs attention before heavy planning work.`);
        lines.push(indentBlock(failure));
    }

    if (!pythonReady) {
        lines.push("python3 was not found on PATH; PSM validation and status hooks are disabled until it is installed.");
    }

    return { additionalContext: lines.join("\n") };
}

function extractCommandText(payload) {
    const toolArgs = getValue(payload, "toolArgs", "tool_input");
    if (typeof toolArgs === "string") {
        return toolArgs;
    }

    if (toolArgs && typeof toolArgs === "object") {
        for (const key of ["command", "cmd", "input", "text"]) {
            if (typeof toolArgs[key] === "string") {
                return toolArgs[key];
            }
        }
    }

    return "";
}

// Best-effort guard only. This is not a security boundary: it recognizes the
// most common destructive command shapes that can wipe planning or package
// state, but determined or obfuscated commands can bypass it. Keep the managed
// target list in sync with the directories the package owns.
const managedTargets = String.raw`(?:planning|\.psm|\.github(?:\/(?:hooks|prompts|skills|agents|instructions|workflows))?|scripts\/psm)`;

const destructivePatterns = [
    /\bgit\s+reset\s+--hard\b/,
    /\bgit\s+checkout\s+--\b/,
    /\bgit\s+checkout\s+\.(?:\s|$)/,
    /\bgit\s+restore\b/,
    /\bgit\s+clean\b(?=[^\n|;&]*\s-\S*f)/,
    new RegExp(String.raw`\brm\s+-\S*[rf]\S*(?:\s+-\S+)*\s+` + managedTargets + String.raw`(?:\/\S*)?(?:\s|;|&|$)`)
];

function preToolUse(payload) {
    const toolName = getValue(payload, "toolName", "tool_name");
    if (!["bash", "powershell", "Bash"].includes(toolName)) {
        return { permissionDecision: "allow" };
    }

    const commandText = extractCommandText(payload);
    for (const pattern of destructivePatterns) {
        if (pattern.test(commandText)) {
            return {
                permissionDecision: "deny",
                permissionDecisionReason: "Blocked by Project Slice Method automation: destructive repository commands can invalidate planning or package state. Use a targeted, reviewable alternative instead."
            };
        }
    }

    return { permissionDecision: "allow" };
}

function summarizeFailure(output) {
    return output
        .trim()
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .slice(0, 4)
        .join("\n");
}

function agentStop(payload) {
    if (getValue(payload, "stopHookActive", "stop_hook_active") === true) {
        return { decision: "allow" };
    }

    // Fail open: never block a turn because the validator toolchain is missing.
    // Only genuine, reproducible validation findings should stop the workflow.
    if (!hasPython()) {
        return { decision: "allow" };
    }

    const planRoots = discoverPlanRoots(getCwd(payload));
    if (planRoots.length === 0) {
        return { decision: "allow" };
    }

    const failures = [];
    for (const planRoot of planRoots) {
        const repoRoot = repoRootForPlanRoot(planRoot);
        const relativeRoot = path.relative(repoRoot, planRoot) || ".";
        const result = runValidator(planRoot, "validate", "--strict");
        if (!validatorProduced(result)) {
            // Could not execute the validator (missing script, spawn error).
            // Treat as inconclusive and allow the turn to end.
            continue;
        }
        if (result.status !== 0) {
            failures.push(`${relativeRoot}: ${summarizeFailure(`${result.stdout}${result.stderr}`)}`);
        }
    }

    if (failures.length === 0) {
        return { decision: "allow" };
    }

    return {
        decision: "block",
        reason: [
            "PSM structural validation failed after the last turn. Fix the planning state before ending the workflow.",
            ...failures.slice(0, 3).map((failure) => `- ${failure}`)
        ].join("\n")
    };
}

async function main(argv) {
    const mode = argv[2];
    const payload = await readPayload();
    switch (mode) {
        case "session-start":
            writeOutput(sessionStart(payload));
            return 0;
        case "pre-tool-use":
            writeOutput(preToolUse(payload));
            return 0;
        case "agent-stop":
            writeOutput(agentStop(payload));
            return 0;
        default:
            throw new Error(`Unknown mode: ${mode}`);
    }
}

main(process.argv).then((code) => {
    process.exitCode = code;
}).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});