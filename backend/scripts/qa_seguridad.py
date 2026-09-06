"""
Suite de regresión de seguridad — cubre los hallazgos de docs/auditoria-2026-09-06.md.

NUNCA correr contra la base de producción: crea usuarios, órdenes y pagos, y
dispara carreras de concurrencia a propósito. Usar una base descartable.

    # 1. base limpia
    docker exec car_postgres_db psql -U admin_car -d postgres -c "CREATE DATABASE car_test;"
    QA_DB='postgresql://admin_car:password123@localhost:5432/car_test' \
        python -c "import models,os;from sqlalchemy import create_engine;\
                   models.Base.metadata.create_all(create_engine(os.environ['QA_DB']))"
    # (+ seed de roles / config / productos: ver scripts/seed_qa.py o el README)

    # 2. levantar la API contra esa base
    DATABASE_URL=$QA_DB MP_WEBHOOK_SECRET=testsecret123 uvicorn main:app --port 8010

    # 3. correr la suite
    QA_DB=$QA_DB QA_BASE=http://localhost:8010 python -m scripts.qa_seguridad
    #    --keep  → no borra los fixtures TEST_* al terminar

Requiere en la base: roles, configuracion_global, y productos con estos nombres
exactos: 'Cuota Social Base', 'Remera Test' (stock 10), 'Buzo Test' (stock 3),
'Cancha 1 Test'.
"""
import os, sys, asyncio
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal

os.environ["DATABASE_URL"] = os.environ.get(
    "QA_DB", "postgresql://admin_car:password123@localhost:5432/car_test")
os.environ.setdefault("SECRET_KEY", "testkey_0123456789abcdef0123456789")

import httpx
from sqlalchemy import text
from database import SessionLocal
import models
from security import get_password_hash

BASE = os.environ.get("QA_BASE", "http://localhost:8010")
PW = "Test12345!"
PASS = FAIL = 0
def ok(name, cond, extra=""):
    global PASS, FAIL
    if cond: PASS += 1; print(f"  \033[32mPASS\033[0m {name} {extra}")
    else:    FAIL += 1; print(f"  \033[31mFAIL\033[0m {name} {extra}")

# ─────────────────────────── fixtures ───────────────────────────
def limpiar():
    db = SessionLocal()
    try:
        ids = [u.id_usuario for u in db.query(models.Usuario).filter(models.Usuario.dni.like("90%")).all()]
        if ids:
            db.execute(text("DELETE FROM reintegros_qr WHERE id_usuario = ANY(:i) OR escaneado_por = ANY(:i)"), {"i": ids})
            db.execute(text("DELETE FROM detalles_orden WHERE id_orden IN (SELECT id_orden FROM ordenes WHERE id_usuario = ANY(:i))"), {"i": ids})
            db.execute(text("UPDATE reservas_instalaciones SET id_orden = NULL WHERE id_usuario = ANY(:i)"), {"i": ids})
            db.execute(text("DELETE FROM ordenes WHERE id_usuario = ANY(:i)"), {"i": ids})
            db.execute(text("DELETE FROM pagos WHERE id_usuario = ANY(:i)"), {"i": ids})
            db.execute(text("DELETE FROM reservas_instalaciones WHERE id_usuario = ANY(:i)"), {"i": ids})
            db.execute(text("DELETE FROM notificaciones WHERE id_usuario = ANY(:i)"), {"i": ids})
            db.execute(text("DELETE FROM audit_log WHERE usuario_actor = ANY(:i)"), {"i": ids})
            db.execute(text("DELETE FROM usuarios_roles WHERE id_usuario = ANY(:i)"), {"i": ids})
            db.execute(text("DELETE FROM usuarios WHERE id_usuario = ANY(:i)"), {"i": ids})
        # restaurar stock de productos test
        db.execute(text("UPDATE productos_servicios SET stock = 10 WHERE nombre = 'Remera Test'"))
        db.execute(text("UPDATE productos_servicios SET stock = 3  WHERE nombre = 'Buzo Test'"))
        db.commit()
    finally:
        db.close()

