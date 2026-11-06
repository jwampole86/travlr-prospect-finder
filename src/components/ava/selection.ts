import type { AvaScreen, AvaSelection } from './host/types';

/** The lead the user currently has open, shared with AVA so "follow up with this lead" knows which one. */
let current: AvaSelection = {};
export const setAvaSelection = (s: AvaSelection | null) => { current = s ?? {}; };
export const getAvaSelection = (): AvaSelection => current;

/** What the open screen shows (its filters, the record that is open, how many records match), so "this one" means something. */
let screen: AvaScreen = {};
export const setAvaScreen = (s: AvaScreen | null) => { screen = s ?? {}; };
export const getAvaScreen = (): AvaScreen => screen;

/** Lets a page offer its own export to AVA's "Export CSV" button. It only ever runs from the person's own click on that button. */
let exporter: (() => number | Promise<number>) | null = null;
export const setAvaExporter = (fn: (() => number | Promise<number>) | null) => { exporter = fn; };
export const runAvaExport = async (): Promise<number> => (exporter ? exporter() : 0);
