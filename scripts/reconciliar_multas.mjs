// Reconciliación: liga cada multa (incident_reports estado='multa', transaction_id NULL)
// con su cargo real en transactions. Emparejamiento 1:1 (casa + monto + categoría +
// ventana de fecha, cargo más cercano no reclamado). Las multas sin cargo se crean
// (cargo + ajuste de saldo). Genera SQL transaccional. Uso:
//   node scripts/reconciliar_multas.mjs         → plan + escribe scratchpad/reconciliar.sql
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const COLONIA = "ce43b59c-529b-4960-8dd7-d975e43ac2fb"; // Villa Catania
const SCRATCH = "/private/tmp/claude-501/-Users-juangarces-dev/286df987-d089-4cf7-90a9-bfe909aed585/scratchpad";
const OUT_LINKS = `${SCRATCH}/reconciliar_links.sql`;
const OUT_ALTAS = `${SCRATCH}/reconciliar_altas.sql`;

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => {
      const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "vecino" }, auth: { persistSession: false },
});

const q = (s) => (s == null ? "NULL" : "'" + String(s).replace(/'/g, "''") + "'");
const dias = (a, b) => Math.abs(new Date(a) - new Date(b)) / 86400000;

// 1) Multas sin ligar (con su categoría)
const { data: multas } = await sb
  .from("incident_reports")
  .select("id, infractor_house_id, monto_multa, created_at, resolved_at, categoria:fine_categories(nombre)")
  .eq("colonia_id", COLONIA).eq("estado", "multa").is("transaction_id", null)
  .order("created_at", { ascending: true });

// 2) Cargos de multa candidatos + los ya ligados (para no reclamar dos veces)
const { data: cargos } = await sb
  .from("transactions")
  .select("id, house_id, monto, concepto, created_at")
  .eq("colonia_id", COLONIA).eq("tipo", "cargo").eq("estado", "aprobado")
  .ilike("concepto", "Multa%");

const { data: yaLigados } = await sb
  .from("incident_reports")
  .select("transaction_id").eq("colonia_id", COLONIA).not("transaction_id", "is", null);
const reclamados = new Set((yaLigados ?? []).map((r) => r.transaction_id));

const linked = [], sinCargo = [];
for (const m of multas) {
  const cat = m.categoria?.nombre ?? "";
  const cand = cargos
    .filter((c) => c.house_id === m.infractor_house_id
      && Number(c.monto) === Number(m.monto_multa)
      && (cat ? c.concepto.includes(cat) : true)
      && !reclamados.has(c.id)
      && new Date(c.created_at) >= new Date(new Date(m.created_at).getTime() - 2 * 86400000)
      && new Date(c.created_at) <= new Date(new Date(m.created_at).getTime() + 30 * 86400000))
    .sort((a, b) => dias(a.created_at, m.created_at) - dias(b.created_at, m.created_at));
  if (cand.length) {
    reclamados.add(cand[0].id);
    linked.push({ m, cargo: cand[0], cat });
  } else {
    sinCargo.push({ m, cat });
  }
}

// ---- Reporte ----
console.log(`Multas sin ligar: ${multas.length}`);
console.log(`  · Ligadas a cargo existente: ${linked.length}`);
console.log(`  · Sin cargo (se crea + ajusta saldo): ${sinCargo.length}`);
if (sinCargo.length) {
  console.log("\n  Multas SIN cargo (se crearán):");
  for (const { m, cat } of sinCargo) {
    const casa = "?"; // se resuelve abajo con houses
    console.log(`   - ${m.id} · ${cat} · $${m.monto_multa} · ${m.created_at.slice(0, 10)} · casa_id ${m.infractor_house_id}`);
  }
}

// nombres de casa para el reporte de saldo
const houseIds = [...new Set(sinCargo.map((s) => s.m.infractor_house_id))];
let casas = {};
if (houseIds.length) {
  const { data: hs } = await sb.from("houses").select("id, numero, saldo").in("id", houseIds);
  casas = Object.fromEntries((hs ?? []).map((h) => [h.id, h]));
  console.log("\n  Ajustes de saldo:");
  const porCasa = {};
  for (const { m } of sinCargo) porCasa[m.infractor_house_id] = (porCasa[m.infractor_house_id] ?? 0) + Number(m.monto_multa);
  for (const [hid, delta] of Object.entries(porCasa)) {
    const h = casas[hid];
    console.log(`   - Casa ${h?.numero}: saldo ${h?.saldo} → ${Number(h?.saldo) + delta} (+$${delta})`);
  }
}

// ---- SQL 1: solo ligas (no cambia saldo) ----
const links = ["BEGIN;", "-- Ligar multas a su cargo existente (no cambia saldo)"];
for (const { m, cargo } of linked) {
  links.push(`UPDATE vecino.incident_reports SET transaction_id=${q(cargo.id)}, resolved_at=COALESCE(resolved_at, ${q(cargo.created_at)}) WHERE id=${q(m.id)} AND transaction_id IS NULL;`);
}
links.push("COMMIT;");
fs.writeFileSync(OUT_LINKS, links.join("\n"));

// ---- SQL 2: altas de cargo + ajuste de saldo (requiere confirmación) ----
const altas = ["BEGIN;", "-- Multas sin cargo: crear cargo + ligar + ajustar saldo"];
for (const { m, cat } of sinCargo) {
  const concepto = `Multa: ${cat || "Incidencia"}`;
  altas.push(
    `WITH nc AS (\n` +
    `  INSERT INTO vecino.transactions (colonia_id, house_id, tipo, monto, concepto, estado, created_at)\n` +
    `  VALUES (${q(COLONIA)}, ${q(m.infractor_house_id)}, 'cargo', ${Number(m.monto_multa)}, ${q(concepto)}, 'aprobado', ${q(m.created_at)})\n` +
    `  RETURNING id\n` +
    `)\n` +
    `UPDATE vecino.incident_reports SET transaction_id=(SELECT id FROM nc), resolved_at=COALESCE(resolved_at, ${q(m.created_at)}) WHERE id=${q(m.id)};`
  );
  altas.push(`UPDATE vecino.houses SET saldo = saldo + ${Number(m.monto_multa)} WHERE id=${q(m.infractor_house_id)};`);
}
for (const hid of houseIds) {
  altas.push(`UPDATE vecino.houses SET estatus = CASE WHEN estatus='en_convenio' THEN 'en_convenio'::vecino.estatus_casa WHEN saldo>0 THEN 'con_adeudo'::vecino.estatus_casa ELSE 'al_corriente'::vecino.estatus_casa END WHERE id=${q(hid)};`);
}
altas.push("COMMIT;");
fs.writeFileSync(OUT_ALTAS, altas.join("\n"));
console.log(`\nSQL: ${OUT_LINKS} (${linked.length} links) · ${OUT_ALTAS} (${sinCargo.length} altas)`);
