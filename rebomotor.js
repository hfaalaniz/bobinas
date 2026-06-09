// ============================================================
// REBOMOTOR.JS — Cálculo de rebobinado de motores eléctricos
// Basado en "REBOBINADO DE MOTORES ELÉCTRICOS" (tesis)
// ============================================================
(function () {
    'use strict';

    // ── Tabla AWG — d_esm: diámetro esmaltado Grado 2 (IEC 60317 / NEMA MW1000) ──
    const AWG_TABLE = {
         8: { d_mm: 3.264, d_esm: 3.340, area_mm2: 8.366,   R_ohm_km:    2.061 },
         9: { d_mm: 2.906, d_esm: 2.979, area_mm2: 6.634,   R_ohm_km:    2.599 },
        10: { d_mm: 2.588, d_esm: 2.658, area_mm2: 5.261,   R_ohm_km:    3.277 },
        11: { d_mm: 2.305, d_esm: 2.373, area_mm2: 4.172,   R_ohm_km:    4.132 },
        12: { d_mm: 2.053, d_esm: 2.118, area_mm2: 3.309,   R_ohm_km:    5.211 },
        13: { d_mm: 1.828, d_esm: 1.891, area_mm2: 2.627,   R_ohm_km:    6.561 },
        14: { d_mm: 1.628, d_esm: 1.689, area_mm2: 2.081,   R_ohm_km:    8.286 },
        15: { d_mm: 1.450, d_esm: 1.509, area_mm2: 1.650,   R_ohm_km:   10.45  },
        16: { d_mm: 1.291, d_esm: 1.348, area_mm2: 1.309,   R_ohm_km:   13.17  },
        17: { d_mm: 1.150, d_esm: 1.204, area_mm2: 1.039,   R_ohm_km:   16.61  },
        18: { d_mm: 1.024, d_esm: 1.075, area_mm2: 0.823,   R_ohm_km:   20.95  },
        19: { d_mm: 0.912, d_esm: 0.961, area_mm2: 0.653,   R_ohm_km:   26.42  },
        20: { d_mm: 0.812, d_esm: 0.858, area_mm2: 0.518,   R_ohm_km:   33.31  },
        21: { d_mm: 0.723, d_esm: 0.767, area_mm2: 0.410,   R_ohm_km:   42.00  },
        22: { d_mm: 0.644, d_esm: 0.685, area_mm2: 0.326,   R_ohm_km:   52.96  },
        23: { d_mm: 0.573, d_esm: 0.612, area_mm2: 0.258,   R_ohm_km:   66.79  },
        24: { d_mm: 0.511, d_esm: 0.548, area_mm2: 0.205,   R_ohm_km:   84.22  },
        25: { d_mm: 0.455, d_esm: 0.490, area_mm2: 0.162,   R_ohm_km:  106.2   },
        26: { d_mm: 0.405, d_esm: 0.438, area_mm2: 0.129,   R_ohm_km:  133.9   },
        27: { d_mm: 0.361, d_esm: 0.392, area_mm2: 0.102,   R_ohm_km:  168.9   },
        28: { d_mm: 0.321, d_esm: 0.350, area_mm2: 0.081,   R_ohm_km:  212.9   },
        29: { d_mm: 0.286, d_esm: 0.314, area_mm2: 0.0642,  R_ohm_km:  268.5   },
        30: { d_mm: 0.255, d_esm: 0.282, area_mm2: 0.0509,  R_ohm_km:  338.6   },
        32: { d_mm: 0.202, d_esm: 0.226, area_mm2: 0.0320,  R_ohm_km:  538.3   },
        34: { d_mm: 0.160, d_esm: 0.182, area_mm2: 0.0201,  R_ohm_km:  856.5   },
        36: { d_mm: 0.127, d_esm: 0.147, area_mm2: 0.0127,  R_ohm_km: 1361.0   },
        38: { d_mm: 0.101, d_esm: 0.119, area_mm2: 0.00797, R_ohm_km: 2164.0   },
        40: { d_mm: 0.0799,d_esm: 0.096, area_mm2: 0.00501, R_ohm_km: 3441.0   },
    };
    const AWG_LIST = [8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,32,34,36,38,40];

    // Densidad de corriente por clase de aislamiento (A/mm²)
    const J_CLASS = { A: 4.0, B: 4.5, F: 5.0, H: 5.5 };

    // ── Base de datos NEMA (valores medios, 50 Hz, dimensiones en mm) ─────────
    // Campos: carcasa, D_int, L, Z, b1(boca), bw(ancho fondo), hw(altura útil)
    // Los valores son la media del rango publicado en la tabla NEMA métrica 50 Hz.
    const NEMA_DB = {
        2: [   // 2 Polos ~3000 RPM
            { hp_min:  1, hp_max:  2, hp_label: '1 – 2 HP',   carcasa: '143T–145T', D_ext: 160, D_int:  59.7, L:  91.5, Z: 24, b1: 2.0, bw: 5.75, hw: 13.25, OD_ref: 160 },
            { hp_min:  3, hp_max:  5, hp_label: '3 – 5 HP',   carcasa: '182T–184T', D_ext: 200, D_int:  87.7, L: 133.4, Z: 36, b1: 2.2, bw: 6.75, hw: 15.50, OD_ref: 200 },
            { hp_min:  7, hp_max: 10, hp_label: '7.5 – 10 HP',carcasa: '213T–215T', D_ext: 230, D_int: 104.8, L: 163.9, Z: 36, b1: 2.4, bw: 7.75, hw: 18.00, OD_ref: 230 },
            { hp_min: 15, hp_max: 25, hp_label: '15 – 25 HP', carcasa: '254T–256T', D_ext: 280, D_int: 130.2, L: 232.4, Z: 48, b1: 2.75,bw: 9.00, hw: 21.00, OD_ref: 280 },
            { hp_min: 30, hp_max: 50, hp_label: '30 – 50 HP', carcasa: '284TS–286TS',D_ext:320, D_int: 162.0, L: 304.8, Z: 48, b1: 3.0, bw:10.50, hw: 24.25, OD_ref: 320 },
        ],
        4: [   // 4 Polos ~1500 RPM
            { hp_min:  1, hp_max:  2, hp_label: '1 – 2 HP',   carcasa: '143T–145T', D_ext: 160, D_int:  67.3, L: 106.7, Z: 36, b1: 2.0, bw: 5.15, hw: 12.50, OD_ref: 160 },
            { hp_min:  3, hp_max:  5, hp_label: '3 – 5 HP',   carcasa: '182T–184T', D_ext: 200, D_int: 104.8, L: 148.6, Z: 36, b1: 2.2, bw: 6.25, hw: 14.75, OD_ref: 200 },
            { hp_min:  7, hp_max: 10, hp_label: '7.5 – 10 HP',carcasa: '213T–215T', D_ext: 250, D_int: 123.9, L: 198.1, Z: 36, b1: 2.4, bw: 7.25, hw: 17.00, OD_ref: 250 },
            { hp_min: 15, hp_max: 25, hp_label: '15 – 25 HP', carcasa: '254T–256T', D_ext: 300, D_int: 149.3, L: 251.5, Z: 48, b1: 2.6, bw: 8.25, hw: 19.75, OD_ref: 300 },
            { hp_min: 30, hp_max: 50, hp_label: '30 – 50 HP', carcasa: '284T–286T', D_ext: 360, D_int: 184.2, L: 335.3, Z: 48, b1: 2.8, bw: 9.50, hw: 23.00, OD_ref: 360 },
        ],
    };

    // Tabla de conexionado NEMA (9 y 12 puntas)
    const NEMA_CONEXIONES = {
        '9_Y_baja':  { label:'9 puntas · Estrella Doble (YY) · Baja tensión',
            L1:'T1, T7', L2:'T2, T8', L3:'T3, T9', puentes:'Unir T4–T5–T6' },
        '9_Y_alta':  { label:'9 puntas · Estrella Serie (Y) · Alta tensión',
            L1:'T1',     L2:'T2',     L3:'T3',     puentes:'T4–T7 | T5–T8 | T6–T9' },
        '9_D_baja':  { label:'9 puntas · Triángulo Doble (ΔΔ) · Baja tensión',
            L1:'T1, T6, T7', L2:'T2, T4, T8', L3:'T3, T5, T9', puentes:'—' },
        '9_D_alta':  { label:'9 puntas · Triángulo Serie (Δ) · Alta tensión',
            L1:'T1', L2:'T2', L3:'T3', puentes:'T4–T7 | T5–T8 | T6–T9' },
        '12_DD':     { label:'12 puntas · Doble Triángulo (ΔΔ) · Baja tensión',
            L1:'T1, T6, T7, T12', L2:'T2, T4, T8, T10', L3:'T3, T5, T9, T11', puentes:'—' },
        '12_YY':     { label:'12 puntas · Doble Estrella (YY) · Baja tensión',
            L1:'T1, T7', L2:'T2, T8', L3:'T3, T9', puentes:'Unir T4–T5–T6 | Unir T10–T11–T12' },
        '12_D':      { label:'12 puntas · Triángulo Serie (Δ) · Tensión intermedia',
            L1:'T1, T12', L2:'T2, T10', L3:'T3, T11', puentes:'T4–T7 | T5–T8 | T6–T9' },
        '12_Y':      { label:'12 puntas · Estrella Serie (Y) · Alta tensión',
            L1:'T1', L2:'T2', L3:'T3', puentes:'T4–T7 | T5–T8 | T6–T9 | Unir T10–T11–T12' },
    };

    // ── Estado del asistente ──────────────────────────────────────────────────
    let _step = 0;
    let _data = {};
    let _results = null;

    // Solo 4 pasos — los datos del bobinado se calculan, no se ingresan
    const STEPS = [
        { id: 'placa',   title: 'Datos de Placa',        icon: '🏷️' },
        { id: 'estator', title: 'Geometría del Estátor', icon: '⚙️' },
        { id: 'ranura',  title: 'Geometría de Ranura',   icon: '📐' },
        { id: 'calcular',title: 'Cálculo y Resultados',  icon: '📊' },
    ];

    // ============================================================
    // NÚCLEO DE CÁLCULO — todo derivado de geometría y placa
    // ============================================================
    function calcular(d) {
        const r = {};

        // ── 1. Datos eléctricos de placa ──────────────────────────
        r.hp       = d.hp;
        r.kW       = d.hp * 0.7457;
        r.V        = d.V;
        r.f        = d.f;
        r.m        = d.m;          // fases
        r.conexion = d.conexion;   // 'Y' o 'D'
        r.eta      = d.eta  || 0.88;
        r.cosfi    = d.cosfi|| 0.85;
        r.ins_class= d.ins_class || 'B';

        // ── 2. Datos geométricos del estátor ──────────────────────
        r.Z      = d.Z;
        r.P      = d.P;
        r.OD_mm  = d.D_ext_mm;
        r.ID_mm  = d.D_int_mm;
        r.L_mm   = d.L_mm;
        r.capas  = d.capas || 2;

        // Diámetro medio magnético útil
        r.D_m    = (r.OD_mm + r.ID_mm) / 2;          // mm
        r.ID_m   = r.ID_mm / 1000;                    // m
        r.L_m    = r.L_mm  / 1000;                    // m

        // ── 3. Geometría de ranura medida ──────────────────────────
        r.b1  = d.b1;    // ancho boca  (mm)
        r.h1  = d.h1;    // altura boca (mm)
        r.bw  = d.bw;    // ancho cuerpo (mm)
        r.hw  = d.hw;    // profundidad cuerpo (mm)

        // Área neta disponible para cobre (descontando papel aislante ~0.5 mm perím.)
        const pared_mm = 0.5;
        r.A_ranura_neta = (r.bw - 2*pared_mm) * (r.hw - pared_mm);   // mm²

        // ── 4. Parámetros de distribución derivados de Z, P, m ────
        // Ranuras por polo y fase
        r.q      = r.Z / (r.P * r.m);
        r.q_int  = Math.floor(r.q);
        r.q_frac = r.q - r.q_int;

        // Paso polar en ranuras
        r.tau_p  = r.Z / r.P;

        // Número de bobinas según capas
        r.Nb     = r.capas === 2 ? r.Z : Math.floor(r.Z / 2);

        // Grupos totales y bobinas por grupo
        r.Ngt    = r.P * r.m;
        r.Nbg    = r.Nb / r.Ngt;

        // ── 5. Paso de bobina — calculado, no ingresado ────────────
        // Criterio estándar: paso corto 5/6 τp (reduce armónicos).
        // Para bobinado de una capa el paso debe ser impar si τp es par.
        const paso_pleno = r.tau_p;
        const paso_corto = paso_pleno * (5/6);

        if (r.capas === 2) {
            // Doble capa: se puede usar paso corto sin restricción
            r.y = Math.round(paso_corto);
        } else {
            // Una capa: el paso debe ser impar
            let y_calc = Math.round(paso_corto);
            if (y_calc % 2 === 0) y_calc--;           // forzar impar
            r.y = Math.max(1, y_calc);
        }

        r.beta           = r.y / r.tau_p;             // relación de paso real
        r.paso_tipo      = r.beta >= 0.999
            ? 'Pleno'
            : `Corto β=${r.beta.toFixed(3)} (${r.y}/${r.tau_p.toFixed(0)} τp)`;

        // ── 6. Factores de bobinado ────────────────────────────────
        const alpha_e = Math.PI * r.P / r.Z;          // rad eléctrico entre ranuras

        // Factor de distribución Kd
        r.Kd = r.q_int >= 1
            ? Math.sin(r.q_int * alpha_e / 2) / (r.q_int * Math.sin(alpha_e / 2))
            : 1;

        // Factor de paso Kp  (Ec. de la tesis: Kp = sin(π·y/2·τp))
        r.Kp = Math.sin(Math.PI * r.beta / 2);

        // Factor de bobinado total
        r.Kw = r.Kd * r.Kp;

        // ── 7. Tensión de fase y corriente de línea ────────────────
        r.V_fase  = r.conexion === 'Y' ? r.V / Math.sqrt(3) : r.V;
        r.I_line  = (r.kW * 1000) / (Math.sqrt(3) * r.V * r.eta * r.cosfi);
        r.I_fase  = r.conexion === 'Y' ? r.I_line : r.I_line / Math.sqrt(3);
        r.rpm_sync= (60 * r.f) / (r.P / 2);

        // ── 8. Inducción — derivada de geometría si no se midió ────
        // Si el usuario la ingresó la usa; si no, se estima del área de la corona.
        // Restricción: Bav entre 0.6 y 0.9 T para motores de inducción.
        if (d.Bav && d.Bav > 0) {
            r.Bav = d.Bav;
        } else {
            // Estimación por flujo disponible en el entrehierro
            // Sección del entrehierro por polo: Sp = (π·ID·L) / P
            const Sp = (Math.PI * r.ID_m * r.L_m) / r.P;    // m²
            // Potencia convertida por polo → EMF aproximada
            // Usamos densidad de flujo típica escalada por relación L/D
            const ratio_LD = r.L_m / r.ID_m;
            r.Bav = Math.min(0.85, Math.max(0.60, 0.70 + 0.08 * Math.log(ratio_LD + 1)));
        }

        // ── 9. Flujo y número de vueltas — Ley de Faraday ──────────
        // Paso polar en metros (arco del entrehierro por polo)
        r.tau_m = Math.PI * r.ID_m / r.P;

        // Flujo por polo: Φ = Bav · τm · L
        r.Phi   = r.Bav * r.tau_m * r.L_m;

        // Vueltas totales por fase desde Faraday: V_fase = 4.44·f·Φ·Kw·N_ph
        const N_ph_raw = r.V_fase / (4.44 * r.f * r.Phi * r.Kw);

        // Bobinas en serie por fase: cada fase tiene Nb/m bobinas distribuidas
        // N_ph = N_c × (bobinas por fase) → N_c = N_ph_raw / (Nb/m)
        const bobinas_por_fase = r.Nb / r.m;
        r.N_c  = d._fix_Nc || Math.max(1, Math.round(N_ph_raw / bobinas_por_fase));
        r.N_ph = r.N_c * bobinas_por_fase;

        // Verificar Faraday con N_c calculado
        r.V_calc = 4.44 * r.f * r.Phi * r.Kw * r.N_ph;
        r.err_V  = Math.abs(r.V_calc - r.V_fase) / r.V_fase * 100;  // %

        // Error inherente al redondeo de N_c (no evitable con ningún calibre)
        const N_ph_ideal = N_ph_raw;
        const V_ideal    = 4.44 * r.f * r.Phi * r.Kw * N_ph_ideal;
        r.err_V_redondeo = Math.abs(r.V_calc - V_ideal) / r.V_fase * 100;

        // ── 10. Calibre de conductor — desde corriente y geometría ──
        // Densidad de corriente J según clase de aislamiento
        r.J_max = J_CLASS[r.ins_class];

        // Sección de cobre requerida por la corriente de fase
        r.A_cond_req = r.I_fase / r.J_max;                           // mm²

        // Conductores en ranura según capas
        // Doble capa: cada ranura tiene N_c de una bobina + N_c de la adyacente
        // Una capa: cada ranura tiene N_c de una sola bobina
        r.n_cond_ranura = r.capas * r.N_c;

        // Sección máxima de conductor que cabe en la ranura (con Ku=0.40)
        const Ku_objetivo = 0.40;
        const A_cond_max  = (r.A_ranura_neta * Ku_objetivo) / r.n_cond_ranura;

        // Seleccionar el calibre más grueso que satisface AMBOS criterios:
        // a) sección ≥ A_cond_req  (corriente)
        // b) sección ≤ A_cond_max  (espacio en ranura)
        r.wire = _seleccionarAWG_dual(r.A_cond_req, A_cond_max);

        // Si el conductor no cabe individual, proponer conductores en paralelo
        r.n_paralelo = 1;
        if (!r.wire) {
            // Intentar con 2 conductores en paralelo (sección efectiva se divide)
            for (let np = 2; np <= 6; np++) {
                const A_req_p  = r.A_cond_req / np;
                const A_max_p  = (r.A_ranura_neta * Ku_objetivo) / (r.n_cond_ranura * np);
                const w = _seleccionarAWG_dual(A_req_p, A_max_p);
                if (w) { r.wire = w; r.n_paralelo = np; break; }
            }
        }
        // Último recurso: mejor candidato por corriente ignorando Ku
        if (!r.wire) {
            r.wire = _seleccionarAWG(r.A_cond_req);
        }
        // Override de auto-corrección
        if (d._fix_awg && AWG_TABLE[d._fix_awg]) {
            r.wire = { awg: d._fix_awg, ...AWG_TABLE[d._fix_awg] };
        }

        // ── 11. Factor de llenado real ────────────────────────────
        const d_esm   = r.wire.d_esm;                                // Grado 2 (IEC 60317)
        const A_esm   = Math.PI / 4 * d_esm * d_esm;
        r.A_cob_ranura= r.n_cond_ranura * r.n_paralelo * A_esm;
        r.Ku_real     = r.A_cob_ranura / r.A_ranura_neta;

        // ── 12. Longitud media de vuelta (MTL) ────────────────────
        // Cuerda de la bobina (entre ranuras i e i+y), medida sobre radio medio
        const R_medio_m  = (r.ID_mm / 2 + r.hw / 2) / 1000;         // m
        const cuerda_m   = 2 * R_medio_m * Math.sin(Math.PI * r.y / r.Z);
        // Vuelta completa = 2 × longitud activa + 2 × cabeza de bobina
        // Cabeza ≈ cuerda × f_cab (factor geométrico 1.1 para paso corto)
        const f_cab = 1.10 + 0.06 * (1 - r.beta);
        r.l_cab_m  = cuerda_m * f_cab;                               // longitud 1 cabeza
        r.MTL      = 2 * (r.L_m + r.l_cab_m);                        // m

        // ── 13. Resistencia y pérdidas ────────────────────────────
        const RHO_CU  = 0.01724;                                      // Ω·mm²/m a 20°C
        const A_total = r.wire.area_mm2 * r.n_paralelo;              // mm² conductor efectivo
        r.R_fase      = RHO_CU * r.N_ph * r.MTL / A_total;
        r.Pcu         = r.m * r.I_fase * r.I_fase * r.R_fase;
        r.pcu_pct     = r.Pcu / (r.kW * 1000) * 100;                 // % de la potencia nominal

        // ── 14. Longitud total de hilo y masa de cobre ─────────────
        r.l_bobina_m  = r.MTL * r.N_c;                               // m por bobina
        r.l_fase_m    = r.N_ph * r.MTL;                              // m por fase
        r.l_total_m   = r.m * r.l_fase_m;                            // m total
        const DEN_CU  = 8960e-9;                                      // kg/mm³
        r.m_Cu_kg     = r.l_total_m * 1000 * r.wire.area_mm2 * r.n_paralelo * DEN_CU;

        // ── 15. Papel aislante de ranura ───────────────────────────
        // Largo = longitud del paquete + 2 dobleces de 10 mm c/u
        r.papel_largo_mm = r.L_mm + 20;
        r.papel_ancho_mm = r.bw + 2;                                  // perímetro simplificado

        // ── 16. Ranura de inicio de cada fase ──────────────────────
        // Fases desplazadas 120° eléctrico = Z/(P·m) ranuras
        const desfase = Math.round(r.Z / (r.P * r.m));
        r.fase_inicios = { U: 1, V: 1 + desfase, W: 1 + 2*desfase };

        // ── 17. Tabla de distribución de ranuras ───────────────────
        r.slotTable = _distribuirRanuras(r.Z, r.P, r.m, r.y);

        // ── 18. RPM sincrónica y deslizamiento típico ──────────────
        r.rpm_nom = d.rpm || r.rpm_sync * 0.967;                      // rpm nominals

        // ── 19. Auto-corrección Ku > 55% ─────────────────────────
        r.auto_fix = null;
        if (r.Ku_real > 0.55 && !d._fix_applied) {
            const KU_OBJ = 0.45;

            // Opción A: mismo AWG, reducir N_c hasta que Ku ≤ KU_OBJ
            const Nc_A = Math.max(1, Math.floor(
                (r.A_ranura_neta * KU_OBJ) / (r.capas * r.n_paralelo * Math.PI / 4 * r.wire.d_esm * r.wire.d_esm)
            ));
            const A_esm_cur = Math.PI / 4 * r.wire.d_esm * r.wire.d_esm;
            const Ku_A = (r.capas * Nc_A * r.n_paralelo * A_esm_cur) / r.A_ranura_neta;

            // Opción B: calibre más fino, mismo N_c — buscar el primer AWG más fino que logra Ku ≤ KU_OBJ
            let fix_B = null;
            const awg_idx = AWG_LIST.indexOf(r.wire.awg);
            for (let i = awg_idx + 1; i < AWG_LIST.length; i++) {
                const w = AWG_TABLE[AWG_LIST[i]];
                const A_esm_b = Math.PI / 4 * w.d_esm * w.d_esm;
                const Ku_b = (r.capas * r.N_c * r.n_paralelo * A_esm_b) / r.A_ranura_neta;
                if (Ku_b <= KU_OBJ) { fix_B = { awg: AWG_LIST[i], wire: w, Ku: Ku_b, N_c: r.N_c }; break; }
            }

            // Opción C: calibre más fino + N_c reducido (combinada)
            let fix_C = null;
            if (fix_B) {
                const A_esm_c = Math.PI / 4 * fix_B.wire.d_esm * fix_B.wire.d_esm;
                const Nc_C = Math.max(1, Math.floor(
                    (r.A_ranura_neta * KU_OBJ) / (r.capas * r.n_paralelo * A_esm_c)
                ));
                const Ku_C = (r.capas * Nc_C * r.n_paralelo * A_esm_c) / r.A_ranura_neta;
                fix_C = { awg: fix_B.awg, wire: fix_B.wire, Ku: Ku_C, N_c: Nc_C };
            }

            // Elegir mejor opción viable: B > C > A
            const viable = f => f && f.Ku <= 0.55;
            const elegida = viable(fix_B) ? { ...fix_B, letra:'B', desc:`AWG ${fix_B.awg} (calibre más fino), N_c sin cambio` }
                          : viable(fix_C) ? { ...fix_C, letra:'C', desc:`AWG ${fix_C.awg} + N_c = ${fix_C.N_c} vueltas` }
                          : viable({Ku: Ku_A}) ? { awg: r.wire.awg, wire: r.wire, Ku: Ku_A, N_c: Nc_A,
                                                   letra:'A', desc:`N_c reducido a ${Nc_A} vueltas, mismo AWG ${r.wire.awg}` }
                          : null;

            if (elegida) {
                // Recalcular con la alternativa aplicada
                const d_fix = { ...d, _fix_applied: true,
                    _fix_awg: elegida.awg, _fix_Nc: elegida.N_c, _fix_desc: elegida.desc, _fix_letra: elegida.letra };
                return calcular(d_fix);
            }
        }

        // Registrar si este resultado viene de una auto-corrección
        if (d._fix_applied) {
            r.auto_fix = { letra: d._fix_letra, desc: d._fix_desc, awg: d._fix_awg, N_c: d._fix_Nc };
        }

        // ── 20. Alertas y diagnóstico ─────────────────────────────
        r.alertas = [];
        if (r.Ku_real > 0.55)
            r.alertas.push({ t:'warn', m:`Factor de llenado Ku=${(r.Ku_real*100).toFixed(1)}% > 55%. No se encontró alternativa automática viable. Revise dimensiones de la ranura.` });
        if (r.Ku_real >= 0.45 && r.Ku_real <= 0.55)
            r.alertas.push({ t:'info', m:`Factor de llenado Ku=${(r.Ku_real*100).toFixed(1)}% — llenado ajustado, puede entrar con cuidado.` });
        if (r.Ku_real < 0.25)
            r.alertas.push({ t:'info', m:`Factor de llenado Ku=${(r.Ku_real*100).toFixed(1)}% < 25%. Ranura muy subutilizada — puede aumentar N_c o usar calibre más grueso.` });
        if (r.q_frac > 0.01)
            r.alertas.push({ t:'info', m:`Bobinado fraccionario q=${r.q.toFixed(3)}. La distribución de ranuras no es uniforme.` });
        if (r.Kw < 0.85)
            r.alertas.push({ t:'warn', m:`Factor de bobinado Kw=${r.Kw.toFixed(3)} bajo. Verifique Z, P y tipo de bobinado.` });
        // Alertar solo si el error de tensión supera lo inevitable por redondeo de N_c
        if (r.err_V > 5 && (r.err_V - r.err_V_redondeo) > 2)
            r.alertas.push({ t:'warn', m:`La tensión calculada (${r.V_calc.toFixed(1)} V) difiere ${r.err_V.toFixed(1)}% de la nominal. Revise Bav o N_c.` });
        if (r.pcu_pct > 8)
            r.alertas.push({ t:'warn', m:`Pérdidas en cobre = ${r.pcu_pct.toFixed(1)}% de la potencia nominal. Alto — considere calibre más grueso.` });
        if (r.n_paralelo > 1)
            r.alertas.push({ t:'info', m:`Se requieren ${r.n_paralelo} conductores en paralelo por bobina para cumplir Ku ≤ 40%.` });

        return r;
    }

    // ── Selección AWG con doble restricción ──────────────────────────────────
    function _seleccionarAWG_dual(A_min, A_max) {
        // Buscar el AWG más grueso que cumple A_min ≤ area ≤ A_max
        for (let i = 0; i < AWG_LIST.length; i++) {
            const awg = AWG_LIST[i];
            const a   = AWG_TABLE[awg].area_mm2;
            if (a >= A_min && a <= A_max) return { awg, ...AWG_TABLE[awg] };
        }
        return null;
    }

    // ── Selección AWG por corriente mínima (sin restricción de espacio) ──────
    function _seleccionarAWG(A_min) {
        for (let i = 0; i < AWG_LIST.length; i++) {
            const awg = AWG_LIST[i];
            if (AWG_TABLE[awg].area_mm2 >= A_min) return { awg, ...AWG_TABLE[awg] };
        }
        return { awg: 8, ...AWG_TABLE[8] };
    }

    // ── Tabla de distribución de ranuras ─────────────────────────────────────
    function _distribuirRanuras(Z, P, m, y) {
        const fases = m === 3 ? ['A','B','C'] : ['A','Aux'];
        return Array.from({ length: Z }, (_, s) => {
            const groupF = (s * P * m) / Z;
            const group  = Math.floor(groupF);
            const polo   = Math.floor(group / m);
            return {
                slot:  s + 1,
                phase: fases[group % m],
                dir:   polo % 2 === 0 ? '+' : '−',
            };
        });
    }

    // ============================================================
    // RENDERIZADO DE RESULTADOS
    // ============================================================
    function renderResultados(r) {
        const el = document.getElementById('rm-resultados');
        if (!el) return;

        const wire_label = r.n_paralelo > 1
            ? `AWG ${r.wire.awg} × ${r.n_paralelo} hilos paralelos`
            : `AWG ${r.wire.awg}`;

        const Ku_color = r.Ku_real > 0.55 ? '#f87171' : r.Ku_real < 0.25 ? '#fbbf24' : '#34d399';

        const autofix_html = r.auto_fix
            ? `<div class="rm-alerta rm-alerta-ok" style="background:#dcfce7;border:1px solid #86efac;color:#14532d;margin-bottom:8px">
                ✅ Opción ${r.auto_fix.letra} aplicada automáticamente: <b>${r.auto_fix.desc}</b> · Ku = ${(r.Ku_real*100).toFixed(1)}%
               </div>` : '';

        const alertas_html = autofix_html + (r.alertas.length
            ? r.alertas.map(a => `<div class="rm-alerta rm-alerta-${a.t}">${a.t==='warn'?'⚠️':'ℹ️'} ${a.m}</div>`).join('')
            : '<div class="rm-alerta rm-ok">✅ Todos los parámetros dentro de rangos normales.</div>');

        el.innerHTML = `

        <!-- ── BLOQUE PRINCIPAL DE RESULTADOS ── -->
        <div class="rm-res-grid">

          <!-- Distribución de bobinado -->
          <div class="rm-card rm-card-blue">
            <div class="rm-card-title">⚙️ Distribución de Bobinado</div>
            <table class="rm-table">
              <tr><td>Ranuras totales (Z)</td><td><b>${r.Z}</b></td></tr>
              <tr><td>Polos (P)</td><td><b>${r.P}</b></td></tr>
              <tr><td>Fases (m)</td><td><b>${r.m}</b></td></tr>
              <tr><td>Ranuras / polo / fase (q)</td>
                  <td><b>${r.q.toFixed(3)}${r.q_frac>0.01?' ⚡ fraccionario':''}</b></td></tr>
              <tr><td>Paso polar τp</td><td><b>${r.tau_p.toFixed(2)} ranuras</b></td></tr>
              <tr class="rm-highlight"><td>Paso de bobina (y) <small>calculado</small></td>
                  <td><b>1 – ${r.y+1} (${r.paso_tipo})</b></td></tr>
              <tr><td>Capas</td><td><b>${r.capas}</b></td></tr>
              <tr><td>Bobinas totales (Nb)</td><td><b>${r.Nb}</b></td></tr>
              <tr><td>Grupos totales (Ngt)</td><td><b>${r.Ngt}</b></td></tr>
              <tr><td>Bobinas / grupo (Nbg)</td><td><b>${r.Nbg.toFixed(1)}</b></td></tr>
              <tr><td>Conexión</td><td><b>${r.conexion==='Y'?'Estrella (Y)':'Triángulo (Δ)'}</b></td></tr>
            </table>
          </div>

          <!-- Factores eléctricos -->
          <div class="rm-card rm-card-purple">
            <div class="rm-card-title">⚡ Factores Eléctricos</div>
            <table class="rm-table">
              <tr><td>Frecuencia</td><td><b>${r.f} Hz</b></td></tr>
              <tr><td>RPM sincrónica</td><td><b>${r.rpm_sync.toFixed(0)} RPM</b></td></tr>
              <tr><td>Tensión nominal (línea)</td><td><b>${r.V} V</b></td></tr>
              <tr><td>Tensión de fase</td><td><b>${r.V_fase.toFixed(1)} V</b></td></tr>
              <tr><td>Tensión calculada (Faraday)</td>
                  <td><b style="color:${r.err_V<3?'#34d399':'#fbbf24'}">${r.V_calc.toFixed(1)} V
                  <small>(err ${r.err_V.toFixed(1)}%)</small></b></td></tr>
              <tr><td>Potencia</td><td><b>${r.hp} HP = ${r.kW.toFixed(2)} kW</b></td></tr>
              <tr><td>Corriente de línea</td><td><b>${r.I_line.toFixed(2)} A</b></td></tr>
              <tr><td>Corriente de fase</td><td><b>${r.I_fase.toFixed(2)} A</b></td></tr>
              <tr><td>Factor distribución Kd</td><td><b>${r.Kd.toFixed(4)}</b></td></tr>
              <tr><td>Factor paso Kp</td><td><b>${r.Kp.toFixed(4)}</b></td></tr>
              <tr><td>Factor bobinado Kw</td><td><b>${r.Kw.toFixed(4)}</b></td></tr>
              <tr><td>Inducción Bav</td><td><b>${r.Bav.toFixed(3)} T</b></td></tr>
              <tr><td>Flujo por polo Φ</td><td><b>${(r.Phi*1000).toFixed(3)} mWb</b></td></tr>
            </table>
          </div>

          <!-- Conductor calculado -->
          <div class="rm-card rm-card-green">
            <div class="rm-card-title">🔌 Conductor <small style="color:var(--muted);font-weight:400;">(calculado desde geometría + corriente)</small></div>
            <table class="rm-table">
              <tr><td>Densidad corriente J (clase ${r.ins_class})</td><td><b>${r.J_max.toFixed(1)} A/mm²</b></td></tr>
              <tr><td>Sección requerida por I_fase</td><td><b>${r.A_cond_req.toFixed(4)} mm²</b></td></tr>
              <tr class="rm-highlight"><td>Calibre seleccionado <small>calculado</small></td>
                  <td><b>${wire_label}</b></td></tr>
              <tr><td>Diámetro de cobre</td><td><b>${r.wire.d_mm.toFixed(3)} mm</b></td></tr>
              <tr><td>Diámetro con esmalte Gr.2</td><td><b>${r.wire.d_esm.toFixed(3)} mm</b></td></tr>
              <tr><td>Sección de cobre</td><td><b>${r.wire.area_mm2.toFixed(4)} mm²</b></td></tr>
              <tr><td>Resistencia (20°C)</td><td><b>${r.wire.R_ohm_km.toFixed(1)} Ω/km</b></td></tr>
              ${r.n_paralelo>1?`<tr><td>Conductores en paralelo</td><td><b>${r.n_paralelo}</b></td></tr>`:''}
              <tr class="rm-highlight"><td>Vueltas por bobina (N_c) <small>calculado</small></td>
                  <td><b>${r.N_c}</b></td></tr>
              <tr><td>Vueltas por fase (N_ph)</td><td><b>${r.N_ph}</b></td></tr>
            </table>
          </div>

          <!-- Ranura y llenado -->
          <div class="rm-card rm-card-orange">
            <div class="rm-card-title">📐 Ranura y Llenado</div>
            <table class="rm-table">
              <tr><td>Ancho boca (b1)</td><td><b>${r.b1} mm</b></td></tr>
              <tr><td>Altura boca (h1)</td><td><b>${r.h1} mm</b></td></tr>
              <tr><td>Ancho cuerpo (bw)</td><td><b>${r.bw} mm</b></td></tr>
              <tr><td>Profundidad cuerpo (hw)</td><td><b>${r.hw} mm</b></td></tr>
              <tr><td>Área neta disponible</td><td><b>${r.A_ranura_neta.toFixed(2)} mm²</b></td></tr>
              <tr><td>Conductores en ranura</td><td><b>${r.n_cond_ranura}${r.n_paralelo>1?` × ${r.n_paralelo} = ${r.n_cond_ranura*r.n_paralelo}`:''}</b></td></tr>
              <tr><td>Área cobre en ranura</td><td><b>${r.A_cob_ranura.toFixed(2)} mm²</b></td></tr>
              <tr><td>Factor de llenado Ku</td>
                  <td><b style="color:${Ku_color}">${(r.Ku_real*100).toFixed(1)}%</b>
                  <small style="color:var(--muted)">(óptimo 35–45%)</small></td></tr>
              <tr><td>Longitud media vuelta (MTL)</td><td><b>${(r.MTL*100).toFixed(1)} cm</b></td></tr>
              <tr><td>Long. cabeza de bobina</td><td><b>${(r.l_cab_m*100).toFixed(1)} cm</b></td></tr>
              <tr><td>Resistencia de fase R</td><td><b>${r.R_fase.toFixed(3)} Ω</b></td></tr>
              <tr><td>Pérdidas Cu (Pcu)</td>
                  <td><b>${r.Pcu.toFixed(1)} W
                  <small>(${r.pcu_pct.toFixed(1)}% Pn)</small></b></td></tr>
            </table>
          </div>

          <!-- Material y logística -->
          <div class="rm-card rm-card-cyan">
            <div class="rm-card-title">📦 Material Necesario</div>
            <table class="rm-table">
              <tr><td>Long. hilo por fase</td><td><b>${r.l_fase_m.toFixed(1)} m</b></td></tr>
              <tr><td>Long. hilo total (${r.m} fases)</td><td><b>${r.l_total_m.toFixed(1)} m</b></td></tr>
              <tr><td>Masa de cobre total</td><td><b>${(r.m_Cu_kg*1000).toFixed(0)} g = ${r.m_Cu_kg.toFixed(3)} kg</b></td></tr>
              <tr><td colspan="2" style="padding-top:10px;color:var(--muted);font-size:10px;">Aislante de ranura</td></tr>
              <tr><td>Largo del papel</td><td><b>${r.papel_largo_mm} mm</b></td></tr>
              <tr><td>Ancho del papel</td><td><b>${r.papel_ancho_mm} mm</b></td></tr>
              <tr><td>Cantidad de piezas</td><td><b>${r.Z} piezas</b></td></tr>
            </table>
          </div>

          <!-- Inicio de fases -->
          <div class="rm-card rm-card-red">
            <div class="rm-card-title">🔴 Inserción de Bobinas</div>
            <table class="rm-table">
              ${r.m===3?`
              <tr><td>Fase U (L1) — inicio</td><td><b>Ranura ${r.fase_inicios.U}</b></td></tr>
              <tr><td>Fase V (L2) — inicio</td><td><b>Ranura ${r.fase_inicios.V}</b></td></tr>
              <tr><td>Fase W (L3) — inicio</td><td><b>Ranura ${r.fase_inicios.W}</b></td></tr>
              `:`
              <tr><td>Bobinado principal</td><td><b>Ranura 1</b></td></tr>
              <tr><td>Bobinado auxiliar</td><td><b>Ranura ${Math.round(r.Z/4)+1}</b></td></tr>
              `}
              <tr><td>Paso de inserción</td><td><b>1 – ${r.y+1}</b></td></tr>
              <tr><td>Bobinas por grupo</td><td><b>${r.Nbg.toFixed(1)}</b></td></tr>
              <tr><td>Grupos totales</td><td><b>${r.Ngt}</b></td></tr>
            </table>
          </div>

        </div>

        <!-- Alertas -->
        <div style="margin-top:16px">${alertas_html}</div>

        <!-- Tabla distribución -->
        <div class="rm-card" style="margin-top:16px;">
          <div class="rm-card-title">📋 Tabla de Distribución de Ranuras</div>
          ${_renderTablaRanuras(r)}
        </div>

        <!-- Protocolo -->
        <div class="rm-card" style="margin-top:16px;background:rgba(15,23,42,0.6);">
          <div class="rm-card-title">🔧 Protocolo de Rebobinado</div>
          ${_renderProtocolo(r)}
        </div>`;
    }

    function _renderTablaRanuras(r) {
        if (!r.slotTable) return '';
        const colores = { A:'#ef4444', B:'#3b82f6', C:'#10b981', Aux:'#f59e0b' };
        const nombres = r.m === 3
            ? { A:'U', B:'V', C:'W' }
            : { A:'Ppal', Aux:'Aux' };
        const cols = Math.min(18, r.Z);
        let html = '<div style="overflow-x:auto"><table class="rm-slot-table"><thead><tr>';
        html += '<th style="padding:4px 6px;color:var(--muted);font-size:10px;">#</th>';
        for (let c = 0; c < cols; c++) html += `<th>${c+1}</th>`;
        html += '</tr></thead><tbody>';
        const rows = Math.ceil(r.Z / cols);
        for (let row = 0; row < rows; row++) {
            html += '<tr>';
            const from = row * cols + 1;
            const to   = Math.min(from + cols - 1, r.Z);
            html += `<td style="font-size:9px;color:var(--muted);white-space:nowrap;">${from}–${to}</td>`;
            for (let c = 0; c < cols; c++) {
                const idx = row * cols + c;
                if (idx >= r.Z) { html += '<td></td>'; continue; }
                const s   = r.slotTable[idx];
                const col = colores[s.phase] || '#64748b';
                const nom = nombres[s.phase] || s.phase;
                html += `<td style="background:${col}22;border:1px solid ${col}44;text-align:center;padding:4px 2px;">
                    <span style="color:${col};font-weight:700;font-size:10px;">${nom}</span>
                    <span style="color:#94a3b8;font-size:9px;">${s.dir}</span>
                </td>`;
            }
            html += '</tr>';
        }
        html += '</tbody></table></div>';
        return html;
    }

    function _renderProtocolo(r) {
        const wire_label = r.n_paralelo > 1
            ? `AWG ${r.wire.awg} × ${r.n_paralelo} paralelos (Ø ${r.wire.d_mm.toFixed(3)} mm c/u)`
            : `AWG ${r.wire.awg} (Ø ${r.wire.d_mm.toFixed(3)} mm)`;
        return `<ol class="rm-protocolo">
          <li><b>Registro previo:</b> fotografiar el motor completo antes de desmontar. Marcar posición angular de tapas respecto al estátor con marcador.</li>
          <li><b>Desmontaje:</b> extraer rodamientos. Medir entrehierro con galgas de espesores para registrar la holgura original.</li>
          <li><b>Extracción del bobinado quemado:</b> cortar cabezas con formón y martillo. Extraer conductores con gancho de alambre grueso. <em>Conservar una bobina íntegra si es posible</em> para confeccionar el molde.</li>
          <li><b>Confección del molde:</b> paso calculado <b>1–${r.y+1}</b> (y=${r.y} ranuras). Medir la longitud axial del paquete (${r.L_mm} mm) y la proyección de las cabezas de bobina del motor original.</li>
          <li><b>Limpieza de ranuras:</b> cepillo de acero, navaja y aire comprimido. Verificar que no queden fragmentos metálicos. Limpiar con solvente dieléctrico.</li>
          <li><b>Aislante de ranura:</b> cortar <b>${r.Z} piezas de papel prespan o nomex</b> de <b>${r.papel_largo_mm} mm × ${r.papel_ancho_mm} mm</b>. Doblar 10 mm en cada extremo axial. Insertar y verificar que supera el hierro en ambos lados.</li>
          <li><b>Bobinado:</b> <b>${r.N_c} vueltas/bobina</b> de hilo <b>${wire_label}</b>. Usar la bobinadora con el molde del paso ${r.y}. Cantidad de bobinas: ${r.Nb} totales, ${r.Nbg.toFixed(1)} por grupo.</li>
          <li><b>Inserción — Fase U (L1):</b> comenzar en ranura <b>${r.fase_inicios.U}</b>, paso 1–${r.y+1}. Insertar todos los grupos de la fase U completos.</li>
          ${r.m===3?`<li><b>Inserción — Fase V (L2):</b> ranura <b>${r.fase_inicios.V}</b>, mismo paso. Luego Fase W (L3) desde ranura <b>${r.fase_inicios.W}</b>.</li>`:''}
          <li><b>Cuñar:</b> insertar cuñas de fibra de vidrio o polyester en la boca de cada ranura tras insertar cada bobina. Verificar que los conductores no toquen el hierro.</li>
          <li><b>Conexionado:</b> conexión <b>${r.conexion==='Y'?'Estrella (Y) — unir los 3 extremos finales en un punto neutro':'Triángulo (Δ) — unir inicio de cada fase con el final de la siguiente'}</b>. Verificar con multímetro: continuidad en cada fase, resistencia ≈ ${r.R_fase.toFixed(2)} Ω/fase, aislamiento entre fases y masa > 500 MΩ.</li>
          <li><b>Amarrado de cabezas:</b> atar con cinta de fibra de vidrio o cordón de algodón tratado. Equilibrar las cabezas para centrarlas geométricamente.</li>
          <li><b>Barnizado:</b> impregnación con barniz alquídico o epoxi. Curar en horno: clase ${r.ins_class} → ${({A:'105°C/4h',B:'130°C/4h',F:'155°C/4h',H:'180°C/4h'})[r.ins_class]||'130°C/4h'}.</li>
          <li><b>Pruebas finales:</b>
            <ul style="margin:4px 0 0 16px;line-height:2;">
              <li>Resistencia de aislamiento &gt; 1 MΩ a 500 V DC (megóhmetro)</li>
              <li>Prueba de alta tensión: 2×Vn+1000 V durante 1 minuto</li>
              <li>Resistencia de devanado por fase: ${r.R_fase.toFixed(3)} Ω (± 5%)</li>
              <li>Prueba en vacío: medir I₀ y verificar que ≤ 50% In</li>
            </ul>
          </li>
        </ol>`;
    }

    // ============================================================
    // ASISTENTE
    // ============================================================
    function renderPasos() {
        const cont = document.getElementById('rm-pasos');
        if (!cont) return;
        cont.innerHTML = STEPS.map((s, i) => `
            <div class="rm-paso-item ${i===_step?'activo':i<_step?'completado':''}"
                 onclick="rmIrAPaso(${i})">
                <div class="rm-paso-num">${i<_step?'✓':i+1}</div>
                <div>
                    <div class="rm-paso-icon">${s.icon}</div>
                    <div class="rm-paso-label">${s.title}</div>
                </div>
            </div>`).join('');
    }

    function renderFormulario() {
        const cont = document.getElementById('rm-formulario');
        if (!cont) return;
        const s = STEPS[_step];
        let html = `<div class="rm-form-header">
            <span class="rm-form-icon">${s.icon}</span>
            <div>
                <div class="rm-form-title">${s.title}</div>
                <div class="rm-form-sub">Paso ${_step+1} de ${STEPS.length}</div>
            </div>
        </div>`;
        if      (_step===0) html += _formPlaca();
        else if (_step===1) html += _formEstator();
        else if (_step===2) html += _formRanura();
        else if (_step===3) html += _formCalcular();
        html += `<div class="rm-nav-btns">
            ${_step>0?`<button class="rm-btn rm-btn-sec" onclick="rmPasoAnterior()">← Anterior</button>`:'<div></div>'}
            ${_step<STEPS.length-1
                ?`<button class="rm-btn rm-btn-pri" onclick="rmPasoSiguiente()">Siguiente →</button>`
                :`<button class="rm-btn rm-btn-calc" onclick="rmCalcular()">⚡ CALCULAR</button>`}
        </div>`;
        cont.innerHTML = html;

        // Si estamos en el paso de placa, activar preview en tiempo real
        if (_step === 0) {
            setTimeout(() => {
                rmActualizarPreview();
                cont.addEventListener('input', rmActualizarPreview, { once: false });
            }, 0);
        }
    }

    // ── PASO 0: Datos de Placa ───────────────────────────────────────────────
    function _formPlaca() {
        const d = _data;
        return `
        <div class="rm-tip">💡 Ingrese los datos de la <b>placa de características</b> del motor.
        No se necesitan los datos del bobinado original — el cálculo los deriva completamente.</div>
        <div class="rm-fg2">
          ${_fld('Potencia (HP)', 'rm-hp', d.hp||5, 'number','0.25','0.25','0.25','HP de la placa')}
          ${_fld('Tensión de línea (V)', 'rm-voltaje', d.V||220, 'number','1','1','5','220, 380, 440...')}
        </div>
        <div class="rm-fg2">
          ${_fld('Frecuencia (Hz)', 'rm-freq', d.f||50, 'number','0','1','1','50 o 60')}
          ${_fld('RPM nominales', 'rm-rpm', d.rpm||1440, 'number','0','1','1','Determina el nº de polos')}
        </div>
        <div class="rm-fg2">
          ${_sel('Fases', 'rm-fases', d.m||3, [{v:3,l:'Trifásico (3~)'},{v:1,l:'Monofásico (1~)'}])}
          ${_sel('Conexión', 'rm-conexion', d.conexion||'Y', [{v:'Y',l:'Estrella Y'},{v:'D',l:'Triángulo Δ'}])}
        </div>
        <div class="rm-fg2">
          ${_fld('Factor de potencia cos φ', 'rm-cosfi', d.cosfi||0.85, 'number','0','0.01','0.01','Si no figura en placa: 0.85')}
          ${_fld('Rendimiento η', 'rm-eta', d.eta||0.88, 'number','0','0.01','0.01','Si no figura en placa: 0.88')}
        </div>
        ${_sel('Clase de aislamiento', 'rm-ins', d.ins_class||'B',
            [{v:'A',l:'Clase A — 105°C'},{v:'B',l:'Clase B — 130°C'},{v:'F',l:'Clase F — 155°C'},{v:'H',l:'Clase H — 180°C'}])}

        <!-- Previsualización en tiempo real de valores derivados -->
        <div id="rm-placa-preview" style="margin-top:16px;padding:13px 16px;
             background:#f0f9ff;border:1px solid #bae6fd;border-radius:9px">
          <div style="font-size:.78rem;font-weight:700;color:#0369a1;margin-bottom:10px;
                      text-transform:uppercase;letter-spacing:.04em">
            ⚡ Valores calculados desde placa
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px">
            <div class="rm-prev-item">
              <span class="rm-prev-lbl">Polos estimados</span>
              <b class="rm-prev-val" id="rm-prev-polos">—</b>
            </div>
            <div class="rm-prev-item">
              <span class="rm-prev-lbl">Potencia (kW)</span>
              <b class="rm-prev-val" id="rm-prev-kw">—</b>
            </div>
            <div class="rm-prev-item">
              <span class="rm-prev-lbl">Corriente de línea I<sub>L</sub></span>
              <b class="rm-prev-val" id="rm-prev-iline">—</b>
            </div>
            <div class="rm-prev-item">
              <span class="rm-prev-lbl">Corriente de fase I<sub>f</sub></span>
              <b class="rm-prev-val" id="rm-prev-ifase">—</b>
            </div>
            <div class="rm-prev-item">
              <span class="rm-prev-lbl">Densidad δ estimada</span>
              <b class="rm-prev-val" id="rm-prev-delta">—</b>
            </div>
            <div class="rm-prev-item">
              <span class="rm-prev-lbl">Tensión de fase V<sub>f</sub></span>
              <b class="rm-prev-val" id="rm-prev-vfase">—</b>
            </div>
          </div>
          <div style="font-size:.72rem;color:#64748b;margin-top:8px">
            I = (HP × 746) / (√3 × V × cosφ × η) &nbsp;·&nbsp;
            δ estimada por potencia: ≤10HP→7 A/mm² · 10–50HP→5.5 · &gt;50HP→4.5
          </div>
        </div>`;
    }

    // Actualiza el panel de previsualización de placa en tiempo real
    window.rmActualizarPreview = function () {
        const hp    = parseFloat(document.getElementById('rm-hp')?.value)    || 0;
        const V     = parseFloat(document.getElementById('rm-voltaje')?.value)|| 0;
        const f     = parseFloat(document.getElementById('rm-freq')?.value)   || 50;
        const rpm   = parseFloat(document.getElementById('rm-rpm')?.value)    || 1440;
        const cosfi = parseFloat(document.getElementById('rm-cosfi')?.value)  || 0.85;
        const eta   = parseFloat(document.getElementById('rm-eta')?.value)    || 0.88;
        const m     = parseInt(document.getElementById('rm-fases')?.value)    || 3;
        const conn  = document.getElementById('rm-conexion')?.value           || 'Y';

        const set = (id, v) => { const el = document.getElementById(id); if (el) el.innerHTML = v; };

        if (!hp || !V || !f || !cosfi || !eta) { return; }

        const kW     = hp * 0.7457;
        const I_line = m === 3
            ? (kW * 1000) / (Math.sqrt(3) * V * eta * cosfi)
            : (kW * 1000) / (V * eta * cosfi);
        const I_fase = (m === 3 && conn === 'D') ? I_line / Math.sqrt(3) : I_line;
        const V_fase = (m === 3 && conn === 'Y') ? V / Math.sqrt(3) : V;

        // Densidad de corriente estimada por rango de potencia
        let delta_est;
        if      (hp <= 10) delta_est = 7.0;
        else if (hp <= 50) delta_est = 5.5;
        else               delta_est = 4.5;

        // Polos estimados desde rpm
        const P_est = Math.round(120 * f / rpm);
        const P_def = Math.max(2, Math.min(12, P_est % 2 === 0 ? P_est : P_est + 1));

        set('rm-prev-polos',  `${P_def} polos`);
        set('rm-prev-kw',     `${kW.toFixed(2)} kW`);
        set('rm-prev-iline',  `<span style="color:#0369a1;font-size:1.05em">${I_line.toFixed(2)} A</span>`);
        set('rm-prev-ifase',  `<span style="color:#0369a1;font-size:1.05em">${I_fase.toFixed(2)} A</span>`);
        set('rm-prev-delta',  `${delta_est.toFixed(1)} A/mm²`);
        set('rm-prev-vfase',  `${V_fase.toFixed(1)} V`);
    };

    // ── PASO 1: Geometría del estátor ────────────────────────────────────────
    function _formEstator() {
        const d = _data;
        const rpm_est = d.rpm||1440, f_est = d.f||50;
        const P_est = Math.round(120 * f_est / rpm_est);
        const P_def = Math.max(2, Math.min(12, P_est%2===0 ? P_est : P_est+1));

        // Opciones del selector NEMA según polos sugeridos
        const polRef = (P_def===2) ? 2 : 4;
        const nemaOpts2 = NEMA_DB[2].map((r,i)=>`<option value="2_${i}">${r.hp_label} — ${r.carcasa}</option>`).join('');
        const nemaOpts4 = NEMA_DB[4].map((r,i)=>`<option value="4_${i}">${r.hp_label} — ${r.carcasa}</option>`).join('');

        return `
        <!-- ── Panel de carga NEMA ── -->
        <div class="rm-nema-panel">
          <div class="rm-nema-title">📋 Cargar datos desde tabla NEMA (50 Hz)</div>
          <div class="rm-nema-row">
            <div class="rm-field" style="margin:0;flex:0 0 140px">
              <label>Polos</label>
              <select id="rm-nema-polos" class="rm-input" onchange="rmNemaUpdateOpts()">
                <option value="2" ${polRef===2?'selected':''}>2 Polos ~3000 RPM</option>
                <option value="4" ${polRef===4?'selected':''}>4 Polos ~1500 RPM</option>
              </select>
            </div>
            <div class="rm-field" style="margin:0;flex:1">
              <label>Potencia / Carcasa</label>
              <select id="rm-nema-rango" class="rm-input">
                ${polRef===2 ? nemaOpts2 : nemaOpts4}
              </select>
            </div>
            <button type="button" class="rm-btn-nema" onclick="rmCargarNEMA()">
              ↓ Cargar datos
            </button>
          </div>
          <div id="rm-nema-info" class="rm-nema-info" style="display:none"></div>
        </div>

        <div class="rm-tip" style="margin-top:12px">💡 Mida el estátor con <b>calibre o pie de rey</b>. Cuente las ranuras físicamente.
        Los valores NEMA son de referencia — ajuste según las medidas reales del motor.</div>

        <div class="rm-fg2">
          ${_fld('Nº de ranuras (Z)', 'rm-Z', d.Z||36, 'number','6','1','1','Contar físicamente')}
          ${_fld('Nº de polos (P)', 'rm-P', d.P||P_def, 'number','2','2','2','2=3000, 4=1500, 6=1000 RPM sync')}
        </div>
        <div class="rm-fg2">
          ${_fld('Diám. exterior OD (mm)', 'rm-OD', d.D_ext_mm||200, 'number','20','0.1','1','Corona exterior')}
          ${_fld('Diám. interior ID (mm)', 'rm-ID', d.D_int_mm||130, 'number','10','0.1','1','Entrehierro / bore')}
        </div>
        <div class="rm-fg2">
          ${_fld('Longitud axial L (mm)', 'rm-L', d.L_mm||100, 'number','10','0.5','1','Largo del paquete de chapas')}
          <div class="rm-field">
            <label for="rm-Bav">Inducción Bav (T)
              <span class="rm-hint" title="Densidad de flujo promedio en el entrehierro. Rango típico 0.60–0.90 T.">?</span>
            </label>
            <div class="rm-bav-row">
              <input type="number" id="rm-Bav" value="${d.Bav||0}" min="0" step="0.01" class="rm-input rm-bav-input" placeholder="0 = auto">
              <button type="button" class="rm-btn-bav" onclick="rmCalcBav()" title="Estimar Bav desde geometría">
                ⚡ Calcular
              </button>
            </div>
            <div id="rm-bav-info" class="rm-bav-info" style="display:none"></div>
          </div>
        </div>
        ${_sel('Número de capas', 'rm-capas', d.capas||2,
            [{v:2,l:'2 capas (una bobina activa + pasiva por ranura)'},{v:1,l:'1 capa (solo bobinas activas)'}])}

        <!-- ── Tabla de conexionado NEMA ── -->
        <div class="rm-nema-conn-wrap">
          <div class="rm-nema-title" style="margin-top:20px">🔌 Referencia de Conexionado NEMA</div>
          <div class="rm-fg2" style="margin-top:8px">
            <div class="rm-field" style="margin:0">
              <label>Esquema de terminales</label>
              <select id="rm-conn-sel" class="rm-input" onchange="rmMostrarConexion()">
                <option value="">— seleccionar —</option>
                <optgroup label="9 puntas">
                  <option value="9_Y_baja">Estrella Doble (YY) · Baja tensión</option>
                  <option value="9_Y_alta">Estrella Serie (Y) · Alta tensión</option>
                  <option value="9_D_baja">Triángulo Doble (ΔΔ) · Baja tensión</option>
                  <option value="9_D_alta">Triángulo Serie (Δ) · Alta tensión</option>
                </optgroup>
                <optgroup label="12 puntas">
                  <option value="12_DD">Doble Triángulo (ΔΔ) · Baja tensión</option>
                  <option value="12_YY">Doble Estrella (YY) · Baja tensión</option>
                  <option value="12_D">Triángulo Serie (Δ) · Tensión intermedia</option>
                  <option value="12_Y">Estrella Serie (Y) · Alta tensión</option>
                </optgroup>
              </select>
            </div>
          </div>
          <div id="rm-conn-info" style="display:none;margin-top:8px">
            <table class="rm-conn-table">
              <thead><tr><th>L1</th><th>L2</th><th>L3</th><th>Puentes / Aislar</th></tr></thead>
              <tbody id="rm-conn-tbody"></tbody>
            </table>
            <div class="rm-nema-marcado">
              <b>Marcación NEMA:</b>
              Fase U → T1(ini) T4(fin) T7(ini) T10(fin) &nbsp;|&nbsp;
              Fase V → T2(ini) T5(fin) T8(ini) T11(fin) &nbsp;|&nbsp;
              Fase W → T3(ini) T6(fin) T9(ini) T12(fin)
            </div>
          </div>
        </div>`;
    }

    // ── PASO 2: Geometría de ranura ──────────────────────────────────────────
    function _formRanura() {
        const d = _data;
        // Usar valores precargados desde NEMA si existen
        const b1_def = d.b1 || d._nema_b1 || 3.0;
        const bw_def = d.bw || d._nema_bw || 7.0;
        const hw_def = d.hw || d._nema_hw || 22.0;
        const nema_hint = (d._nema_b1 && !d.b1)
            ? `<div class="rm-nema-info-ok">✓ Datos de ranura precargados desde tabla NEMA — verifique con las medidas reales del motor.</div>`
            : '';
        return `
        ${nema_hint}
        <div class="rm-tip">💡 Mida la ranura con <b>calibre de punta</b> una vez limpia de conductor quemado.
        Estas dimensiones determinan el calibre de hilo y las vueltas por bobina.</div>
        <div class="rm-slot-diagram">
            <svg viewBox="0 0 130 170" width="130" height="170" style="float:right;margin:0 0 12px 16px;">
              <rect x="5" y="5" width="120" height="160" fill="#0f172a" rx="6" stroke="#1e3a5f" stroke-width="1"/>
              <rect x="5" y="5" width="120" height="35" fill="#1e293b" rx="6"/>
              <text x="65" y="27" text-anchor="middle" fill="#64748b" font-size="9" font-family="monospace">Corona (yoke)</text>
              <rect x="5"  y="40" width="35" height="95" fill="#334155"/>
              <rect x="90" y="40" width="35" height="95" fill="#334155"/>
              <rect x="40" y="60" width="50" height="75" fill="#060b18" stroke="#22d3ee" stroke-width="1.5"/>
              <rect x="50" y="135" width="30" height="10" fill="#060b18" stroke="#f59e0b" stroke-width="1" stroke-dasharray="3,2"/>
              <line x1="50" y1="154" x2="80" y2="154" stroke="#f59e0b" stroke-width="1"/>
              <text x="65" y="164" text-anchor="middle" fill="#f59e0b" font-size="9" font-family="monospace">b1</text>
              <line x1="40" y1="90" x2="40" y2="84" stroke="#22d3ee" stroke-width="1"/>
              <line x1="90" y1="90" x2="90" y2="84" stroke="#22d3ee" stroke-width="1"/>
              <line x1="40" y1="87" x2="90" y2="87" stroke="#22d3ee" stroke-width="1"/>
              <text x="65" y="82" text-anchor="middle" fill="#22d3ee" font-size="9" font-family="monospace">bw</text>
              <line x1="97" y1="60"  x2="104" y2="60"  stroke="#a78bfa" stroke-width="1"/>
              <line x1="97" y1="135" x2="104" y2="135" stroke="#a78bfa" stroke-width="1"/>
              <line x1="100" y1="60"  x2="100" y2="135" stroke="#a78bfa" stroke-width="1"/>
              <text x="113" y="101" text-anchor="middle" fill="#a78bfa" font-size="9" font-family="monospace">hw</text>
              <line x1="7" y1="40"  x2="14" y2="40"  stroke="#10b981" stroke-width="1"/>
              <line x1="7" y1="135" x2="14" y2="135" stroke="#10b981" stroke-width="1"/>
              <line x1="10" y1="40" x2="10" y2="135" stroke="#10b981" stroke-width="1"/>
              <text x="10" y="30" text-anchor="middle" fill="#10b981" font-size="7" font-family="monospace" transform="rotate(-90,17,90)">h1</text>
            </svg>
        </div>
        <div class="rm-fg2">
          ${_fld('Ancho de boca b1 (mm)', 'rm-b1', b1_def, 'number','0','0.1','0.1','Apertura hacia el entrehierro')}
          ${_fld('Altura de boca h1 (mm)', 'rm-h1', d.h1||1.5, 'number','0','0.1','0.1','Zona de la cuña')}
        </div>
        <div class="rm-fg2">
          ${_fld('Ancho de cuerpo bw (mm)', 'rm-bw', bw_def, 'number','1','0.1','0.1','Ancho útil de la ranura')}
          ${_fld('Profundidad cuerpo hw (mm)', 'rm-hw', hw_def, 'number','2','0.5','0.5','Profundidad útil de la ranura')}
        </div>
        <div style="clear:both;"></div>`;
    }

    // ── PASO 3: Resumen antes de calcular ─────────────────────────────────────
    function _formCalcular() {
        const d = _data;
        return `
        <div class="rm-tip rm-tip-ok">✅ Datos completos. El cálculo determinará automáticamente:
        <b>paso de bobina, calibre AWG y vueltas por bobina</b> en función de la geometría ingresada.</div>
        <div class="rm-resumen-datos">
          <div class="rm-res-fila"><span>Potencia</span><b>${d.hp||'—'} HP (${((d.hp||0)*0.7457).toFixed(2)} kW)</b></div>
          <div class="rm-res-fila"><span>Tensión / Conexión</span><b>${d.V||'—'} V — ${d.conexion==='Y'?'Estrella (Y)':'Triángulo (Δ)'}</b></div>
          <div class="rm-res-fila"><span>Frecuencia</span><b>${d.f||'—'} Hz</b></div>
          <div class="rm-res-fila"><span>Fases</span><b>${d.m===3?'Trifásico':'Monofásico'}</b></div>
          <div class="rm-res-fila"><span>Ranuras / Polos</span><b>Z = ${d.Z||'—'} / P = ${d.P||'—'}</b></div>
          <div class="rm-res-fila"><span>Diámetros OD / ID</span><b>${d.D_ext_mm||'—'} mm / ${d.D_int_mm||'—'} mm</b></div>
          <div class="rm-res-fila"><span>Longitud axial</span><b>${d.L_mm||'—'} mm</b></div>
          <div class="rm-res-fila"><span>Ranura bw × hw</span><b>${d.bw||'—'} × ${d.hw||'—'} mm</b></div>
          <div class="rm-res-fila"><span>Clase de aislamiento</span><b>${d.ins_class||'B'}</b></div>
          <div class="rm-res-fila"><span>Capas</span><b>${d.capas||2}</b></div>
        </div>`;
    }

    // ── Helpers de formulario ────────────────────────────────────────────────
    function _fld(label, id, val, type, min, step, stepUp, hint) {
        return `<div class="rm-field">
            <label for="${id}">${label}${hint?`<span class="rm-hint" title="${hint}">?</span>`:''}</label>
            <input type="${type||'number'}" id="${id}" value="${val}"
                ${min!==undefined?`min="${min}"`:''}
                ${step?`step="${step}"`:''}
                class="rm-input">
        </div>`;
    }
    function _sel(label, id, val, opts) {
        return `<div class="rm-field">
            <label for="${id}">${label}</label>
            <select id="${id}" class="rm-input">
                ${opts.map(o=>`<option value="${o.v}" ${String(o.v)===String(val)?'selected':''}>${o.l}</option>`).join('')}
            </select>
        </div>`;
    }

    // ── Recoger datos ────────────────────────────────────────────────────────
    function _recogerDatos() {
        const gv = id => { const e=document.getElementById(id); return e?e.value:''; };
        const gn = id => { const v=parseFloat(gv(id)); return isNaN(v)?0:v; };
        const gi = id => { const v=parseInt(gv(id));   return isNaN(v)?0:v; };
        if (_step===0) {
            _data.hp       = gn('rm-hp')      || 5;
            _data.V        = gn('rm-voltaje') || 220;
            _data.f        = gn('rm-freq')    || 50;
            _data.rpm      = gn('rm-rpm')     || 1440;
            _data.m        = gi('rm-fases')   || 3;
            _data.conexion = gv('rm-conexion')|| 'Y';
            _data.cosfi    = gn('rm-cosfi')   || 0.85;
            _data.eta      = gn('rm-eta')     || 0.88;
            _data.ins_class= gv('rm-ins')     || 'B';
        } else if (_step===1) {
            _data.Z        = gi('rm-Z')  || 36;
            _data.P        = gi('rm-P')  || 4;
            _data.D_ext_mm = gn('rm-OD') || 200;
            _data.D_int_mm = gn('rm-ID') || 130;
            _data.L_mm     = gn('rm-L')  || 100;
            _data.Bav      = gn('rm-Bav');          // 0 → calcular automáticamente
            _data.capas    = gi('rm-capas') || 2;
        } else if (_step===2) {
            _data.b1 = gn('rm-b1') || 3;
            _data.h1 = gn('rm-h1') || 1.5;
            _data.bw = gn('rm-bw') || 7;
            _data.hw = gn('rm-hw') || 22;
        }
    }

    // ── Actualizar opciones del selector NEMA al cambiar polos ───────────────
    window.rmNemaUpdateOpts = function () {
        const polos = parseInt(document.getElementById('rm-nema-polos')?.value) || 4;
        const sel   = document.getElementById('rm-nema-rango');
        if (!sel) return;
        sel.innerHTML = NEMA_DB[polos]
            .map((r, i) => `<option value="${polos}_${i}">${r.hp_label} — ${r.carcasa}</option>`)
            .join('');
        document.getElementById('rm-nema-info').style.display = 'none';
    };

    // ── Cargar datos geométricos NEMA en los campos del formulario ────────────
    window.rmCargarNEMA = function () {
        const val = document.getElementById('rm-nema-rango')?.value;
        if (!val) return;
        const [p, idx] = val.split('_').map(Number);
        const row = NEMA_DB[p]?.[idx];
        if (!row) return;

        const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };

        set('rm-Z',  row.Z);
        set('rm-P',  p);
        set('rm-OD', row.D_ext);
        set('rm-ID', row.D_int);
        set('rm-L',  row.L);
        // Ranura — va al paso 2, guardamos en _data para que se precargue
        _data._nema_b1 = row.b1;
        _data._nema_bw = row.bw;
        _data._nema_hw = row.hw;

        const info = document.getElementById('rm-nema-info');
        info.style.display = 'block';
        info.innerHTML =
            `<b>✓ Cargado:</b> Carcasa ${row.carcasa} · ${row.hp_label} · ${p} polos &nbsp;|&nbsp; ` +
            `Z=${row.Z} · OD=${row.D_ext} mm · ID=${row.D_int} mm · L=${row.L} mm &nbsp;|&nbsp; ` +
            `<span style="color:var(--muted)">Ranura (b1=${row.b1} / bw=${row.bw} / hw=${row.hw} mm) ` +
            `→ se precargará en el paso siguiente.</span>`;
    };

    // ── Mostrar tabla de conexionado NEMA ─────────────────────────────────────
    window.rmMostrarConexion = function () {
        const key  = document.getElementById('rm-conn-sel')?.value;
        const wrap = document.getElementById('rm-conn-info');
        const tbody= document.getElementById('rm-conn-tbody');
        if (!key || !wrap || !tbody) return;
        const c = NEMA_CONEXIONES[key];
        if (!c) { wrap.style.display = 'none'; return; }
        tbody.innerHTML = `<tr>
            <td>${c.L1}</td>
            <td>${c.L2}</td>
            <td>${c.L3}</td>
            <td>${c.puentes}</td>
        </tr>`;
        wrap.style.display = 'block';
    };

    // ── Calcular Bav desde geometría (botón inline en paso 1) ────────────────
    window.rmCalcBav = function () {
        const gn = id => { const v = parseFloat(document.getElementById(id)?.value); return isNaN(v) ? 0 : v; };

        const ID_mm = gn('rm-ID');
        const L_mm  = gn('rm-L');
        const P     = parseInt(document.getElementById('rm-P')?.value) || (_data.P || 4);

        if (!ID_mm || !L_mm || !P) {
            const info = document.getElementById('rm-bav-info');
            info.style.display = 'block';
            info.className = 'rm-bav-info rm-bav-warn';
            info.textContent = '⚠ Ingrese primero: Diámetro interior (ID), Longitud (L) y Polos (P).';
            return;
        }

        const ID_m = ID_mm / 1000;
        const L_m  = L_mm  / 1000;

        // Estimación por relación L/D — motores con L/D pequeño tienen Bav más alto
        const ratio_LD = L_m / ID_m;
        const Bav_est  = Math.min(0.88, Math.max(0.58, 0.70 + 0.08 * Math.log(ratio_LD + 1)));

        // Sección del entrehierro por polo
        const tau_m = Math.PI * ID_m / P;         // paso polar en m
        const Sp    = tau_m * L_m;                 // m² por polo

        // Mostrar en el campo
        const input = document.getElementById('rm-Bav');
        input.value = Bav_est.toFixed(3);

        const info = document.getElementById('rm-bav-info');
        info.style.display = 'block';
        info.className = 'rm-bav-info rm-bav-ok';
        info.innerHTML =
            `Bav estimada: <b>${Bav_est.toFixed(3)} T</b> &nbsp;|&nbsp; ` +
            `τm = ${(tau_m*1000).toFixed(1)} mm &nbsp;|&nbsp; ` +
            `Sp/polo = ${(Sp*1e4).toFixed(2)} cm² &nbsp;|&nbsp; ` +
            `L/ID = ${ratio_LD.toFixed(2)}. ` +
            `<span style="color:var(--muted)">Puede ajustar manualmente (rango típico 0.60–0.90 T).</span>`;
    };

    // ── Navegación ───────────────────────────────────────────────────────────
    window.rmPasoSiguiente = function () {
        _recogerDatos();
        if (_step < STEPS.length-1) { _step++; renderPasos(); renderFormulario(); }
    };
    window.rmPasoAnterior = function () {
        if (_step > 0) { _step--; renderPasos(); renderFormulario(); }
    };
    window.rmIrAPaso = function (n) {
        if (n <= _step) { _step = n; renderPasos(); renderFormulario(); }
    };
    window.rmCalcular = function () {
        _recogerDatos();
        try {
            _results = calcular(_data);
            const wrap = document.getElementById('rm-resultados-wrap');
            if (wrap) wrap.classList.remove('hidden');
            renderResultados(_results);
            wrap?.scrollIntoView({ behavior:'smooth' });
        } catch(e) {
            alert('Error en el cálculo: ' + e.message);
            console.error(e);
        }
    };

    (function init() {
        renderPasos();
        renderFormulario();
    }());

})();
