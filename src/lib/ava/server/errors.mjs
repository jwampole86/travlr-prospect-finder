// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
export class ToolTimeout extends Error {}
export class ToolError extends Error {}
/** The caller is not allowed to do this (role, ownership). Reported as a permission denial, not a failure. */
export class ToolDenied extends Error {}
