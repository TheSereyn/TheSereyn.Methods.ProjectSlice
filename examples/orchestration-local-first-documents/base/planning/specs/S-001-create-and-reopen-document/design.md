# Design

## Approach

Use a local document store and load persisted document metadata on startup.

## Components Affected

- document store;
- startup document loading;
- document open workflow.

## Data and Interfaces

Persist document title and body in a local storage format that can be reopened on startup.

## Risks and Edge Cases

- persistence failures must surface clearly enough to block the slice;
- loading order should not depend on later search functionality.

## Verification Strategy

Use focused persistence tests and a restart flow test.