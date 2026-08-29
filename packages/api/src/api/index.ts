export default {
  fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("ok");
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler;
