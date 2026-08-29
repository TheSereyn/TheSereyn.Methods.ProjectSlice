# Design

## Approach

Query the persisted document metadata by title and keep the matching rules deliberately simple.

## Components Affected

- document store query path;
- search UI or command surface;
- document open flow.

## Data and Interfaces

Search uses persisted document titles from the local store and returns references that the open flow can resolve.

## Risks and Edge Cases

- empty queries should not imply all results;
- matching behavior must stay deterministic while the slice is still basic.

## Verification Strategy

Use focused query tests and one end-to-end open-result demonstration.