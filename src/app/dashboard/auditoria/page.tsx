"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { callRpc } from "@/lib/rpc";

type Grupo = {
  casa: string;
  concepto: string;
  monto: number;
  fecha: string;
  veces: number;
  ids: string[];
};

const money = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

export default function AuditoriaPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [corrigiendo, setCorrigiendo] = useState<Set<string>>(new Set());

  const cargar = useCallback(async () => {
    const { data } = await supabaseBrowser.rpc("auditoria_abonos_duplicados");
    setGrupos((data as unknown as Grupo[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabaseBrowser.auth.getUser();
      if (!user) return router.replace("/login");
      const { data: prof } = await supabaseBrowser
        .from("profiles")
        .select("role, approval_status")
        .eq("id", user.id)
        .maybeSingle();
      const p = prof as unknown as { role: string; approval_status: string } | null;
      if (!p || p.approval_status !== "aprobado") return router.replace("/esperando");
      if (p.role !== "admin" && p.role !== "comite") return router.replace("/dashboard");
      await cargar();
      setReady(true);
    })();
  }, [router, cargar]);

  // Borra un abono extra (deja el primero del grupo). Ajusta el saldo de la casa.
  async function corregir(g: Grupo) {
    const idExtra = g.ids[g.ids.length - 1]; // el último del grupo
    if (corrigiendo.has(idExtra)) return;
    if (
      !confirm(
        `¿Borrar UN abono duplicado de la Casa ${g.casa} (${money(g.monto)} del ${g.fecha})?\n` +
          `Le sube ${money(g.monto)} a su saldo. Esta acción no se puede deshacer.`
      )
    )
      return;
    setMsg(null);
    setCorrigiendo((s) => new Set(s).add(idExtra));
    const res = await callRpc("corregir_abono_duplicado", { p_id: idExtra });
    setCorrigiendo((s) => {
      const n = new Set(s);
      n.delete(idExtra);
      return n;
    });
    if (!res.ok) {
      setMsg(res.error);
      return;
    }
    await cargar();
  }

  if (!ready)
    return (
      <main className="flex-1 flex items-center justify-center text-slate-400">Cargando…</main>
    );

  const totalSobre = grupos.reduce((s, g) => s + (g.veces - 1) * g.monto, 0);

  return (
    <main className="flex-1 bg-gradient-to-b from-brand-50 via-white to-sky-50">
      <div className="w-full max-w-md mx-auto px-5 py-6 flex flex-col">
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push("/dashboard/comite")}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            ← Volver
          </button>
          <Image src="/brand/vecinity-logo.svg" alt="Vecinity" width={120} height={34} priority />
        </div>

        <h1 className="text-2xl font-bold text-slate-800 mt-4">Auditoría de pagos</h1>
        <p className="text-sm text-slate-500">
          Abonos que parecen contados dos veces (misma casa, monto, día y concepto).
          Revísalos: algunos pueden ser pagos reales de 2 meses. Borra solo los que confirmes.
        </p>

        <div className="mt-4 rounded-2xl bg-amber-50 ring-1 ring-amber-200 p-4">
          <p className="text-sm text-amber-800">
            <span className="font-bold">{grupos.length}</span> grupos sospechosos ·{" "}
            posible sobre-acreditación total{" "}
            <span className="font-bold">{money(totalSobre)}</span>
          </p>
        </div>

        {msg && (
          <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 ring-1 ring-red-200 mt-3">
            {msg}
          </p>
        )}

        <section className="mt-4 mb-6">
          {grupos.length === 0 ? (
            <p className="text-slate-400 text-sm bg-white rounded-2xl p-4 ring-1 ring-slate-100">
              No hay abonos duplicados 🎉
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {grupos.map((g) => (
                <li
                  key={`${g.casa}-${g.fecha}-${g.monto}-${g.concepto}`}
                  className="bg-white rounded-2xl p-3.5 ring-1 ring-slate-100"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800">
                        Casa {g.casa} · {money(g.monto)} ×{g.veces}
                      </p>
                      <p className="text-xs text-slate-500 truncate" title={g.concepto}>
                        {g.fecha} · {g.concepto}
                      </p>
                    </div>
                    <button
                      onClick={() => corregir(g)}
                      disabled={corrigiendo.has(g.ids[g.ids.length - 1])}
                      className="shrink-0 rounded-xl border border-red-200 text-red-600 text-sm font-semibold px-3 py-2 hover:bg-red-50 disabled:opacity-40"
                    >
                      Borrar 1
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
