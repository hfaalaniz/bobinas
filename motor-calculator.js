/**
 * motor-calculator.js
 * Cálculo de bobinados trifásicos según "Calculo bobinados trifasicos.pdf"
 *
 * Secuencia (fórmulas del PDF):
 *  1. tp  = π · Di[cm] / P
 *  2. φ   = B[KGs] · tp · L[cm] / 1000
 *  3. Zf  = (50 · V · k · k1) / (2.22 · φ · f · ξ · k2)
 *  4. Nc  = (3 · Zf) / N      → espiras por bobina
 *  5. S   = (I · k2) / (δ · 1.73 · k1)   → mm²
 *
 * Factor de bobinado ξ: tabla del PDF según N (ranuras) y P (polos) y paso elegido.
 * Factor de llenado Ku: conductores reales en la ranura × área esmaltada / área neta.
 *   - doble capa (k=1): 2·Nc conductores por ranura
 *   - una capa   (k=2): Nc  conductores por ranura
 */

// ── Tabla de factor de bobinado ξ del PDF ────────────────────────────────────
// Clave: "Z_P" → array de {paso, acort_pct, xi}
// paso = "1:X" donde X = ranura de fin
// acort_pct = porcentaje de acortamiento respecto al paso diametral
// xi = factor de bobinado
const XI_TABLE = {
    "12_2":  [{paso:"1:7",  acort:0,    xi:0.966},{paso:"1:4",  acort:41.2, xi:0.684}],
    "12_4":  [{paso:"1:6",  acort:3.6,  xi:0.934}],
    "12_6":  [{paso:"1:5",  acort:15.4, xi:0.837}],
    "18_2":  [{paso:"1:10", acort:0,    xi:0.960},{paso:"1:7",  acort:15.2, xi:0.832}],
    "18_4":  [{paso:"1:9",  acort:1.5,  xi:0.945},{paso:"1:6",  acort:30.8, xi:0.735}],
    "18_6":  [{paso:"1:8",  acort:6.4,  xi:0.902}],
    "24_2":  [{paso:"1:13", acort:0,    xi:0.958},{paso:"1:10", acort:8.2,  xi:0.885},{paso:"1:7",  acort:41.0, xi:0.678}],
    "24_4":  [{paso:"1:12", acort:1.2,  xi:0.946},{paso:"1:9",  acort:15.4, xi:0.830}],
    "24_6":  [{paso:"1:11", acort:3.6,  xi:0.926},{paso:"1:8",  acort:26.0, xi:0.760}],
    "30_2":  [{paso:"1:16", acort:0,    xi:0.957},{paso:"1:13", acort:5.1,  xi:0.910},{paso:"1:10", acort:23.6, xi:0.774}],
    "30_4":  [{paso:"1:15", acort:1.0,  xi:0.947},{paso:"1:12", acort:9.5,  xi:0.874},{paso:"1:9",  acort:35.0, xi:0.710}],
    "30_6":  [{paso:"1:14", acort:2.3,  xi:0.935},{paso:"1:11", acort:15.2, xi:0.829}],
    "36_2":  [{paso:"1:19", acort:0,    xi:0.956},{paso:"1:16", acort:3.5,  xi:0.923},{paso:"1:13", acort:15.2, xi:0.829}],
    "36_4":  [{paso:"1:18", acort:0.8,  xi:0.948},{paso:"1:15", acort:6.3,  xi:0.898},{paso:"1:12", acort:22.0, xi:0.783}],
    "36_6":  [{paso:"1:17", acort:1.5,  xi:0.942},{paso:"1:14", acort:10.2, xi:0.866},{paso:"1:11", acort:30.8, xi:0.732}],
    "48_2":  [{paso:"1:25", acort:0,    xi:0.955},{paso:"1:22", acort:1.9,  xi:0.937},{paso:"1:19", acort:8.2,  xi:0.881},{paso:"1:16", acort:20.2, xi:0.794}],
    "48_4":  [{paso:"1:24", acort:0.8,  xi:0.948},{paso:"1:21", acort:3.3,  xi:0.923},{paso:"1:18", acort:11.4, xi:0.856},{paso:"1:15", acort:26.0, xi:0.757}],
    "48_6":  [{paso:"1:23", acort:1.2,  xi:0.944},{paso:"1:20", acort:6.0,  xi:0.902},{paso:"1:17", acort:15.2, xi:0.827},{paso:"1:14", acort:33.1, xi:0.716}],
};

