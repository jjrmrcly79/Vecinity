"use server";

import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Resultado =
  | { ok: true; accion: "amonestacion" | "propuesta" | "ninguna"; monto?: number; placaOcr?: string }
  | { ok: false; error: string };

type MediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

// OCR de la placa con visión de Claude + auto-proceso de la incidencia.
// La API key vive solo en el servidor; el RPC (SECURITY DEFINER, service role)
// hace la validación de 3 vías y crea amonestación o propuesta de multa.
export async function autoprocesarIncidencia(
  incidentId: string,
  placaReportada: string,
  evidenciaUrl: string
): Promise<Resultado> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "no-key" };

  try {
    // 1. Descargar la foto de evidencia (server-side)
    const img = await fetch(evidenciaUrl);
    if (!img.ok) return { ok: false, error: "No se pudo leer la foto." };
    const b64 = Buffer.from(await img.arrayBuffer()).toString("base64");
    const ct = (img.headers.get("content-type") || "image/jpeg").toLowerCase();
    const media: MediaType = (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(ct)
      ? ct
      : "image/jpeg") as MediaType;

    // 2. Leer la placa con Claude (visión)
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: media, data: b64 } },
            {
              type: "text",
              text:
                'Lee la PLACA del vehículo en esta foto. Responde SOLO con un JSON: ' +
                '{"placa":"ABC123D","confianza":0.0} donde "placa" son los caracteres ' +
                'alfanuméricos sin espacios ni guiones (en MAYÚSCULAS) y "confianza" es de 0 a 1. ' +
                'Si no se ve ninguna placa legible, usa {"placa":"","confianza":0}.',
            },
          ],
        },
      ],
    });

    const txt = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    let placaOcr = "";
    let conf = 0;
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const o = JSON.parse(m[0]) as { placa?: string; confianza?: number };
        placaOcr = String(o.placa ?? "").toUpperCase();
        conf = Number(o.confianza) || 0;
      } catch {
        // respuesta no-JSON → se deja sin lectura (queda pendiente manual)
      }
    }

    // 3. Auto-procesar (3 vías + amonestación/propuesta) en la BD
    const { data, error } = await supabaseAdmin.rpc("procesar_incidencia_auto", {
      p_id: incidentId,
      p_placa_reportada: placaReportada,
      p_plate_ocr: placaOcr,
      p_confidence: conf,
    });
    if (error) return { ok: false, error: error.message };

    const d = (data ?? {}) as { accion?: string; monto?: number };
    const accion = (d.accion === "amonestacion" || d.accion === "propuesta"
      ? d.accion
      : "ninguna") as "amonestacion" | "propuesta" | "ninguna";
    return { ok: true, accion, monto: d.monto, placaOcr };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error en el OCR." };
  }
}
