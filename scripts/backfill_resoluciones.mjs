// Backfill de resoluciones oficiales para multas ya aplicadas (estado='multa')
// sin resolucion_oficial. Genera con Claude citando el artículo literal y guarda
// vía set_resolucion_oficial. Uso: node scripts/backfill_resoluciones.mjs [--dry]
import fs from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const DRY = process.argv.includes("--dry");
const COLONIA = "ce43b59c-529b-4960-8dd7-d975e43ac2fb"; // Villa Catania
const CONCURRENCIA = 4;

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => {
      const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "vecino" }, auth: { persistSession: false },
});
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const money = (n) => `$${Number(n).toLocaleString("es-MX")}`;
const cuando = (iso) =>
  new Date(iso).toLocaleString("es-MX", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

function prompt(inc, art) {
  return `Eres el asistente del Comité de Administración de la colonia "${inc.colonia?.nombre ?? "el condominio"}". Redacta una **RESOLUCIÓN OFICIAL** de una multa, dirigida al condómino infractor, en español, con tono institucional, formal y respetuoso, en formato Markdown breve (máx. ~200 palabras).

Datos de la infracción:
- Casa infractora: ${inc.infractor?.numero ?? "—"}
- Motivo (categoría): ${inc.categoria?.nombre ?? "Incidencia"}
- Fecha y hora de la evidencia: ${cuando(inc.evidencia_capturada_at ?? inc.created_at)}
- Monto de la multa: ${money(inc.monto_multa)}
${inc.descripcion ? `- Detalle del reporte: "${inc.descripcion}"` : ""}

Artículo del reglamento que fundamenta la sanción (cítalo TEXTUALMENTE, no lo reformules ni inventes números de artículo):
${art ? `${art.articulo} — ${art.titulo}:\n"${art.texto}"` : "No hay un artículo específico ligado; cita el reglamento interno de manera general."}

La resolución debe: 1) Encabezarse como "Resolución Oficial de Multa". 2) Describir la conducta y la fecha/hora de la evidencia. 3) Citar el artículo TAL COMO se te entregó. 4) Indicar el monto y que se cargó al estado de cuenta. 5) Mencionar que puede solicitar aclaración o condonación ante el Comité.
Reglas: NO inventes artículos/montos/datos; NO menciones ni insinúes quién reportó (es anónimo); no incluyas nombres de personas (solo número de casa).`;
}

async function main() {
  const { data: incs, error } = await sb
    .from("incident_reports")
    .select(
      "id, monto_multa, descripcion, evidencia_capturada_at, created_at, " +
        "categoria:fine_categories(nombre, articulo_id), " +
        "infractor:houses!infractor_house_id(numero), colonia:colonias(nombre)"
    )
    .eq("colonia_id", COLONIA)
    .eq("estado", "multa")
    .is("resolucion_oficial", null);
  if (error) throw error;
  console.log(`${incs.length} multas sin resolución${DRY ? " (dry-run)" : ""}`);
  if (DRY) return;

  // Cache de artículos por id
  const artCache = new Map();
  async function getArt(id) {
    if (!id) return null;
    if (artCache.has(id)) return artCache.get(id);
    const { data } = await sb.from("reglamento").select("articulo, titulo, texto").eq("id", id).maybeSingle();
    artCache.set(id, data ?? null);
    return data ?? null;
  }

  let ok = 0, fail = 0;
  const cola = [...incs];
  async function worker(w) {
    while (cola.length) {
      const inc = cola.shift();
      try {
        const art = await getArt(inc.categoria?.articulo_id);
        const resp = await anthropic.messages.create({
          model: "claude-opus-4-8", max_tokens: 1200,
          messages: [{ role: "user", content: prompt(inc, art) }],
        });
        const texto = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
        if (!texto) throw new Error("IA sin contenido");
        const { error: e2 } = await sb.rpc("set_resolucion_oficial", {
          p_incident_id: inc.id, p_texto: texto, p_articulo: art ? art.articulo : null,
        });
        if (e2) throw e2;
        ok++;
        console.log(`  ✓ [${ok + fail}/${incs.length}] Casa ${inc.infractor?.numero} · ${inc.categoria?.nombre}`);
      } catch (e) {
        fail++;
        console.log(`  ✗ ${inc.id}: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCIA }, (_, i) => worker(i)));
  console.log(`\nListo: ${ok} generadas, ${fail} fallidas.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
