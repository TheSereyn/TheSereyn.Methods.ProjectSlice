# Releasing

Project Slice Method publishes to npm as `@thesereyn/psm`.

The repository's automated publish path is intentionally narrow: it only runs from a GitHub release publish event and is designed for npm Trusted Publisher.

## Version policy

- Stable releases use `Major.Minor.Patch`.
- Prereleases use `Major.Minor.Patch-<type>.<build-number>`.
- Release tags in this repository must use bare semver without a leading `v`.
- GitHub prerelease tags use one-based numbering.
- npm prerelease package versions use zero-based numbering for the same release train.

Examples:

- GitHub release tag `0.1.0-alpha.1` maps to npm package version `0.1.0-alpha.0`.
- GitHub release tag `0.1.0-beta.2` maps to npm package version `0.1.0-beta.1`.
- GitHub release tag `0.1.0` maps directly to npm package version `0.1.0`.

That means the next npm package version after `0.1.0-alpha.0` is `0.1.0-alpha.1`, but the corresponding GitHub prerelease tag is `0.1.0-alpha.2`.

## Release train rules

- Keep changes within the target stable release train until that stable release ships.
- For example, all work leading to the first stable release stays within the `0.1.0` train.
- After `0.1.0` ships, the next feature train starts at `0.2.0-alpha.0` when a new minor release is warranted.
- Patch releases such as `0.1.1` can ship directly as stable releases. Alpha, beta, and RC stages are optional for patches.

## Channel intent

- `alpha`: broad changes are allowed, including breaking feature changes and major revisions.
- `beta`: bug fixing and testing should dominate. Minor feature changes are acceptable, and breaking changes are still possible if needed.
- `rc`: bug-fix-only phase for a proposed stable release.

## Trusted Publisher setup

Configure npm Trusted Publisher for this package after the workflow file is on the default branch.

1. Open the package settings for `@thesereyn/psm` on npm.
2. Add a GitHub Actions trusted publisher.
3. Configure the publisher with these exact values:

- Organization or user: `TheSereyn`
- Repository: `TheSereyn.Methods.ProjectSlice`
- Workflow filename: `publish.yml`
- Allowed actions: `npm publish`

Leave the environment name empty unless this repository later adds a protected publish environment.

The repository URL in `package.json` must remain exactly `https://github.com/TheSereyn/TheSereyn.Methods.ProjectSlice.git` for Trusted Publisher validation to succeed.

## Automated workflow

The workflow lives at `.github/workflows/publish.yml` and triggers only on the GitHub `release` event with the `published` activity type.

Before publishing, it verifies:

- the release tag format;
- the GitHub prerelease flag;
- the `package.json` package name and version;
- the `toolkit.yaml` package name and version;
- the `package.json` repository URL used by Trusted Publisher.

It then:

1. installs dependencies;
2. runs `npm test`;
3. runs `npm pack --dry-run`;
4. publishes to npm with the derived dist-tag.

Stable releases publish to the `latest` dist-tag.
Prerelease releases publish to the dist-tag that matches the prerelease channel, such as `alpha`, `beta`, or `rc`.

## Publish examples

- GitHub release tag `0.1.0-alpha.1` publishes npm version `0.1.0-alpha.0` with dist-tag `alpha`.
- GitHub release tag `0.1.0-beta.1` publishes npm version `0.1.0-beta.0` with dist-tag `beta`.
- GitHub release tag `0.1.0-rc.1` publishes npm version `0.1.0-rc.0` with dist-tag `rc`.
- GitHub release tag `0.1.0` publishes npm version `0.1.0` with dist-tag `latest`.
- GitHub release tag `0.1.1` publishes npm version `0.1.1` with dist-tag `latest`.

## Post-publish check

Verify the live dist-tags after a release:

```bash
npm dist-tag ls @thesereyn/psm
```

Use the explicit prerelease install path while a release remains on a prerelease dist-tag:

```bash
npx @thesereyn/psm@alpha init
```