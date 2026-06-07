// ============================================================================
// REWIND.JS — Módulo C: Rebobinado de Transformadores de Red (50/60 Hz)
// ============================================================================

(function () {
    const WINDING_COLORS = ['#ff6b35', '#667eea', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

    // -------------------------------------------------------------------------
    // GESTIÓN DINÁMICA DE SECUNDARIOS
    // -------------------------------------------------------------------------
    let rwSecCount = 1;
    const RW_MAX_SEC = 5;

    window.rwAddSecondary = function () {
        if (rwSecCount >= RW_MAX_SEC) return;
        rwSecCount++;
        const row = document.getElementById(`rwSec${rwSecCount}`);
        if (row) {
            row.style.display = 'block';
            row.querySelector('input').focus();
        }
        document.getElementById('rwAddSecBtn').disabled = rwSecCount >= RW_MAX_SEC;
        _rwClearResults();
    };

    window.rwRemoveSecondary = function (n) {
        if (n <= 1) return;
        // Compactar: desplazar valores de filas posteriores hacia arriba
        for (let i = n; i < rwSecCount; i++) {
            const cur  = document.getElementById(`rwSec${i}`);
            const next = document.getElementById(`rwSec${i + 1}`);
            if (cur && next) {
                cur.querySelector(`#rwVsec${i}V`).value  = next.querySelector(`#rwVsec${i + 1}V`).value;
                cur.querySelector(`#rwVsec${i}P`).value  = next.querySelector(`#rwVsec${i + 1}P`).value;
            }
        }
        const lastRow = document.getElementById(`rwSec${rwSecCount}`);
        if (lastRow) {
            lastRow.style.display = 'none';
            lastRow.querySelectorAll('input').forEach(inp => { inp.value = ''; });
        }
        rwSecCount--;
        document.getElementById('rwAddSecBtn').disabled = rwSecCount >= RW_MAX_SEC;
        _rwClearResults();
    };

    window.rwToggleMode = function () {
        const mode = document.getElementById('rwMode').value;
        const rebFields = document.getElementById('rwRebobinarFields');
        if (rebFields) rebFields.style.display = mode === 'rewind' ? 'block' : 'none';
        _rwClearResults();
    };

    // -------------------------------------------------------------------------
    // VALIDACIÓN COMPLETA DE ENTRADAS
    // Retorna { ok: bool, errors: [], warnings: [] }
    // -------------------------------------------------------------------------
    function _rwValidate(p) {
        const errors   = [];
        const warnings = [];

        // ── Geometría del núcleo ──────────────────────────────────────────────
        if (p.Ae_cm2 <= 0)
            errors.push('La sección del núcleo Ae debe ser mayor que 0.');
        if (p.winArea_cm2 <= 0)
            errors.push('El área de ventana Aw debe ser mayor que 0.');

        // Relación geométrica mínima: la ventana debe ser coherente con la sección
        // Un núcleo típico tiene Aw ≈ 1.0 × Ae … 4 × Ae.
        if (p.Ae_cm2 > 0 && p.winArea_cm2 > 0) {
            const ratio = p.winArea_cm2 / p.Ae_cm2;
            if (ratio < 0.5)
                warnings.push(`Ventana Aw (${p.winArea_cm2.toFixed(1)} cm²) muy pequeña respecto a Ae (${p.Ae_cm2.toFixed(1)} cm²). Relación Aw/Ae = ${ratio.toFixed(2)} — lo típico es ≥ 1.`);
            if (ratio > 10)
                warnings.push(`Relación Aw/Ae = ${ratio.toFixed(1)} parece alta. Verifique las dimensiones.`);
        }

        // ── Frecuencia ────────────────────────────────────────────────────────
        if (p.freq !== 50 && p.freq !== 60)
            errors.push('La frecuencia debe ser 50 Hz o 60 Hz (red eléctrica).');

        // ── Voltaje primario ──────────────────────────────────────────────────
        if (p.Vp <= 0)
            errors.push('El voltaje primario debe ser mayor que 0 V.');
        if (p.Vp > 0 && (p.Vp < 100 || p.Vp > 480))
            warnings.push(`Voltaje primario ${p.Vp} V inusual para red eléctrica (rango típico: 100–480 V).`);

        // ── Modo rebobinar: datos del devanado original ───────────────────────
        if (p.mode === 'rewind') {
            if (p.Vp_orig <= 0)
                errors.push('El voltaje primario original debe ser mayor que 0 V.');
            if (p.Np_orig <= 0)
                errors.push('Las vueltas primarias originales deben ser mayor que 0.');
            // Sanity: la relación debe ser razonable (1–10 V/vuelta)
            if (p.Vp_orig > 0 && p.Np_orig > 0) {
                const vpv_meas = p.Vp_orig / p.Np_orig;
                if (vpv_meas < 0.05)
                    warnings.push(`V/vuelta medido (${vpv_meas.toFixed(4)} V/N) es muy bajo — revise el conteo de vueltas.`);
                if (vpv_meas > 5)
                    warnings.push(`V/vuelta medido (${vpv_meas.toFixed(3)} V/N) es alto — verifique el número de vueltas original.`);
            }
        }

        // ── Secundarios ───────────────────────────────────────────────────────
        if (p.secondaries.length === 0)
            errors.push('Agregue al menos un secundario con voltaje y potencia.');

        p.secondaries.forEach((s, i) => {
            const n = i + 1;
            if (s.Vs <= 0)
                errors.push(`Secundario ${n}: el voltaje debe ser mayor que 0 V.`);
            if (s.Ps <= 0)
                errors.push(`Secundario ${n}: la potencia debe ser mayor que 0 VA.`);

            // Relación de transformación máxima realista: secundario no puede
            // superar 10× el voltaje primario sin un diseño muy especial.
            if (p.Vp > 0 && s.Vs > p.Vp * 10)
                errors.push(`Secundario ${n}: voltaje ${s.Vs} V supera 10× el primario (${p.Vp} V). Relación de transformación irreal.`);

            // Corriente secundaria derivada de potencia/voltaje
            if (s.Vs > 0 && s.Ps > 0) {
                const Is = s.Ps / s.Vs;
                // AWG mínimo en tabla es AWG 10 → 5.26 mm² → ~13 A a 2.5 A/mm²
                const maxAWG10 = awgTable[10].area * 2.5;
                if (Is > maxAWG10)
                    errors.push(`Secundario ${n}: corriente ${Is.toFixed(2)} A excede la capacidad máxima del calibre más grueso disponible (AWG 10, ${maxAWG10.toFixed(1)} A). Divida la carga en varios secundarios.`);
            }
        });

        // ── Compatibilidad núcleo ↔ potencia total ────────────────────────────
        if (p.Ae_cm2 > 0 && p.winArea_cm2 > 0 && p.secondaries.length > 0) {
            // Producto de áreas Ap = Ae × Aw (cm⁴) determina la potencia máxima
            // Para núcleos de acero silicio a 50 Hz:  Pmax ≈ Ap^0.75 × 7.3 kVA
            // (coeficiente estándar de la fórmula de Grossner)
            const Ap_cm4 = p.Ae_cm2 * p.winArea_cm2;
            const Pmax_VA = 7300 * Math.pow(Ap_cm4, 0.75);
            const Ptotal  = p.secondaries.reduce((s, sec) => s + sec.Ps, 0);
            if (Ptotal > Pmax_VA * 1.1)
                errors.push(
                    `La potencia total requerida (${Ptotal.toFixed(0)} VA) supera la capacidad estimada del núcleo ` +
                    `(Ap = ${Ap_cm4.toFixed(1)} cm⁴ → Pmáx ≈ ${Pmax_VA.toFixed(0)} VA). ` +
                    `Aumente Ae o Aw, o reduzca la potencia.`
                );
            else if (Ptotal > Pmax_VA * 0.8)
                warnings.push(
                    `El núcleo opera cerca de su límite (${(Ptotal / Pmax_VA * 100).toFixed(0)}% de Pmáx ≈ ${Pmax_VA.toFixed(0)} VA). ` +
                    `El factor de llenado será alto y la temperatura puede ser elevada.`
                );

            // ── Verificar viabilidad de llenado mediante el método AP ─────────
            // Fórmula de Grossner: AP_requerido = Ptotal / (Ku × Kf × f × Bmax × J)
            // Con: Ku=0.4, Kf=4.44 (onda sinusoidal), J=2.5 A/mm²=2.5e6 A/m²
            const core_v  = coreDatabase[p.coreType] || coreDatabase['silicon_steel'];
            const Bmax_v  = core_v.bsat * 0.7;         // T
            const J_v     = 2.5e6;                      // A/m²
            const Ku_v    = 0.40;
            const Kf_v    = 4.44;
            const Ptotal_ap = p.secondaries.reduce((s, sec) => s + sec.Ps, 0);
            const AP_req  = Ptotal_ap / (Ku_v * Kf_v * p.freq * Bmax_v * J_v); // m⁴
            const AP_avail = (p.Ae_cm2 * 1e-4) * (p.winArea_cm2 * 1e-4);    // m⁴
            const apRatio = AP_req / AP_avail;
            if (apRatio > 1.3)
                errors.push(
                    `Núcleo insuficiente: AP requerido ${(AP_req * 1e4).toFixed(2)} cm⁴ > ` +
                    `AP disponible ${(AP_avail * 1e4).toFixed(2)} cm⁴ (relación ${apRatio.toFixed(2)}×). ` +
                    `Aumente Ae o Aw, o reduzca la potencia total.`
                );
            else if (apRatio > 0.8)
                warnings.push(
                    `El núcleo opera cerca de su límite AP (${(apRatio * 100).toFixed(0)}% utilizado). ` +
                    `El factor de llenado será alto (Ku > 35%).`
                );
        }

        return { ok: errors.length === 0, errors, warnings };
    }

    // -------------------------------------------------------------------------
    // CÁLCULO PRINCIPAL
    // -------------------------------------------------------------------------
    window.calculateRewind = function () {
        // ── Leer entradas ─────────────────────────────────────────────────────
        const coreType    = document.getElementById('rwCoreType').value;
        const Ae_cm2      = parseFloat(document.getElementById('rwAe').value);
        const winArea_cm2 = parseFloat(document.getElementById('rwWindowArea').value);
        const freq        = parseFloat(document.getElementById('rwFreq').value) || 50;
        const Vp          = parseFloat(document.getElementById('rwVprimary').value);
        const mode        = document.getElementById('rwMode').value;

        let Vp_orig = 0, Np_orig = 0;
        if (mode === 'rewind') {
            Vp_orig = parseFloat(document.getElementById('rwOriginalV').value);
            Np_orig = parseInt(document.getElementById('rwOriginalN').value);
        }

        // Recoger secundarios activos
        const secondaries = [];
        for (let i = 1; i <= RW_MAX_SEC; i++) {
            const row = document.getElementById(`rwSec${i}`);
            if (!row || row.style.display === 'none') continue;
            const Vs = parseFloat(document.getElementById(`rwVsec${i}V`)?.value);
            const Ps = parseFloat(document.getElementById(`rwVsec${i}P`)?.value);
            if (Vs > 0 && Ps > 0) secondaries.push({ Vs, Ps, index: i });
        }

        // ── Validación ────────────────────────────────────────────────────────
        const params = { coreType, Ae_cm2, winArea_cm2, freq, Vp, mode, Vp_orig, Np_orig, secondaries };
        const val    = _rwValidate(params);

        if (!val.ok) {
            _rwShowValidation(val.errors, val.warnings);
            return;
        }

        // ── Núcleo y geometría ────────────────────────────────────────────────
        const core    = coreDatabase[coreType] || coreDatabase['silicon_steel'];
        const Ae      = Ae_cm2 * 1e-4;       // m²
        const Aw      = winArea_cm2 * 1e-4;  // m²
        // Leer overrides de corrección automática (data attributes del campo Ae)
        const aeEl        = document.getElementById('rwAe');
        const bmaxFactor  = parseFloat(aeEl?.dataset.bmaxFactor) || 0.70;
        const jOverride   = parseFloat(aeEl?.dataset.jOverride)  || 0;
        const Bmax        = core.bsat * bmaxFactor;

        // Longitud del camino magnético medio para núcleo laminado EI
        // le ≈ 2 × (a + b) donde a = b = √Ae → le = 4√Ae
        // Con factor de forma real ≈ π/2 para sección rectangular ≈ cuadrada:
        const le = Math.PI * Math.sqrt(Ae) * 2; // m

        // Turno medio: vuelta rodea la columna central cuadrada de lado √Ae_cm2
        // Perímetro = 4 × lado, más 20% de holgura por solapamiento de capas
        const colSide_m = Math.sqrt(Ae_cm2) / 100; // m
        const meanTurn  = 4 * colSide_m * 1.2;     // m/vuelta

        // ── V por vuelta ──────────────────────────────────────────────────────
        let vpv;
        if (mode === 'rewind') {
            // Medición directa del transformador existente
            vpv = Vp_orig / Np_orig; // V/vuelta real
        } else {
            // Fórmula de Faraday para diseño desde cero:
            // E = 4.44 × f × N × Bmax × Ae → vpv = E/N = 4.44 × f × Bmax × Ae
            vpv = 4.44 * freq * Bmax * Ae; // V/vuelta
        }

        if (vpv <= 0 || !isFinite(vpv)) {
            _rwShowError('No se pudo calcular V/vuelta. Verifique Ae, frecuencia y Bmax del material.');
            return;
        }

        // ── Vueltas ───────────────────────────────────────────────────────────
        // Primario: redondear hacia arriba para no superar Bmax
        const Np = Math.ceil(Vp / vpv);

        // Verificación cruzada: con Np calculado, ¿cuál es el B real?
        const Breal = Vp / (4.44 * freq * Np * Ae);
        if (Breal > core.bsat)
            _rwShowError(`B real (${(Breal * 1000).toFixed(0)} mT) supera Bsat del material (${(core.bsat * 1000).toFixed(0)} mT). Aumente Ae.`);

        // ── Corriente primaria ────────────────────────────────────────────────
        const eta    = 0.90; // eficiencia típica de transformadores de red
        const Ptotal = secondaries.reduce((s, sec) => s + sec.Ps, 0);
        const Ip     = Ptotal / (Vp * eta);

        // ── Devanados ─────────────────────────────────────────────────────────
        // Densidad de corriente: 2.5 A/mm² base; la corrección automática puede subirla
        const J_red = jOverride > 0 ? jOverride : 2.5; // A/mm²
        const windings = [];

        // Primario
        const awgP  = selectWireGaugeOptimal(Ip, J_red);
        const wireP = awgTable[awgP];
        windings.push({
            name:       'Primario',
            N:          Np,
            V:          Vp,
            I:          Ip,
            awg:        awgP,
            wire:       wireP,
            wireLength: Np * meanTurn,       // m
            color:      WINDING_COLORS[0],
            Jreal:      Ip / wireP.area,     // A/mm²
            R_dc:       (CONSTANTS.copperResistivity * Np * meanTurn) / (wireP.area * 1e-6) // Ω
        });

        // Secundarios — +5% vueltas para compensar caída de tensión en carga
        secondaries.forEach((sec, idx) => {
            const Ns    = Math.ceil((sec.Vs / vpv) * 1.05);
            const Is    = sec.Ps / sec.Vs;
            const awgS  = selectWireGaugeOptimal(Is, J_red);
            const wireS = awgTable[awgS];
            const R_dc  = (CONSTANTS.copperResistivity * Ns * meanTurn) / (wireS.area * 1e-6);
            // Caída de tensión real en secundario bajo carga plena
            const Vdrop = Is * R_dc;
            const Vout_real = sec.Vs - Vdrop; // voltaje real en bornes con carga

            windings.push({
                name:       `Secundario ${idx + 1}`,
                N:          Ns,
                V:          sec.Vs,
                I:          Is,
                awg:        awgS,
                wire:       wireS,
                wireLength: Ns * meanTurn,
                color:      WINDING_COLORS[idx + 1] || '#aaa',
                Jreal:      Is / wireS.area,
                R_dc,
                Vdrop,
                Vout_real
            });
        });

        // ── Factor de llenado ─────────────────────────────────────────────────
        // Trabajar en mm² uniformemente: area del cable en mm², ventana en mm²
        // wire.diameter está en mm → area conductor = π × (d/2)²  [mm²]
        // +15% de factor de aislamiento de esmalte y relleno entre vueltas
        const Aw_mm2 = winArea_cm2 * 100; // 1 cm² = 100 mm²
        let totalCopperArea_mm2 = 0;
        windings.forEach(w => {
            const r_mm = w.wire.diameter / 2; // mm
            totalCopperArea_mm2 += w.N * Math.PI * r_mm * r_mm * 1.15;
        });
        // Ku: fracción real de ventana ocupada por cobre (incluye esmalte).
        // Límite práctico ≈ 0.40 para bobinado manual, 0.55 con máquina.
        const Ku = totalCopperArea_mm2 / Aw_mm2;
        const fillFactor = Ku * 100; // %

        // ── Pérdidas en cobre ─────────────────────────────────────────────────
        let Pcu = 0;
        windings.forEach(w => {
            Pcu += w.I * w.I * w.R_dc;
        });

        // ── Pérdidas en núcleo — Ley de Steinmetz generalizada ───────────────
        // Pfe = loss_ref × (Bmax/loss_bref)^β × (freq/loss_fref)^α × Vol_cm³ / 1000
        // loss en mW/cm³ a (loss_bref, loss_fref); β y α del datasheet del material.
        const Bref_core  = core.loss_bref  || 1.0;
        const fRef_core  = core.loss_fref  || freq;
        const beta_core  = core.steinmetz_beta  || 2.0;
        const alpha_core = core.steinmetz_alpha || 1.4;
        const coreVolume_cm3 = (Ae * le) * 1e6; // m³ → cm³
        const Pfe = core.loss
            * Math.pow(Bmax / Bref_core, beta_core)
            * Math.pow(freq / fRef_core, alpha_core)
            * coreVolume_cm3 / 1000; // W

        // ── Regulación de voltaje por secundario ──────────────────────────────
        // Reg% = (V_vacio - V_carga) / V_vacio × 100
        windings.slice(1).forEach(w => {
            w.regulation = (w.Vdrop / w.V) * 100;
        });

        // ── Eficiencia real ───────────────────────────────────────────────────
        const efficiencyReal = (Ptotal / (Ptotal + Pcu + Pfe)) * 100;

        // ── Elevación de temperatura ──────────────────────────────────────────
        // Superficie estimada como prisma rectangular con base ≈ OD del bobinado.
        // Lado de columna en cm = √Ae_cm2; núcleo EI ocupa ~3× ese lado total.
        // Cada cara: (3×lado)²; 6 caras → superficie total en cm² → m²
        const ladoCm    = Math.sqrt(Ae_cm2);         // cm
        const transDim  = 3 * ladoCm / 100;          // m (dimensión exterior aprox)
        const surfaceArea = 6 * transDim * transDim; // m²
        // Convección natural: ~8 W/(m²·°C) para objetos pequeños
        const deltaT = (Pcu + Pfe) / (Math.max(surfaceArea, 0.002) * 8);

        // ── Verificaciones post-cálculo ───────────────────────────────────────
        const postWarnings = [...val.warnings];
        if (Breal > core.bsat * 0.85)
            postWarnings.push(`Densidad de flujo real (${(Breal * 1000).toFixed(0)} mT) supera el 85% de Bsat. Riesgo de saturación bajo picos de corriente.`);
        if (fillFactor > 60)
            postWarnings.push(`Factor de llenado (${fillFactor.toFixed(1)}%) alto — el bobinado será difícil. Considere un núcleo mayor.`);
        if (deltaT > 40)
            postWarnings.push(`Elevación de temperatura estimada (${deltaT.toFixed(0)} °C) elevada. Agregue ventilación o reduzca la potencia.`);

        // ── Empaquetado de resultados ─────────────────────────────────────────
        const results = {
            vpv, Np, Breal, windings, Ptotal, Ip, Ae_cm2, winArea_cm2, Bmax,
            core, fillFactor, Ku, Pcu, Pfe, totalLoss: Pcu + Pfe,
            efficiencyReal, deltaT, freq, Vp, le, meanTurn,
            postWarnings, mode
        };

        _lastResults = results; // cache para corrección automática
        displayRewindResults(results);
        drawRewindCrossSection(results);

        // Guardar diseño (solo cuando no hay errores)
        savedDesigns.push({
            timestamp: new Date().toISOString(),
            type: 'rewind',
            data: { coreType, Ae_cm2, winArea_cm2, freq, Vp, mode,
                    secondaries: secondaries.map(s => ({ Vs: s.Vs, Ps: s.Ps })) }
        });
        try { localStorage.setItem('inductorDesigns', JSON.stringify(savedDesigns)); } catch (_) {}
        if (typeof showToast === 'function') showToast('Diseño calculado y guardado', 'success');
    };

    // -------------------------------------------------------------------------
    // CORRECCIÓN AUTOMÁTICA
    // Lee los resultados del último cálculo y ajusta los campos del formulario
    // para hacer el diseño viable, luego recalcula.
    // -------------------------------------------------------------------------
    let _lastResults = null; // cache del último resultado

    window.rwAutoFix = function () {
        if (!_lastResults) {
            if (typeof showToast === 'function') showToast('Calcule primero el transformador', 'warning');
            return;
        }

        const r       = _lastResults;
        const fixes   = [];
        let   changed = false;

        // ── Parámetros de trabajo actuales ────────────────────────────────────
        let Ae_cm2      = r.Ae_cm2;
        let winArea_cm2 = r.winArea_cm2;
        let J           = 2.5; // A/mm² — densidad de corriente de partida
        let Bmax_factor = 0.70; // fracción de Bsat usada en el diseño

        const core   = r.core;
        const freq   = r.freq;
        const Vp     = r.Vp;
        const Ptotal = r.Ptotal;

        // ── FIX 1: B real > 85% Bsat → necesita más Ae ───────────────────────
        // Ae_min para que Bmax sea ≤ 75% Bsat con el Np real
        if (r.Breal > core.bsat * 0.85) {
            const Ae_min_m2 = Vp / (4.44 * freq * r.Np * core.bsat * 0.75);
            const Ae_min    = Ae_min_m2 * 1e4; // m² → cm²
            if (Ae_min > Ae_cm2) {
                Ae_cm2 = Math.ceil(Ae_min * 10) / 10; // redondear hacia arriba en 0.1
                fixes.push(`Ae aumentado a ${Ae_cm2.toFixed(1)} cm² (B real > 85% Bsat)`);
                changed = true;
            }
        }

        // ── FIX 2: AP insuficiente → aumentar Ae y/o Aw ──────────────────────
        // AP_req = Ptotal / (Ku × Kf × f × Bmax × J)  [m⁴]
        // Si AP disponible < AP requerido, escalar ambas dimensiones
        const Bmax_v   = core.bsat * Bmax_factor;
        const AP_req   = Ptotal / (0.40 * 4.44 * freq * Bmax_v * J * 1e6); // m⁴
        const AP_avail = (Ae_cm2 * 1e-4) * (winArea_cm2 * 1e-4);
        if (AP_avail < AP_req * 1.05) {
            // Escalar AP manteniendo la relación Aw/Ae original
            const ratio   = winArea_cm2 / Ae_cm2;
            // AP_new = Ae_new × (ratio × Ae_new) = ratio × Ae_new²
            const Ae_new  = Math.sqrt(AP_req * 1.05 / ratio) * 1e2; // m → cm
            const Aw_new  = Ae_new * ratio;
            if (Ae_new > Ae_cm2 || Aw_new > winArea_cm2) {
                Ae_cm2      = Math.ceil(Ae_new * 10) / 10;
                winArea_cm2 = Math.ceil(Aw_new * 10) / 10;
                fixes.push(`Ae ajustado a ${Ae_cm2.toFixed(1)} cm² y Aw a ${winArea_cm2.toFixed(1)} cm² (AP insuficiente)`);
                changed = true;
            }
        }

        // ── FIX 3: Factor de llenado Ku > 0.40 ───────────────────────────────
        // Estrategia: primero subir J hasta 3.5 A/mm² (cables más finos, más vueltas caben)
        // Si aún es insuficiente, calcular el Aw mínimo real y actualizar.
        if (r.Ku > 0.40) {
            // Intentar con J = 3.5 A/mm² para estimar si el llenado baja a < 0.40
            const J_try = 3.5;
            const Ae_m2 = Ae_cm2 * 1e-4;
            const vpv   = 4.44 * freq * core.bsat * Bmax_factor * Ae_m2;
            const Np    = Math.ceil(Vp / vpv);
            const Ip    = Ptotal / (Vp * 0.9);

            let totalArea_mm2 = 0;

            // Estimación de área de cobre con J aumentada
            const awgP_new = selectWireGaugeOptimal(Ip, J_try);
            const dP = awgTable[awgP_new].diameter;
            totalArea_mm2 += Np * Math.PI * (dP / 2) * (dP / 2) * 1.15;

            r.windings.slice(1).forEach(w => {
                const awgS_new = selectWireGaugeOptimal(w.I, J_try);
                const dS = awgTable[awgS_new].diameter;
                totalArea_mm2 += w.N * Math.PI * (dS / 2) * (dS / 2) * 1.15;
            });

            const Aw_mm2_cur  = winArea_cm2 * 100;
            const Ku_est      = totalArea_mm2 / Aw_mm2_cur;

            if (Ku_est <= 0.40) {
                // Subir J a 3.5 es suficiente — no tocar Aw, se aplica al calcular
                fixes.push(`Densidad de corriente aumentada a ${J_try} A/mm² — Ku estimado: ${(Ku_est * 100).toFixed(1)}%`);
                J = J_try;
                // Escribir en un campo oculto de J para que calculateRewind lo use
                // Como no hay campo de J en el form, lo guardamos en un data attribute
                document.getElementById('rwAe').dataset.jOverride = J_try;
                changed = true;
            } else {
                // Subir J no es suficiente: calcular Aw mínimo para Ku = 0.38
                const Aw_min_mm2 = totalArea_mm2 / 0.38;
                const Aw_min_cm2 = Math.ceil(Aw_min_mm2 / 100 * 10) / 10; // redondear 0.1
                if (Aw_min_cm2 > winArea_cm2) {
                    winArea_cm2 = Aw_min_cm2;
                    J = J_try;
                    document.getElementById('rwAe').dataset.jOverride = J_try;
                    fixes.push(`Aw aumentado a ${winArea_cm2.toFixed(1)} cm² con J = ${J_try} A/mm² (Ku → ~38%)`);
                    changed = true;
                }
            }
        } else {
            // Limpiar override si el Ku ya era bueno
            delete document.getElementById('rwAe').dataset.jOverride;
        }

        // ── FIX 4: ΔT > 40 °C → reducir Bmax al 60% para bajar Pfe ──────────
        if (r.deltaT > 40 && Bmax_factor > 0.60) {
            Bmax_factor = 0.60;
            fixes.push(`Bmax reducido al 60% de Bsat para bajar pérdidas en núcleo (ΔT > 40 °C)`);
            changed = true;
        }

        if (!changed) {
            if (typeof showToast === 'function') showToast('El diseño ya es viable — no hay correcciones necesarias', 'info');
            return;
        }

        // ── Aplicar al formulario ─────────────────────────────────────────────
        document.getElementById('rwAe').value         = Ae_cm2.toFixed(1);
        document.getElementById('rwWindowArea').value = winArea_cm2.toFixed(1);
        // Guardar Bmax_factor para que calculateRewind lo lea
        document.getElementById('rwAe').dataset.bmaxFactor = Bmax_factor;

        // ── Mostrar resumen de correcciones ───────────────────────────────────
        const resEl = document.getElementById('rwResults');
        if (resEl) {
            resEl.innerHTML = `
                <div class="validation-warnings" style="margin-bottom:16px">
                    <div class="validation-title warning" style="color:#a5b4fc">🔧 Correcciones aplicadas — recalculando…</div>
                    ${fixes.map(f => `<div class="validation-message">✓ ${f}</div>`).join('')}
                </div>`;
        }

        // Recalcular con los nuevos valores
        setTimeout(window.calculateRewind, 120);
    };

    // -------------------------------------------------------------------------
    // MOSTRAR VALIDACIÓN
    // -------------------------------------------------------------------------
    function _rwShowValidation(errors, warnings) {
        const c = document.getElementById('rwResults');
        if (!c) return;
        let html = '';
        if (errors.length) {
            html += `<div class="validation-errors">
                <div class="validation-title error">❌ Errores — corrija antes de calcular</div>
                ${errors.map(e => `<div class="validation-message">• ${e}</div>`).join('')}
            </div>`;
        }
        if (warnings.length) {
            html += `<div class="validation-warnings">
                <div class="validation-title warning">⚠️ Advertencias</div>
                ${warnings.map(w => `<div class="validation-message">• ${w}</div>`).join('')}
            </div>`;
        }
        c.innerHTML = html;
    }

    function _rwShowError(msg) {
        const c = document.getElementById('rwResults');
        if (c) c.innerHTML = `<div class="result-item error"><div class="result-label">❌ Error de cálculo</div><div class="result-value">${msg}</div></div>`;
    }

    function _rwClearResults() {
        const c = document.getElementById('rwResults');
        if (c) c.innerHTML = '<p class="placeholder-text">Configure los parámetros y presione "Calcular Rebobinado"</p>';
    }

    // -------------------------------------------------------------------------
    // MOSTRAR RESULTADOS
    // -------------------------------------------------------------------------
    function displayRewindResults(r) {
        const container = document.getElementById('rwResults');
        if (!container) return;

        let html = '';

        // Advertencias post-cálculo al tope
        const hasIssues = r.postWarnings.length > 0 || r.Ku > 0.40 || r.deltaT > 40 || r.Breal > r.core.bsat * 0.85;
        if (r.postWarnings.length) {
            html += `<div class="validation-warnings" style="margin-bottom:8px">
                <div class="validation-title warning">⚠️ Advertencias del diseño</div>
                ${r.postWarnings.map(w => `<div class="validation-message">• ${w}</div>`).join('')}
            </div>`;
        }
        if (hasIssues) {
            html += `<button onclick="window.rwAutoFix()" class="btn-autofix">
                🔧 Corregir Automáticamente
            </button>`;
        }

        html += '<div class="result-grid">';

        // ── Núcleo ────────────────────────────────────────────────────────────
        html += _rwHeader('NÚCLEO MAGNÉTICO');
        html += createResultItem('Material', r.core.name, '');
        html += createResultItem('Sección Ae', r.Ae_cm2.toFixed(2), 'cm²');
        html += createResultItem('Ventana Aw', r.winArea_cm2.toFixed(2), 'cm²');
        html += createResultItem('Producto Ap = Ae×Aw', (r.Ae_cm2 * r.winArea_cm2).toFixed(2), 'cm⁴');
        html += createResultItem('Bmax diseño', (r.Bmax * 1000).toFixed(1), 'mT');
        html += createResultItem('B real (plena carga)', (r.Breal * 1000).toFixed(1), 'mT',
            r.Breal > r.core.bsat * 0.85 ? 'error' : r.Breal > r.core.bsat * 0.7 ? 'warning' : 'success');
        html += createResultItem('V por Vuelta', r.vpv.toFixed(4), 'V/N');
        html += createResultItem('le camino magnético', (r.le * 100).toFixed(1), 'cm');
        html += createResultItem('Turno medio', (r.meanTurn * 100).toFixed(1), 'cm/N');

        // ── Devanados ─────────────────────────────────────────────────────────
        html += _rwHeader('DEVANADOS');
        r.windings.forEach(w => {
            html += createResultItem(`Vueltas — ${w.name}`, w.N, 'N');
            html += createResultItem(`Corriente — ${w.name}`, w.I.toFixed(3), 'A');
            html += createResultItem(`J real — ${w.name}`, w.Jreal.toFixed(2), 'A/mm²',
                w.Jreal > 3.5 ? 'error' : w.Jreal > 2.5 ? 'warning' : 'success');
            html += createResultItem(`Cable — ${w.name}`, `AWG ${w.awg}`, '');
            html += createResultItem(`Ø cable — ${w.name}`, w.wire.diameter.toFixed(3), 'mm');
            html += createResultItem(`Long. cable — ${w.name}`, (w.wireLength * 100).toFixed(0), 'cm');
            html += createResultItem(`R DC — ${w.name}`, w.R_dc.toFixed(3), 'Ω');
            if (w.Vdrop !== undefined) {
                html += createResultItem(`Caída V — ${w.name}`, w.Vdrop.toFixed(3), 'V',
                    w.Vdrop / w.V > 0.08 ? 'error' : w.Vdrop / w.V > 0.04 ? 'warning' : 'success');
                html += createResultItem(`V real en bornes — ${w.name}`, w.Vout_real.toFixed(3), 'V');
                html += createResultItem(`Regulación — ${w.name}`, w.regulation.toFixed(2), '%',
                    w.regulation > 8 ? 'error' : w.regulation > 4 ? 'warning' : 'success');
            }
        });

        // ── Potencia y pérdidas ───────────────────────────────────────────────
        html += _rwHeader('POTENCIA Y PÉRDIDAS');
        html += createResultItem('Potencia total salida', r.Ptotal.toFixed(1), 'VA');
        html += createResultItem('Pérdidas Cu (cobre)', r.Pcu.toFixed(3), 'W');
        html += createResultItem('Pérdidas Fe (núcleo)', r.Pfe.toFixed(3), 'W');
        html += createResultItem('Pérdidas totales', r.totalLoss.toFixed(3), 'W');
        html += createResultItem('Eficiencia real', r.efficiencyReal.toFixed(1), '%',
            r.efficiencyReal >= 90 ? 'success' : r.efficiencyReal >= 80 ? 'warning' : 'error');

        // ── Factor de llenado y temperatura ───────────────────────────────────
        html += _rwHeader('FACTOR DE LLENADO Y TEMPERATURA');
        html += createResultItem('Ku (factor utilización)', r.Ku.toFixed(3), '',
            r.Ku > 0.55 ? 'error' : r.Ku > 0.40 ? 'warning' : 'success');
        html += createResultItem('Llenado ventana', r.fillFactor.toFixed(1), '%',
            r.fillFactor > 55 ? 'error' : r.fillFactor > 40 ? 'warning' : 'success');
        html += createResultItem('ΔT elevación', r.deltaT.toFixed(1), '°C',
            r.deltaT > 50 ? 'error' : r.deltaT > 35 ? 'warning' : 'success');

        html += '</div>';

        // ── Tabla de instrucciones ─────────────────────────────────────────────
        html += `<h3 style="margin:20px 0 10px;color:#a5b4fc;">Tabla de Bobinado</h3>`;
        html += `<table class="winding-table"><thead><tr>
            <th>Devanado</th><th>Vueltas</th><th>AWG</th><th>Ø (mm)</th>
            <th>Cable (cm)</th><th>I (A)</th><th>J (A/mm²)</th><th>R DC (Ω)</th>
        </tr></thead><tbody>`;
        r.windings.forEach((w, i) => {
            const cls = i === 0 ? 'wt-primary' : 'wt-secondary';
            html += `<tr class="${cls}">
                <td><strong>${w.name}</strong></td>
                <td>${w.N}</td>
                <td>AWG ${w.awg}</td>
                <td>${w.wire.diameter.toFixed(3)}</td>
                <td>${(w.wireLength * 100).toFixed(0)}</td>
                <td>${w.I.toFixed(3)}</td>
                <td>${w.Jreal.toFixed(2)}</td>
                <td>${w.R_dc.toFixed(3)}</td>
            </tr>`;
        });
        html += '</tbody></table>';

        // ── Pasos narrativos ───────────────────────────────────────────────────
        html += `<h3 style="margin:20px 0 10px;color:#a5b4fc;">Instrucciones de Bobinado</h3>`;
        html += '<ol class="winding-steps">';
        html += `<li>Limpiar el núcleo. Medir y verificar Ae ≈ ${r.Ae_cm2.toFixed(1)} cm² y Aw ≈ ${r.winArea_cm2.toFixed(1)} cm².</li>`;
        html += `<li>Aplicar cinta base al núcleo (1–2 capas de cinta de mylar de 0.05 mm) para proteger el esmalte del cable.</li>`;
        html += `<li>Bobinar primario: <strong>${r.windings[0].N} vueltas</strong> de <strong>AWG ${r.windings[0].awg}</strong> (Ø ${r.windings[0].wire.diameter.toFixed(3)} mm). Cable total: ${(r.windings[0].wireLength * 100).toFixed(0)} cm. Bobinar en capas uniformes, compactas y sin cruces. Terminar con cinta de mylar (mínimo 2 capas de 0.1 mm) como aislamiento entre primario y secundarios.</li>`;
        r.windings.slice(1).forEach((w, i) => {
            const reg = w.regulation?.toFixed(1) ?? '—';
            html += `<li>Bobinar <strong>${w.name}</strong>: <strong>${w.N} vueltas</strong> de <strong>AWG ${w.awg}</strong> (Ø ${w.wire.diameter.toFixed(3)} mm). Cable: ${(w.wireLength * 100).toFixed(0)} cm. Tensión diseño: ${w.V} V — tensión real en bornes bajo carga: ${w.Vout_real?.toFixed(2) ?? '—'} V (regulación ${reg}%)${i < r.windings.length - 2 ? '. Intercalar cinta de aislamiento antes del siguiente secundario.' : '.'}</li>`;
        });
        html += `<li>Factor de llenado total: ${r.fillFactor.toFixed(1)}% de la ventana (Ku = ${r.Ku.toFixed(3)})${r.fillFactor > 40 ? ' — ajuste el bobinado compactando cada capa.' : ' — correcto.'}</li>`;
        html += `<li>Medir resistencia DC de cada devanado con ohmímetro y comparar con los valores calculados (±15% aceptable).</li>`;
        html += `<li>Conectar al voltaje primario <strong>sin carga</strong>. Medir voltajes en vacío de cada secundario. Deben coincidir con el valor de diseño (${r.windings[0].V} V → ≈ ${r.windings.slice(1).map(w => w.V + ' V').join(', ')}).</li>`;
        html += `<li>Conectar carga nominal y re-medir. La caída de tensión esperada está calculada arriba (regulación por secundario).</li>`;
        html += '</ol>';

        if (r.fillFactor > 55) {
            html += `<div class="result-item error" style="margin-top:16px">
                <div class="result-label">⚠️ FACTOR DE LLENADO EXCESIVO (${r.fillFactor.toFixed(1)}%)</div>
                <div class="result-value">Aw mínimo recomendado: ${(r.winArea_cm2 * r.fillFactor / 40).toFixed(1)} cm². Use el botón "Corregir Automáticamente" arriba.</div>
            </div>`;
        }

        container.innerHTML = html;
    }

    function _rwHeader(text) {
        return `<div style="grid-column:1/-1;background:linear-gradient(135deg,#667eea,#764ba2);
            color:white;padding:10px;border-radius:8px;font-weight:bold;
            text-align:center;margin-top:10px">${text}</div>`;
    }

    // -------------------------------------------------------------------------
    // CANVAS: SECCIÓN TRANSVERSAL CON CAPAS
    // -------------------------------------------------------------------------
    function drawRewindCrossSection(r) {
        const canvas = document.getElementById('rwCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.offsetWidth || 520;
        if (canvas.width !== W) canvas.width = W;
        if (canvas.height !== 400) canvas.height = 400;

        ctx.clearRect(0, 0, W, 400);
        // Fondo oscuro
        ctx.fillStyle = 'rgba(15,12,41,0.7)';
        ctx.fillRect(0, 0, W, 400);

        const cx     = W / 2;
        const cy     = 185;
        const coreW  = 52;
        const coreH  = 160;
        const winH   = coreH - 8;
        const layerT = 16; // grosor de cada capa de devanado
        const gap    = 3;  // espacio entre capas

        // ── Núcleo (columna central) ──────────────────────────────────────────
        const coreColor = r.core.color || '#8B7355';
        ctx.fillStyle = coreColor;
        ctx.beginPath();
        ctx.roundRect(cx - coreW / 2, cy - coreH / 2, coreW, coreH, 4);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Etiqueta del núcleo
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(r.core.name.split(' ').slice(0, 2).join(' '), cx, cy - 4);
        ctx.font = '9px Arial';
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.fillText(`Ae=${r.Ae_cm2.toFixed(1)}cm²`, cx, cy + 10);

        // ── Devanados ─────────────────────────────────────────────────────────
        r.windings.forEach((w, i) => {
            const offset = coreW / 2 + gap + i * (layerT + gap);
            const alpha  = i === 0 ? 'dd' : 'bb'; // primario más opaco

            // Capa izquierda
            ctx.fillStyle = w.color + alpha;
            ctx.beginPath();
            ctx.roundRect(cx - offset - layerT, cy - winH / 2, layerT, winH, 2);
            ctx.fill();
            ctx.strokeStyle = w.color;
            ctx.lineWidth = 1;
            ctx.stroke();

            // Capa derecha (espejo)
            ctx.fillStyle = w.color + alpha;
            ctx.beginPath();
            ctx.roundRect(cx + offset, cy - winH / 2, layerT, winH, 2);
            ctx.fill();
            ctx.strokeStyle = w.color;
            ctx.stroke();

            // Etiqueta vueltas y AWG encima de la capa derecha
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.font = 'bold 9px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`${w.N}N`, cx + offset + layerT / 2, cy - winH / 2 - 10);
            ctx.font = '8px Arial';
            ctx.fillStyle = 'rgba(255,255,255,0.65)';
            ctx.fillText(`AWG${w.awg}`, cx + offset + layerT / 2, cy - winH / 2 - 1);
        });

        // ── Leyenda inferior ──────────────────────────────────────────────────
        const legendY  = cy + coreH / 2 + 22;
        const itemW    = Math.min(130, (W - 20) / r.windings.length);
        r.windings.forEach((w, i) => {
            const lx = 10 + i * itemW;
            ctx.fillStyle = w.color;
            ctx.fillRect(lx, legendY, 10, 10);
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.font = '9px Arial';
            ctx.textAlign = 'left';
            const label = `${w.name} (${w.I.toFixed(2)}A, AWG ${w.awg})`;
            ctx.fillText(label.length > 20 ? label.slice(0, 19) + '…' : label, lx + 13, legendY + 9);
        });

        // ── Factor de llenado visual (barra) ──────────────────────────────────
        const barY   = legendY + 26;
        const barW   = W - 40;
        const fillPx = Math.min(barW, barW * r.fillFactor / 100);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath(); ctx.roundRect(20, barY, barW, 12, 6); ctx.fill();
        const barColor = r.fillFactor > 55 ? '#ef4444' : r.fillFactor > 40 ? '#f59e0b' : '#10b981';
        ctx.fillStyle = barColor;
        ctx.beginPath(); ctx.roundRect(20, barY, fillPx, 12, 6); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = 'bold 9px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Ku = ${r.Ku.toFixed(3)}  (${r.fillFactor.toFixed(1)}% ventana)`, W / 2, barY + 9);
    }

})(); // fin IIFE
