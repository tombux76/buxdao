import { createRequire } from "module";
import path from "node:path";
import type { NextRequest } from "next/server";

const require = createRequire(import.meta.url);

type NodeHandler = (req: NodeRequest, res: NodeResponse) => void | Promise<void>;

type NodeRequest = {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string>;
  body?: unknown;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
};

type NodeResponse = {
  statusCode: number;
  setHeader: (key: string, value: string) => void;
  end: (data?: string) => void;
};

function loadCasinoHandlerModule(handlerPath: string): NodeHandler | { handler: NodeHandler } {
  switch (path.basename(handlerPath)) {
    case "load-player.cjs":
      return require("../../../casino-api/load-player.cjs");
    case "save-game.cjs":
      return require("../../../casino-api/save-game.cjs");
    case "collect.cjs":
      return require("../../../casino-api/collect.cjs");
    case "confirm-collect.cjs":
      return require("../../../casino-api/confirm-collect.cjs");
    case "register-collect-signature.cjs":
      return require("../../../casino-api/register-collect-signature.cjs");
    case "game-stats.cjs":
      return require("../../../casino-api/game-stats.cjs");
    case "leaderboard.cjs":
      return require("../../../casino-api/leaderboard.cjs");
    default:
      throw new Error(`Unknown casino handler: ${handlerPath}`);
  }
}

export async function runCasinoHandler(
  request: NextRequest,
  handlerPath: string,
  options?: { parseBody?: boolean; body?: unknown },
): Promise<Response> {
  let handler: NodeHandler;
  try {
    const handlerModule = loadCasinoHandlerModule(handlerPath);
    handler = typeof handlerModule === "function" ? handlerModule : handlerModule.handler;
  } catch (error) {
    console.error("Casino handler load failed:", handlerPath, error);
    return Response.json(
      {
        error: "Casino handler unavailable",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  let body: unknown = {};
  if (options?.body !== undefined) {
    body = options.body;
  } else if (options?.parseBody && request.method !== "GET" && request.method !== "HEAD") {
    try {
      body = await request.json();
    } catch {
      body = {};
    }
  }

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  return new Promise<Response>((resolve) => {
    let statusCode = 200;
    const responseHeaders: Record<string, string> = {};

    const res: NodeResponse = {
      get statusCode() {
        return statusCode;
      },
      set statusCode(value: number) {
        statusCode = value;
      },
      setHeader(key: string, value: string) {
        responseHeaders[key.toLowerCase()] = value;
      },
      end(data?: string) {
        resolve(
          new Response(data ?? "", {
            status: statusCode,
            headers: responseHeaders,
          }),
        );
      },
    };

    const req: NodeRequest = {
      method: request.method,
      headers,
      query,
      body,
    };

    Promise.resolve(handler(req, res)).catch((error) => {
      console.error("Casino handler error:", error);
      resolve(
        Response.json(
          { error: "Server error", message: error instanceof Error ? error.message : String(error) },
          { status: 500 },
        ),
      );
    });
  });
}
