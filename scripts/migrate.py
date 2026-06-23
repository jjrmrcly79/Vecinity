#!/usr/bin/env python3
"""Genera el SQL de migración SQLite (Django) -> Supabase schema vecino.
Escribe payloads JSON {query: sql} para enviar con curl a /pg/query (sin red aquí)."""
import sqlite3, json, uuid, re, unicodedata

DB = "proyecto-condominio/db.sqlite3"
con = sqlite3.connect(DB); con.row_factory = sqlite3.Row; cur = con.cursor()

def q(v):
    if v is None: return "NULL"
    if isinstance(v, (int, float)): return str(v)
    s = str(v).replace("'", "''")
    return "'" + s + "'"

def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s or "colonia"

ESTATUS = {"Al Corriente": "al_corriente", "Con Adeudo": "con_adeudo", "En Convenio": "en_convenio"}
TIPO = {"Propietario": "propietario", "Arrendatario": "arrendatario"}
TX_TIPO = {"CARGO": "cargo", "ABONO": "abono", "AJUSTE": "ajuste"}
APPRO = {"PENDIENTE": "pendiente", "APROBADO": "aprobado", "RECHAZADO": "rechazado"}
PAY = {"Pendiente": "pendiente", "Pagado": "pagado", "Atrasado": "atrasado", "En Verificación": "en_verificacion", "En Verificacion": "en_verificacion"}
VEH = {"Pendiente": "pendiente", "Aprobado": "aprobado", "Rechazado": "rechazado"}
PROP = {"Pendiente": "pendiente", "Activa": "activa", "Aprobada": "aprobada", "Rechazada": "rechazada", "Cancelada": "cancelada"}
VOTE = {"A Favor": "a_favor", "En Contra": "en_contra", "Abstencion": "abstencion", "Abstención": "abstencion"}
INC = {"PENDIENTE": "pendiente", "RECHAZADO": "rechazado", "MULTA": "multa"}

nid = lambda: str(uuid.uuid4())

# ---- mapas id_legacy -> uuid ----
colonia, house, brand, model, finecat, prop = {}, {}, {}, {}, {}, {}
house_col = {}  # casa_id -> colonia_uuid

S1, S2, S3, S4 = [], [], [], []

# limpieza de datos demo previos (colonia de prueba)
S1.append("DELETE FROM vecino.colonias WHERE slug='la-cantera';")

# COLONIAS (villas)
main_col = None
for r in cur.execute("SELECT id,nombre FROM condominio_villa ORDER BY id"):
    cid = nid(); colonia[r["id"]] = cid
    if main_col is None: main_col = cid
    sg = slug(r["nombre"])
    S1.append(f"INSERT INTO vecino.colonias (id,nombre,slug,cuota_mensual,dia_limite_pago,recargo,umbral_saldo_alerta,umbral_suspension_rfid) VALUES ({q(cid)},{q(r['nombre'])},{q(sg+'-'+str(r['id']))},800,10,100,1600,2400);")

# ZONES (una por colonia para agrupar)
zone_of = {}
for vid, cid in colonia.items():
    zid = nid(); zone_of[cid] = zid
    nombre = cur.execute("SELECT nombre FROM condominio_villa WHERE id=?", (vid,)).fetchone()["nombre"]
    S1.append(f"INSERT INTO vecino.zones (id,colonia_id,nombre,codigo,color) VALUES ({q(zid)},{q(cid)},{q(nombre)},'GEN','#10b981');")

# HOUSES (casas)
for r in cur.execute("SELECT * FROM condominio_casa"):
    hid = nid(); house[r["id"]] = hid; cid = colonia[r["villa_id"]]; house_col[r["id"]] = cid
    S1.append("INSERT INTO vecino.houses (id,colonia_id,zone_id,numero,propietario,tel_1,tel_2,tel_3,tipo_residente,esta_rentada,nombre_arrendatario,num_habitantes,saldo,estatus,es_verificado,pin_finanzas) VALUES (" +
        ",".join([q(hid), q(cid), q(zone_of[cid]), q(r["numero_casa"]), q(r["propietario"]),
                  q(r["telefono_1"] or r["telefono"]), q(r["telefono_2"]), q(r["telefono_3"]),
                  q(TIPO.get(r["tipo_residente"], "propietario")),
                  "true" if r["esta_rentada"] else "false", q(r["nombre_arrendatario"]),
                  str(r["num_habitantes"] or 1), str(r["saldo"] or 0),
                  q(ESTATUS.get(r["estatus_condominio"], "al_corriente")),
                  "true" if r["es_propietario_verificado"] else "false", q(r["pin_finanzas"])]) + ");")