// ── Tabla AWG con diámetro esmaltado Grado 2 (IEC 60317 / NEMA MW1000) ──────
// d_esm: diámetro total con barniz esmalte, medido sobre el aislante
const AWG_DATA = [
    {awg: 8,  d_cu:3.264, d_esm:3.340, area_cu:8.366},
    {awg: 9,  d_cu:2.906, d_esm:2.979, area_cu:6.634},
    {awg:10,  d_cu:2.588, d_esm:2.658, area_cu:5.261},
    {awg:11,  d_cu:2.305, d_esm:2.373, area_cu:4.172},
    {awg:12,  d_cu:2.053, d_esm:2.118, area_cu:3.309},
    {awg:13,  d_cu:1.828, d_esm:1.891, area_cu:2.627},
    {awg:14,  d_cu:1.628, d_esm:1.689, area_cu:2.081},
    {awg:15,  d_cu:1.450, d_esm:1.509, area_cu:1.650},
    {awg:16,  d_cu:1.291, d_esm:1.348, area_cu:1.309},
    {awg:17,  d_cu:1.150, d_esm:1.204, area_cu:1.039},
    {awg:18,  d_cu:1.024, d_esm:1.075, area_cu:0.823},
    {awg:19,  d_cu:0.912, d_esm:0.961, area_cu:0.653},
    {awg:20,  d_cu:0.812, d_esm:0.858, area_cu:0.518},
    {awg:21,  d_cu:0.723, d_esm:0.767, area_cu:0.410},
    {awg:22,  d_cu:0.644, d_esm:0.685, area_cu:0.326},
    {awg:23,  d_cu:0.573, d_esm:0.612, area_cu:0.258},
    {awg:24,  d_cu:0.511, d_esm:0.548, area_cu:0.205},
    {awg:25,  d_cu:0.455, d_esm:0.490, area_cu:0.162},
    {awg:26,  d_cu:0.405, d_esm:0.438, area_cu:0.129},
    {awg:27,  d_cu:0.361, d_esm:0.392, area_cu:0.102},
    {awg:28,  d_cu:0.321, d_esm:0.350, area_cu:0.081},
    {awg:29,  d_cu:0.286, d_esm:0.314, area_cu:0.064},
    {awg:30,  d_cu:0.255, d_esm:0.282, area_cu:0.051},
];

// Selecciona el AWG más próximo a area_req_mm2.
// Primero intenta el calibre inmediatamente superior (más grueso que S) — es el estándar.
// Si el más próximo por debajo tiene diferencia < 3% acepta también ese (tolerancia práctica de taller).
// Devuelve siempre un objeto con el wire elegido más metadatos de selección.
function selAWG(area_req_mm2) {
    // AWG_DATA está ordenado de grueso (AWG 8) a fino (AWG 30)
    // Buscar el primero (más fino) cuya área ≥ area_req → recorrer de fino a grueso
    let wire_sup = null;   // calibre inmediatamente superior o igual
    let wire_inf = null;   // calibre inmediatamente inferior (más fino)
    for (let i = AWG_DATA.length - 1; i >= 0; i--) {
        if (AWG_DATA[i].area_cu >= area_req_mm2) {
            wire_sup = AWG_DATA[i];
            wire_inf = AWG_DATA[i + 1] || null;   // el siguiente más fino
            break;
        }
    }
    if (!wire_sup) return { ...AWG_DATA[0], nota: 'Sección requerida supera AWG 8' };

    // Tolerancia: si el calibre inferior está dentro del 5% de S, preferirlo
    // para no forzar un calibre innecesariamente grueso cuando casi entra.
    if (wire_inf) {
        const diff_sup = wire_sup.area_cu - area_req_mm2;
        const diff_inf = area_req_mm2 - wire_inf.area_cu;
        if (diff_inf / area_req_mm2 < 0.05) {
            // El calibre más fino está dentro del 5% de tolerancia → ofrecer ambos
            return { ...wire_sup, alt: wire_inf };
        }
    }
    return wire_sup;
}

