/**
 * Zillow's data provider allows about one request per second across everything we run. When a screen starts many state pulls at once,
 * the rest were turned away with HTTP 429, so every Zillow pull started from the browser goes through this one line, spaced apart.
 */
const SPACING_MS = 1300;
let chain: Promise<unknown> = Promise.resolve();
const pause = () => new Promise<void>(resolve => setTimeout(resolve, SPACING_MS));

export function gatedZillowPull<T>(run: () => Promise<T>): Promise<T> {
  const result = chain.then(run);
  chain = result.then(pause, pause);
  return result;
}
