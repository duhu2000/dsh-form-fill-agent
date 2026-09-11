# Main convergence / DSH-UX-001 v1.5.2

Baseline main: 7ed7473bc25e9c52a94eaa8f43f65dc85e0496c7.
Published head: 1dde48cdd9a8b85383c5845e6b66c3f74f8c30d8 (V0.2.27).

An explicit merge joins both histories, including PR #2/#3/#4/#5 dependencies. No published tag or npm version is rewritten. The application package remains 0.2.27, with exactly the published runtime files.

Main's pre-existing qcc-field-contracts 0.2.0 export/snapshot module is retained; lockfile workspace metadata is synchronized. This is a residual difference from V0.2.27's shared package 0.1.0, not a new shared-package release. No consumer dependency is upgraded.

Contract regression: launcher passes workspaceId and namespaced sessionId, prefers Workspace sessionIds over recent workspace, concurrent clicks create once. Tab single:true, close/detach/reopen, host collapse/expand, session isolation and bottom/float ownership remain covered. Workspace sessionIds is updated by the Host mock (the plugin uses the Host creation API, not direct workspace mutation).

Validation: npm run check: 127 tests and all four package checks pass. Main application tarball SHA256 c5dd9bdb3880e2689f7be6f86b7ff35dd56e71b92f2e093a39879b6c9cf3e838 matches the published 0.2.27 source pack. Prior real-host co-install acceptance was reported by the coordinating ledger; this governance change does not claim to rerun that external acceptance.
