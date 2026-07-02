import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Datos fijos de la asociación (impresos en el recibo físico de Villa Catania).
// Si en el futuro hay más colonias, mover a columnas de `colonias`.
const ASOCIACION = "ASOCIACIÓN DE COLONOS DE VILLA CATANIA A.C.";
const TEL = "TEL: 461 688 33 38";
const BANCOMER = "0110552925";
const CLABE = "012215001105529255";

export type ReciboData = {
  folio: number;
  fechaISO: string; // fecha del abono (created_at)
  propietario: string | null;
  numeroCasa: string;
  concepto: string;
  monto: number;
};

// ---- Número a letras (español, MXN) --------------------------------------
const UNIDADES = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
const ESPECIALES: Record<number, string> = {
  10: "DIEZ", 11: "ONCE", 12: "DOCE", 13: "TRECE", 14: "CATORCE", 15: "QUINCE",
  16: "DIECISÉIS", 17: "DIECISIETE", 18: "DIECIOCHO", 19: "DIECINUEVE",
  20: "VEINTE", 21: "VEINTIUNO", 22: "VEINTIDÓS", 23: "VEINTITRÉS", 24: "VEINTICUATRO",
  25: "VEINTICINCO", 26: "VEINTISÉIS", 27: "VEINTISIETE", 28: "VEINTIOCHO", 29: "VEINTINUEVE",
};
const DECENAS = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS",
  "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

function menorAMil(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  let out = "";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  if (c > 0) out += CENTENAS[c] + " ";
  if (resto > 0) {
    if (resto < 10) out += UNIDADES[resto];
    else if (ESPECIALES[resto]) out += ESPECIALES[resto];
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      out += DECENAS[d] + (u > 0 ? " Y " + UNIDADES[u] : "");
    }
  }
  return out.trim();
}

function enteroALetras(n: number): string {
  if (n === 0) return "CERO";
  if (n < 1000) return menorAMil(n);
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  let out = "";
  if (millones > 0) out += (millones === 1 ? "UN MILLÓN" : menorAMil(millones) + " MILLONES") + " ";
  if (miles > 0) out += (miles === 1 ? "MIL" : menorAMil(miles) + " MIL") + " ";
  if (resto > 0) out += menorAMil(resto);
  return out.trim();
}

export function montoALetras(monto: number): string {
  const entero = Math.floor(monto);
  const centavos = Math.round((monto - entero) * 100);
  return `${enteroALetras(entero)} PESOS ${String(centavos).padStart(2, "0")}/100 M.N.`;
}

const money = (n: number) => `$ ${Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

// ---- PDF ------------------------------------------------------------------
export async function construirReciboPDF(d: ReciboData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]); // Carta
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const AZUL = rgb(0, 0.2, 0.4);
  const ROJO = rgb(0.85, 0.33, 0.31);
  const BLANCO = rgb(1, 1, 1);

  const W = 612;
  const M = 40;
  const right = W - M;

  const text = (
    s: string,
    x: number,
    y: number,
    opts: { size?: number; f?: typeof font; color?: ReturnType<typeof rgb>; center?: number } = {}
  ) => {
    const size = opts.size ?? 11;
    const f = opts.f ?? font;
    let px = x;
    if (opts.center !== undefined) px = opts.center - f.widthOfTextAtSize(s, size) / 2;
    page.drawText(s, { x: px, y, size, font: f, color: opts.color ?? AZUL });
  };

  // Marco azul
  page.drawRectangle({ x: M - 10, y: 470, width: W - 2 * (M - 10), height: 280, borderColor: AZUL, borderWidth: 2.5 });

  // Header izquierda
  text(ASOCIACION, 0, 725, { size: 12, f: bold, center: (M + 330) / 2 + 40 });
  text(TEL, 0, 710, { size: 10, f: bold, center: (M + 330) / 2 + 40 });
  text("~ Villa Catania ~", 0, 682, { size: 22, f: italic, center: (M + 330) / 2 + 40 });

  // Caja RECIBO (derecha)
  const boxX = 400, boxW = 152;
  page.drawRectangle({ x: boxX, y: 700, width: boxW, height: 22, color: AZUL });
  text("R E C I B O", boxX, 706, { size: 12, f: bold, color: BLANCO, center: boxX + boxW / 2 });
  page.drawRectangle({ x: boxX, y: 668, width: boxW, height: 32, borderColor: AZUL, borderWidth: 2 });
  text(`Nº ${d.folio}`, boxX, 678, { size: 18, f: bold, color: ROJO, center: boxX + boxW / 2 });

  // Fecha DIA/MES/AÑO
  const f = new Date(d.fechaISO);
  const dia = String(f.getDate()).padStart(2, "0");
  const mes = String(f.getMonth() + 1).padStart(2, "0");
  const anio = String(f.getFullYear()).slice(-2);
  const cellW = boxW / 3;
  for (let i = 0; i < 3; i++) {
    page.drawRectangle({ x: boxX + i * cellW, y: 640, width: cellW, height: 16, color: AZUL });
    page.drawRectangle({ x: boxX + i * cellW, y: 622, width: cellW, height: 18, borderColor: AZUL, borderWidth: 1 });
  }
  ["DIA", "MES", "AÑO"].forEach((h, i) =>
    text(h, boxX + i * cellW, 644, { size: 8, f: bold, color: BLANCO, center: boxX + i * cellW + cellW / 2 })
  );
  [dia, mes, anio].forEach((v, i) =>
    text(v, boxX + i * cellW, 627, { size: 12, f: bold, center: boxX + i * cellW + cellW / 2 })
  );

  // Campos
  const linea = (label: string, valor: string, y: number, labelW = 80) => {
    text(label, M, y, { size: 11, f: bold });
    page.drawLine({ start: { x: M + labelW, y: y - 2 }, end: { x: right, y: y - 2 }, thickness: 0.7, color: AZUL });
    text(valor, M + labelW + 4, y, { size: 11 });
  };
  const nombre = d.propietario && d.propietario !== "nan" ? d.propietario : `Casa ${d.numeroCasa}`;
  linea("Nombre:", nombre, 590);
  linea("Bancomer:", BANCOMER, 562);
  linea("Clabe:", CLABE, 534);
  linea("Domicilio:", `Villa Catania      Número: ${d.numeroCasa}`, 506);
  linea("Concepto:", d.concepto, 478);

  // Cantidad + letra
  const cbX = 380, cbW = 172;
  page.drawRectangle({ x: cbX, y: 430, width: cbW, height: 20, color: AZUL });
  text("C A N T I D A D", cbX, 435, { size: 11, f: bold, color: BLANCO, center: cbX + cbW / 2 });
  page.drawRectangle({ x: cbX, y: 402, width: cbW, height: 28, borderColor: AZUL, borderWidth: 2 });
  text(money(d.monto), cbX, 410, { size: 15, f: bold, center: cbX + cbW / 2 });

  text("FIRMA: Administrador", M, 415, { size: 11, f: bold });
  page.drawLine({ start: { x: M, y: 430 }, end: { x: M + 150, y: 430 }, thickness: 0.7, color: AZUL });

  text("Cantidad con letra:", M, 380, { size: 10, f: bold });
  text(montoALetras(d.monto), M + 110, 380, { size: 10 });

  text(
    "Este recibo se genera automáticamente al validar el pago en la app oficial de Villa Catania.",
    0, 452, { size: 7.5, color: rgb(0.5, 0.5, 0.5), center: W / 2 }
  );

  return pdf.save();
}
