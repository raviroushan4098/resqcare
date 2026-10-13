import { createRouter } from "@/server/http/router";
import { routes } from "@/server/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handle = createRouter(routes);

async function dispatch(req: Request) {
  const pathname = new URL(req.url).pathname.replace(/^\/api/, "") || "/";
  return handle(req, pathname);
}

export { dispatch as GET, dispatch as POST, dispatch as PUT, dispatch as PATCH, dispatch as DELETE };
