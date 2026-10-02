// Minimal Upstash Redis client over the REST API, using plain fetch.
// Zero dependencies. It only ever needs the two variables Vercel injects for
// read AND write access: KV_REST_API_URL and KV_REST_API_TOKEN.
//
//   POST {url}/pipeline   Authorization: Bearer {token}
//   body: [["SET","k","v"],["INCR","k"], ...]
//   reply: [{ "result": ... } | { "error": "..." }, ...]
//
// Commands are always sent as JSON arrays, never built into a string, so player
// input cannot change which command runs.

export class StoreError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StoreError';
  }
}

export function createUpstash({ url, token, fetchImpl = globalThis.fetch, timeoutMs = 4000 }) {
  const endpoint = `${String(url).replace(/\/+$/, '')}/pipeline`;

  return {
    // Run commands in order in one round trip; returns each command's result.
    async pipeline(commands) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(commands.map((cmd) => cmd.map(String))),
          signal: controller.signal,
        });
      } catch (err) {
        // Never include the token or URL in the message.
        throw new StoreError(err?.name === 'AbortError' ? 'store timed out' : 'store unreachable');
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) throw new StoreError(`store returned HTTP ${response.status}`);

      let body;
      try {
        body = await response.json();
      } catch {
        throw new StoreError('store returned invalid JSON');
      }
      if (!Array.isArray(body) || body.length !== commands.length) throw new StoreError('store returned an unexpected reply');
      return body.map((item) => {
        if (item && typeof item === 'object' && 'error' in item) throw new StoreError('store rejected a command');
        return item?.result ?? null;
      });
    },
  };
}
