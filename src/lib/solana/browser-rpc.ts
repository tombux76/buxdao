type RpcResponse<T> = {
  result?: T;
  error?: { message?: string };
};

async function browserRpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch("/api/solana/rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) {
    throw new Error(`RPC request failed (${res.status})`);
  }
  const body = (await res.json()) as RpcResponse<T>;
  if (body.error) {
    throw new Error(body.error.message ?? "RPC error");
  }
  if (body.result === undefined) {
    throw new Error("RPC returned no result");
  }
  return body.result;
}

export async function getLatestBlockhashForWallet(): Promise<string> {
  const result = await browserRpc<{ value: { blockhash: string } }>("getLatestBlockhash", [
    { commitment: "confirmed" },
  ]);
  return result.value.blockhash;
}
