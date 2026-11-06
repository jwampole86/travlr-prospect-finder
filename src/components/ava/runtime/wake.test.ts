// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import { describe, expect, it } from 'vitest';
import { matchWake } from './wake';

describe('matchWake', () => {
  it.each([
    ['Hey AVA', ''],
    ['hey ava', ''],
    ['Hi Ava!', ''],
    ['Hello, AVA.', ''],
    ['OK Ava', ''],
    ['okay ava,', ''],
    ['Hey Eva', ''],
    ['hey a v a', ''],
    ['AVA', ''],
    ['Ava?', ''],
    ['Good morning Ava', ''],
  ])('wakes on %j', (said, rest) => {
    expect(matchWake(said)).toEqual({ rest });
  });

  it('hands back the request said in the same breath', () => {
    expect(matchWake('Hey AVA, show me my highest priority leads')).toEqual({ rest: 'show me my highest priority leads' });
    expect(matchWake('hi ava take me to the pipeline')).toEqual({ rest: 'take me to the pipeline' });
    expect(matchWake('OK Ava: where is lead management?')).toEqual({ rest: 'where is lead management?' });
  });

  it.each([
    'I asked Ava about it yesterday',
    'hey avalanche is coming',
    'the Ava project is due',
    'heyava',
    'have a good day',
    'hey there',
    'what is ava',
    '',
    '   ',
  ])('stays asleep for %j', (said) => {
    expect(matchWake(said)).toBeNull();
  });

  it('does not wake on a greeting to someone else', () => {
    expect(matchWake('hey Dave, can you look at this')).toBeNull();
  });
});
