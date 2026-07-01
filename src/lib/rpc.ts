import { supabaseBrowser } from "@/lib/supabase/browser";

/**
 * Helper para llamar RPCs / escrituras de Supabase SIN tragar el error.
 *
 * Problema que resuelve: `await supabaseBrowser.rpc(...)` NO lanza — devuelve
 * `{ data, error }`. En todo el dashboard se ignoraba `error` y se removía el
 * item de la bandeja como si hubiera funcionado, dejando abonos/multas en
 * `pendiente` con el comité creyendo que ya se aplicaron.
 *
 * Uso:
 *   const res = await callRpc("resolver_transaccion", { p_id: id, p_aprobar: true });
 *   if (!res.ok) { setMsg(res.error); return; }   // ← NO remover el item
 *   // ...éxito: ahora sí actualizar la UI
 */

export type RpcResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Traduce mensajes técnicos de Postgres/PostgREST a algo mostrable al usuario. */
export function mensajeDeError(raw: string | null | undefined): string {
  const m = (raw ?? "").trim();
  if (!m) return "Ocurrió un error. Revisa tu conexión e inténtalo de nuevo.";
  // Errores P0001 (RAISE EXCEPTION de nuestras RPCs) ya vienen en español legible.
  // Limpiamos prefijos técnicos comunes de PostgREST.
  const limpio = m
    .replace(/^.*?(?:violates|error:|failed:)\s*/i, "")
    .replace(/\s*\(SQLSTATE.*?\)\s*$/i, "");
  // Fallos de red típicos de fetch.
  if (/fetch|network|Failed to fetch|timeout/i.test(m)) {
    return "No se pudo conectar. Revisa tu internet e inténtalo de nuevo.";
  }
  return limpio || m;
}

/** Llama una función RPC del schema vecino. Nunca lanza; devuelve RpcResult. */
export async function callRpc<T = unknown>(
  fn: string,
  args?: Record<string, unknown>
): Promise<RpcResult<T>> {
  try {
    const { data, error } = await supabaseBrowser.rpc(fn, args ?? {});
    if (error) return { ok: false, error: mensajeDeError(error.message) };
    return { ok: true, data: data as T };
  } catch (e) {
    return { ok: false, error: mensajeDeError((e as Error)?.message) };
  }
}

/**
 * Envuelve cualquier operación de Supabase que devuelva `{ error }`
 * (update/insert/delete directos, storage, etc.) para no tragar el error.
 *
 *   const res = await runOrError(() =>
 *     supabaseBrowser.from("common_areas").update(campos).eq("id", id)
 *   );
 *   if (!res.ok) { setMsg(res.error); return; }
 */
export async function runOrError<T = unknown>(
  op: () => PromiseLike<{ data?: T; error: { message: string } | null }>
): Promise<RpcResult<T | undefined>> {
  try {
    const { data, error } = await op();
    if (error) return { ok: false, error: mensajeDeError(error.message) };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: mensajeDeError((e as Error)?.message) };
  }
}
