import type { AvaSelection } from './host/types';

/** The lead the user currently has open, shared with AVA so "follow up with this lead" knows which one. */
let current: AvaSelection = {};
export const setAvaSelection = (s: AvaSelection | null) => { current = s ?? {}; };
export const getAvaSelection = (): AvaSelection => current;
