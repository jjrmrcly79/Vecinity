"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAprobado } from "@/lib/supabase/server-auth";
import { construirReciboPDF } from "@/lib/recibo-pdf";

type Resultado = { ok: true; url: string; folio: number } | { ok: false; error: string };

const BUCKET = "vecino-recibos";

// Genera (o devuelve) el recibo foliado en PDF de un abono aprobado.
// Idempotente: si ya tiene recibo, devuelve la URL existente. Lo puede pedir
// el residente dueño del abono o el comité. La key/So service role vive en el
// servidor. Folio consecutivo atómico vía siguiente_folio.
export async function generarReciboAbono(
  token: string,
  transactionId: string
): Promise<Resultado> {
  let user;
  try {
    user = await requireAprobado(token);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No autorizado." };
  }

  // Transacción + casa (service role).
  const { data: tx, error: e1 } = await supabaseAdmin
    .from("transactions")
    .select(
      "id, tipo, estado, monto, concepto, folio, recibo_pdf_url, created_at, colonia_id, house_id, " +
        "house:houses(numero, propietario)"
    )
    .eq("id", transactionId)
    .maybeSingle();
  if (e1 || !tx) return { ok: false, error: e1?.message ?? "No se encontró el movimiento." };

  const row = tx as unknown as {
    tipo: string;
    estado: string;
    monto: number;
    concepto: string;
    folio: number | null;
    recibo_pdf_url: string | null;
    created_at: string;
    colonia_id: string;
    house_id: string;
    house: { numero: string; propietario: string | null } | null;
  };

  // Autorización: el dueño de la casa o el comité.
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("role, house_id")
    .eq("id", user.id)
    .maybeSingle();
  const p = prof as unknown as { role: string; house_id: string | null } | null;
  const esAdmin = p?.role === "admin" || p?.role === "comite";
  if (!esAdmin && p?.house_id !== row.house_id) {
    return { ok: false, error: "No tienes acceso a este recibo." };
  }

  if (row.tipo !== "abono" || row.estado !== "aprobado") {
    return { ok: false, error: "Solo los pagos aprobados generan recibo." };
  }

  // Idempotente: ya existe.
  if (row.recibo_pdf_url) {
    return { ok: true, url: row.recibo_pdf_url, folio: row.folio ?? 0 };
  }

  // Folio consecutivo (usa el existente si por alguna razón ya lo tiene).
  let folio = row.folio ?? 0;
  if (!folio) {
    const { data: f, error: ef } = await supabaseAdmin.rpc("siguiente_folio", {
      p_colonia: row.colonia_id,
    });
    if (ef || typeof f !== "number") return { ok: false, error: ef?.message ?? "No se pudo asignar folio." };
    folio = f;
  }

  // PDF
  let bytes: Uint8Array;
  try {
    bytes = await construirReciboPDF({
      folio,
      fechaISO: row.created_at,
      propietario: row.house?.propietario ?? null,
      numeroCasa: row.house?.numero ?? "—",
      concepto: row.concepto,
      monto: Number(row.monto),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error armando el PDF." };
  }

  // Subir a Storage
  const path = `${row.colonia_id}/${row.house_id}/recibo_${folio}.pdf`;
  const { error: eUp } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (eUp) return { ok: false, error: `Error subiendo el recibo: ${eUp.message}` };

  const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  const url = pub.publicUrl;

  const { error: eSet } = await supabaseAdmin.rpc("set_recibo_transaccion", {
    p_id: transactionId,
    p_folio: folio,
    p_url: url,
  });
  if (eSet) return { ok: false, error: eSet.message };

  return { ok: true, url, folio };
}