// ── Buscar opciones de paso disponibles en la tabla ──────────────────────────
function opcionesPaso(Z, P) {
    // Buscar primero con P exacto, luego con P normalizado a 2/4/6/8
    const Pnorm = [2,4,6,8].reduce((prev,cur) => Math.abs(cur-P)<Math.abs(prev-P)?cur:prev);
    // Buscar Z exacto, luego el más cercano disponible en la tabla
    const Zkeys = Object.keys(XI_TABLE);
    const key_exact = `${Z}_${P}`;
    if (XI_TABLE[key_exact]) return { key: key_exact, rows: XI_TABLE[key_exact] };

    // Buscar combinando Z de la tabla con el P normalizado
    const Znorm = [12,18,24,30,36,48].reduce((prev,cur) =>
        Math.abs(cur-Z)<Math.abs(prev-Z)?cur:prev);
    const key = `${Znorm}_${Pnorm}`;
    return { key, rows: XI_TABLE[key] || null, Z_usado: Znorm, P_usado: Pnorm };
}

// ── Función principal de cálculo ─────────────────────────────────────────────
function calcular() {
    const gn = id => parseFloat(document.getElementById(id)?.value);
    const gi = id => parseInt(document.getElementById(id)?.value);
    const gv = id => document.getElementById(id)?.value;

    const P     = gi('polos');
    const Z     = gi('ranuras');
    const Di_mm = gn('dint');     // mm → convertir a cm para el PDF
    const Dext  = gn('dext');
    const L_mm  = gn('largo');    // mm → convertir a cm
    const k     = gi('capas');    // 1=doble capa, 2=una capa  (convenio del PDF)
    const k1    = gi('k1');       // ramas en paralelo
    const k2    = gn('k2');       // 1=triángulo, 1.73=estrella
    const B     = gn('B');        // KGs: 4 antiguos, 5 modernos
    const f     = gn('freq');
    const V     = gn('voltaje');

    const b0      = gn('b0');
    const b1      = gn('b1');
    const h1      = gn('h1');
    const e_papel = gn('papel');
    const e_cuna  = gn('cuna');

    const I      = gn('corriente');
    const delta  = gn('densidad');
    const xi_sel = gv('paso-sel'); // clave del paso seleccionado

    if ([P,Z,Di_mm,L_mm,b0,b1,h1,I,delta,f,V,B,k1,k2].some(v => isNaN(v)||v<=0)) {
        alert('Complete todos los campos con valores válidos mayores a cero.');
        return;
    }

    // ── Conversión de unidades (PDF trabaja en cm y KGs) ─────────────────────
    const Di = Di_mm / 10;   // cm
    const L  = L_mm  / 10;   // cm

    // ── 1. Paso polar tp (cm de arco) ─────────────────────────────────────────
    const tp = (Math.PI * Di) / P;

    // ── 2. Flujo magnético φ ──────────────────────────────────────────────────
    const phi = (B * tp * L) / 1000;

    // ── 3. Factor de bobinado ξ ───────────────────────────────────────────────
    const info_paso = opcionesPaso(Z, P);
    const rows = info_paso.rows;
    let xi_row = rows ? rows[0] : null;
    if (xi_sel && rows) {
        const found = rows.find(r => r.paso === xi_sel);
        if (found) xi_row = found;
    }
    const xi   = xi_row ? xi_row.xi    : 0.95;
    const paso_label = xi_row ? xi_row.paso : '—';
    const acort_pct  = xi_row ? xi_row.acort : 0;

    // ── 4. Espiras por fase Zf ────────────────────────────────────────────────
    const Zf = (50 * V * k * k1) / (2.22 * phi * f * xi * k2);

    // ── 5. Espiras por bobina Nc ──────────────────────────────────────────────
    // Nc = (3 · Zf) / N  → redondeado al entero más cercano
    const Nc_raw = (3 * Zf) / Z;
    const Nc     = Math.round(Nc_raw);
    // Si hay acortamiento, el PDF dice aumentar Nc en acort_pct %
    const Nc_calc_adj = Math.round(Nc * (1 + acort_pct / 100));
    // Override de alternativa (nc_ov se lee después del cálculo de AWG — se declara aquí por scope)
    // El nc_ov no está disponible aún porque awg-override se lee más abajo, pero nc-override sí
    const nc_ov_early = parseInt(document.getElementById('nc-override')?.value);
    const Nc_adj = (!isNaN(nc_ov_early) && nc_ov_early > 0) ? nc_ov_early : Nc_calc_adj;

    // ── 6. Sección del alambre S ──────────────────────────────────────────────
    // S = (I · k2) / (δ · 1.73 · k1)
    const S = (I * k2) / (delta * 1.73 * k1);

    // Override desde "Aplicar alternativa" (awg-override y nc-override)
    const awg_ov = parseInt(document.getElementById('awg-override')?.value);
    const nc_ov  = parseInt(document.getElementById('nc-override')?.value);
    const usando_override = !isNaN(awg_ov) && awg_ov > 0;

    const wire = usando_override
        ? (AWG_DATA.find(w => w.awg === awg_ov) || selAWG(S))
        : selAWG(S);
    const A_esm = Math.PI / 4 * wire.d_esm * wire.d_esm;

    // ── 7. Área de ranura ─────────────────────────────────────────────────────
    // Bruta: trapecio b0 (boca) y b1 (fondo), altura h1
    const A_bruta = ((b0 + b1) / 2) * h1;

    // Neta: restar papel (reduce ancho en 2×e_papel por cara lateral, altura en e_papel por el fondo)
    //       y cuña (resta e_cuna de la altura disponible en la zona de conductores)
    const b0_net = Math.max(0.5, b0 - 2 * e_papel);
    const b1_net = Math.max(0.5, b1 - 2 * e_papel);
    const h_net  = Math.max(1.0, h1 - e_papel - e_cuna);
    const A_neta = ((b0_net + b1_net) / 2) * h_net;

    // ── 8. Factor de llenado Ku ───────────────────────────────────────────────
    // Conductores por ranura:
    //   k=1 (doble capa) → 2·Nc_adj conductores/ranura
    //   k=2 (una capa)   →   Nc_adj conductores/ranura
    const n_cond = (k === 1 ? 2 : 1) * Nc_adj;
    const A_cob  = n_cond * A_esm;
    const Ku     = A_cob / A_neta;

    // ── Cálculo de alternativas si Ku > 45% ──────────────────────────────────
    const capas_factor = (k === 1 ? 2 : 1);

    // Opción A: Nc máximo que cabe manteniendo AWG seleccionado, Ku ≤ 45%
    const Nc_max_ranura = Math.max(1, Math.floor((A_neta * 0.45) / (A_esm * capas_factor)));
    const Ku_A = (capas_factor * Nc_max_ranura * A_esm) / A_neta;

    // Opción B: calibre más fino (número AWG mayor) manteniendo Nc_adj
    // Buscar el AWG más fino cuyo Ku ≤ 50% y cuya sección de cobre ≥ S (sin restricción rígida)
    // Si ninguno cumple ambos, mostrar el de menor Ku junto con su deficiencia de corriente
    let alt_B = null;
    {
        const idx_actual = AWG_DATA.findIndex(w => w.awg === wire.awg);
        let mejor_Ku = Infinity, mejor_w = null;
        for (let i = idx_actual + 1; i < AWG_DATA.length; i++) {
            const wf    = AWG_DATA[i];
            const A_wf  = Math.PI / 4 * wf.d_esm * wf.d_esm;
            const Ku_wf = (capas_factor * Nc_adj * A_wf) / A_neta;
            // Guardar el primer que cumple Ku ≤ 50%
            if (Ku_wf <= 0.50 && !alt_B) {
                alt_B = {
                    awg: wf.awg, d_esm: wf.d_esm, area_cu: wf.area_cu,
                    Ku: Ku_wf,
                    deficit_pct: wf.area_cu < S ? ((S - wf.area_cu) / S * 100) : 0
                };
            }
            // Seguir para encontrar el de menor Ku (aunque no cumpla corriente)
            if (Ku_wf < mejor_Ku) { mejor_Ku = Ku_wf; mejor_w = wf; }
        }
        // Si ninguno cumple Ku ≤ 50%, guardar el mejor encontrado como referencia
        if (!alt_B && mejor_w) {
            const A_mw = Math.PI / 4 * mejor_w.d_esm * mejor_w.d_esm;
            alt_B = {
                awg: mejor_w.awg, d_esm: mejor_w.d_esm, area_cu: mejor_w.area_cu,
                Ku: (capas_factor * Nc_adj * A_mw) / A_neta,
                deficit_pct: (S - mejor_w.area_cu) / S * 100,
                no_viable: true
            };
        }
    }

    // Opción C: reducir Nc al mínimo que produce Ku ≤ 45% con el AWG seleccionado
    // (igual que A pero mostramos también el impacto en Zf y tensión)
    // Ya calculado como Nc_max_ranura — aquí calculamos el error de tensión estimado
    const Nc_reduccion_pct = Nc_adj > 0 ? ((Nc_adj - Nc_max_ranura) / Nc_adj * 100) : 0;

    // ── 9. Longitud media de vuelta y masa ────────────────────────────────────
    const paso_num  = xi_row ? parseInt(xi_row.paso.split(':')[1]) : Math.round(tp * 10 / (Math.PI));
    const D_medio   = (Di_mm + Dext) / 2;
    const cuerda_mm = 2 * (D_medio / 2) * Math.sin(Math.PI * (paso_num - 1) / Z);
    const l_cab_mm  = cuerda_mm * 1.15;
    const MTL_mm    = 2 * (L_mm + l_cab_mm);

    // Total de espiras en todo el estator
    const Nb        = (k === 1) ? Z : Z / 2;      // bobinas totales
    const l_tot_m   = Nb * Nc_adj * MTL_mm / 1000;
    const masa_kg   = l_tot_m * wire.area_cu * 8.89e-3;

    // ── 10. Renderizar ────────────────────────────────────────────────────────
    const set  = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    const setT = (id, txt)  => { const el = document.getElementById(id); if (el) el.textContent = txt; };

    // Parámetros del bobinado
    set('r-tp',    `${tp.toFixed(3)} cm &nbsp;(${(tp*10).toFixed(1)} mm)`);
    set('r-phi',   `${phi.toFixed(4)} Wb &nbsp;<small style="color:var(--muted)">(B=${B} KGs, Di=${Di.toFixed(2)} cm, L=${L.toFixed(2)} cm)</small>`);
    set('r-xi',    `${xi.toFixed(3)} &nbsp;<small style="color:var(--muted)">paso ${paso_label}</small>`);
    set('r-Zf',    `${Zf.toFixed(2)} espiras/fase`);
    set('r-Nc',    `${Nc_raw.toFixed(2)} → <b>${Nc}</b> espiras/bobina`);
    const nc_override_activo = !isNaN(nc_ov_early) && nc_ov_early > 0;
    if (nc_override_activo) {
        set('r-Nc-adj', `<b style="color:#1d4ed8">${Nc_adj}</b> espiras/bobina &nbsp;<small style="color:#1d4ed8;font-weight:600">✎ corregido (automático: ${Nc_calc_adj})</small>`);
        document.getElementById('r-Nc-adj-row').style.display = '';
        document.getElementById('r-Nc-adj-row').querySelector('span').textContent = 'Espiras/bobina (corregido)';
    } else if (acort_pct > 0) {
        set('r-Nc-adj', `<b>${Nc_adj}</b> espiras/bobina &nbsp;<small style="color:var(--orange)">(+${acort_pct}% por acortamiento del paso)</small>`);
        document.getElementById('r-Nc-adj-row').style.display = '';
        document.getElementById('r-Nc-adj-row').querySelector('span').textContent = 'Espiras/bobina (con acort.)';
    } else {
        document.getElementById('r-Nc-adj-row').style.display = 'none';
    }

    // Geometría
    const tau_p_ranuras = Z / P;
    set('r-taup',  `${tau_p_ranuras.toFixed(2)} ranuras`);
    set('r-q',     `${(Z/(P*3)).toFixed(3)}`);
    set('r-perim', `${(Math.PI * Di_mm).toFixed(1)} mm`);

    // Ranura
    set('r-area-bruta', `${A_bruta.toFixed(2)} mm²`);
    set('r-area-neta',  `${A_neta.toFixed(2)} mm²`);

    // Conductor
    set('r-S',     `${S.toFixed(4)} mm²`);
    if (usando_override) {
        set('r-awg', `<b style="color:#1d4ed8">AWG ${wire.awg}</b> &nbsp;<small style="color:#1d4ed8;font-weight:600">✎ corregido (automático: AWG ${selAWG(S).awg})</small>`);
    } else {
        set('r-awg', `AWG ${wire.awg}`);
    }
    set('r-dcu',   `${wire.d_cu.toFixed(3)} mm`);
    set('r-desm',  `${wire.d_esm.toFixed(3)} mm`);
    set('r-aesm',  `${A_esm.toFixed(4)} mm²`);

    // Masa
    set('r-mtl',   `${MTL_mm.toFixed(1)} mm`);
    set('r-ltot',  `${l_tot_m.toFixed(1)} m`);
    set('r-peso',  `${masa_kg.toFixed(2)} kg`);

    // ── Factor de llenado — visual ────────────────────────────────────────────
    const pct = (Ku * 100).toFixed(1);
    let color, badge, badgeClass;
    if      (Ku < 0.30)  { color='#22c55e'; badgeClass='badge-ok';    badge='Holgado'; }
    else if (Ku <= 0.45) { color='#3b82f6'; badgeClass='badge-good';  badge='Óptimo';  }
    else if (Ku <= 0.55) { color='#f59e0b'; badgeClass='badge-warn';  badge='Ajustado';}
    else                 { color='#ef4444'; badgeClass='badge-danger'; badge='No entrará'; }

    set('r-ku-pct',   `${pct}%`);
    set('r-ku-badge', `<span class="badge ${badgeClass}">${badge}</span>`);
    const bar = document.getElementById('r-ku-bar');
    if (bar) { bar.style.width = Math.min(100, Ku * 100) + '%'; bar.style.background = color; }

    set('r-ku-detail', `
        <b>Fórmula:</b> Ku = (n_cond × A_esm) / A_neta<br>
        n_cond = ${k===1?'2':'1'} × ${Nc_adj} = <b>${n_cond}</b> conductores/ranura
        &nbsp;<small>(${k===1?'doble capa':'una capa'}${acort_pct>0?`, Nc +${acort_pct}% por acortamiento`:''})</small><br>
        A_esm = π/4 × ${wire.d_esm.toFixed(3)}² = <b>${A_esm.toFixed(4)} mm²</b>
        &nbsp;<small>(AWG ${wire.awg} esmaltado Gr.2 — no usar cobre desnudo ${wire.d_cu.toFixed(3)} mm)</small><br>
        A_neta = <b>${A_neta.toFixed(2)} mm²</b>
        &nbsp;<small>(bruta ${A_bruta.toFixed(2)} − papel 2×${e_papel} mm − cuña ${e_cuna} mm)</small><br>
        Ku = (${n_cond} × ${A_esm.toFixed(4)}) / ${A_neta.toFixed(2)}
           = ${A_cob.toFixed(2)} / ${A_neta.toFixed(2)} = <b>${pct}%</b>`);

    // ── Bloque de alternativas (separado del detalle de fórmula) ─────────────
    // Guardar alternativas en variable global para que aplicarAlt() las use
    window._alternativas = [];

    if (Ku > 0.45) {
        // Opción A: mismo AWG, Nc reducido
        window._alternativas.push({
            letra: 'A',
            titulo: `Reducir espiras — AWG ${wire.awg} sin cambio`,
            desc: [
                `Nc: <b>${Nc_adj} → ${Nc_max_ranura} esp/bobina</b>`,
                `AWG: <b>${wire.awg}</b> (Ø esm. ${wire.d_esm.toFixed(3)} mm)`,
                `Reducción del ${Nc_reduccion_pct.toFixed(0)}% en espiras`,
                `Impacto: la tensión inducida baja ~${Nc_reduccion_pct.toFixed(0)}%`,
            ],
            Ku: Ku_A,
            viable: Nc_max_ranura >= 1 && Ku_A <= 0.55,
            // Valores a aplicar
            awg_override: wire.awg,
            delta_new: null,   // sin cambio
            Nc_new: Nc_max_ranura,
        });

        // Opción B: AWG más fino, mismo Nc
        if (alt_B) {
            const nota = alt_B.deficit_pct > 0
                ? `Déficit corriente: ${alt_B.deficit_pct.toFixed(1)}% (aumentar δ o usar k₁=2)`
                : `Corriente cubierta (${alt_B.area_cu.toFixed(3)} mm² ≥ S)`;
            window._alternativas.push({
                letra: 'B',
                titulo: `Calibre más fino — AWG ${alt_B.awg}`,
                desc: [
                    `AWG: <b>${alt_B.awg}</b> (Ø esm. ${alt_B.d_esm.toFixed(3)} mm · Cu ${alt_B.area_cu.toFixed(3)} mm²)`,
                    `Nc: <b>${Nc_adj} esp/bobina</b> (sin cambio)`,
                    nota,
                ],
                Ku: alt_B.Ku,
                viable: alt_B.Ku <= 0.55 && !alt_B.no_viable,
                awg_override: alt_B.awg,
                delta_new: null,
                Nc_new: Nc_adj,
            });
        }

        // Opción C: AWG más fino + Nc reducido (combinada)
        if (alt_B) {
            const A_wf_c = Math.PI / 4 * alt_B.d_esm * alt_B.d_esm;
            const Nc_c   = Math.max(1, Math.floor((A_neta * 0.45) / (A_wf_c * capas_factor)));
            const Ku_C   = (capas_factor * Nc_c * A_wf_c) / A_neta;
            const red_c  = Nc_adj > 0 ? ((Nc_adj - Nc_c) / Nc_adj * 100) : 0;
            window._alternativas.push({
                letra: 'C',
                titulo: `Combinada — AWG ${alt_B.awg}, Nc = ${Nc_c} esp/bobina`,
                desc: [
                    `AWG: <b>${alt_B.awg}</b> (Ø esm. ${alt_B.d_esm.toFixed(3)} mm)`,
                    `Nc: <b>${Nc_adj} → ${Nc_c} esp/bobina</b> (−${red_c.toFixed(0)}%)`,
                    `Máximo aprovechamiento de la ranura con calibre más fino`,
                ],
                Ku: Ku_C,
                viable: Ku_C <= 0.55,
                awg_override: alt_B.awg,
                delta_new: null,
                Nc_new: Nc_c,
            });
        }

        // Selección automática: B (mantiene Nc) > C (combinada) > A (reduce Nc)
        // Se aplica solo si no hay ya un override manual activo
        const ya_tiene_override = (usando_override || (!isNaN(nc_ov_early) && nc_ov_early > 0));
        if (!ya_tiene_override) {
            const orden_preferencia = ['B', 'C', 'A'];
            for (const letra of orden_preferencia) {
                const idx = window._alternativas.findIndex(a => a.letra === letra && a.viable);
                if (idx >= 0) {
                    aplicarAlt(idx);
                    return; // aplicarAlt llama a calcular() — salir para no doble-renderizar
                }
            }
        }

        // Renderizar tarjetas de alternativas
        const cards = window._alternativas.map((a, i) => {
            const ku_pct  = (a.Ku * 100).toFixed(1);
            const ku_col  = a.Ku <= 0.45 ? '#15803d' : a.Ku <= 0.55 ? '#854d0e' : '#991b1b';
            const ku_bg   = a.Ku <= 0.45 ? '#dcfce7' : a.Ku <= 0.55 ? '#fef9c3' : '#fee2e2';
            const estado  = a.viable
                ? `<span style="color:#15803d;font-weight:700">✓ Viable</span>`
                : `<span style="color:#991b1b;font-weight:700">✗ Revisar</span>`;
            const btn_dis = a.viable ? '' : 'opacity:.55;cursor:not-allowed';
            return `
            <div style="background:#fff;border:1px solid #cbd5e1;border-radius:9px;padding:14px 16px;
                        display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">
              <!-- Letra -->
              <div style="width:34px;height:34px;border-radius:50%;background:#1d4ed8;color:#fff;
                          display:flex;align-items:center;justify-content:center;font-weight:800;
                          font-size:1rem;flex-shrink:0">${a.letra}</div>
              <!-- Contenido -->
              <div style="flex:1;min-width:180px">
                <div style="font-weight:700;font-size:.87rem;margin-bottom:6px">${a.titulo}</div>
                <ul style="padding-left:16px;font-size:.78rem;color:#475569;line-height:1.9;margin:0">
                  ${a.desc.map(d=>`<li>${d}</li>`).join('')}
                </ul>
              </div>
              <!-- Ku + botón -->
              <div style="display:flex;flex-direction:column;align-items:center;gap:8px;flex-shrink:0">
                <div style="background:${ku_bg};color:${ku_col};border-radius:7px;padding:6px 14px;
                            font-size:1.1rem;font-weight:800;text-align:center">
                  ${ku_pct}%
                </div>
                <div style="font-size:.72rem;text-align:center">${estado}</div>
                <button onclick="aplicarAlt(${i})"
                  style="padding:8px 16px;background:#1d4ed8;color:#fff;border:none;
                         border-radius:7px;font-size:.78rem;font-weight:700;cursor:pointer;
                         white-space:nowrap;${btn_dis}">
                  ↺ Aplicar y recalcular
                </button>
              </div>
            </div>`;
        }).join('');

        set('r-alternativas', `
            <div style="margin-top:4px">
              <div style="font-size:.8rem;font-weight:700;color:#1e293b;margin-bottom:10px;
                          padding:10px 14px;background:#fef9c3;border:1px solid #fde047;
                          border-radius:8px">
                ⚠️ Ku > 45% — el bobinado no entrará con la configuración actual.
                Seleccione una alternativa y pulse <b>Aplicar y recalcular</b>.
              </div>
              <div style="display:flex;flex-direction:column;gap:10px">${cards}</div>
            </div>`);

        // Alerta de Nc bajo
        if (Nc_adj <= 5) {
            let al_prev = document.getElementById('r-alertas').innerHTML;
            document.getElementById('r-alertas').innerHTML = al_prev +
                alerta('warn', `Nc=${Nc_adj} espiras es muy bajo. Verifique: (1) Di y L están en mm ` +
                    `(se convierten a cm internamente), (2) B=5 KGs correcto, (3) V es tensión de línea.`);
        }
    } else {
        set('r-alternativas', '');
    }

    // Alertas
    let al = '';
    if (phi < 0.001)
        al += alerta('warn','El flujo φ calculado es muy pequeño. Verifique Di, L y B.');
    if (Zf > 500)
        al += alerta('warn',`Zf=${Zf.toFixed(0)} espiras/fase es inusualmente alto. Verifique V, f, B.`);
    if (acort_pct > 0)
        al += alerta('info',`Paso acortado ${paso_label}: el PDF indica aumentar Nc en ${acort_pct}% → de ${Nc} a ${Nc_adj} espiras/bobina.`);
    if (info_paso.Z_usado && info_paso.Z_usado !== Z)
        al += alerta('info',`Z=${Z} no está en la tabla del PDF. Se usó Z=${info_paso.Z_usado} como aproximación.`);
    set('r-alertas', al);

    document.getElementById('resultados').style.display = 'block';
    document.getElementById('resultados').scrollIntoView({behavior:'smooth'});
}

