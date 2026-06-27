import Anthropic from "@anthropic-ai/sdk";

// Helper server-only: lee una placa de una imagen con visión de Claude.
// Devuelve null si no hay API key o no se pudo leer la imagen.
type MediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export async function leerPlacaDeImagen(
  url: string
): Promise<{ plate: string; conf: number } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const img = await fetch(url);
  if (!img.ok) return null;
  const b64 = Buffer.from(await img.arrayBuffer()).toString("base64");
  const ct = (img.headers.get("content-type") || "image/jpeg").toLowerCase();
  const media: MediaType = (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(ct)
    ? ct
    : "image/jpeg") as MediaType;

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
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) return { plate: "", conf: 0 };
  try {
    const o = JSON.parse(m[0]) as { placa?: string; confianza?: number };
    return { plate: String(o.placa ?? "").toUpperCase(), conf: Number(o.confianza) || 0 };
  } catch {
    return { plate: "", conf: 0 };
  }
}
