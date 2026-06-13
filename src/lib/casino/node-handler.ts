import { createRequire } from "module";
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

export async function runCasinoHandler(
  request: NextRequest,
  handlerPath: string,
  options?: { parseBody?: boolean },
): Promise<Response> {
  const handlerModule = require(handlerPath) as NodeHandler | { handler: NodeHandler };
  const handler = typeof handlerModule === "function" ? handlerModule : handlerModule.handler;

  const url = new URL(request.url);
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  let body: unknown = {};
  if (options?.parseBody && request.method !== "GET" && request.method !== "HEAD") {
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
      resolve(
        Response.json(
          { error: "Server error", message: error instanceof Error ? error.message : String(error) },
          { status: 500 },
        ),
      );
    });
  });
}
