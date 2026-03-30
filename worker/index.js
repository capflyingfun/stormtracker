export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    if (url.pathname === '/metar') {
      const params = new URLSearchParams(url.search);
      const awcUrl = `https://aviationweather.gov/api/data/metar?${params.toString()}`;
      try {
        const resp = await fetch(awcUrl, {
          headers: { 'User-Agent': 'StormTracker/1.0' },
        });
        const body = await resp.text();
        return new Response(body, {
          status: resp.status,
          headers: {
            'Content-Type': resp.headers.get('Content-Type') || 'text/plain',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=60',
          },
        });
      } catch (e) {
        return new Response('Upstream error: ' + e.message, {
          status: 502,
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    if (url.pathname === '/taf') {
      const params = new URLSearchParams(url.search);
      const awcUrl = `https://aviationweather.gov/api/data/taf?${params.toString()}`;
      try {
        const resp = await fetch(awcUrl, {
          headers: { 'User-Agent': 'StormTracker/1.0' },
        });
        const body = await resp.text();
        return new Response(body, {
          status: resp.status,
          headers: {
            'Content-Type': resp.headers.get('Content-Type') || 'text/plain',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=60',
          },
        });
      } catch (e) {
        return new Response('Upstream error: ' + e.message, {
          status: 502,
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    return new Response('StormTracker AWC Proxy\n\nEndpoints:\n  /metar?ids=KPNS&format=raw\n  /taf?ids=KPNS&format=raw\n\nSee: https://aviationweather.gov/data/api/', {
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
      },
    });
  },
};