# CATALOGO marcas/modelos
for r in cur.execute("SELECT id,nombre FROM condominio_marca"):
    bid = nid(); brand[r["id"]] = bid
    S1.append(f"INSERT INTO vecino.vehicle_brands (id,nombre) VALUES ({q(bid)},{q(r['nombre'])});")
for r in cur.execute("SELECT id,marca_id,nombre FROM condominio_modelo"):
    mid = nid(); model[r["id"]] = mid
    if r["marca_id"] in brand:
        S1.append(f"INSERT INTO vecino.vehicle_models (id,brand_id,nombre) VALUES ({q(mid)},{q(brand[r['marca_id']])},{q(r['nombre'])});")

# fine_categories (a la colonia principal)
for r in cur.execute("SELECT id,nombre,monto_base FROM condominio_categoriaincidencia"):
    fid = nid(); finecat[r["id"]] = fid
    S1.append(f"INSERT INTO vecino.fine_categories (id,colonia_id,nombre,monto_base) VALUES ({q(fid)},{q(main_col)},{q(r['nombre'])},{r['monto_base'] or 200});")

# common_areas
for r in cur.execute("SELECT * FROM condominio_areacomun"):
    aid = nid(); cid = colonia.get(r["villa_id"], main_col)
    S1.append(f"INSERT INTO vecino.common_areas (id,colonia_id,nombre,descripcion,capacidad_personas,cantidad_espacios) VALUES ({q(aid)},{q(cid)},{q(r['nombre'])},{q(r['descripcion'])},{r['capacidad_personas'] or 1},{r['cantidad_espacios'] or 1});")

# folio_counters (max al principal)
mx = cur.execute("SELECT MAX(ultimo_folio) m FROM condominio_contadorfolio").fetchone()["m"] or 1999
S1.append(f"INSERT INTO vecino.folio_counters (colonia_id,ultimo_folio) VALUES ({q(main_col)},{mx}) ON CONFLICT (colonia_id) DO UPDATE SET ultimo_folio=EXCLUDED.ultimo_folio;")

# ---- STAGE 2: vehicles, payments, transactions ----
for r in cur.execute("SELECT * FROM condominio_vehiculo"):
    if r["casa_id"] not in house: continue
    cid = house_col[r["casa_id"]]
    S2.append("INSERT INTO vecino.vehicles (id,colonia_id,house_id,brand_id,model_id,placa,color,tarjeta_rfid,estado) VALUES (" +
        ",".join([q(nid()), q(cid), q(house[r["casa_id"]]), q(brand.get(r["marca_id"])), q(model.get(r["modelo_id"])),
                  q(r["placa"]), q(r["color"]), q(r["tarjeta_rfid"]), q(VEH.get(r["estado"], "pendiente"))]) + ");")

for r in cur.execute("SELECT * FROM condominio_pago"):
    if r["casa_id"] not in house: continue
    cid = house_col[r["casa_id"]]
    S2.append("INSERT INTO vecino.payments (id,colonia_id,house_id,concepto,monto,fecha_vencimiento,estado,folio,es_deuda_anterior) VALUES (" +
        ",".join([q(nid()), q(cid), q(house[r["casa_id"]]), q(r["concepto"]), str(r["monto"] or 0),
                  q(r["fecha_vencimiento"]), q(PAY.get(r["estado"], "pendiente")),
                  str(r["folio"]) if r["folio"] else "NULL", "true" if r["es_deuda_anterior"] else "false"]) + ");")

for r in cur.execute("SELECT * FROM condominio_transaccion"):
    if r["casa_id"] not in house: continue
    cid = house_col[r["casa_id"]]
    S2.append("INSERT INTO vecino.transactions (id,colonia_id,house_id,tipo,monto,concepto,estado,created_at) VALUES (" +
        ",".join([q(nid()), q(cid), q(house[r["casa_id"]]), q(TX_TIPO.get(r["tipo"], "ajuste")),
                  str(r["monto"] or 0), q(r["concepto"]), q(APPRO.get(r["estado_aprobacion"] or "APROBADO", "aprobado")),
                  q(r["fecha"])]) + ");")

