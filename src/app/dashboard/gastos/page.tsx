"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Gasto = {
  id: string;
  concepto: string;
  monto: number;
  categoria: string;
  fecha_pago: string;
  descripcion: string | null;
  archivo_principal_url: string | null;
};

const BUCKET = "vecino-evidencias";

const money = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const fecha = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
};

// Colores fijos por categoría conocida (cae a gris si no está)
const COLOR: Record<string, string> = {
  Vigilancia_Insumos: "bg-slate-600",
  CFE: "bg-amber-500",
  Jardineria: "bg-emerald-500",
  Alberca: "bg-sky-500",
  Fumigacion: "bg-lime-600",
  SAT: "bg-red-500",
  Otros: "bg-purple-500",
};

export default function GastosPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [coloniaId, setColoniaId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [gastos, setGastos] = useState<Gasto[]>([]);

  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [categoria, setCategoria] = useState("");
  const [fechaPago, setFechaPago] = useState(hoyISO());
  const [descripcion, setDescripcion] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cargarGastos = useCallback(async () => {
    const { data } = await supabaseBrowser
      .from("colonia_expenses")
      .select("id, concepto, monto, categoria, fecha_pago, descripcion, archivo_principal_url")
      .order("fecha_pago", { ascending: false })
      .limit(200);
    setGastos((data as unknown as Gasto[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabaseBrowser.auth.getUser();
      if (!user) return router.replace("/login");
      const { data: prof } = await supabaseBrowser
        .from("profiles")
        .select("role, colonia_id, approval_status")
        .eq("id", user.id)
        .maybeSingle();
      const p = prof as unknown as {
        role: string;
        colonia_id: string | null;
        approval_status: string;
      } | null;
      if (!p || p.approval_status !== "aprobado") return router.replace("/esperando");
      if (p.role !== "admin" && p.role !== "comite") return router.replace("/dashboard");
      setColoniaId(p.colonia_id);
      setUserId(user.id);
      await cargarGastos();
      setReady(true);
    })();
  }, [router, cargarGastos]);

  async function subirArchivo(file: File): Promise<string | null> {
    if (!coloniaId) return null;
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${coloniaId}/gastos/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabaseBrowser.storage.from(BUCKET).upload(path, file);
    if (error) return null;
    return supabaseBrowser.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  async function registrar() {
    setMsg(null);
    if (!concepto.trim()) return setMsg("Escribe el concepto.");
    const m = parseFloat(monto);
    if (!m || m <= 0) return setMsg("El monto debe ser mayor a 0.");
    if (!categoria.trim()) return setMsg("Elige o escribe una categoría.");
    if (!coloniaId) return setMsg("Sin colonia.");
    setBusy(true);
    const url = archivo ? await subirArchivo(archivo) : null;
    const { error } = await supabaseBrowser.from("colonia_expenses").insert({
      colonia_id: coloniaId,
      concepto: concepto.trim(),
      monto: m,
      categoria: categoria.trim(),
      fecha_pago: fechaPago,
      descripcion: descripcion.trim() || null,
      archivo_principal_url: url,
      registrado_por: userId,
    });
    setBusy(false);
    if (error) return setMsg(error.message.replace(/^.*?:\s/, ""));
    setConcepto("");
    setMonto("");
    setCategoria("");
    setDescripcion("");
    setArchivo(null);
    setFechaPago(hoyISO());
    await cargarGastos();
  }

  async function eliminar(id: string) {
    await supabaseBrowser.from("colonia_expenses").delete().eq("id", id);
    await cargarGastos();
  }

  function exportarCSV() {
    const cell = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Fecha", "Categoría", "Concepto", "Monto", "Descripción"];
    const lines = gastos.map((g) =>
      [g.fecha_pago, g.categoria, g.concepto, g.monto, g.descripcion].map(cell).join(",")
    );
    const csv = [header.map(cell).join(","), ...lines].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `gastos-${hoyISO()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!ready)
    return (
      <main className="flex-1 flex items-center justify-center text-slate-400">Cargando…</main>
    );

  const total = gastos.reduce((s, g) => s + Number(g.monto), 0);
  const porCat = Object.entries(
    gastos.reduce<Record<string, number>>((acc, g) => {
      acc[g.categoria] = (acc[g.categoria] || 0) + Number(g.monto);
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);
  const maxCat = porCat.length ? porCat[0][1] : 0;
  const sugerencias = Array.from(new Set([...Object.keys(COLOR), ...gastos.map((g) => g.categoria)]));

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

        <h1 className="text-2xl font-bold text-slate-800 mt-4">Gastos de la colonia</h1>

        {/* Total + export */}
        <div className="mt-4 rounded-3xl p-5 bg-gradient-to-br from-slate-700 to-slate-900 text-white shadow-lg">
          <p className="text-white/70 text-sm">Total registrado</p>
          <p className="text-3xl font-extrabold mt-1">{money(total)}</p>
          <div className="flex items-center justify-between mt-1">
            <p className="text-white/70 text-sm">{gastos.length} gastos</p>
            <button
              onClick={exportarCSV}
              disabled={gastos.length === 0}
              className="rounded-xl bg-white/20 hover:bg-white/30 px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
            >
              ⬇ Exportar CSV
            </button>
          </div>
        </div>

        {/* Desglose por categoría */}
        {porCat.length > 0 && (
          <section className="mt-5">
            <h2 className="text-sm font-bold text-slate-700 mb-2">Por categoría</h2>
            <ul className="flex flex-col gap-2.5">
              {porCat.map(([cat, val]) => (
                <li key={cat}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 font-medium">{cat}</span>
                    <span className="text-slate-500">
                      {money(val)} · {Math.round((val / total) * 100)}%
                    </span>
                  </div>
                  <div className="mt-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full ${COLOR[cat] ?? "bg-brand-500"}`}
                      style={{ width: `${maxCat > 0 ? (val / maxCat) * 100 : 0}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Registrar gasto */}
        <section className="mt-6">
          <h2 className="text-sm font-bold text-slate-700 mb-2">Registrar gasto</h2>
          <div className="bg-white rounded-2xl ring-1 ring-slate-100 p-4 flex flex-col gap-3">
            <input
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Concepto (ej. Pago de luz CFE)"
              className="w-full rounded-xl ring-1 ring-slate-200 px-3 py-2 text-slate-800 outline-none focus:ring-2 focus:ring-brand-300"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                type="number"
                placeholder="$ Monto"
                className="rounded-xl ring-1 ring-slate-200 px-3 py-2 text-slate-800 outline-none focus:ring-2 focus:ring-brand-300"
              />
              <input
                value={fechaPago}
                onChange={(e) => setFechaPago(e.target.value)}
                type="date"
                className="rounded-xl ring-1 ring-slate-200 px-3 py-2 text-slate-800 outline-none focus:ring-2 focus:ring-brand-300"
              />
            </div>
            <input
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              list="cats"
              placeholder="Categoría"
              className="w-full rounded-xl ring-1 ring-slate-200 px-3 py-2 text-slate-800 outline-none focus:ring-2 focus:ring-brand-300"
            />
            <datalist id="cats">
              {sugerencias.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Descripción (opcional)"
              className="w-full rounded-xl ring-1 ring-slate-200 px-3 py-2 text-slate-800 outline-none focus:ring-2 focus:ring-brand-300"
            />
            <label className="text-xs text-slate-500">
              Comprobante (opcional)
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                className="mt-1 w-full text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:px-2 file:py-1.5 file:font-semibold"
              />
            </label>
            {msg && (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 ring-1 ring-red-200">
                {msg}
              </p>
            )}
            <button
              onClick={registrar}
              disabled={busy}
              className="rounded-2xl bg-gradient-to-br from-brand-500 to-emerald-600 text-white py-3 font-extrabold shadow-lg disabled:opacity-40 active:scale-[0.99] transition"
            >
              {busy ? "Guardando…" : "Guardar gasto"}
            </button>
          </div>
        </section>

        {/* Lista de gastos */}
        <section className="mt-6 mb-6">
          <h2 className="text-sm font-bold text-slate-700 mb-2">
            Movimientos <span className="text-slate-400 font-medium">({gastos.length})</span>
          </h2>
          {gastos.length === 0 ? (
            <p className="text-slate-400 text-sm bg-white rounded-2xl p-4 ring-1 ring-slate-100">
              Aún no hay gastos registrados.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {gastos.map((g) => (
                <li
                  key={g.id}
                  className="bg-white rounded-2xl p-3.5 ring-1 ring-slate-100 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{g.concepto}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {g.categoria} · {fecha(g.fecha_pago)}
                      {g.descripcion ? ` · ${g.descripcion}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {g.archivo_principal_url && (
                      <a
                        href={g.archivo_principal_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-base"
                        title="Ver comprobante"
                      >
                        📎
                      </a>
                    )}
                    <span className="font-bold text-slate-700">{money(Number(g.monto))}</span>
                    <button
                      onClick={() => eliminar(g.id)}
                      className="text-slate-300 hover:text-red-500 text-lg leading-none"
                      title="Eliminar"
                    >
                      ×
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
