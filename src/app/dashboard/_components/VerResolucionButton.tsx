"use client";

import { useState } from "react";
import { callRpc } from "@/lib/rpc";

export type Resolucion = {
  incident_id: string;
  categoria: string;
  estado: string;
  monto: number;
  descripcion: string | null;
  evidencia_url: string | null;
  evidencia_capturada_at: string | null;
  evidencia_lat: number | null;
  evidencia_lng: number | null;
  placa: string | null;
  created_at: string;
  resuelto_at: string | null;
  resolucion_oficial: string | null;
  articulo: string | null;
  articulo_titulo: string | null;
  articulo_texto: string | null;
  articulo_snapshot: string | null;
};

const money = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const fechaHora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-MX", {
        day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "—";

// Botón + modal de la resolución oficial de una multa. Localiza la multa por el
// transaction_id del cargo. Reutilizable en la vista del residente y del comité.
export function VerResolucionButton({
  transactionId,
  className,
}: {
  transactionId: string;
  className?: string;
}) {
  const [cargando, setCargando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Resolucion | null>(null);

  async function abrir() {
    setErr(null);
    setCargando(true);
    const res = await callRpc<Resolucion>("ver_resolucion_multa", { p_transaction_id: transactionId });
    setCargando(false);
    if (!res.ok) return setErr(res.error);
    setDetalle(res.data);
  }

  return (
    <>
      <button
        onClick={abrir}
        disabled={cargando}
        className={
          className ??
          "inline-flex items-center gap-1 rounded-lg bg-slate-700 text-white text-xs font-semibold px-3 py-1.5 hover:bg-slate-800 disabled:opacity-40"
        }
      >
        {cargando ? "Abriendo…" : "📄 Ver resolución"}
      </button>
      {err && <span className="text-xs text-red-600 ml-2">{err}</span>}
      {detalle && <ResolucionModal r={detalle} onClose={() => setDetalle(null)} />}
    </>
  );
}

function ResolucionModal({ r, onClose }: { r: Resolucion; onClose: () => void }) {
  const mapsUrl =
    r.evidencia_lat != null && r.evidencia_lng != null
      ? `https://maps.google.com/?q=${r.evidencia_lat},${r.evidencia_lng}`
      : null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white/95 backdrop-blur px-5 py-3 flex items-center justify-between border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Resolución oficial</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">
            ✕
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-100 p-4">
            <p className="text-lg font-bold text-slate-800">{r.categoria}</p>
            <p className="text-2xl font-extrabold text-amber-600 mt-1">{money(r.monto)}</p>
            <p className="text-xs text-slate-500 mt-1">
              Evidencia registrada: {fechaHora(r.evidencia_capturada_at ?? r.created_at)}
            </p>
            {r.placa && (
              <p className="text-xs text-slate-500">
                Placa detectada: <span className="font-semibold">{r.placa}</span>
              </p>
            )}
          </div>

          {r.evidencia_url && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Evidencia</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={r.evidencia_url}
                alt="Evidencia de la infracción"
                className="w-full rounded-2xl ring-1 ring-slate-200 object-contain max-h-80 bg-slate-100"
              />
              <div className="flex gap-3 mt-1.5">
                <a href={r.evidencia_url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-600 font-semibold underline">
                  Ver foto completa
                </a>
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-600 font-semibold underline">
                    Ubicación en el mapa
                  </a>
                )}
              </div>
            </div>
          )}

          {r.articulo && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                Fundamento — Reglamento interno
              </p>
              <div className="rounded-2xl bg-brand-50 ring-1 ring-brand-100 p-4">
                <p className="font-bold text-slate-800">
                  {r.articulo}
                  {r.articulo_titulo ? ` · ${r.articulo_titulo}` : ""}
                </p>
                {r.articulo_texto && (
                  <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{r.articulo_texto}</p>
                )}
              </div>
            </div>
          )}

          {r.resolucion_oficial ? (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                Resolución del Comité
              </p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-white ring-1 ring-slate-100 rounded-2xl p-4">
                {r.resolucion_oficial}
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              La resolución formal se está preparando. El fundamento y la evidencia ya están disponibles arriba.
            </p>
          )}

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Si consideras que esta multa es un error o deseas solicitar aclaración o condonación, contacta
            al Comité de Administración.
          </p>
        </div>
      </div>
    </div>
  );
}
