"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";

export type InvitationInfo = {
  ok: boolean;
  error?: string;
  colonia?: { id: string; nombre: string };
  street?: string | null;
  numero?: string | null;
  houseId?: string | null;
  role?: string;
};

/** Valida un código de invitación y devuelve la colonia/casa pre-llenada. */
export async function validateInvitation(token: string): Promise<InvitationInfo> {
  const code = token.trim().toUpperCase();
  if (!code) return { ok: false, error: "Escribe tu código de invitación." };

  const { data, error } = await supabaseAdmin
    .from("invitations")
    .select(
      "id, role, accepted_at, expires_at, colonia:colonias(id,nombre), house:houses(id,numero,street)"
    )
    .eq("token", code)
    .maybeSingle();

  if (error) return { ok: false, error: "No pudimos validar la invitación." };
  if (!data) return { ok: false, error: "Código no válido. Revísalo con tu comité." };
  if (data.accepted_at) return { ok: false, error: "Esta invitación ya fue usada." };
  if (data.expires_at && new Date(data.expires_at) < new Date())
    return { ok: false, error: "La invitación expiró. Pide una nueva al comité." };

  const colonia = data.colonia as unknown as { id: string; nombre: string } | null;
  const house = data.house as unknown as
    | { id: string; numero: string; street: string | null }
    | null;

  return {
    ok: true,
    colonia: colonia ?? undefined,
    street: house?.street ?? null,
    numero: house?.numero ?? null,
    houseId: house?.id ?? null,
    role: data.role,
  };
}

export type OnboardingResult = {
  ok: boolean;
  error?: string;
  profileId?: string;
};

/** Crea la cuenta, liga el perfil a la colonia/casa de la invitación (status pendiente). */
export async function completeOnboarding(input: {
  token: string;
  nombre: string;
  email: string;
  password: string;
  telefono: string;
}): Promise<OnboardingResult> {
  const nombre = input.nombre.trim();
  const email = input.email.trim().toLowerCase();
  if (!nombre) return { ok: false, error: "Falta tu nombre." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: "Correo no válido." };
  if (input.password.length < 6)
    return { ok: false, error: "La contraseña debe tener al menos 6 caracteres." };

  // 1. Re-validar invitación (fuente de verdad en el server)
  const inv = await validateInvitation(input.token);
  if (!inv.ok) return { ok: false, error: inv.error };

  // 2. Crear usuario de auth (confirmado). El trigger handle_new_user crea el perfil mínimo.
  const { data: created, error: createErr } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
      user_metadata: { app: "vecino", name: nombre, phone: input.telefono },
    });

  if (createErr || !created?.user) {
    const msg = createErr?.message?.toLowerCase() ?? "";
    if (msg.includes("already") || msg.includes("registered"))
      return { ok: false, error: "Ya existe una cuenta con ese correo." };
    return { ok: false, error: "No pudimos crear tu cuenta. Intenta de nuevo." };
  }

  const userId = created.user.id;

  // 3. Ligar/asegurar el perfil con la colonia y casa de la invitación (upsert).
  const { error: upErr } = await supabaseAdmin.from("profiles").upsert(
    {
      id: userId,
      nombre,
      email,
      telefono: input.telefono,
      role: inv.role ?? "residente",
      colonia_id: inv.colonia?.id ?? null,
      house_id: inv.houseId ?? null,
      // El código de invitación CAT-<casa> ya prueba identidad (lo entregó el comité
      // a esa casa) → auto-aprobado, entra directo al dashboard sin pasar por /esperando.
      approval_status: "aprobado",
    },
    { onConflict: "id" }
  );
  if (upErr) return { ok: false, error: "Cuenta creada, pero falló el perfil. Avisa al comité." };

  // 4. Marcar la invitación como usada.
  await supabaseAdmin
    .from("invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("token", input.token.trim().toUpperCase());

  return { ok: true, profileId: userId };
}