def mkuser(dni, nombre, rol, *, req_cambio=False, mes_cubierto=None, saldo=Decimal("0")):
    db = SessionLocal()
    try:
        u = models.Usuario(dni=dni, nombre=nombre, apellido="Test",
                           email=f"qa{dni}@qacar.com",
                           password_hash=get_password_hash(PW),
                           requiere_cambio_password=req_cambio,
                           mes_cubierto_hasta=mes_cubierto,
                           saldo_a_favor=saldo,
                           fecha_nacimiento=date(1990, 1, 1))
        db.add(u); db.flush()
        r = db.query(models.Rol).filter_by(nombre=rol).first()
        db.add(models.UsuarioRol(id_usuario=u.id_usuario, id_rol=r.id_rol))
        db.commit()
        return db.query(models.Usuario).filter_by(dni=dni).first().id_usuario
    finally:
        db.close()

def dbget(dni):
    db = SessionLocal()
    try: return db.query(models.Usuario).filter_by(dni=dni).first()
    finally: db.close()

def prod(nombre):
    db = SessionLocal()
    try:
        p = db.query(models.ProductoServicio).filter_by(nombre=nombre).first()
        return (p.id_producto, p.stock, p.precio_actual)
    finally: db.close()

async def login(cl, dni):
    r = await cl.post(f"{BASE}/auth/login", json={"dni": dni, "password": PW})
    if r.status_code != 200: return None, r
    return r.json()["access_token"], r

def H(t): return {"Authorization": f"Bearer {t}"}

