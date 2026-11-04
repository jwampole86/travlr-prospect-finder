// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
let base = '';
/** Hosts serve the model and logo from their own public folder, e.g. `/ava`. */
export const setAssetBase = (b: string) => { base = b.replace(/\/$/, ''); };
export const assetUrl = (path: string) => base + path;