# ---- STAGE 3: proposals, votes, expenses, incident_reports ----
for r in cur.execute("SELECT * FROM condominio_propuesta"):
    pid = nid(); prop[r["id"]] = pid; cid = colonia.get(r["villa_id"], main_col)
    autor = house.get(r["autor_id"])
    S3.append("INSERT INTO vecino.proposals (id,colonia_id,autor_house_id,titulo,descripcion,costo_estimado,beneficios,tipo,estado,fecha_creacion,fecha_fin_votacion) VALUES (" +
        ",".join([q(pid), q(cid), q(autor), q(r["titulo"]), q(r["descripcion"]), str(r["costo_estimado"] or 0),
                  q(r["beneficios"]), "'general'", q(PROP.get(r["estado"], "pendiente")), q(r["fecha_creacion"]), q(r["fecha_fin_votacion"])]) + ");")
for r in cur.execute("SELECT * FROM condominio_voto"):
    if r["propuesta_id"] not in prop or r["casa_id"] not in house: continue
    S3.append(f"INSERT INTO vecino.votes (id,proposal_id,house_id,decision) VALUES ({q(nid())},{q(prop[r['propuesta_id']])},{q(house[r['casa_id']])},{q(VOTE.get(r['decision'],'abstencion'))});")
for r in cur.execute("SELECT * FROM condominio_gastovilla"):
    S3.append("INSERT INTO vecino.colonia_expenses (id,colonia_id,concepto,monto,fecha_pago,categoria,descripcion) VALUES (" +
        ",".join([q(nid()), q(main_col), q(r["concepto"]), str(r["monto"] or 0), q(r["fecha_pago"]), q(r["categoria"]), q(r["descripcion"])]) + ");")
for r in cur.execute("SELECT * FROM condominio_reporteincidencia"):
    inf = house.get(r["casa_infractora_id"])
    if not inf: continue
    cid = house_col[r["casa_infractora_id"]]
    S3.append("INSERT INTO vecino.incident_reports (id,colonia_id,reportante_house_id,infractor_house_id,categoria_id,descripcion,evidencia_url,estado,resolucion_admin,monto_multa,created_at) VALUES (" +
        ",".join([q(nid()), q(cid), q(house.get(r["reportante_id"])), q(inf), q(finecat.get(r["categoria_id"])),
                  q(r["descripcion"]), q(r["evidencia_foto"]), q(INC.get(r["estado"], "pendiente")),
                  q(r["resolucion_admin"]), str(r["monto_multa"] or 0), q(r["fecha_creacion"])]) + ");")

# ---- STAGE 4: invitaciones (1 por casa) + re-link demo ----
codes = {}
for casa_id, hid in house.items():
    cas = cur.execute("SELECT numero_casa,villa_id FROM condominio_casa WHERE id=?", (casa_id,)).fetchone()
    cid = colonia[cas["villa_id"]]
    code = ("CAT" if cid == main_col else "SVC") + "-" + re.sub(r"[^0-9A-Za-z]", "", str(cas["numero_casa"]))
    base = code; k = 1
    while code in codes:
        k += 1; code = f"{base}-{k}"
    codes[code] = 1
    S4.append(f"INSERT INTO vecino.invitations (id,colonia_id,house_id,role,token,expires_at) VALUES ({q(nid())},{q(cid)},{q(hid)},'residente',{q(code)},now()+interval '60 days');")

# re-link cuentas demo a la colonia principal + casa 128
casa128 = cur.execute("SELECT id FROM condominio_casa WHERE numero_casa='128' AND villa_id=(SELECT MIN(id) FROM condominio_villa)").fetchone()
h128 = house.get(casa128["id"]) if casa128 else None
S4.append(f"UPDATE vecino.profiles SET colonia_id={q(main_col)}, house_id={q(h128)} WHERE email='comite@cantera.test';")
S4.append(f"UPDATE vecino.profiles SET colonia_id={q(main_col)} WHERE email='juanperez@cantera.test';")

con.close()

for name, stmts in [("mig1", S1), ("mig2", S2), ("mig3", S3), ("mig4", S4)]:
    sql = "\n".join(stmts)
    json.dump({"query": sql}, open(f"/tmp/{name}.json", "w"))
    print(f"{name}: {len(stmts)} statements, {len(sql)} bytes")
print("colonias:", len(colonia), "| casas:", len(house), "| main_col:", main_col, "| h128:", h128)