# ─────────────────────────── escenarios ───────────────────────────
async def run():
    limpiar()
    U = {
        "admin":    mkuser("90000001", "Admin",    "admin_general"),
        "staff":    mkuser("90000002", "Staff",    "personal_administrativo"),
        "portero":  mkuser("90000003", "Portero",  "admin_temporal"),
        "invitado": mkuser("90000004", "Invitado", "invitado"),
        "socio":    mkuser("90000005", "Socio",    "socio", mes_cubierto=date.today() + timedelta(days=60)),
        "socio2":   mkuser("90000006", "Socio2",   "socio", mes_cubierto=date.today() + timedelta(days=60)),
        "moroso":   mkuser("90000007", "Moroso",   "socio", mes_cubierto=date(2025, 1, 10)),
        "provis":   mkuser("90000008", "Provisorio","socio", req_cambio=True),
    }
    async with httpx.AsyncClient(timeout=20) as cl:
        t_admin, _   = await login(cl, "90000001")
        t_staff, _   = await login(cl, "90000002")
        t_portero, _ = await login(cl, "90000003")
        t_inv, _     = await login(cl, "90000004")
        t_socio, _   = await login(cl, "90000005")

        print("\n── A1 · auto-registro no puede ser becado ──")
        body = {"dni": "90009999", "nombre": "Hacker", "apellido": "X",
                "email": "hacker90009999@gmail.com", "password": "noesnumerico1",
                "fecha_nacimiento": "1990-05-05", "es_becado": True,
                "becado_hasta": "2099-01-01", "id_titular": U["admin"]}
        r = await cl.post(f"{BASE}/usuarios/", json=body, headers={"X-Forwarded-For": "203.0.113.10"})
        creado = dbget("90009999")
        ok("POST /usuarios/ 201", r.status_code == 201, f"({r.status_code})")
        ok("es_becado ignorado", creado is not None and creado.es_becado is False,
           f"(es_becado={getattr(creado,'es_becado',None)})")
        ok("id_titular ignorado", creado is not None and creado.id_titular is None,
           f"(id_titular={getattr(creado,'id_titular',None)})")

        print("\n── A5 · exposición de padrón / QR ──")
        r1 = await cl.get(f"{BASE}/usuarios/", headers=H(t_inv))
        r2 = await cl.get(f"{BASE}/usuarios/", headers=H(t_socio))
        r3 = await cl.get(f"{BASE}/usuarios/", headers=H(t_admin))
        ok("GET /usuarios/ invitado → 403", r1.status_code == 403, f"({r1.status_code})")
        ok("GET /usuarios/ socio → 403", r2.status_code == 403, f"({r2.status_code})")
        ok("GET /usuarios/ admin → 200", r3.status_code == 200, f"({r3.status_code})")
        rd1 = await cl.post(f"{BASE}/qr/validar-dni", json={"dni": "90000005"}, headers=H(t_inv))
        rd2 = await cl.post(f"{BASE}/qr/validar-dni", json={"dni": "90000005"}, headers=H(t_portero))
        ok("POST /qr/validar-dni invitado → 403", rd1.status_code == 403, f"({rd1.status_code})")
        ok("POST /qr/validar-dni admin_temporal → 200", rd2.status_code == 200, f"({rd2.status_code})")
        qr = str(dbget("90000005").qr_token)
        rt = await cl.post(f"{BASE}/qr/validar-token", json={"token": qr}, headers=H(t_inv))
        j = rt.json() if rt.status_code == 200 else {}
        ok("validar-token invitado recortado (sin foto/roles/meses)",
           rt.status_code == 200 and j.get("foto_perfil_url") is None
           and j.get("roles_activos") == [] and j.get("meses_adeudados") == 0,
           f"({rt.status_code} {j})")

        print("\n── M6 · primer ingreso bloquea la API ──")
        t_pro, _ = await login(cl, "90000008")
        rp1 = await cl.get(f"{BASE}/socio/cuotas/estado", headers=H(t_pro))
        det = rp1.json().get("detail", {})
        ok("ruta normal con clave provisoria → 403 tipo=requiere_cambio_password",
           rp1.status_code == 403 and isinstance(det, dict) and det.get("tipo") == "requiere_cambio_password",
           f"({rp1.status_code} {det})")
        rp2 = await cl.post(f"{BASE}/usuarios/me/password", headers=H(t_pro),
                            json={"password_actual": PW, "password_nuevo": "Nueva12345!",
                                  "password_nuevo_confirmacion": "Nueva12345!"})
        ok("POST /usuarios/me/password con clave provisoria → 200", rp2.status_code == 200, f"({rp2.status_code})")
        r = await cl.post(f"{BASE}/auth/login", json={"dni": "90000008", "password": "Nueva12345!"})
        t_pro_new = r.json().get("access_token")
        rp3 = await cl.get(f"{BASE}/socio/cuotas/estado", headers=H(t_pro_new))
        ok("tras cambiar la clave, ruta normal → 200", rp3.status_code == 200, f"({rp3.status_code})")

        print("\n── M5 · cambiar clave invalida el token viejo ──")
        t_s2, _ = await login(cl, "90000006")
        # el iat del JWT son segundos enteros: esperamos >1s para que el token
        # viejo quede claramente en un segundo anterior al cambio de clave
        await asyncio.sleep(1.3)
        rc = await cl.post(f"{BASE}/usuarios/me/password", headers=H(t_s2),
                           json={"password_actual": PW, "password_nuevo": "Otra12345!",
                                 "password_nuevo_confirmacion": "Otra12345!"})
        rme = await cl.get(f"{BASE}/usuarios/me", headers=H(t_s2))
        ok("cambio de clave → 200", rc.status_code == 200, f"({rc.status_code})")
        ok("token viejo tras el cambio → 401", rme.status_code == 401, f"({rme.status_code})")

        print("\n── M7 · personal_administrativo no corrige meses ──")
        t_mor, _ = await login(cl, "90000007")
        rgo = await cl.post(f"{BASE}/socio/cuotas/generar-orden", json={"meses_a_pagar": 2}, headers=H(t_mor))
        oid = rgo.json().get("id_orden"); pid = rgo.json().get("id_pago")
        ra = await cl.post(f"{BASE}/admin/ordenes/{oid}/aprobar",
                           json={"meses_corregidos": 1}, headers=H(t_staff))
        ok("aprobar con meses_corregidos como staff → 403", ra.status_code == 403, f"({ra.status_code})")
        ra2 = await cl.post(f"{BASE}/admin/ordenes/{oid}/aprobar",
                            json={"meses_corregidos": 1}, headers=H(t_admin))
        db = SessionLocal()
        try:
            pago = db.query(models.Pago).filter_by(id_pago=pid).first()
            orden = db.query(models.Orden).filter_by(id_orden=oid).first()
            inv_ok = pago and orden and pago.monto_total == orden.monto_total
        finally: db.close()
        ok("aprobar con meses_corregidos como admin → 200", ra2.status_code == 200, f"({ra2.status_code})")
        ok("Pago.monto_total ajustado al corregir meses", bool(inv_ok),
           f"(pago={getattr(pago,'monto_total',None)} orden={getattr(orden,'monto_total',None)})")

        print("\n── M8 · admin_temporal no acredita saldo ──")
        db = SessionLocal()
        try:
            resv = models.ReservaInstalacion(
                id_producto=prod("Cancha 1 Test")[0], instalacion="cancha_1",
                fecha_inicio=datetime.now(timezone.utc) + timedelta(hours=2),
                fecha_fin=datetime.now(timezone.utc) + timedelta(hours=4),
                estado="confirmada", id_usuario=U["socio"],
                monto_reintegro_unitario=Decimal("500"))
            db.add(resv); db.flush()
            rq = models.ReintegroQR(id_reserva=resv.id_reserva, id_usuario=U["socio"],
                                    monto=Decimal("500"), forma="pendiente",
                                    escaneado_por=U["portero"])
            db.add(rq); db.commit()
            rid = rq.id_reintegro
        finally: db.close()
        rf1 = await cl.patch(f"{BASE}/admin/reintegros/{rid}/forma?forma=saldo_a_favor", headers=H(t_portero))
        rf2 = await cl.patch(f"{BASE}/admin/reintegros/{rid}/forma?forma=efectivo", headers=H(t_portero))
        ok("portero → forma=saldo_a_favor → 403", rf1.status_code == 403, f"({rf1.status_code})")
        ok("portero → forma=efectivo → 200", rf2.status_code == 200, f"({rf2.status_code})")

        print("\n── A3/A4 · stock: se descuenta 1 vez, se restaura al rechazar ──")
        buzo_id, s0, _ = prod("Buzo Test")   # s0 == 3
        r = await cl.post(f"{BASE}/socio/carrito/checkout", headers=H(t_socio),
                          json={"items": [{"id_producto": buzo_id, "cantidad": 1}], "metodo_pago": "transferencia"})
        s1 = prod("Buzo Test")[1]
        ok("checkout descuenta 1 (3→2)", s1 == s0 - 1, f"(stock={s1})")
        db = SessionLocal()
        try:
            o = (db.query(models.Orden)
                   .join(models.DetalleOrden).filter(models.DetalleOrden.id_producto == buzo_id,
                                                     models.Orden.estado == "pendiente_verificacion").first())
            oid_tienda = o.id_orden
        finally: db.close()
        ra = await cl.post(f"{BASE}/admin/ordenes/{oid_tienda}/aprobar", json={}, headers=H(t_admin))
        s2 = prod("Buzo Test")[1]
        ok("aprobar NO descuenta de nuevo (sigue 2)", s2 == s0 - 1, f"({ra.status_code}, stock={s2})")
        r = await cl.post(f"{BASE}/socio/carrito/checkout", headers=H(t_socio),
                          json={"items": [{"id_producto": buzo_id, "cantidad": 1}], "metodo_pago": "transferencia"})
        s3 = prod("Buzo Test")[1]
        db = SessionLocal()
        try:
            o = (db.query(models.Orden).join(models.DetalleOrden)
                   .filter(models.DetalleOrden.id_producto == buzo_id,
                           models.Orden.estado == "pendiente_verificacion").first())
            oid_rej = o.id_orden
        finally: db.close()
        rr = await cl.post(f"{BASE}/admin/ordenes/{oid_rej}/rechazar",
                           json={"motivo_rechazo": "motivo de prueba"}, headers=H(t_admin))
        s4 = prod("Buzo Test")[1]
        ok("rechazar restaura stock", s4 == s3 + 1, f"({rr.status_code}, {s3}→{s4})")

        print("\n── A2 · saldo a favor no se gasta dos veces (concurrente) ──")
        db = SessionLocal()
        try:
            u = db.query(models.Usuario).filter_by(id_usuario=U["socio2"]).first()
            u.saldo_a_favor = Decimal("3000"); db.commit()
        finally: db.close()
        r = await cl.post(f"{BASE}/auth/login", json={"dni": "90000006", "password": "Otra12345!"})
        t_s2n = r.json()["access_token"]
        remera_id = prod("Remera Test")[0]
        payload = {"items": [{"id_producto": remera_id, "cantidad": 1}], "metodo_pago": "transferencia", "usar_saldo": True}
        res = await asyncio.gather(
            cl.post(f"{BASE}/socio/carrito/checkout", headers=H(t_s2n), json=payload),
            cl.post(f"{BASE}/socio/carrito/checkout", headers=H(t_s2n), json=payload),
            return_exceptions=True)
        codes = [getattr(x, "status_code", str(x)) for x in res]
        saldo_final = dbget("90000006").saldo_a_favor
        ok("dos checkouts concurrentes: saldo final == 0 (no negativo)",
           saldo_final == Decimal("0.00"), f"(codes={codes}, saldo_final={saldo_final})")

        print("\n── M9 · rate limit registro ──")
        codes = []
        for _ in range(8):
            rr = await cl.post(f"{BASE}/usuarios/", json={}, headers={"X-Forwarded-For": "203.0.113.20"})
            codes.append(rr.status_code)
        ok("6º+ POST /usuarios/ desde misma IP → 429", 429 in codes, f"({codes})")

        print("\n── M3 · webhook MP sin firma → 401 ──")
        rw = await cl.post(f"{BASE}/webhooks/mercadopago", json={"type": "payment", "data": {"id": "123"}})
        ok("POST /webhooks/mercadopago sin x-signature → 401", rw.status_code == 401, f"({rw.status_code})")

        print("\n── B7 · pago manual con orden de cuota pendiente → 409 ──")
        t_mor2, _ = await login(cl, "90000007")
        await cl.post(f"{BASE}/socio/cuotas/generar-orden", json={"meses_a_pagar": 1}, headers=H(t_mor2))
        rb = await cl.post(f"{BASE}/admin/pagos/registrar-pago-manual",
                           json={"id_usuario": U["moroso"], "meses_a_pagar": 1}, headers=H(t_admin))
        ok("registrar-pago-manual con pendiente → 409", rb.status_code == 409, f"({rb.status_code})")

        print("\n── B12 · PATCH /usuarios/{id} solo autogestión ──")
        rp = await cl.patch(f"{BASE}/usuarios/{U['socio2']}", headers=H(t_socio), json={"telefono": "123"})
        rp2 = await cl.patch(f"{BASE}/usuarios/{U['socio']}", headers=H(t_socio), json={"es_becado": True})
        ok("PATCH perfil de OTRO socio → 403", rp.status_code == 403, f"({rp.status_code})")
        ok("PATCH campo prohibido (es_becado) en el propio → 403", rp2.status_code == 403, f"({rp2.status_code})")

        print("\n── sanity permisos ──")
        rs = await cl.get(f"{BASE}/admin/pagos/morosos", headers=H(t_socio))
        ok("socio → GET /admin/pagos/morosos → 403", rs.status_code == 403, f"({rs.status_code})")

    print(f"\n═══ {PASS} PASS · {FAIL} FAIL ═══")
    if "--keep" not in sys.argv:
        limpiar(); print("(fixtures TEST_* limpiadas)")

asyncio.run(run())
