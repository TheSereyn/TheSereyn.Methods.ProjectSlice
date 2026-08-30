import assert from "node:assert/strict";
import test from "node:test";

import { resolveReleasePublishMetadata } from "../scripts/psm/release_publish.mjs";

const repositoryUrl = "https://github.com/TheSereyn/TheSereyn.Methods.ProjectSlice.git";

test("stable releases publish the matching stable package version to latest", () => {
    const metadata = resolveReleasePublishMetadata({
        tagName: "0.1.1",
        releaseIsPrerelease: false,
        packageName: "@thesereyn/psm",
        packageVersion: "0.1.1",
        toolkitName: "@thesereyn/psm",
        toolkitVersion: "0.1.1",
        repositoryUrl,
        expectedRepositoryUrl: repositoryUrl
    });

    assert.equal(metadata.distTag, "latest");
    assert.equal(metadata.installCommand, "npx @thesereyn/psm init");
    assert.equal(metadata.releaseChannel, "stable");
});

test("GitHub prerelease tags map one-based counters to zero-based npm versions", () => {
    const metadata = resolveReleasePublishMetadata({
        tagName: "0.2.0-beta.3",
        releaseIsPrerelease: true,
        packageName: "@thesereyn/psm",
        packageVersion: "0.2.0-beta.2",
        toolkitName: "@thesereyn/psm",
        toolkitVersion: "0.2.0-beta.2",
        repositoryUrl,
        expectedRepositoryUrl: repositoryUrl
    });

    assert.equal(metadata.distTag, "beta");
    assert.equal(metadata.packageVersion, "0.2.0-beta.2");
    assert.equal(metadata.installCommand, "npx @thesereyn/psm@beta init");
});

test("release tags must not use a v prefix", () => {
    assert.throws(() => {
        resolveReleasePublishMetadata({
            tagName: "v0.1.0",
            releaseIsPrerelease: false,
            packageName: "@thesereyn/psm",
            packageVersion: "0.1.0",
            toolkitName: "@thesereyn/psm",
            toolkitVersion: "0.1.0",
            repositoryUrl,
            expectedRepositoryUrl: repositoryUrl
        });
    }, /bare semver/);
});

test("release prerelease flag must match the tag channel", () => {
    assert.throws(() => {
        resolveReleasePublishMetadata({
            tagName: "0.1.0-alpha.1",
            releaseIsPrerelease: false,
            packageName: "@thesereyn/psm",
            packageVersion: "0.1.0-alpha.0",
            toolkitName: "@thesereyn/psm",
            toolkitVersion: "0.1.0-alpha.0",
            repositoryUrl,
            expectedRepositoryUrl: repositoryUrl
        });
    }, /prerelease flag mismatch/);
});

test("Trusted Publisher releases require an exact repository URL match", () => {
    assert.throws(() => {
        resolveReleasePublishMetadata({
            tagName: "0.1.0",
            releaseIsPrerelease: false,
            packageName: "@thesereyn/psm",
            packageVersion: "0.1.0",
            toolkitName: "@thesereyn/psm",
            toolkitVersion: "0.1.0",
            repositoryUrl,
            expectedRepositoryUrl: "https://github.com/TheSereyn/some-other-repo.git"
        });
    }, /does not match the expected GitHub repository/);
});