function alerta(tipo, msg) {
    const cls = tipo === 'warn' ? 'alerta-warn' : 'alerta-info';
    const ico = tipo === 'warn' ? '⚠️' : 'ℹ️';
    return `<div class="alerta ${cls}">${ico} ${msg}</div>`;
}

// ── Aplicar una alternativa y recalcular ────────────────────────────────────
// El botón en cada tarjeta llama aplicarAlt(i) con el índice en _alternativas[]
window.aplicarAlt = function (idx) {
    const a = window._alternativas && window._alternativas[idx];
    if (!a) return;

    // Escribir los valores de la alternativa en los campos ocultos de override
    // y en los campos visibles del formulario
    const el_awg = document.getElementById('awg-override');
    const el_nc  = document.getElementById('nc-override');
    if (el_awg) el_awg.value = a.awg_override;
    if (el_nc)  el_nc.value  = a.Nc_new;

    // Marcar visualmente qué alternativa se está aplicando
    document.querySelectorAll('.alt-card-active').forEach(e => e.classList.remove('alt-card-active'));
    const banner = document.getElementById('alt-banner');
    if (banner) {
        banner.style.display = 'flex';
        const bannerText = document.getElementById('alt-banner-text');
        if (bannerText) {
            const titulo = a.titulo;
            const nc_label = (a.Nc_new != null && !titulo.includes('Nc ='))
                ? `  ·  Nc = ${a.Nc_new} esp/bobina` : '';
            bannerText.textContent = `↺ Opción ${a.letra} activa: ${titulo}${nc_label}`;
        }
    }

    // Recalcular
    calcular();
};

// ── Limpiar override y volver al cálculo automático ─────────────────────────
window.limpiarOverride = function () {
    const el_awg = document.getElementById('awg-override');
    const el_nc  = document.getElementById('nc-override');
    if (el_awg) el_awg.value = '';
    if (el_nc)  el_nc.value  = '';
    const banner = document.getElementById('alt-banner');
    if (banner) banner.style.display = 'none';
    calcular();
};

// ── Actualizar selector de paso al cambiar Z o P ─────────────────────────────
function actualizarPasos() {
    const Z = parseInt(document.getElementById('ranuras')?.value);
    const P = parseInt(document.getElementById('polos')?.value);
    const sel = document.getElementById('paso-sel');
    if (!sel) return;

    const info = opcionesPaso(Z, P);
    const rows = info.rows;
    if (!rows || rows.length === 0) {
        sel.innerHTML = '<option value="">Sin datos para esta combinación</option>';
        return;
    }
    sel.innerHTML = rows.map((r,i) =>
        `<option value="${r.paso}" ${i===0?'selected':''}>` +
        `${r.paso} &nbsp;— ξ=${r.xi} &nbsp;(acort. ${r.acort}%)</option>`
    ).join('');
}
