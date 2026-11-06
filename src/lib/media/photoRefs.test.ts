import { describe, expect, it } from 'vitest';
import { imageKey, isAllowedImageUrl, toRefs, truliaPhotoRefs, zillowPhotoRefs, MAX_PHOTOS_PER_LISTING } from './photoRefs';
import { isPublishable, validateRightsChange } from './rights';

const Z = (h: string, s = 'p_e') => `https://photos.zillowstatic.com/fp/${h}-${s}.jpg`;
const T = (h: string, n = 5) => `https://www.trulia.com/pictures/thumbs_${n}/zillowstatic/fp/${h}-full.jpg`;

describe('isAllowedImageUrl', () => {
  it('accepts the known photo CDNs over https', () => {
    expect(isAllowedImageUrl(Z('abc'))).toBe(true);
    expect(isAllowedImageUrl(T('abc'))).toBe(true);
  });
  it.each([
    ['http (not https)', 'http://photos.zillowstatic.com/fp/a-p_e.jpg'],
    ['another host', 'https://evil.example.com/fp/a-p_e.jpg'],
    ['lookalike host', 'https://photos.zillowstatic.com.evil.com/fp/a.jpg'],
    ['internal address', 'https://169.254.169.254/latest/meta-data/a.jpg'],
    ['localhost', 'https://localhost/a.jpg'],
    ['credentials', 'https://user:pw@photos.zillowstatic.com/fp/a.jpg'],
    ['odd port', 'https://photos.zillowstatic.com:8443/fp/a.jpg'],
    ['not an image', 'https://photos.zillowstatic.com/fp/a.html'],
    ['trulia page, not a picture', 'https://www.trulia.com/rental/123.jpg'],
    ['not a string', 42],
    ['not a url', 'photos.zillowstatic.com/a.jpg'],
  ])('refuses %s', (_why, u) => expect(isAllowedImageUrl(u)).toBe(false));
});

describe('imageKey', () => {
  it('gives the same key for one photo in different sizes and on different hosts', () => {
    expect(imageKey(Z('0ca21d66', 'p_e'))).toBe('0ca21d66');
    expect(imageKey(Z('0ca21d66', 'p_f'))).toBe('0ca21d66');
    expect(imageKey(T('0ca21d66', 3))).toBe('0ca21d66');
    expect(imageKey(T('0ca21d66', 5))).toBe(imageKey(Z('0ca21d66')));
  });
});

describe('photo refs', () => {
  it('Trulia: takes the largest size, de-duplicates the hero against the gallery, and keeps order', () => {
    const refs = truliaPhotoRefs({
      heroImage: { url: { small: T('a', 3), medium: T('a', 4) } },
      photos: [{ url: { small: T('a', 3), large: T('a', 5) } }, { url: { large: T('b', 5) } }, { url: { large: 'https://evil.example.com/c.jpg' } }, { url: { large: T('c', 5) } }],
    });
    expect(refs.map((r) => r.key)).toEqual(['a', 'b', 'c']);
    expect(refs[0].url).toBe(T('a', 5));
    expect(refs.map((r) => r.position)).toEqual([0, 1, 2]);
  });
  it('Zillow: one cover image, or none if it is not an allowed address', () => {
    expect(zillowPhotoRefs(Z('z1'))).toHaveLength(1);
    expect(zillowPhotoRefs('https://evil.example.com/z.jpg')).toEqual([]);
    expect(zillowPhotoRefs(undefined)).toEqual([]);
  });
  it('caps the number of photos per listing', () => {
    const many = Array.from({ length: MAX_PHOTOS_PER_LISTING + 10 }, (_, i) => Z(`h${i}`));
    expect(toRefs(many)).toHaveLength(MAX_PHOTOS_PER_LISTING);
  });
  it('copes with missing media', () => {
    expect(truliaPhotoRefs(undefined)).toEqual([]);
    expect(truliaPhotoRefs({})).toEqual([]);
  });
});

describe('rights', () => {
  it('lets a photo stay unreviewed, restricted or rejected without a reason', () => {
    for (const status of ['unreviewed', 'restricted', 'rejected'] as const) expect(validateRightsChange({ status })).toBeNull();
  });
  it('will not clear a photo without a basis', () => {
    expect(validateRightsChange({ status: 'cleared' })).toMatch(/why this photo may be published/i);
    expect(validateRightsChange({ status: 'cleared', basis: 'because' as never })).not.toBeNull();
  });
  it('clears with a basis, and demands the written permission when relying on the source site', () => {
    expect(validateRightsChange({ status: 'cleared', basis: 'seller_provided' })).toBeNull();
    expect(validateRightsChange({ status: 'cleared', basis: 'source_terms_allow' })).toMatch(/which source term/i);
    expect(validateRightsChange({ status: 'cleared', basis: 'source_terms_allow', note: 'Zillow Group feed agreement #123' })).toBeNull();
  });
  it('only cleared, visible photos are publishable', () => {
    expect(isPublishable({ rights_status: 'cleared' })).toBe(true);
    expect(isPublishable({ rights_status: 'cleared', hidden: true })).toBe(false);
    expect(isPublishable({ rights_status: 'unreviewed' })).toBe(false);
    expect(isPublishable({ rights_status: 'restricted' })).toBe(false);
  });
});
