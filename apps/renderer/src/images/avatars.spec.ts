import { fetchAvatar } from './avatars';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

function fakeFetch(response: Response | Error) {
  const calls: string[] = [];
  const fetch = (input: string | URL | Request) => {
    calls.push(input instanceof Request ? input.url : input.toString());
    return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
  };
  return { fetch, calls };
}

const png = () => new Response(PNG_BYTES, { headers: { 'content-type': 'image/png' } });

describe('fetchAvatar', () => {
  it('turns a GitHub avatar into a small data URI', async () => {
    const fake = fakeFetch(png());
    const uri = await fetchAvatar('https://avatars.githubusercontent.com/u/4242?v=4', fake.fetch);
    expect(uri).toBe(`data:image/png;base64,${PNG_BYTES.toString('base64')}`);
    expect(new URL(fake.calls[0] ?? '').searchParams.get('s')).toBe('96');
    await fetchAvatar('https://avatars.githubusercontent.com/u/4242?v=4', fake.fetch, 256);
    expect(new URL(fake.calls[1] ?? '').searchParams.get('s')).toBe('256');
  });

  it.each([
    'http://avatars.githubusercontent.com/u/1',
    'https://evil.example.com/u/1',
    'https://avatars.githubusercontent.com.evil.dev/u/1',
    'file:///etc/passwd',
    'not a url',
  ])('never fetches anything but GitHub avatars over https (%s)', async (url) => {
    const fake = fakeFetch(png());
    expect(await fetchAvatar(url, fake.fetch)).toBeNull();
    expect(fake.calls).toEqual([]);
  });

  it('falls back (null) when GitHub fails, answers something else or sends too much', async () => {
    const url = 'https://avatars.githubusercontent.com/u/1';
    expect(await fetchAvatar(url, fakeFetch(new TypeError('offline')).fetch)).toBeNull();
    expect(await fetchAvatar(url, fakeFetch(new Response('x', { status: 404 })).fetch)).toBeNull();
    const html = new Response('<html>', { headers: { 'content-type': 'text/html' } });
    expect(await fetchAvatar(url, fakeFetch(html).fetch)).toBeNull();
    const huge = new Response(Buffer.alloc(600_000), { headers: { 'content-type': 'image/png' } });
    expect(await fetchAvatar(url, fakeFetch(huge).fetch)).toBeNull();
  });
});
