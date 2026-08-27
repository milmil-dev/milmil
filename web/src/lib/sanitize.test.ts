import { describe, expect, it } from 'vite-plus/test';

import { externalHref, stripTags } from './sanitize';

describe('stripTags', () => {
  it('drops ordinary markup', () => {
    expect(stripTags('<p>A <b>bold</b> synopsis</p>')).toBe('A bold synopsis');
  });

  it('leaves nothing tag-shaped behind when tags are interleaved', () => {
    expect(stripTags('<scr<script>ipt>hi')).not.toContain('<');
    expect(stripTags('<a href="#"><img src=x onerror=y>caption')).toBe('caption');
  });

  it('is a fixed point once there is no markup left', () => {
    const once = stripTags('<i>plain</i>');
    expect(stripTags(once)).toBe(once);
  });
});

describe('externalHref', () => {
  it('accepts http and https', () => {
    expect(externalHref('https://nyaa.si/?page=rss')).toBe('https://nyaa.si/?page=rss');
    expect(externalHref('http://example.test/feed')).toBe('http://example.test/feed');
  });

  it('refuses anything else', () => {
    expect(externalHref('javascript:alert(1)')).toBeUndefined();
    expect(externalHref('data:text/html,<script>')).toBeUndefined();
    expect(externalHref('/relative/feed.xml')).toBeUndefined();
    expect(externalHref('not a url at all')).toBeUndefined();
  });
});
