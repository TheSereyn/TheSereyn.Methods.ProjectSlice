import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SEMVER_RELEASE_TAG = /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<preType>alpha|beta|rc)\.(?<preNumber>0|[1-9]\d*))?$/;

export function resolveReleasePublishMetadata({
    tagName,
    releaseIsPrerelease,
    packageName,
    packageVersion,
    toolkitName,
    toolkitVersion,
    repositoryUrl,
    expectedRepositoryUrl
}) {
    const match = SEMVER_RELEASE_TAG.exec(tagName);
    if (!match?.groups) {
        throw new Error("Release tags must use bare semver like 0.1.0 or 0.1.0-alpha.0.");
    }

    if (packageName !== toolkitName) {
        throw new Error(`package.json name ${packageName} does not match toolkit.yaml name ${toolkitName}.`);
    }

    if (packageVersion !== toolkitVersion) {
        throw new Error(`package.json version ${packageVersion} does not match toolkit.yaml version ${toolkitVersion}.`);
    }

    if (!repositoryUrl) {
        throw new Error("package.json must define repository.url for Trusted Publisher releases.");
    }

    if (expectedRepositoryUrl && repositoryUrl !== expectedRepositoryUrl) {
        throw new Error(`package.json repository URL ${repositoryUrl} does not match the expected GitHub repository ${expectedRepositoryUrl}.`);
    }

    const releaseBaseVersion = `${match.groups.major}.${match.groups.minor}.${match.groups.patch}`;
    const prereleaseType = match.groups.preType ?? null;
    const tagIsPrerelease = prereleaseType !== null;

    if (tagIsPrerelease !== releaseIsPrerelease) {
        throw new Error(`GitHub release prerelease flag mismatch for tag ${tagName}.`);
    }

    let expectedPackageVersion = releaseBaseVersion;
    let distTag = "latest";
    let installCommand = `npx ${packageName} init`;

    if (tagIsPrerelease) {
        expectedPackageVersion = `${releaseBaseVersion}-${prereleaseType}.${match.groups.preNumber}`;
        distTag = prereleaseType;
        installCommand = `npx ${packageName}@${distTag} init`;
    }

    if (packageVersion !== expectedPackageVersion) {
        throw new Error(`package.json version ${packageVersion} does not match the package version ${expectedPackageVersion} implied by release tag ${tagName}.`);
    }

    return {
        packageName,
        packageVersion,
        releaseTag: tagName,
        releaseBaseVersion,
        releaseChannel: prereleaseType ?? "stable",
        releaseIsPrerelease: tagIsPrerelease,
        distTag,
        installCommand,
        repositoryUrl
    };
}

function parseArgs(argv) {
    const args = {};
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token.startsWith("--")) {
            throw new Error(`Unexpected positional argument: ${token}`);
        }

        const key = token.slice(2);
        const value = argv[index + 1];
        if (!value || value.startsWith("--")) {
            throw new Error(`Missing value for --${key}`);
        }

        args[key] = value;
        index += 1;
    }

    return args;
}

function parseBoolean(value, flagName) {
    if (value === "true") {
        return true;
    }

    if (value === "false") {
        return false;
    }

    throw new Error(`Expected --${flagName} to be true or false.`);
}

function readJson(filePath) {
    return JSON.parse(readFileSync(filePath, "utf8"));
}

function readToolkitValue(filePath, key) {
    const content = readFileSync(filePath, "utf8");
    const match = content.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
    if (!match) {
        throw new Error(`toolkit.yaml is missing the top-level ${key} field.`);
    }

    return match[1].trim();
}

function getRepositoryUrl(repositoryValue) {
    if (typeof repositoryValue === "string" && repositoryValue.length > 0) {
        return repositoryValue;
    }

    if (repositoryValue && typeof repositoryValue === "object" && typeof repositoryValue.url === "string") {
        return repositoryValue.url;
    }

    return "";
}

function writeGitHubOutput(filePath, values) {
    const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
    appendFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function main() {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
    const packageJson = readJson(path.join(repoRoot, "package.json"));
    const toolkitPath = path.join(repoRoot, "toolkit.yaml");
    const args = parseArgs(process.argv.slice(2));

    const metadata = resolveReleasePublishMetadata({
        tagName: args.tag,
        releaseIsPrerelease: parseBoolean(args.prerelease, "prerelease"),
        packageName: packageJson.name,
        packageVersion: packageJson.version,
        toolkitName: readToolkitValue(toolkitPath, "name"),
        toolkitVersion: readToolkitValue(toolkitPath, "version"),
        repositoryUrl: getRepositoryUrl(packageJson.repository),
        expectedRepositoryUrl: args["repository-url"]
    });

    if (args["github-output"]) {
        writeGitHubOutput(args["github-output"], {
            package_name: metadata.packageName,
            package_version: metadata.packageVersion,
            release_tag: metadata.releaseTag,
            release_base_version: metadata.releaseBaseVersion,
            release_channel: metadata.releaseChannel,
            release_is_prerelease: metadata.releaseIsPrerelease,
            dist_tag: metadata.distTag,
            install_command: metadata.installCommand,
            repository_url: metadata.repositoryUrl
        });
    }

    process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
    try {
        main();
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    }
}