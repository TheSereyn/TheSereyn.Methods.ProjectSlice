import { access, cp, mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const toolkitPath = path.join(packageRoot, "toolkit.yaml");
const instructionsBlockStart = "<!-- PSM-INSTRUCTIONS:BEGIN -->";
const instructionsBlockEnd = "<!-- PSM-INSTRUCTIONS:END -->";
const defaultPlanningRoot = "planning";

export async function run(argv, options = {}) {
    const io = options.io ?? {
        log: (message = "") => console.log(message),
        error: (message = "") => console.error(message)
    };

    const [command = "help", ...args] = argv;

    switch (command) {
        case "help":
        case "--help":
        case "-h":
            printHelp(io);
            return 0;
        case "inspect":
            return inspectToolkit(io, args);
        case "init":
            return initProject(io, args);
        case "add":
            return addPackageSource(io, args);
        case "sync":
            return syncInstalledPackages(io, args);
        case "update":
            return updateInstalledPackages(io, args);
        case "diff":
            return diffInstalledPackages(io, args);
        case "doctor":
            return doctorProject(io, args);
        case "validate":
            return validateProject(io, args);
        case "status":
            return statusProject(io, args);
        case "trace":
            return traceSlice(io, args);
        case "milestone":
            return milestoneStatus(io, args);
        case "coverage":
            return coverageForSlice(io, args);
        case "next-id":
            return nextId(io, args);
        default:
            io.error(`Unknown command: ${command}`);
            printHelp(io);
            return 1;
    }
}

async function inspectToolkit(io, args) {
    const { positionals, flags } = parseArgs(args);
    const sourcePackage = positionals[0]
        ? await resolvePackageSource(positionals[0])
        : await getCurrentPackageSource();
    const toolkit = sourcePackage.toolkit;
    const asJson = flags.json === true;

    if (asJson) {
        io.log(JSON.stringify({
            sourceType: sourcePackage.sourceType,
            sourceRef: sourcePackage.sourceRef,
            toolkit
        }, null, 2));
        return 0;
    }

    io.log(`${toolkit.name} v${toolkit.version}`);
    io.log(toolkit.description);
    io.log("");
    io.log(`Source: ${sourcePackage.displaySource}`);
    io.log(`Primary install path: ${toolkit.install.primary}`);
    io.log(`Managed assets: ${toolkit.repoManaged.length}`);
    io.log(`Plan templates: ${toolkit.planOwned.length}`);
    io.log(`Instruction file: ${toolkit.instructions.file} (default mode: preserve)`);
    io.log("");
    io.log("Managed paths");

    for (const item of toolkit.repoManaged) {
        io.log(`  ${item.destination}`);
    }

    io.log("");
    io.log("Plan template paths");

    for (const item of toolkit.planOwned) {
        io.log(`  ${item.destination}`);
    }

    io.log("");
    io.log("Plan root convention");
    io.log("  Keep user-owned project state under planning/.");
    io.log("  Use planning/<plan-slug>/ when one repository needs more than one PSM plan.");

    return 0;
}

async function initProject(io, args) {
    const { positionals, flags } = parseArgs(args);
    const sourcePackage = await getCurrentPackageSource();
    const targets = positionals.length > 0 ? positionals : ["."];

    if (flags.name && targets.length > 1) {
        io.error("--name can only be used when initializing a single target repository.");
        return 1;
    }

    let failures = 0;

    for (const target of targets) {
        const targetRoot = path.resolve(target);
        const projectName = flags.name ?? path.basename(targetRoot);
        const result = await installPackageIntoTarget(io, sourcePackage, targetRoot, projectName, flags, {
            includePlan: true
        });

        if (!result.ok) {
            failures += 1;
            continue;
        }

        io.log(`Initialized Project Slice Method in ${targetRoot}`);
        io.log("");
        io.log(`Project name: ${projectName}`);
        io.log(`Plan root: ${result.planningRoot}`);
        io.log(`Managed files: ${result.repoManagedFiles.length}`);
        io.log(`Plan files: ${result.planFiles.length}`);
        io.log(`Instructions mode: ${result.instructionsState.mode}`);
        if (result.instructionsState.needsManualMerge && result.instructionsState.snippetFile) {
            io.log(`Manual instructions merge: ${result.instructionsState.snippetFile}`);
        }
        io.log("Next steps:");
        io.log(`  1. Fill in ${result.planningRoot}/PROJECT.md with the real project intent.`);
        io.log(`  2. Review ${result.planningRoot}/ROADMAP.md and the starter slice package.`);
        io.log(`  3. From ${targetRoot}, run python3 scripts/psm/validate_psm.py validate ${result.planningRoot} --strict`);
    }

    return failures === 0 ? 0 : 1;
}

async function addPackageSource(io, args) {
    const { positionals, flags } = parseArgs(args);
    const [sourceArg, ...targetArgs] = positionals;

    if (!sourceArg) {
        io.error("add requires a package source path, for example: add ../package");
        return 1;
    }

    const targets = targetArgs.length > 0 ? targetArgs : ["."];
    if (flags.name && targets.length > 1) {
        io.error("--name can only be used when adding a package to a single target repository.");
        return 1;
    }

    const sourcePackage = await resolvePackageSource(sourceArg);
    let failures = 0;

    for (const target of targets) {
        const targetRoot = path.resolve(target);
        const projectName = flags.name ?? path.basename(targetRoot);
        const result = await installPackageIntoTarget(io, sourcePackage, targetRoot, projectName, flags, {
            includePlan: flags.includePlan === true
        });

        if (!result.ok) {
            failures += 1;
            continue;
        }

        io.log(`Added package ${sourcePackage.toolkit.name} to ${targetRoot}`);
        io.log(`Source: ${sourcePackage.displaySource}`);
        io.log(`Managed files: ${result.repoManagedFiles.length}`);
        io.log(`Plan files: ${result.planFiles.length}`);
        io.log(`Instructions mode: ${result.instructionsState.mode}`);
        if (result.instructionsState.needsManualMerge && result.instructionsState.snippetFile) {
            io.log(`Manual instructions merge: ${result.instructionsState.snippetFile}`);
        }
    }

    return failures === 0 ? 0 : 1;
}

async function syncInstalledPackages(io, args) {
    return applyLifecycleRefresh(io, args, { mode: "sync" });
}

async function updateInstalledPackages(io, args) {
    return applyLifecycleRefresh(io, args, { mode: "update" });
}

async function diffInstalledPackages(io, args) {
    const { positionals } = parseArgs(args);
    const targets = positionals.length > 0 ? positionals : ["."];
    let failures = 0;
    let differencesFound = 0;

    for (const target of targets) {
        const targetRoot = path.resolve(target);
        const lifecycleState = await readLifecycleState(targetRoot);
        const packageNames = Object.keys(lifecycleState.packages);

        if (packageNames.length === 0) {
            io.error(`No installed packages are recorded under ${path.join(lifecycleState.repoRoot, ".psm", "lock.json")}.`);
            failures += 1;
            continue;
        }

        let targetDiffCount = 0;

        for (const packageName of packageNames) {
            const packageRecord = lifecycleState.packages[packageName];
            const sourcePackage = await resolveRecordedPackageSource(packageName, packageRecord, lifecycleState.repoRoot);
            const expectedFiles = await expandEntries(sourcePackage.toolkit.repoManaged ?? [], false, {}, sourcePackage.root);
            const differences = await collectManagedDifferences(lifecycleState.repoRoot, packageRecord, expectedFiles);

            if (differences.length === 0) {
                continue;
            }

            targetDiffCount += differences.length;
            io.log(`Package ${packageName}`);
            io.log(`Source: ${sourcePackage.displaySource}`);
            for (const difference of differences) {
                io.log(`${difference.type.padEnd(10)}${difference.file}`);
            }
            io.log("");
        }

        if (targetDiffCount === 0) {
            io.log(`No managed file differences found.`);
        } else {
            differencesFound += targetDiffCount;
        }
    }

    return failures === 0 && differencesFound === 0 ? 0 : 1;
}

async function doctorProject(io, args) {
    const { positionals } = parseArgs(args);
    const { flags } = parseArgs(args);
    const targets = positionals.length > 0 ? positionals : ["."];
    let failures = 0;

    for (const target of targets) {
        const targetRoot = path.resolve(target);
        const result = await doctorTarget(io, targetRoot, flags);
        if (!result.ok) {
            failures += 1;
        }
    }

    return failures === 0 ? 0 : 1;
}

async function validateProject(io, args) {
    const { positionals, flags } = parseArgs(args);
    const targets = positionals.length > 0 ? positionals : ["."];
    let failures = 0;

    for (const target of targets) {
        const targetRoot = path.resolve(target);
        const planRoots = await resolveCommandPlanRoots(targetRoot, flags, { allowMultiple: flags.all === true });

        if (!planRoots.ok) {
            io.error(planRoots.message);
            failures += 1;
            continue;
        }

        const repoRoot = await findOwningRepoRoot(targetRoot);

        for (const planRoot of planRoots.roots) {
            const result = runValidatorCommand(repoRoot, "validate", [planRoot, ...(flags.strict ? ["--strict"] : [])]);
            relayValidatorResult(io, planRoot, result, repoRoot);
            if (result.status !== 0) {
                failures += 1;
            }
        }
    }

    return failures === 0 ? 0 : 1;
}

async function statusProject(io, args) {
    const { positionals, flags } = parseArgs(args);
    const targets = positionals.length > 0 ? positionals : ["."];
    let failures = 0;

    for (const target of targets) {
        const targetRoot = path.resolve(target);
        const planRoots = await resolveCommandPlanRoots(targetRoot, flags, { allowMultiple: flags.all === true });

        if (!planRoots.ok) {
            io.error(planRoots.message);
            failures += 1;
            continue;
        }

        const repoRoot = await findOwningRepoRoot(targetRoot);

        for (const planRoot of planRoots.roots) {
            const result = runValidatorCommand(repoRoot, "status", [planRoot]);
            relayCommandOutput(io, result);
            if (result.status !== 0) {
                failures += 1;
            }
        }
    }

    return failures === 0 ? 0 : 1;
}

async function traceSlice(io, args) {
    const { positionals, flags } = parseArgs(args);
    const sliceId = positionals[0];
    const target = positionals[1] ?? ".";

    if (!sliceId) {
        io.error("trace requires a slice ID, for example: trace S-001");
        return 1;
    }

    const targetRoot = path.resolve(target);
    const repoRoot = await findOwningRepoRoot(targetRoot);
    const planRoots = await resolveCommandPlanRoots(targetRoot, flags, { allowMultiple: false });

    if (!planRoots.ok) {
        io.error(planRoots.message);
        return 1;
    }

    const result = runValidatorCommand(repoRoot, "trace", [sliceId, planRoots.roots[0]]);
    relayCommandOutput(io, result);
    return result.status === 0 ? 0 : 1;
}

async function milestoneStatus(io, args) {
    const { positionals, flags } = parseArgs(args);
    const milestoneId = positionals[0];
    const target = positionals[1] ?? ".";

    if (!milestoneId) {
        io.error("milestone requires a milestone ID, for example: milestone M-001");
        return 1;
    }

    const targetRoot = path.resolve(target);
    const repoRoot = await findOwningRepoRoot(targetRoot);
    const planRoots = await resolveCommandPlanRoots(targetRoot, flags, { allowMultiple: false });

    if (!planRoots.ok) {
        io.error(planRoots.message);
        return 1;
    }

    const result = runValidatorCommand(repoRoot, "milestone", [milestoneId, planRoots.roots[0]]);
    relayCommandOutput(io, result);
    return result.status === 0 ? 0 : 1;
}

async function coverageForSlice(io, args) {
    const { positionals, flags } = parseArgs(args);
    const sliceId = positionals[0];
    const target = positionals[1] ?? ".";

    if (!sliceId) {
        io.error("coverage requires a slice ID, for example: coverage S-001");
        return 1;
    }

    const targetRoot = path.resolve(target);
    const repoRoot = await findOwningRepoRoot(targetRoot);
    const planRoots = await resolveCommandPlanRoots(targetRoot, flags, { allowMultiple: false });

    if (!planRoots.ok) {
        io.error(planRoots.message);
        return 1;
    }

    const result = runValidatorCommand(repoRoot, "coverage", [sliceId, planRoots.roots[0]]);
    relayCommandOutput(io, result);
    return result.status === 0 ? 0 : 1;
}

async function nextId(io, args) {
    const { positionals, flags } = parseArgs(args);
    const idType = positionals[0];
    const target = positionals[1] ?? ".";

    if (!idType) {
        io.error("next-id requires an ID type, for example: next-id slice");
        return 1;
    }

    const targetRoot = path.resolve(target);
    const repoRoot = await findOwningRepoRoot(targetRoot);
    const planRoots = await resolveCommandPlanRoots(targetRoot, flags, { allowMultiple: false });

    if (!planRoots.ok) {
        io.error(planRoots.message);
        return 1;
    }

    const result = runValidatorCommand(repoRoot, "next-id", [idType, planRoots.roots[0]]);
    relayCommandOutput(io, result);
    return result.status === 0 ? 0 : 1;
}

async function readToolkit() {
    return readToolkitAt(packageRoot);
}

async function readToolkitAt(rootPath) {
    const content = await readFile(path.join(rootPath, "toolkit.yaml"), "utf8");
    return parseToolkitYaml(content);
}

async function getCurrentPackageSource() {
    return {
        root: packageRoot,
        toolkit: await readToolkitAt(packageRoot),
        sourceType: "self",
        sourceRef: "current-package",
        displaySource: "current package"
    };
}

async function resolvePackageSource(sourceArg) {
    const resolvedRoot = path.resolve(sourceArg);
    const toolkitFile = path.join(resolvedRoot, "toolkit.yaml");

    if (!await exists(toolkitFile)) {
        throw new Error(`Unsupported package source '${sourceArg}'. Only local filesystem package sources with toolkit.yaml are supported right now.`);
    }

    let toolkit;
    try {
        toolkit = await readToolkitAt(resolvedRoot);
    } catch (error) {
        throw new Error(`Could not read package manifest at ${toolkitFile}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const isCurrentPackage = path.resolve(resolvedRoot) === path.resolve(packageRoot);

    return {
        root: resolvedRoot,
        toolkit,
        sourceType: isCurrentPackage ? "self" : "path",
        sourceRef: isCurrentPackage ? "current-package" : resolvedRoot,
        displaySource: isCurrentPackage ? "current package" : resolvedRoot
    };
}

async function resolveRecordedPackageSource(packageName, packageRecord, repoRoot) {
    if (packageRecord.sourceType === "self" || packageRecord.sourceRef === "current-package" || packageRecord.source === "npm") {
        const sourcePackage = await getCurrentPackageSource();
        if (sourcePackage.toolkit.name !== packageName) {
            throw new Error(`Current package is ${sourcePackage.toolkit.name}, but lifecycle state expects ${packageName}.`);
        }
        return sourcePackage;
    }

    if (packageRecord.sourceType === "path" && typeof packageRecord.sourceRef === "string") {
        const resolvedRef = path.isAbsolute(packageRecord.sourceRef)
            ? packageRecord.sourceRef
            : path.resolve(repoRoot ?? process.cwd(), packageRecord.sourceRef);
        const sourcePackage = await resolvePackageSource(resolvedRef);
        if (sourcePackage.toolkit.name !== packageName) {
            throw new Error(`Package source ${packageRecord.sourceRef} resolved to ${sourcePackage.toolkit.name}, but lifecycle state expects ${packageName}.`);
        }
        return sourcePackage;
    }

    throw new Error(`Unsupported package source for ${packageName}. Only current-package and local path lifecycle sources are supported right now.`);
}

async function installPackageIntoTarget(io, sourcePackage, targetRoot, projectName, flags, options) {
    const planningRoot = normalizePlanningRoot(flags.planningRoot ?? defaultPlanningRoot);
    const replacements = {
        "{{PROJECT_NAME}}": projectName,
        "{{DATE}}": new Date().toISOString().slice(0, 10),
        "{{PACKAGE_VERSION}}": sourcePackage.toolkit.version,
        "{{METHOD_VERSION}}": sourcePackage.toolkit.methodVersion,
        "{{PLANNING_ROOT}}": planningRoot
    };

    await mkdir(targetRoot, { recursive: true });

    const repoManagedFiles = await expandEntries(sourcePackage.toolkit.repoManaged ?? [], false, replacements, sourcePackage.root);
    const planFiles = options.includePlan === true
        ? await expandEntries(sourcePackage.toolkit.planOwned ?? [], true, replacements, sourcePackage.root)
        : [];
    const repoManagedPlan = await createWritePlan(repoManagedFiles, targetRoot, replacements, flags.force === true);
    const planWritePlan = await createWritePlan(planFiles, targetRoot, replacements, flags.force === true);
    const instructionsPlan = sourcePackage.toolkit.instructions
        ? await createInstructionsPlan(sourcePackage.toolkit, sourcePackage.root, targetRoot, replacements, flags.instructionsMode ?? "preserve")
        : createNoopInstructionsPlan();

    const conflicts = [
        ...repoManagedPlan.conflicts,
        ...planWritePlan.conflicts,
        ...instructionsPlan.conflicts
    ];

    if (conflicts.length > 0) {
        io.error(`Refusing to overwrite existing files in ${targetRoot}.`);
        io.error("Use --force for managed or plan files, or --instructions-mode merge to append a managed PSM block to an existing instructions file.");
        for (const conflict of conflicts) {
            io.error(`  ${conflict}`);
        }
        return { ok: false };
    }

    await applyWritePlan(repoManagedPlan);
    await applyWritePlan(planWritePlan);
    await applyInstructionsPlan(instructionsPlan);
    const managedFileHashes = await computeManagedHashes(repoManagedFiles);
    const portableSourceRef = sourcePackage.sourceType === "path"
        ? toPortableSourceRef(targetRoot, sourcePackage.root)
        : sourcePackage.sourceRef;
    await writeStateFiles(targetRoot, {
        projectName,
        planningRoot: options.includePlan === true ? planningRoot : null,
        planFiles: planFiles.map((file) => file.destination),
        packageRecord: buildPackageRecord(sourcePackage, {
            sourceRef: portableSourceRef,
            repoManagedFiles: repoManagedFiles.map((file) => file.destination),
            managedFileHashes,
            instructions: instructionsPlan.state,
            planRoots: options.includePlan === true ? [planningRoot] : []
        })
    });

    return {
        ok: true,
        planningRoot,
        repoManagedFiles,
        planFiles,
        instructionsState: instructionsPlan.state
    };
}

async function expandEntries(entries, templated, replacements, sourceRoot = packageRoot) {
    const files = [];

    for (const entry of entries) {
        const sourcePath = path.join(sourceRoot, entry.source);
        assertWithin(sourceRoot, sourcePath);
        const destinationRoot = applyReplacements(entry.destination, replacements);
        if (path.isAbsolute(destinationRoot) || destinationRoot.split(/[\\/]/).includes("..")) {
            throw new Error(`Unsafe destination in package manifest: ${entry.destination}`);
        }
        const sourceStats = await stat(sourcePath);

        if (sourceStats.isDirectory()) {
            const nested = await expandDirectory(sourcePath, destinationRoot, templated);
            files.push(...nested);
            continue;
        }

        files.push({
            source: sourcePath,
            destination: destinationRoot,
            templated
        });
    }

    return files;
}

async function expandDirectory(sourceRoot, destinationRoot, templated) {
    const entries = [];
    const children = await readdir(sourceRoot, { withFileTypes: true });

    for (const child of children) {
        const childSource = path.join(sourceRoot, child.name);
        const childDestination = path.posix.join(destinationRoot, child.name);

        if (child.isDirectory()) {
            entries.push(...await expandDirectory(childSource, childDestination, templated));
            continue;
        }

        entries.push({
            source: childSource,
            destination: childDestination,
            templated
        });
    }

    return entries;
}

async function copyEntry(source, destination, replacements = null) {
    await mkdir(path.dirname(destination), { recursive: true });

    if (!replacements) {
        await cp(source, destination, { force: true });
        return;
    }

    const original = await readFile(source, "utf8");
    const rendered = applyReplacements(original, replacements);
    await writeFile(destination, rendered, "utf8");
}

function applyReplacements(input, replacements) {
    return Object.entries(replacements).reduce((content, [token, value]) => {
        return content.split(token).join(value);
    }, input);
}

async function writeStateFiles(targetRoot, installState) {
    const stateRoot = path.join(targetRoot, ".psm");
    await mkdir(stateRoot, { recursive: true });

    const manifestPath = path.join(stateRoot, "manifest.json");
    const lockPath = path.join(stateRoot, "lock.json");
    const existingManifest = await readJsonIfExists(manifestPath);
    const existingLock = await readJsonIfExists(lockPath);
    const existingState = normalizeLifecycleState(existingManifest, existingLock);
    const now = new Date().toISOString();
    const packageName = installState.packageRecord.name;
    const existingPackage = existingState.packages[packageName] ?? {};
    const packages = {
        ...existingState.packages,
        [packageName]: {
            ...existingPackage,
            version: installState.packageRecord.version,
            source: installState.packageRecord.source,
            sourceType: installState.packageRecord.sourceType,
            sourceRef: installState.packageRecord.sourceRef,
            manifest: installState.packageRecord.manifest,
            repoManagedFiles: uniqueValues(installState.packageRecord.repoManagedFiles),
            managedFileHashes: installState.packageRecord.managedFileHashes ?? existingPackage.managedFileHashes ?? {},
            instructions: installState.packageRecord.instructions ?? existingPackage.instructions ?? null,
            planRoots: uniqueValues(installState.packageRecord.planRoots ?? existingPackage.planRoots ?? []),
            installedAt: existingPackage.installedAt ?? now,
            updatedAt: now
        }
    };
    const planRoots = mergePlanRoots(existingState.planRoots, installState, packages[packageName], now);
    const primaryPackageName = existingManifest?.name ?? packageName;
    const primaryPackage = packages[primaryPackageName] ?? packages[packageName];

    await writeFile(manifestPath, JSON.stringify({
        schemaVersion: 2,
        name: primaryPackageName,
        version: primaryPackage.version,
        installedAt: existingManifest?.installedAt ?? now,
        updatedAt: now,
        repoManagedFiles: uniqueValues(Object.values(packages).flatMap((entry) => entry.repoManagedFiles ?? [])),
        instructions: primaryPackage.instructions ?? existingManifest?.instructions ?? null,
        planRoots,
        packages
    }, null, 2) + "\n", "utf8");

    await writeFile(lockPath, JSON.stringify({
        schemaVersion: 2,
        packages: Object.fromEntries(Object.entries(packages).map(([name, entry]) => {
            return [name, {
                version: entry.version,
                source: entry.source,
                sourceType: entry.sourceType,
                sourceRef: entry.sourceRef,
                manifest: entry.manifest,
                repoManagedFiles: entry.repoManagedFiles,
                planRoots: entry.planRoots,
                installedAt: entry.installedAt,
                updatedAt: entry.updatedAt
            }];
        })),
        planRoots: uniqueValues(planRoots.map((root) => root.root)),
        updatedAt: now,
        installedAt: existingLock?.installedAt ?? now
    }, null, 2) + "\n", "utf8");
}

async function runCheck(label, predicate) {
    const ok = await predicate();
    return { label, ok, detail: "" };
}

function parseArgs(args) {
    const positionals = [];
    const flags = {};

    for (let index = 0; index < args.length; index += 1) {
        const token = args[index];

        if (token === "--force") {
            flags.force = true;
            continue;
        }

        if (token === "--name") {
            flags.name = args[index + 1];
            index += 1;
            continue;
        }

        if (token === "--planning-root") {
            flags.planningRoot = args[index + 1];
            index += 1;
            continue;
        }

        if (token === "--instructions-mode") {
            flags.instructionsMode = args[index + 1];
            index += 1;
            continue;
        }

        if (token === "--strict") {
            flags.strict = true;
            continue;
        }

        if (token === "--all") {
            flags.all = true;
            continue;
        }

        if (token === "--include-plan") {
            flags.includePlan = true;
            continue;
        }

        if (token === "--json") {
            flags.json = true;
            continue;
        }

        if (token === "--dry-run") {
            flags.dryRun = true;
            continue;
        }

        if (token === "--prune") {
            flags.prune = true;
            continue;
        }

        positionals.push(token);
    }

    return { positionals, flags };
}

async function exists(targetPath) {
    try {
        await access(targetPath);
        return true;
    } catch {
        return false;
    }
}

function printHelp(io) {
    io.log("Project Slice Method CLI");
    io.log("");
    io.log("Commands");
    io.log("  inspect [source] [--json] Show the current bundle or a local installable package source.");
    io.log("  init [path...] [--name X] [--planning-root planning/foo] [--instructions-mode preserve|merge|overwrite]");
    io.log("                            Bootstrap one or more repositories with PSM artifacts.");
    io.log("  add <source> [path...] [--include-plan] [--name X] [--planning-root planning/foo]");
    io.log("                            Add a local installable package source to one or more repositories.");
    io.log("  sync [path...] [--force] [--dry-run]");
    io.log("                            Reapply package-managed assets, preserving local edits unless --force.");
    io.log("  update [path...] [--force] [--dry-run] [--prune]");
    io.log("                            Refresh managed assets/versions; preserves local edits unless --force; --prune removes stale managed files.");
    io.log("  diff [path...]            Show managed-file drift against the recorded package sources.");
    io.log("  doctor [path...] [--planning-root planning/foo] [--strict]");
    io.log("                            Check bootstrapped repositories and validate each discovered plan root.");
    io.log("  validate [path...] [--planning-root planning/foo] [--all] [--strict]");
    io.log("                            Run the structural validator through the CLI.");
    io.log("  status [path...] [--planning-root planning/foo] [--all]");
    io.log("                            Print machine-derived project status for one or more plan roots.");
    io.log("  trace <slice-id> [path] [--planning-root planning/foo]");
    io.log("                            Show dependencies, requirements, tasks, and evidence for one slice.");
    io.log("  milestone <milestone-id> [path] [--planning-root planning/foo]");
    io.log("                            Show milestone composition and slice state.");
    io.log("  coverage <slice-id> [path] [--planning-root planning/foo]");
    io.log("                            Show requirement coverage for one slice.");
    io.log("  next-id <type> [path] [--planning-root planning/foo]");
    io.log("                            Return the next stable ID for the selected artifact type.");
}

function parseToolkitYaml(input) {
    const toolkit = {};
    const lines = input.split(/\r?\n/);
    let section = null;
    let currentItem = null;

    for (const rawLine of lines) {
        const trimmed = rawLine.trim();

        if (trimmed.length === 0 || trimmed.startsWith("#")) {
            continue;
        }

        const indent = rawLine.length - rawLine.trimStart().length;

        if (indent === 0) {
            currentItem = null;

            if (trimmed.endsWith(":")) {
                section = trimmed.slice(0, -1);
                continue;
            }

            const { key, value } = splitKeyValue(trimmed);
            toolkit[key] = value;
            section = null;
            continue;
        }

        if (indent === 2 && section === "install") {
            const { key, value } = splitKeyValue(trimmed);
            if (typeof toolkit.install !== "object" || toolkit.install === null || Array.isArray(toolkit.install)) {
                toolkit.install = {};
            }
            toolkit.install[key] = value;
            continue;
        }

        if (indent === 2 && trimmed.startsWith("- ")) {
            if (!Array.isArray(toolkit[section])) {
                toolkit[section] = [];
            }
            currentItem = {};
            toolkit[section].push(currentItem);
            const remainder = trimmed.slice(2).trim();

            if (remainder.length > 0) {
                if (remainder.includes(":")) {
                    const { key, value } = splitKeyValue(remainder);
                    currentItem[key] = value;
                } else {
                    toolkit[section][toolkit[section].length - 1] = stripWrappingQuotes(remainder);
                    currentItem = null;
                }
            }

            continue;
        }

        if (indent === 2 && currentItem === null) {
            if (typeof toolkit[section] !== "object" || toolkit[section] === null || Array.isArray(toolkit[section])) {
                toolkit[section] = {};
            }
            const { key, value } = splitKeyValue(trimmed);
            toolkit[section][key] = value;
            continue;
        }

        if (indent === 4 && currentItem) {
            const { key, value } = splitKeyValue(trimmed);
            currentItem[key] = value;
            continue;
        }

        throw new Error(`Unsupported toolkit.yaml structure: ${rawLine}`);
    }

    return toolkit;
}

function splitKeyValue(line) {
    const separatorIndex = line.indexOf(":");

    if (separatorIndex === -1) {
        throw new Error(`Invalid key/value line: ${line}`);
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = stripWrappingQuotes(line.slice(separatorIndex + 1).trim());
    return { key, value };
}

function stripWrappingQuotes(value) {
    if (value.length >= 2 && value[0] === value[value.length - 1] && ["\"", "'"].includes(value[0])) {
        return value.slice(1, -1);
    }
    return value;
}

async function createWritePlan(entries, targetRoot, replacements, force) {
    const writes = [];
    const conflicts = [];
    const skipped = [];

    for (const entry of entries) {
        const destination = path.join(targetRoot, entry.destination);
        assertWithin(targetRoot, destination);
        const content = entry.templated
            ? applyReplacements(await readFile(entry.source, "utf8"), replacements)
            : await readFile(entry.source);

        if (await exists(destination)) {
            const same = entry.templated
                ? (await readFile(destination, "utf8")) === content
                : (await readFile(destination)).equals(content);

            if (same) {
                skipped.push(entry.destination);
                continue;
            }

            if (!force) {
                conflicts.push(entry.destination);
                continue;
            }
        }

        writes.push({
            destination,
            relativeDestination: entry.destination,
            content,
            encoding: entry.templated ? "utf8" : undefined
        });
    }

    return { writes, conflicts, skipped };
}

async function applyWritePlan(plan) {
    for (const write of plan.writes) {
        await mkdir(path.dirname(write.destination), { recursive: true });
        await writeFile(write.destination, write.content, write.encoding ? { encoding: write.encoding } : undefined);
    }
}

async function createInstructionsPlan(toolkit, sourceRoot, targetRoot, replacements, mode) {
    const normalizedMode = normalizeInstructionsMode(mode);
    const templatePath = path.join(sourceRoot, toolkit.instructions.createTemplate);
    const templateContent = applyReplacements(await readFile(templatePath, "utf8"), replacements).trimEnd() + "\n";
    const instructionsPath = path.join(targetRoot, toolkit.instructions.file);
    const snippetRelativePath = path.posix.join(".psm", "copilot-instructions.snippet.md");
    const snippetPath = path.join(targetRoot, snippetRelativePath);
    const snippetContent = createManagedInstructionsBlock(templateContent);

    if (!await exists(instructionsPath)) {
        return {
            conflicts: [],
            writes: [{ destination: instructionsPath, content: templateContent, encoding: "utf8" }],
            snippetWrites: [],
            deletes: await createInstructionsCleanupDeletes(snippetPath),
            state: {
                file: toolkit.instructions.file,
                mode: "created",
                needsManualMerge: false,
                snippetFile: null
            }
        };
    }

    const currentContent = await readFile(instructionsPath, "utf8");
    const hasSameTemplate = currentContent.trim() === templateContent.trim();
    const existingManagedBlock = extractManagedInstructionsBlock(currentContent);
    const hasSameManagedBlock = existingManagedBlock !== null && existingManagedBlock.trim() === snippetContent.trim();

    if (normalizedMode === "preserve") {
        const needsManualMerge = !(hasSameTemplate || hasSameManagedBlock);
        const snippetWrites = needsManualMerge
            ? [{ destination: snippetPath, content: snippetContent, encoding: "utf8" }]
            : [];
        return {
            conflicts: [],
            writes: [],
            snippetWrites,
            deletes: needsManualMerge ? [] : await createInstructionsCleanupDeletes(snippetPath),
            state: {
                file: toolkit.instructions.file,
                mode: "preserve",
                needsManualMerge,
                snippetFile: needsManualMerge ? snippetRelativePath : null
            }
        };
    }

    if (normalizedMode === "merge") {
        const merged = mergeInstructions(currentContent, templateContent);
        const writes = merged === currentContent
            ? []
            : [{ destination: instructionsPath, content: merged, encoding: "utf8" }];
        return {
            conflicts: [],
            writes,
            snippetWrites: [],
            deletes: await createInstructionsCleanupDeletes(snippetPath),
            state: {
                file: toolkit.instructions.file,
                mode: "merge",
                needsManualMerge: false,
                snippetFile: null
            }
        };
    }

    return {
        conflicts: [],
        writes: hasSameTemplate ? [] : [{ destination: instructionsPath, content: templateContent, encoding: "utf8" }],
        snippetWrites: [],
        deletes: await createInstructionsCleanupDeletes(snippetPath),
        state: {
            file: toolkit.instructions.file,
            mode: "overwrite",
            needsManualMerge: false,
            snippetFile: null
        }
    };
}

function createNoopInstructionsPlan() {
    return {
        conflicts: [],
        writes: [],
        snippetWrites: [],
        deletes: [],
        state: {
            file: null,
            mode: "none",
            needsManualMerge: false,
            snippetFile: null
        }
    };
}

async function createInstructionsCleanupDeletes(snippetPath) {
    return await exists(snippetPath) ? [snippetPath] : [];
}

async function applyInstructionsPlan(plan) {
    for (const write of [...plan.writes, ...plan.snippetWrites]) {
        await mkdir(path.dirname(write.destination), { recursive: true });
        await writeFile(write.destination, write.content, { encoding: write.encoding });
    }

    for (const filePath of plan.deletes ?? []) {
        try {
            await unlink(filePath);
        } catch (error) {
            if (error?.code !== "ENOENT") {
                throw error;
            }
        }
    }
}

async function doctorTarget(io, targetRoot, flags) {
    const repoRoot = await findOwningRepoRoot(targetRoot);
    const planRoots = await resolveCommandPlanRoots(targetRoot, { ...flags, all: true }, { allowMultiple: true });
    const checks = [];
    const warnings = [];

    checks.push(await runCheck("Git repository", async () => exists(path.join(repoRoot, ".git"))));
    checks.push(await runCheck("scripts/psm/validate_psm.py", async () => exists(path.join(repoRoot, "scripts", "psm", "validate_psm.py"))));

    const pythonResult = spawnSync("python3", ["--version"], {
        cwd: repoRoot,
        encoding: "utf8"
    });

    checks.push({
        label: "python3 available",
        ok: pythonResult.status === 0,
        detail: pythonResult.status === 0 ? (pythonResult.stdout || pythonResult.stderr).trim() : "python3 not found"
    });

    if (!planRoots.ok) {
        checks.push({ label: "plan roots discovered", ok: false, detail: planRoots.message });
    } else {
        checks.push({ label: "plan roots discovered", ok: planRoots.roots.length > 0, detail: planRoots.roots.map((root) => path.relative(repoRoot, root) || ".").join(", ") });
    }

    const manifest = await readJsonIfExists(path.join(repoRoot, ".psm", "manifest.json"));
    if (manifest?.instructions?.needsManualMerge && manifest.instructions.snippetFile) {
        warnings.push(`copilot instructions merge required: ${manifest.instructions.snippetFile}`);
    }

    for (const check of checks) {
        io.log(`${check.ok ? "OK" : "FAIL"}  ${check.label}${check.detail ? `: ${check.detail}` : ""}`);
    }

    if (!checks.every((check) => check.ok)) {
        for (const warning of warnings) {
            io.log(`WARN  ${warning}`);
        }
        return { ok: false };
    }

    for (const planRoot of planRoots.roots) {
        const projectFile = await exists(path.join(planRoot, "PROJECT.md"));
        const roadmapFile = await exists(path.join(planRoot, "ROADMAP.md"));
        io.log(`${projectFile ? "OK" : "FAIL"}  ${path.relative(repoRoot, path.join(planRoot, "PROJECT.md"))}`);
        io.log(`${roadmapFile ? "OK" : "FAIL"}  ${path.relative(repoRoot, path.join(planRoot, "ROADMAP.md"))}`);

        const result = runValidatorCommand(repoRoot, "validate", [planRoot, ...(flags.strict ? ["--strict"] : [])]);
        relayValidatorResult(io, planRoot, result, repoRoot);
        if (result.status !== 0) {
            for (const warning of warnings) {
                io.log(`WARN  ${warning}`);
            }
            return { ok: false };
        }
    }

    for (const warning of warnings) {
        io.log(`WARN  ${warning}`);
    }

    return { ok: true };
}

async function resolveCommandPlanRoots(targetRoot, flags, options) {
    const planRoots = await discoverPlanRoots(targetRoot, flags);
    if (planRoots.length === 0) {
        return { ok: false, message: `No PSM plan roots found under ${targetRoot}.` };
    }

    if (!options.allowMultiple && planRoots.length > 1) {
        return {
            ok: false,
            message: "Multiple plan roots were found. Re-run with --planning-root planning/<plan-slug> or --all."
        };
    }

    return { ok: true, roots: planRoots };
}

async function discoverPlanRoots(targetRoot, flags) {
    const repoRoot = await findOwningRepoRoot(targetRoot);

    if (flags.planningRoot) {
        return [path.join(repoRoot, normalizePlanningRoot(flags.planningRoot))];
    }

    if (await isPlanningRoot(targetRoot)) {
        return [targetRoot];
    }

    const directChildPlanRoot = path.join(targetRoot, defaultPlanningRoot);
    if (await isPlanningRoot(directChildPlanRoot)) {
        return [directChildPlanRoot];
    }

    const manifest = await readJsonIfExists(path.join(repoRoot, ".psm", "manifest.json"));
    if (Array.isArray(manifest?.planRoots) && manifest.planRoots.length > 0) {
        return manifest.planRoots.map((root) => path.join(repoRoot, root.root));
    }

    const defaultRoot = path.join(repoRoot, defaultPlanningRoot);
    if (await isPlanningRoot(defaultRoot)) {
        return [defaultRoot];
    }

    return findNestedPlanRoots(defaultRoot);
}

async function findNestedPlanRoots(searchRoot) {
    if (!await exists(searchRoot)) {
        return [];
    }

    if (await isPlanningRoot(searchRoot)) {
        return [searchRoot];
    }

    const children = await readdir(searchRoot, { withFileTypes: true });
    const roots = [];

    for (const child of children) {
        if (!child.isDirectory()) {
            continue;
        }
        roots.push(...await findNestedPlanRoots(path.join(searchRoot, child.name)));
    }

    return roots;
}

async function isPlanningRoot(targetPath) {
    return await exists(path.join(targetPath, "PROJECT.md"))
        && await exists(path.join(targetPath, "ROADMAP.md"))
        && await exists(path.join(targetPath, "INBOX.md"))
        && await exists(path.join(targetPath, "specs"));
}

async function findOwningRepoRoot(startPath) {
    let current = path.resolve(startPath);

    while (true) {
        if (await exists(path.join(current, ".git")) || await exists(path.join(current, ".psm", "manifest.json"))) {
            return current;
        }

        const parent = path.dirname(current);
        if (parent === current) {
            return path.resolve(startPath);
        }

        current = parent;
    }
}

function runValidatorCommand(targetRoot, command, args) {
    const validatorPath = resolveValidatorPath(targetRoot);
    return spawnSync("python3", [validatorPath, command, ...args], {
        cwd: path.resolve(targetRoot),
        encoding: "utf8"
    });
}

function resolveValidatorPath(targetRoot) {
    const localValidator = path.join(targetRoot, "scripts", "psm", "validate_psm.py");
    return localValidator;
}

function relayValidatorResult(io, planRoot, result, repoRoot = null) {
    const root = repoRoot ?? targetRootForResult(planRoot);
    const label = path.relative(root, planRoot) || ".";
    const detail = `${result.stdout}${result.stderr}`.trim().replace(/\s+/g, " ");
    io.log(`${result.status === 0 ? "OK" : "FAIL"}  validator ${label}${detail ? `: ${detail}` : ""}`);
}

function relayCommandOutput(io, result) {
    const output = `${result.stdout}${result.stderr}`.trim();
    if (output) {
        io.log(output);
    }
}

function normalizePlanningRoot(value) {
    if (!value) {
        return defaultPlanningRoot;
    }

    if (path.isAbsolute(value)) {
        throw new Error("--planning-root must be relative to the target repository.");
    }

    const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
    if (normalized !== defaultPlanningRoot && !normalized.startsWith(`${defaultPlanningRoot}/`)) {
        throw new Error("Plan roots must live under planning/. Use planning or planning/<plan-slug>.");
    }
    if (normalized.split("/").some((segment) => segment === ".." || segment === ".")) {
        throw new Error("Plan roots must not contain '..' or '.' path segments.");
    }
    return normalized;
}

function normalizeInstructionsMode(value) {
    const normalized = (value ?? "preserve").toLowerCase();
    if (!["preserve", "merge", "overwrite"].includes(normalized)) {
        throw new Error("--instructions-mode must be one of preserve, merge, or overwrite.");
    }
    return normalized;
}

function createManagedInstructionsBlock(content) {
    return `${instructionsBlockStart}\n${content.trim()}\n${instructionsBlockEnd}\n`;
}

function extractManagedInstructionsBlock(content) {
    const start = content.indexOf(instructionsBlockStart);
    const end = content.indexOf(instructionsBlockEnd);
    if (start === -1 || end === -1 || end < start) {
        return null;
    }
    return content.slice(start, end + instructionsBlockEnd.length).trimEnd();
}

function mergeInstructions(existingContent, templateContent) {
    const managedBlock = createManagedInstructionsBlock(templateContent).trimEnd();
    const start = existingContent.indexOf(instructionsBlockStart);
    const end = existingContent.indexOf(instructionsBlockEnd);

    if (start !== -1 && end !== -1 && end >= start) {
        const before = existingContent.slice(0, start).trimEnd();
        const after = existingContent.slice(end + instructionsBlockEnd.length).trimStart();
        return `${before}\n\n${managedBlock}${after ? `\n\n${after}` : ""}\n`;
    }

    return `${existingContent.trimEnd()}\n\n${managedBlock}\n`;
}

async function readJsonIfExists(filePath) {
    if (!await exists(filePath)) {
        return null;
    }

    try {
        return JSON.parse(await readFile(filePath, "utf8"));
    } catch {
        return null;
    }
}

function uniqueValues(values) {
    return [...new Set(values)];
}

function targetRootForResult(planRoot) {
    return path.dirname(path.dirname(planRoot));
}

function buildPackageRecord(sourcePackage, details) {
    return {
        name: sourcePackage.toolkit.name,
        version: sourcePackage.toolkit.version,
        source: sourcePackage.sourceType === "self" ? "npm" : sourcePackage.sourceType,
        sourceType: sourcePackage.sourceType,
        sourceRef: details.sourceRef ?? sourcePackage.sourceRef,
        manifest: "toolkit.yaml",
        repoManagedFiles: details.repoManagedFiles,
        managedFileHashes: details.managedFileHashes ?? {},
        instructions: details.instructions,
        planRoots: details.planRoots ?? []
    };
}

function hashBuffer(content) {
    return createHash("sha256").update(content).digest("hex");
}

async function computeManagedHashes(files) {
    const hashes = {};
    for (const file of files) {
        hashes[file.destination] = hashBuffer(await readFile(file.source));
    }
    return hashes;
}

function toPortableSourceRef(repoRoot, sourceRoot) {
    return path.relative(repoRoot, sourceRoot) || ".";
}

function assertWithin(root, candidate) {
    const relative = path.relative(root, candidate);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error(`Refusing to operate on a path outside the target directory: ${candidate}`);
    }
}

function mergePlanRoots(existingPlanRoots, installState, packageRecord, now) {
    const byRoot = new Map(existingPlanRoots.map((entry) => [entry.root, entry]));

    if (installState.planningRoot) {
        const existing = byRoot.get(installState.planningRoot);
        byRoot.set(installState.planningRoot, {
            root: installState.planningRoot,
            projectName: installState.projectName,
            templatedFiles: installState.planFiles,
            initializedAt: existing?.initializedAt ?? now,
            updatedAt: now
        });
    }

    for (const root of packageRecord.planRoots ?? []) {
        if (!byRoot.has(root)) {
            byRoot.set(root, {
                root,
                projectName: installState.projectName ?? root,
                templatedFiles: [],
                initializedAt: now,
                updatedAt: now
            });
        }
    }

    return [...byRoot.values()];
}

function normalizeLifecycleState(existingManifest, existingLock) {
    return {
        packages: normalizeLifecyclePackages(existingManifest, existingLock),
        planRoots: normalizeLifecyclePlanRoots(existingManifest, existingLock)
    };
}

function normalizeLifecyclePackages(existingManifest, existingLock) {
    if (existingManifest?.packages && typeof existingManifest.packages === "object") {
        return existingManifest.packages;
    }

    const lockPackages = existingLock?.packages && typeof existingLock.packages === "object"
        ? existingLock.packages
        : {};
    const legacyName = existingManifest?.name ?? Object.keys(lockPackages)[0];
    if (!legacyName) {
        return {};
    }

    const lockEntry = lockPackages[legacyName] ?? {};
    return {
        [legacyName]: {
            version: lockEntry.version ?? existingManifest?.version ?? "0.0.0",
            source: lockEntry.source ?? "npm",
            sourceType: lockEntry.sourceType ?? (lockEntry.source === "path" ? "path" : "self"),
            sourceRef: lockEntry.sourceRef ?? (lockEntry.source === "path" ? lockEntry.sourceRef : "current-package"),
            manifest: lockEntry.manifest ?? "toolkit.yaml",
            repoManagedFiles: existingManifest?.repoManagedFiles ?? lockEntry.repoManagedFiles ?? [],
            instructions: existingManifest?.instructions ?? null,
            planRoots: normalizeLifecyclePlanRoots(existingManifest, existingLock).map((entry) => entry.root),
            installedAt: existingManifest?.installedAt ?? existingLock?.installedAt ?? null,
            updatedAt: existingManifest?.updatedAt ?? existingLock?.updatedAt ?? null
        }
    };
}

function normalizeLifecyclePlanRoots(existingManifest, existingLock) {
    if (Array.isArray(existingManifest?.planRoots) && existingManifest.planRoots.length > 0) {
        return existingManifest.planRoots.map((entry) => {
            if (typeof entry === "string") {
                return { root: entry, projectName: entry, templatedFiles: [], initializedAt: null, updatedAt: null };
            }
            return entry;
        });
    }

    if (Array.isArray(existingLock?.planRoots)) {
        return existingLock.planRoots.map((root) => ({ root, projectName: root, templatedFiles: [], initializedAt: null, updatedAt: null }));
    }

    return [];
}

async function readLifecycleState(targetRoot) {
    const repoRoot = await findOwningRepoRoot(targetRoot);
    const manifest = await readJsonIfExists(path.join(repoRoot, ".psm", "manifest.json"));
    const lock = await readJsonIfExists(path.join(repoRoot, ".psm", "lock.json"));
    const normalized = normalizeLifecycleState(manifest, lock);
    return {
        repoRoot,
        manifest,
        lock,
        packages: normalized.packages,
        planRoots: normalized.planRoots
    };
}

async function applyLifecycleRefresh(io, args, options) {
    const { positionals, flags } = parseArgs(args);
    const targets = positionals.length > 0 ? positionals : ["."];
    const force = flags.force === true;
    const dryRun = flags.dryRun === true;
    let failures = 0;

    for (const target of targets) {
        const targetRoot = path.resolve(target);
        const lifecycleState = await readLifecycleState(targetRoot);
        const packageNames = Object.keys(lifecycleState.packages);

        if (packageNames.length === 0) {
            io.error(`No installed packages are recorded under ${path.join(lifecycleState.repoRoot, ".psm", "lock.json")}.`);
            failures += 1;
            continue;
        }

        for (const packageName of packageNames) {
            try {
                const packageRecord = lifecycleState.packages[packageName];
                const sourcePackage = await resolveRecordedPackageSource(packageName, packageRecord, lifecycleState.repoRoot);
                const projectName = lifecycleState.planRoots[0]?.projectName ?? path.basename(lifecycleState.repoRoot);
                const planningRoot = lifecycleState.planRoots[0]?.root ?? defaultPlanningRoot;
                const replacements = {
                    "{{PROJECT_NAME}}": projectName,
                    "{{DATE}}": new Date().toISOString().slice(0, 10),
                    "{{PACKAGE_VERSION}}": sourcePackage.toolkit.version,
                    "{{METHOD_VERSION}}": sourcePackage.toolkit.methodVersion,
                    "{{PLANNING_ROOT}}": planningRoot
                };

                const expectedFiles = await expandEntries(sourcePackage.toolkit.repoManaged ?? [], false, replacements, sourcePackage.root);
                const baselineHashes = packageRecord.managedFileHashes ?? {};
                const plan = await createLifecycleWritePlan(expectedFiles, lifecycleState.repoRoot, baselineHashes, force);
                const prune = (options.mode === "update" && flags.prune === true)
                    ? await computePrune(lifecycleState.repoRoot, packageRecord, expectedFiles, baselineHashes, force)
                    : { toDelete: [], pruned: [], keptModified: [] };
                const instructionsPlan = sourcePackage.toolkit.instructions
                    ? await createInstructionsPlan(sourcePackage.toolkit, sourcePackage.root, lifecycleState.repoRoot, replacements, flags.instructionsMode ?? "preserve")
                    : createNoopInstructionsPlan();

                reportLifecyclePlan(io, options.mode, packageName, sourcePackage, plan, prune);

                if (dryRun) {
                    io.log(`Dry run: no files were changed for ${packageName}.`);
                    io.log("");
                    continue;
                }

                await applyWritePlan(plan);
                await applyInstructionsPlan(instructionsPlan);
                await applyPrune(prune);

                const prunedSet = new Set(prune.pruned);
                const finalManagedFiles = uniqueValues([
                    ...expectedFiles.map((file) => file.destination),
                    ...(packageRecord.repoManagedFiles ?? []).filter((file) => !prunedSet.has(file))
                ]);
                await writeStateFiles(lifecycleState.repoRoot, {
                    projectName,
                    planningRoot: null,
                    planFiles: [],
                    packageRecord: buildPackageRecord(sourcePackage, {
                        sourceRef: packageRecord.sourceRef,
                        repoManagedFiles: finalManagedFiles,
                        managedFileHashes: plan.resultingHashes,
                        instructions: instructionsPlan.state.file ? instructionsPlan.state : packageRecord.instructions,
                        planRoots: packageRecord.planRoots ?? []
                    })
                });

                if (options.mode === "update") {
                    io.log(`Updated package ${packageName} to v${sourcePackage.toolkit.version}`);
                } else {
                    io.log(`Synchronized package ${packageName} at v${sourcePackage.toolkit.version}`);
                }
                io.log("");
            } catch (error) {
                io.error(error instanceof Error ? error.message : String(error));
                failures += 1;
            }
        }
    }

    return failures === 0 ? 0 : 1;
}

async function createLifecycleWritePlan(expectedFiles, targetRoot, baselineHashes, force) {
    const writes = [];
    const restored = [];
    const updated = [];
    const overwritten = [];
    const preserved = [];
    const unchanged = [];
    const resultingHashes = {};

    for (const entry of expectedFiles) {
        const destination = path.join(targetRoot, entry.destination);
        assertWithin(targetRoot, destination);
        const sourceContent = await readFile(entry.source);
        const sourceHash = hashBuffer(sourceContent);

        if (!await exists(destination)) {
            writes.push({ destination, content: sourceContent, encoding: undefined });
            restored.push(entry.destination);
            resultingHashes[entry.destination] = sourceHash;
            continue;
        }

        const currentContent = await readFile(destination);
        const currentHash = hashBuffer(currentContent);

        if (currentHash === sourceHash) {
            unchanged.push(entry.destination);
            resultingHashes[entry.destination] = sourceHash;
            continue;
        }

        const baseline = baselineHashes[entry.destination];
        const locallyModified = baseline === undefined || currentHash !== baseline;

        if (locallyModified && !force) {
            preserved.push(entry.destination);
            if (baseline !== undefined) {
                resultingHashes[entry.destination] = baseline;
            }
            continue;
        }

        writes.push({ destination, content: sourceContent, encoding: undefined });
        if (locallyModified) {
            overwritten.push(entry.destination);
        } else {
            updated.push(entry.destination);
        }
        resultingHashes[entry.destination] = sourceHash;
    }

    return { writes, restored, updated, overwritten, preserved, unchanged, resultingHashes };
}

async function computePrune(repoRoot, packageRecord, expectedFiles, baselineHashes, force) {
    const expected = new Set(expectedFiles.map((file) => file.destination));
    const toDelete = [];
    const pruned = [];
    const keptModified = [];

    for (const relative of packageRecord.repoManagedFiles ?? []) {
        if (expected.has(relative)) {
            continue;
        }
        const absolute = path.join(repoRoot, relative);
        assertWithin(repoRoot, absolute);
        if (!await exists(absolute)) {
            continue;
        }
        const currentHash = hashBuffer(await readFile(absolute));
        const baseline = baselineHashes[relative];
        if (force || (baseline !== undefined && currentHash === baseline)) {
            toDelete.push(absolute);
            pruned.push(relative);
        } else {
            keptModified.push(relative);
        }
    }

    return { toDelete, pruned, keptModified };
}

async function applyPrune(prune) {
    for (const absolute of prune.toDelete) {
        await unlink(absolute);
    }
}

function reportLifecyclePlan(io, mode, packageName, sourcePackage, plan, prune) {
    io.log(`Package ${packageName}`);
    io.log(`Source: ${sourcePackage.displaySource}`);
    logLifecycleGroup(io, "restore", plan.restored);
    logLifecycleGroup(io, "update", plan.updated);
    logLifecycleGroup(io, "overwrite", plan.overwritten);
    logLifecycleGroup(io, "preserve-local", plan.preserved);
    logLifecycleGroup(io, "prune", prune.pruned);
    logLifecycleGroup(io, "stale-kept", prune.keptModified);

    if (plan.preserved.length > 0) {
        io.log("  Local edits were preserved. Re-run with --force to overwrite them.");
    }
    if (prune.keptModified.length > 0) {
        io.log("  Stale but locally modified files were kept. Re-run update --prune --force to remove them.");
    }

    const touched = plan.restored.length + plan.updated.length + plan.overwritten.length + prune.pruned.length;
    if (touched === 0 && plan.preserved.length === 0) {
        io.log("Already up to date.");
    }
}

function logLifecycleGroup(io, label, files) {
    for (const file of files) {
        io.log(`${label.padEnd(16)}${file}`);
    }
}

async function collectManagedDifferences(targetRoot, packageRecord, expectedFiles) {
    const differences = [];
    const recordedFiles = new Set(packageRecord.repoManagedFiles ?? []);
    const expectedDestinations = new Set(expectedFiles.map((file) => file.destination));

    for (const entry of expectedFiles) {
        const destination = path.join(targetRoot, entry.destination);
        const expectedContent = await readFile(entry.source);

        if (!await exists(destination)) {
            differences.push({ type: "MISSING", file: entry.destination });
            continue;
        }

        const actualContent = await readFile(destination);
        if (!actualContent.equals(expectedContent)) {
            differences.push({ type: "MODIFIED", file: entry.destination });
        }

        recordedFiles.delete(entry.destination);
    }

    for (const staleFile of recordedFiles) {
        if (!expectedDestinations.has(staleFile)) {
            differences.push({ type: "STALE", file: staleFile });
        }
    }

    return differences;
}