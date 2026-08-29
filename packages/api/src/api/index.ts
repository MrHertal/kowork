// Mirrors OAUTH_CALLBACK_PORT / OAUTH_CALLBACK_PATH from
// opencode/packages/opencode/src/mcp/oauth-provider.ts: providers that only
// allow HTTPS redirect URIs (e.g. Canva) redirect here, and we relay to the
// app's local OAuth callback server. Never log the URL — auth codes transit
// in the query string.
const OAUTH_CALLBACK_PORT = 19876;
const OAUTH_CALLBACK_PATH = "/mcp/oauth/callback";

export default {
  fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("ok");
    if (url.pathname === OAUTH_CALLBACK_PATH) {
      return new Response(null, {
        status: 302,
        headers: {
          location: `http://127.0.0.1:${OAUTH_CALLBACK_PORT}${OAUTH_CALLBACK_PATH}${url.search}`,
          "cache-control": "private, no-store",
        },
      });
    }
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler;
