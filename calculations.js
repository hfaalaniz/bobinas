// ============================================================================
// CALCULATIONS.JS - Sistema de Cálculo de Inductores y Transformadores
// ============================================================================

// ============================================================================
// FUNCIONES DE CONVERSIÓN
// ============================================================================

/**
 * Convierte valores de inductancia a Henrios
 * @param {number} value - Valor a convertir
 * @param {string} unit - Unidad origen (uH, mH, H)
 * @returns {number} Valor en Henrios
 */
function convertToHenry(value, unit) {
    const conversions = {
        'uH': 1e-6,
        'mH': 1e-3,
        'H': 1
    };
    return value * (conversions[unit] || 1);
}

// ============================================================================
// CÁLCULOS DE INDUCTORES
// ============================================================================

/**
 * Calcula inductor con núcleo de aire
 * @param {number} L - Inductancia en Henrios
 * @param {number} I - Corriente en Amperios
 * @param {number} wireGauge - Calibre AWG del cable
 * @param {number} coilDiameter - Diámetro de la bobina en mm
 * @param {number} coilLength - Longitud de la bobina en mm
 * @returns {Object} Resultados del cálculo
 */
function calculateAirCoreInductor(L, I, wireGauge, coilDiameter, coilLength) {
    const wire = awgTable[wireGauge];
    if (!wire) throw new Error('Calibre AWG no válido');
    
    const d = coilDiameter / 1000; // Convertir a metros
    const l = coilLength / 1000;
    
    // Fórmula de Wheeler para bobinas de una capa
    const N = Math.sqrt((L * (d + l * 0.9)) / (CONSTANTS.mu0 * Math.pow(d/2, 2)));
    const turns = Math.ceil(N);
    
    // Longitud del cable
    const wireLength = turns * Math.PI * d;
    
    // Resistencia DC
    const resistance = (CONSTANTS.copperResistivity * wireLength) / (wire.area * 1e-6);
    
    // Densidad de corriente
    const currentDensity = I / (wire.area * 1e-6);
    
    // Pérdidas
    const copperLoss = I * I * resistance;
    
    // Peso
    const weight = wireLength * wire.area * 1e-6 * CONSTANTS.copperDensity * 1000;
    
    return {
        turns,
        wireLength: wireLength * 1000, // mm
        resistance,
        inductance: L,
        coreLoss: 0,
        copperLoss,
        totalLoss: copperLoss,
        currentDensity,
        wireDiameter: wire.diameter,
        weight,
        voltage: I * resistance,
        saturation: false,
        fillFactor: 0,
        maxCurrent: I * 2 // Estimación conservadora
    };
}

/**
 * Calcula inductor con núcleo toroidal
 * @param {number} L - Inductancia en Henrios
 * @param {number} I - Corriente en Amperios
 * @param {string} coreType - Tipo de núcleo
 * @param {number} wireGauge - Calibre AWG del cable
 * @param {number} od - Diámetro exterior del toroide en mm
 * @param {number} id - Diámetro interior del toroide en mm
 * @param {number} h - Altura del toroide en mm
 * @param {number} customMu - Permeabilidad personalizada (opcional)
 * @returns {Object} Resultados del cálculo
 */
function calculateToroidInductor(L, I, coreType, wireGauge, od, id, h, customMu, freq) {
    const core = coreDatabase[coreType];
    if (!core) throw new Error('Tipo de núcleo no válido');

    const wire = awgTable[wireGauge];
    if (!wire) throw new Error('Calibre AWG no válido');

    if (od <= id) throw new Error('El diámetro exterior debe ser mayor que el interior');
    if (od <= 0 || id <= 0 || h <= 0) throw new Error('Las dimensiones del toroide deben ser positivas');

    // customMu válido solo si es un número finito > 0
    const mu_r = (typeof customMu === 'number' && isFinite(customMu) && customMu > 0) ? customMu : core.mu_r;

    // Frecuencia: parámetro explícito o fallback a la referencia del material (para inductor DC, 50Hz)
    const freqHz = (typeof freq === 'number' && isFinite(freq) && freq > 0)
        ? freq
        : (core.loss_fref || 50);

    // Parámetros geométricos (convertir a metros)
    const OD = od / 1000;
    const ID = id / 1000;
    const H  = h  / 1000;

    // Sección transversal del núcleo: ancho = (OD - ID) / 2, alto = H
    const Ae = ((OD - ID) / 2) * H; // m²

    // Longitud media del camino magnético (por el centro de la sección)
    const le = Math.PI * (OD + ID) / 2; // m

    // Factor AL (H/N²)
    const AL = (CONSTANTS.mu0 * mu_r * Ae) / le;

    // Número de vueltas necesarias
    const turns = Math.ceil(Math.sqrt(L / AL));

    // Inductancia real
    const actualL = AL * turns * turns;

    // Densidad de flujo: B = mu0 * mu_r * N * I / le
    const B = (CONSTANTS.mu0 * mu_r * turns * I) / le;

    // Verificar saturación
    const saturationLevel = core.bsat > 0 ? (B / core.bsat) * 100 : 0;
    const isSaturated = B > core.bsat * 0.9;

    // Longitud media de una vuelta sobre el toroide (perímetro de la sección + gap externo)
    // Aproximación estándar: π × (OD + ID) / 2 — igual a le — es válida para toroide rectangular
    // La longitud de cable por vuelta es la longitud del lazo que rodea la sección del núcleo:
    // = perímetro de la sección rectangular = 2 × (ancho + alto) = 2 × ((OD-ID)/2 + H)
    const sectionPerimeter = 2 * ((OD - ID) / 2 + H); // m por vuelta
    const wireLength = turns * sectionPerimeter;       // m total

    // Resistencia DC
    const resistance = (CONSTANTS.copperResistivity * wireLength) / (wire.area * 1e-6);

    // Densidad de corriente (A/m²)
    const currentDensity = I / (wire.area * 1e-6);

    // Pérdidas en el cobre
    const copperLoss = I * I * resistance;

    // Pérdidas en el núcleo — Steinmetz generalizado
    const volume   = Ae * le; // m³
    const vol_cm3  = volume * 1e6;
    const Bref_c   = core.loss_bref       || 1.0;
    const fRef_c   = core.loss_fref       || 50;
    const beta_c   = core.steinmetz_beta  || 2.0;
    const alpha_c  = core.steinmetz_alpha || 1.4;
    const coreLoss = core.loss
        * Math.pow(B    / Bref_c, beta_c)
        * Math.pow(freqHz / fRef_c, alpha_c)
        * vol_cm3 / 1000; // W

    // Factor de llenado — área disponible = ventana interior del toroide
    // Para un toroide, la ventana es el agujero circular interior: π × (ID/2)²
    const windowArea = Math.PI * Math.pow(ID / 2, 2); // m²
    // Área de cobre por vuelta (sección circular del hilo con factor de apilamiento 1.1)
    const wireArea_m2 = Math.PI * Math.pow((wire.diameter / 1000) / 2, 2); // m²
    const usedArea  = turns * wireArea_m2 * 1.1; // factor 1.1 por aislante
    const fillFactor = (usedArea / windowArea) * 100;

    // Corriente máxima antes de saturación (despejando I de B = mu0*mu_r*N*I/le)
    const maxCurrent = core.bsat > 0
        ? (core.bsat * 0.9 * le) / (CONSTANTS.mu0 * mu_r * turns)
        : I * 2;

    // Peso total
    const copperWeight = wireLength * wire.area * 1e-6 * CONSTANTS.copperDensity;
    const coreWeight   = volume * 5000; // kg/m³ densidad típica núcleo magnético
    const weight       = (copperWeight + coreWeight) * 1000; // g

    return {
        turns,
        wireLength: wireLength * 1000, // mm
        resistance,
        inductance: actualL,
        coreLoss,
        copperLoss,
        totalLoss: coreLoss + copperLoss,
        currentDensity,
        wireDiameter: wire.diameter,
        weight,
        voltage: I * resistance,
        saturation: isSaturated,
        saturationLevel,
        B_field: B,
        fillFactor,
        maxCurrent,
        AL_factor: AL * 1e9, // nH/N²
        coreVolume: volume * 1e6 // cm³
    };
}

// ============================================================================
// OPTIMIZACIÓN DE INDUCTOR — corrige entradas para hacerlo viable
// ============================================================================

window.optimizeInductor = function () {
    const coreType = document.getElementById('coreType').value;
    if (coreType === 'air') {
        showToast('La optimización automática aplica solo a núcleos magnéticos.', 'info');
        return;
    }

    const core = coreDatabase[coreType];
    const L    = convertToHenry(
        parseFloat(document.getElementById('inductance').value) || 100,
        document.getElementById('inductanceUnit').value || 'mH'
    );
    const I    = parseFloat(document.getElementById('current').value)    || 1;
    let   od   = parseFloat(document.getElementById('toroidOD').value)   || 30;
    let   id   = parseFloat(document.getElementById('toroidID').value)   || 15;
    let   h    = parseFloat(document.getElementById('toroidHeight').value)|| 10;
    let   awg  = parseInt(document.getElementById('wireGauge').value)    || 20;

    if (!core) { showToast('Material de núcleo no reconocido.', 'error'); return; }

    const mu0  = CONSTANTS.mu0;
    const mu_r = core.mu_r;
    const bsat = core.bsat;
    const awgList = [10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,32,34,36,38,40];
    const B_LIMIT  = 0.80; // apuntar a ≤ 80 % Bsat
    const FF_MAX   = 0.70; // factor de llenado máximo 70 %
    const J_MAX    = 5.0;  // densidad de corriente máxima A/mm²

    const log = [];
    let changed = false;

    // ── Función auxiliar de un cálculo rápido ──────────────────────────────
    function quick(od_m, id_m, h_m, awg_) {
        const Ae  = ((od_m - id_m) / 2) * h_m;
        const le  = Math.PI * (od_m + id_m) / 2;
        const AL  = mu0 * mu_r * Ae / le;
        const N   = Math.ceil(Math.sqrt(L / AL));
        const B   = mu0 * mu_r * N * I / le;
        const win = Math.PI * Math.pow(id_m / 2, 2);
        const wd  = awgTable[awg_] ? awgTable[awg_].diameter / 1000 : 0.001;
        const fill= N * Math.PI * Math.pow(wd / 2, 2) * 1.1 / win;
        const J   = I / (awgTable[awg_] ? awgTable[awg_].area * 1e-6 : 1e-6); // A/m²
        return { Ae, le, AL, N, B, fill, J_Am2: J };
    }

    // ── PASO 1: saturación — escalar núcleo ────────────────────────────────
    let r = quick(od/1000, id/1000, h/1000, awg);
    if (r.B > bsat * B_LIMIT) {
        // Mantener proporciones originales; escalar factor k hasta B ≤ 80% Bsat
        // B = mu0*mu_r*N*I/le; le ∝ k; N ∝ 1/sqrt(k³) → B ∝ 1/k^2.5 aprox
        // Iteramos en pasos de 5 mm de OD
        const od0 = od, id0 = id, h0 = h;
        let found = false;
        for (let step = 5; od + step <= 400; step += 5) {
            const od2 = od0 + step;
            const k   = od2 / od0;
            const id2 = id0 * k;
            const h2  = h0  * k;
            r = quick(od2/1000, id2/1000, h2/1000, awg);
            if (r.B <= bsat * B_LIMIT) {
                log.push(`Núcleo escalado: OD ${od0}→${od2.toFixed(0)} mm, ID ${id0}→${id2.toFixed(0)} mm, h ${h0}→${h2.toFixed(0)} mm (sat. ${(r.B/bsat*100).toFixed(0)}%)`);
                od = od2; id = id2; h = h2;
                changed = true;
                found = true;
                break;
            }
        }
        if (!found) {
            // Si escalar sola no es suficiente en rango razonable, intentar escalar más
            // y/o sugerir cambio de material (pero aún aplicar el mejor hallado)
            const od2 = od0 + 370;
            const k   = od2 / od0;
            od = od2; id = id0 * k; h = h0 * k;
            r  = quick(od/1000, id/1000, h/1000, awg);
            log.push(`Núcleo muy grande necesario: OD ${od.toFixed(0)} mm — considere cambiar el material del núcleo.`);
            changed = true;
        }
    }

    // ── PASO 2: factor de llenado — cable más fino ─────────────────────────
    r = quick(od/1000, id/1000, h/1000, awg);
    if (r.fill > FF_MAX) {
        let found = false;
        for (let i = awgList.indexOf(awg) + 1; i < awgList.length; i++) {
            const awg2 = awgList[i];
            const r2   = quick(od/1000, id/1000, h/1000, awg2);
            if (r2.fill <= FF_MAX) {
                log.push(`Calibre ajustado: AWG ${awg} → AWG ${awg2} (llenado ${(r2.fill*100).toFixed(0)}%)`);
                awg = awg2;
                changed = true;
                found = true;
                break;
            }
        }
        if (!found) {
            // Si el llenado sigue alto con el cable más fino, escalar núcleo un poco más
            for (let step = 5; step <= 100; step += 5) {
                const od2 = od + step;
                const k   = od2 / od;
                const id2 = id * k, h2 = h * k;
                const r2  = quick(od2/1000, id2/1000, h2/1000, awg);
                if (r2.fill <= FF_MAX && r2.B <= bsat * B_LIMIT) {
                    log.push(`Núcleo reescalado por llenado: OD → ${od2.toFixed(0)} mm`);
                    od = od2; id = id2; h = h2;
                    changed = true;
                    break;
                }
            }
        }
    }

    // ── PASO 3: densidad de corriente — cable más grueso ───────────────────
    r = quick(od/1000, id/1000, h/1000, awg);
    const J_mm2 = r.J_Am2 / 1e6;
    if (J_mm2 > J_MAX) {
        for (let i = awgList.indexOf(awg) - 1; i >= 0; i--) {
            const awg2 = awgList[i];
            const r2   = quick(od/1000, id/1000, h/1000, awg2);
            if (r2.J_Am2 / 1e6 <= J_MAX) {
                log.push(`Calibre aumentado por densidad de corriente: AWG ${awg} → AWG ${awg2}`);
                awg = awg2;
                changed = true;
                break;
            }
        }
    }

    if (!changed) {
        showToast('El diseño ya es viable. No se requieren correcciones.', 'success');
        return;
    }

    // ── Aplicar valores corregidos al formulario ───────────────────────────
    document.getElementById('toroidOD').value    = Math.round(od);
    document.getElementById('toroidID').value    = Math.round(id);
    document.getElementById('toroidHeight').value= Math.round(h);
    document.getElementById('wireGauge').value   = awg;

    // Ejecutar cálculo con los nuevos valores
    setTimeout(() => {
        calculateInductor();
        // Mostrar log de cambios
        const logHtml = log.map(l => `<li>${l}</li>`).join('');
        const notice  = document.createElement('div');
        notice.style.cssText = 'margin-top:12px;padding:12px 14px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:8px;font-size:13px;color:#fcd34d;';
        notice.innerHTML = `<strong style="display:block;margin-bottom:6px;">🔧 Parámetros corregidos automáticamente:</strong><ul style="margin:0;padding-left:18px;line-height:1.8;">${logHtml}</ul>`;
        const res = document.getElementById('results');
        if (res) res.prepend(notice);
    }, 60);
};

// ============================================================================
// FUNCIÓN PRINCIPAL DE CÁLCULO DE INDUCTOR
// ============================================================================

/**
 * Función principal de cálculo de inductor
 */
function calculateInductor() {
    try {
        // Obtener valores de entrada
        const coreType = document.getElementById('coreType').value;
        const inductanceValue = parseFloat(document.getElementById('inductance').value);
        const inductanceUnit = document.getElementById('inductanceUnit').value;
        const current = parseFloat(document.getElementById('current').value);
        const wireGauge = parseInt(document.getElementById('wireGauge').value) || 20;
        
        // Validar entradas
        if (isNaN(inductanceValue) || inductanceValue <= 0) {
            throw new Error('Valor de inductancia inválido');
        }
        if (isNaN(current) || current <= 0) {
            throw new Error('Valor de corriente inválido');
        }
        
        const L = convertToHenry(inductanceValue, inductanceUnit);
        let results;
        
        if (coreType === 'air') {
            const coilDiameter = parseFloat(document.getElementById('coilDiameter').value) || 20;
            const coilLength = parseFloat(document.getElementById('coilLength').value) || 30;
            results = calculateAirCoreInductor(L, current, wireGauge, coilDiameter, coilLength);
        } else {
            const od = parseFloat(document.getElementById('toroidOD').value) || 30;
            const id = parseFloat(document.getElementById('toroidID').value) || 15;
            const h = parseFloat(document.getElementById('toroidHeight').value) || 10;
            const customMu = parseFloat(document.getElementById('permeability').value);
            const freq = 50; // inductores DC/baja frecuencia; referencia Steinmetz
            results = calculateToroidInductor(L, current, coreType, wireGauge, od, id, h, customMu, freq);
        }
        
        displayResults(results, coreType);
        
        // Llamar a funciones de visualización si existen
        if (typeof drawCoil === 'function') {
            drawCoil(results, coreType);
        }
        if (typeof drawBHCurve === 'function') {
            drawBHCurve(coreType, results.B_field || 0);
        }
        
    } catch (error) {
        console.error('Error en cálculo:', error);
        document.getElementById('results').innerHTML = `
            <div class="result-item error">
                <div class="result-label">❌ Error</div>
                <div class="result-value">${error.message}</div>
            </div>
        `;
    }
}

// ============================================================================
// VISUALIZACIÓN DE RESULTADOS - INDUCTOR
// ============================================================================

/**
 * Muestra los resultados del cálculo de inductor
 * @param {Object} results - Resultados del cálculo
 * @param {string} coreType - Tipo de núcleo
 */
function displayResults(results, coreType) {
    const core = coreDatabase[coreType];
    let html = '<div class="result-grid">';
    
    // === SECCIÓN: RESULTADOS BÁSICOS ===
    html += '<div style="grid-column: 1/-1; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 10px; border-radius: 8px; font-weight: bold; text-align: center;">ESPECIFICACIONES BÁSICAS</div>';
    
    html += createResultItem('Número de Vueltas', results.turns.toFixed(0), 'N');
    html += createResultItem('Inductancia Real', (results.inductance * 1e3).toFixed(2), 'mH');
    html += createResultItem('Longitud de Cable', results.wireLength.toFixed(2), 'mm');
    html += createResultItem('Diámetro de Cable', results.wireDiameter.toFixed(3), 'mm');
    
    // === SECCIÓN: PARÁMETROS ELÉCTRICOS ===
    html += '<div style="grid-column: 1/-1; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 10px; border-radius: 8px; font-weight: bold; text-align: center; margin-top: 15px;">PARÁMETROS ELÉCTRICOS</div>';
    
    html += createResultItem('Resistencia DC', results.resistance.toFixed(3), 'Ω');
    html += createResultItem('Caída de Tensión', results.voltage.toFixed(3), 'V');
    html += createResultItem('Densidad de Corriente', (results.currentDensity / 1e6).toFixed(2), 'A/mm²', 
        results.currentDensity > CONSTANTS.maxCurrentDensity ? 'warning' : 'success');
    
    // === SECCIÓN: PÉRDIDAS ===
    html += '<div style="grid-column: 1/-1; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 10px; border-radius: 8px; font-weight: bold; text-align: center; margin-top: 15px;">PÉRDIDAS</div>';
    
    html += createResultItem('Pérdidas en Cobre', results.copperLoss.toFixed(3), 'W');
    
    if (coreType !== 'air') {
        html += createResultItem('Pérdidas en Núcleo', results.coreLoss.toFixed(3), 'W');
    }
    
    html += createResultItem('Pérdidas Totales', results.totalLoss.toFixed(3), 'W');
    
    // === SECCIÓN: INFORMACIÓN DEL NÚCLEO ===
    if (coreType !== 'air') {
        html += '<div style="grid-column: 1/-1; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 10px; border-radius: 8px; font-weight: bold; text-align: center; margin-top: 15px;">INFORMACIÓN DEL NÚCLEO</div>';
        
        html += createResultItem('Campo Magnético (B)', (results.B_field * 1000).toFixed(2), 'mT');
        const satStatus = results.saturationLevel >= 90 ? 'error' : results.saturationLevel >= 70 ? 'warning' : 'success';
        html += createResultItem('Nivel de Saturación', results.saturationLevel.toFixed(1), '%', satStatus);
        html += createResultItem('Corriente Máxima', results.maxCurrent.toFixed(2), 'A');
        html += createResultItem('Factor de Llenado', results.fillFactor.toFixed(1), '%',
            results.fillFactor > 80 ? 'warning' : 'success');
        html += createResultItem('Factor AL', results.AL_factor.toFixed(2), 'nH/N²');
        html += createResultItem('Volumen del Núcleo', results.coreVolume.toFixed(2), 'cm³');
    }
    
    html += createResultItem('Peso Estimado', results.weight.toFixed(2), 'g');
    html += createResultItem('Material del Núcleo', core.name, '');
    
    html += '</div>';
    
    // === ADVERTENCIAS ===
    if (results.saturationLevel >= 90) {
        html += `<div class="result-item error" style="margin-top: 20px;">
            <div class="result-label">⚠️ ADVERTENCIA: SATURACIÓN</div>
            <div class="result-value">El núcleo está saturado. Reduzca la corriente o use un núcleo más grande.</div>
        </div>`;
    } else if (results.saturationLevel >= 70) {
        html += `<div class="result-item warning" style="margin-top: 20px;">
            <div class="result-label">⚠️ PRECAUCIÓN: SATURACIÓN PRÓXIMA</div>
            <div class="result-value">El núcleo está al ${results.saturationLevel.toFixed(1)}% de saturación. Considere reducir la corriente o usar un núcleo más grande.</div>
        </div>`;
    }
    
    if (results.currentDensity > CONSTANTS.maxCurrentDensity) {
        html += `<div class="result-item warning" style="margin-top: 20px;">
            <div class="result-label">⚠️ ADVERTENCIA: DENSIDAD DE CORRIENTE ALTA</div>
            <div class="result-value">La densidad de corriente es muy alta. Considere usar un cable más grueso (AWG menor).</div>
        </div>`;
    }
    
    if (results.fillFactor > 80 && coreType !== 'air') {
        html += `<div class="result-item warning" style="margin-top: 20px;">
            <div class="result-label">⚠️ ADVERTENCIA: FACTOR DE LLENADO ALTO</div>
            <div class="result-value">El factor de llenado es muy alto. Será difícil bobinar el cable.</div>
        </div>`;
    }
    
    document.getElementById('results').innerHTML = html;
}

/**
 * Crea un elemento de resultado individual
 * @param {string} label - Etiqueta del resultado
 * @param {string} value - Valor del resultado
 * @param {string} unit - Unidad del resultado
 * @param {string} type - Tipo de resultado (success, warning, error)
 * @returns {string} HTML del elemento
 */
function createResultItem(label, value, unit, type = '') {
    return `
        <div class="result-item ${type}">
            <div class="result-label">${label}</div>
            <div class="result-value">${value} ${unit}</div>
        </div>
    `;
}

// ============================================================================
// CÁLCULOS DE TRANSFORMADORES
// ============================================================================

/**
 * Calcula un transformador con método profesional
 */
function calculateTransformer() {
    try {
        // Obtener valores de entrada
        const coreType = document.getElementById('transCore').value;
        const vPrimary = parseFloat(document.getElementById('vPrimary').value);
        const vSecondary = parseFloat(document.getElementById('vSecondary').value);
        const iSecondary = parseFloat(document.getElementById('iSecondary').value);
        const frequency = parseFloat(document.getElementById('frequency').value);
        const efficiency = parseFloat(document.getElementById('efficiency').value) / 100;
        
        // Validar entradas
        if (isNaN(vPrimary) || vPrimary <= 0) throw new Error('Voltaje primario inválido');
        if (isNaN(vSecondary) || vSecondary <= 0) throw new Error('Voltaje secundario inválido');
        if (isNaN(iSecondary) || iSecondary <= 0) throw new Error('Corriente secundaria inválida');
        if (isNaN(frequency) || frequency <= 0) throw new Error('Frecuencia inválida');
        
        const core = coreDatabase[coreType];
        
        // === PASO 1: CÁLCULOS DE POTENCIA ===
        const powerOut = vSecondary * iSecondary; // Potencia de salida (W)
        const powerIn = powerOut / efficiency; // Potencia de entrada (W)
        const iPrimary = powerIn / vPrimary; // Corriente primaria (A)
        
        // === PASO 2: RELACIÓN DE TRANSFORMACIÓN ===
        const turnsRatio = vPrimary / vSecondary;
        
        // === PASO 3: DENSIDAD DE FLUJO ÓPTIMA ===
        let Bmax;
        if (frequency >= 10000) {
            Bmax = core.bsat * 0.25; // Alta frecuencia
        } else if (frequency >= 400) {
            Bmax = core.bsat * 0.5; // Frecuencia media
        } else {
            Bmax = core.bsat * 0.7; // Baja frecuencia (50/60 Hz)
        }
        
        // === PASO 4: ÁREA DEL NÚCLEO ===
        const Kf = 4.44; // Factor de forma para onda senoidal
        const J  = 3e6;  // Densidad de corriente: 3 A/mm²
        const Ku = 0.4;  // Factor de utilización de ventana (40%)

        // Si el usuario ingresó dimensiones físicas del núcleo, úsalas directamente.
        // De lo contrario calcular Ae desde la potencia (método de producto de áreas).
        const odRaw = parseFloat(document.getElementById('transOD')?.value);
        const idRaw = parseFloat(document.getElementById('transID')?.value);
        const hRaw  = parseFloat(document.getElementById('transHeight')?.value);
        const hasPhysical = odRaw > 0 && idRaw > 0 && hRaw > 0 && odRaw > idRaw;

        let Ae, Ae_cm2;
        if (hasPhysical) {
            // Núcleo toroidal físico conocido
            const OD = odRaw / 1000; // m
            const ID = idRaw / 1000;
            const H  = hRaw  / 1000;
            Ae    = ((OD - ID) / 2) * H;   // m²
            Ae_cm2 = Ae * 1e4;              // cm²
        } else {
            // Producto de áreas desde potencia
            const PT = powerOut * 2.2;
            const Ap = PT / (2 * Kf * frequency * Bmax * J * Ku);
            Ae    = Math.sqrt(Ap / 2);
            Ae_cm2 = Ae * 1e4;
        }

        // === PASO 5: NÚMERO DE VUELTAS ===
        const nPrimary = Math.ceil((vPrimary * 1e8) / (Kf * frequency * Bmax * Ae_cm2));
        const nSecondary = Math.ceil(nPrimary / turnsRatio);
        
        // Ajuste por caída de tensión
        const voltageDropFactor = 1.05;
        const nSecondaryAdjusted = Math.ceil(nSecondary * voltageDropFactor);
        
        // === PASO 6: SELECCIÓN DE CALIBRES AWG ===
        const awgPrimary = selectWireGaugeOptimal(iPrimary, J / 1e6);
        const awgSecondary = selectWireGaugeOptimal(iSecondary, J / 1e6);
        
        // === PASO 7: LONGITUD DE CABLES ===
        const coreDimension = Math.sqrt(Ae_cm2);
        const meanTurnLength = (coreDimension * 4) * 1.2;
        const wireLengthPrimary = nPrimary * meanTurnLength;
        const wireLengthSecondary = nSecondaryAdjusted * meanTurnLength;
        
        // === PASO 8: RESISTENCIAS DC ===
        const wirePrimary = awgTable[awgPrimary];
        const wireSecondary = awgTable[awgSecondary];
        
        const resistancePrimary = (CONSTANTS.copperResistivity * wireLengthPrimary / 100) / (wirePrimary.area * 1e-6);
        const resistanceSecondary = (CONSTANTS.copperResistivity * wireLengthSecondary / 100) / (wireSecondary.area * 1e-6);
        const resistanceTotal = resistancePrimary + (resistanceSecondary * Math.pow(turnsRatio, 2));
        
        // === PASO 9: PÉRDIDAS EN EL COBRE ===
        const copperLossPrimary = Math.pow(iPrimary, 2) * resistancePrimary;
        const copperLossSecondary = Math.pow(iSecondary, 2) * resistanceSecondary;
        const totalCopperLoss = copperLossPrimary + copperLossSecondary;
        
        // === PASO 10: PÉRDIDAS EN EL NÚCLEO — Steinmetz generalizado ===
        const coreVolume  = Ae * (Math.PI * coreDimension / 100); // m³
        const coreVol_cm3 = coreVolume * 1e6;
        const Bref_t  = core.loss_bref  || 1.0;
        const fRef_t  = core.loss_fref  || frequency;
        const beta_t  = core.steinmetz_beta  || 2.0;
        const alpha_t = core.steinmetz_alpha || 1.4;
        const coreLoss = core.loss
            * Math.pow(Bmax / Bref_t, beta_t)
            * Math.pow(frequency / fRef_t, alpha_t)
            * coreVol_cm3 / 1000; // W
        
        // === PASO 11: EFICIENCIA REAL ===
        const totalLoss = totalCopperLoss + coreLoss;
        const efficiencyReal = (powerOut / (powerOut + totalLoss)) * 100;
        
        // === PASO 12: REGULACIÓN DE VOLTAJE ===
        const voltageRegulation = ((resistanceTotal * iPrimary) / vPrimary) * 100;
        
        // === PASO 13: DENSIDADES DE CORRIENTE ===
        const currentDensityPrimary = iPrimary / (wirePrimary.area * 1e-6);
        const currentDensitySecondary = iSecondary / (wireSecondary.area * 1e-6);
        
        // === PASO 14: FACTOR DE LLENADO ===
        const windowArea = Ae * 2;
        const copperAreaPrimary = nPrimary * Math.PI * Math.pow(wirePrimary.diameter / 2000, 2);
        const copperAreaSecondary = nSecondaryAdjusted * Math.PI * Math.pow(wireSecondary.diameter / 2000, 2);
        const totalCopperArea = copperAreaPrimary + copperAreaSecondary;
        const fillFactor = (totalCopperArea / (windowArea * 1e4)) * 100;
        
        // === PASO 15: PESO ESTIMADO ===
        const copperWeightPrimary = (wireLengthPrimary / 100) * wirePrimary.area * 1e-6 * CONSTANTS.copperDensity;
        const copperWeightSecondary = (wireLengthSecondary / 100) * wireSecondary.area * 1e-6 * CONSTANTS.copperDensity;
        const coreWeight = coreVolume * 7800;
        const totalWeight = (copperWeightPrimary + copperWeightSecondary + coreWeight) * 1000;
        
        // === PASO 16: TEMPERATURA ESTIMADA ===
        const surfaceArea = 6 * Math.pow(coreDimension / 100, 2);
        const temperatureRise = totalLoss / (10 * surfaceArea);
        
        const results = {
            turnsRatio, nPrimary, nSecondary: nSecondaryAdjusted, awgPrimary, awgSecondary,
            powerIn, powerOut, iPrimary, iSecondary,
            Ae_cm2, Bmax, coreVolume: coreVolume * 1e6, coreDimension,
            wireLengthPrimary, wireLengthSecondary,
            wireDiameterPrimary: wirePrimary.diameter, wireDiameterSecondary: wireSecondary.diameter,
            resistancePrimary, resistanceSecondary, resistanceTotal,
            copperLossPrimary, copperLossSecondary, totalCopperLoss, coreLoss, totalLoss,
            efficiency: efficiencyReal, voltageRegulation,
            currentDensityPrimary, currentDensitySecondary, fillFactor,
            totalWeight, temperatureRise, coreType, frequency
        };
        
        displayTransformerResults(results);
        
        if (typeof drawTransformer === 'function') {
            drawTransformer(results);
        }
        
        window.lastTransformerResults = results;
        
    } catch (error) {
        console.error('Error en cálculo del transformador:', error);
        document.getElementById('transformerResults').innerHTML = `
            <div class="result-item error">
                <div class="result-label">❌ Error</div>
                <div class="result-value">${error.message}</div>
            </div>
        `;
    }
}

/**
 * Selecciona el calibre AWG óptimo para una corriente dada
 * @param {number} current - Corriente en Amperios
 * @param {number} targetDensity - Densidad objetivo en A/mm²
 * @returns {number} Calibre AWG seleccionado
 */
function selectWireGaugeOptimal(current, targetDensity = 3) {
    const requiredArea = current / targetDensity; // mm²
    // Iterar del más fino (AWG 40) al más grueso (AWG 10).
    // Tomar el AWG más fino que aún tenga área ≥ requiredArea.
    const awgs = [10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,32,34,36,38,40];
    for (let i = awgs.length - 1; i >= 0; i--) {
        const awg = awgs[i];
        if (awgTable[awg] && awgTable[awg].area >= requiredArea) {
            return awg;
        }
    }
    return 10; // fallback al más grueso si la corriente supera todos
}

// ============================================================================
// VISUALIZACIÓN DE RESULTADOS - TRANSFORMADOR
// ============================================================================

/**
 * Muestra los resultados del cálculo de transformador
 * @param {Object} results - Resultados del cálculo
 */
function displayTransformerResults(results) {
    const core = coreDatabase[results.coreType];
    let html = '<div class="result-grid">';
    
    // === SECCIÓN 1: NÚCLEO Y GEOMETRÍA ===
    html += '<div style="grid-column: 1/-1; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 10px; border-radius: 8px; font-weight: bold; text-align: center;">NÚCLEO Y GEOMETRÍA</div>';
    
    html += createResultItem('Material del Núcleo', core.name, '');
    html += createResultItem('Área Efectiva (Ae)', results.Ae_cm2.toFixed(2), 'cm²');
    html += createResultItem('Densidad de Flujo (Bmax)', (results.Bmax * 1000).toFixed(1), 'mT', 
        results.Bmax > core.bsat * 0.8 ? 'warning' : 'success');
    html += createResultItem('Volumen del Núcleo', results.coreVolume.toFixed(2), 'cm³');
    html += createResultItem('Dimensión Característica', results.coreDimension.toFixed(2), 'cm');
    html += createResultItem('Frecuencia', results.frequency, 'Hz');
    
    // === SECCIÓN 2: DEVANADOS ===
    html += '<div style="grid-column: 1/-1; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 10px; border-radius: 8px; font-weight: bold; text-align: center; margin-top: 15px;">DEVANADOS</div>';
    
    html += createResultItem('Relación de Transformación', results.turnsRatio.toFixed(3), ':1');
    html += createResultItem('Vueltas Primario', results.nPrimary, 'N');
    html += createResultItem('Vueltas Secundario', results.nSecondary, 'N');
    html += createResultItem('Cable Primario (AWG)', results.awgPrimary, '');
    html += createResultItem('Cable Secundario (AWG)', results.awgSecondary, '');
    html += createResultItem('Diámetro Cable Primario', results.wireDiameterPrimary.toFixed(3), 'mm');
    html += createResultItem('Diámetro Cable Secundario', results.wireDiameterSecondary.toFixed(3), 'mm');
    html += createResultItem('Longitud Cable Primario', results.wireLengthPrimary.toFixed(1), 'cm');
    html += createResultItem('Longitud Cable Secundario', results.wireLengthSecondary.toFixed(1), 'cm');
    
    // === SECCIÓN 3: PARÁMETROS ELÉCTRICOS ===
    html += '<div style="grid-column: 1/-1; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 10px; border-radius: 8px; font-weight: bold; text-align: center; margin-top: 15px;">PARÁMETROS ELÉCTRICOS</div>';
    
    html += createResultItem('Potencia Entrada', results.powerIn.toFixed(2), 'W');
    html += createResultItem('Potencia Salida', results.powerOut.toFixed(2), 'W');
    html += createResultItem('Corriente Primaria', results.iPrimary.toFixed(3), 'A');
    html += createResultItem('Corriente Secundaria', results.iSecondary.toFixed(3), 'A');
    html += createResultItem('Resistencia Primario', results.resistancePrimary.toFixed(3), 'Ω');
    html += createResultItem('Resistencia Secundario', results.resistanceSecondary.toFixed(3), 'Ω');
    html += createResultItem('Resistencia Total (ref. primario)', results.resistanceTotal.toFixed(3), 'Ω');
    html += createResultItem('Regulación de Voltaje', results.voltageRegulation.toFixed(2), '%',
        results.voltageRegulation > 10 ? 'warning' : 'success');
    
    // === SECCIÓN 4: PÉRDIDAS Y EFICIENCIA ===
    html += '<div style="grid-column: 1/-1; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 10px; border-radius: 8px; font-weight: bold; text-align: center; margin-top: 15px;">PÉRDIDAS Y EFICIENCIA</div>';
    
    html += createResultItem('Pérdidas Cobre Primario', results.copperLossPrimary.toFixed(3), 'W');
    html += createResultItem('Pérdidas Cobre Secundario', results.copperLossSecondary.toFixed(3), 'W');
    html += createResultItem('Pérdidas Totales Cobre', results.totalCopperLoss.toFixed(3), 'W');
    html += createResultItem('Pérdidas en Núcleo', results.coreLoss.toFixed(3), 'W');
    html += createResultItem('Pérdidas Totales', results.totalLoss.toFixed(3), 'W');
    html += createResultItem('Eficiencia Real', results.efficiency.toFixed(2), '%', 
        results.efficiency >= 85 ? 'success' : results.efficiency >= 75 ? 'warning' : 'error');
    
    // === SECCIÓN 5: VERIFICACIONES ===
    html += '<div style="grid-column: 1/-1; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 10px; border-radius: 8px; font-weight: bold; text-align: center; margin-top: 15px;">VERIFICACIONES</div>';
    
    html += createResultItem('Densidad J Primario', (results.currentDensityPrimary / 1e6).toFixed(2), 'A/mm²',
        results.currentDensityPrimary > 5e6 ? 'error' : results.currentDensityPrimary > 4e6 ? 'warning' : 'success');
    html += createResultItem('Densidad J Secundario', (results.currentDensitySecondary / 1e6).toFixed(2), 'A/mm²',
        results.currentDensitySecondary > 5e6 ? 'error' : results.currentDensitySecondary > 4e6 ? 'warning' : 'success');
    html += createResultItem('Factor de Llenado', results.fillFactor.toFixed(1), '%',
        results.fillFactor > 80 ? 'error' : results.fillFactor > 60 ? 'warning' : 'success');
    html += createResultItem('Elevación de Temperatura', results.temperatureRise.toFixed(1), '°C',
        results.temperatureRise > 50 ? 'error' : results.temperatureRise > 30 ? 'warning' : 'success');
    html += createResultItem('Peso Total', results.totalWeight.toFixed(2), 'g');
    
    html += '</div>';
    
    // === ADVERTENCIAS ===
    let warnings = [];
    
    if (results.Bmax > core.bsat * 0.8) {
        warnings.push({
            type: 'error',
            title: '⚠️ DENSIDAD DE FLUJO MUY ALTA',
            message: 'El núcleo está cerca de la saturación. Reduzca la densidad de flujo o use un núcleo más grande.'
        });
    }
    
    if (results.currentDensityPrimary > 5e6 || results.currentDensitySecondary > 5e6) {
        warnings.push({
            type: 'error',
            title: '⚠️ DENSIDAD DE CORRIENTE EXCESIVA',
            message: 'La densidad de corriente es peligrosamente alta. Use cables más gruesos inmediatamente.'
        });
    } else if (results.currentDensityPrimary > 4e6 || results.currentDensitySecondary > 4e6) {
        warnings.push({
            type: 'warning',
            title: '⚠️ DENSIDAD DE CORRIENTE ALTA',
            message: 'La densidad de corriente es alta. Considere usar cables más gruesos para reducir pérdidas.'
        });
    }
    
    if (results.fillFactor > 80) {
        warnings.push({
            type: 'error',
            title: '⚠️ FACTOR DE LLENADO EXCESIVO',
            message: 'No hay suficiente espacio para los devanados. Use un núcleo más grande o cables más delgados.'
        });
    } else if (results.fillFactor > 60) {
        warnings.push({
            type: 'warning',
            title: '⚠️ FACTOR DE LLENADO ALTO',
            message: 'El bobinado será difícil. Considere usar un núcleo más grande.'
        });
    }
    
    if (results.temperatureRise > 50) {
        warnings.push({
            type: 'error',
            title: '⚠️ TEMPERATURA EXCESIVA',
            message: 'La elevación de temperatura es muy alta. Mejore la ventilación o reduzca las pérdidas.'
        });
    } else if (results.temperatureRise > 30) {
        warnings.push({
            type: 'warning',
            title: '⚠️ TEMPERATURA ELEVADA',
            message: 'La temperatura puede ser un problema. Considere mejorar la disipación térmica.'
        });
    }
    
    if (results.voltageRegulation > 10) {
        warnings.push({
            type: 'warning',
            title: '⚠️ REGULACIÓN DE VOLTAJE POBRE',
            message: 'La caída de voltaje es significativa. Considere aumentar el área del núcleo o usar cables más gruesos.'
        });
    }
    
    if (results.efficiency < 75) {
        warnings.push({
            type: 'error',
            title: '⚠️ EFICIENCIA BAJA',
            message: 'La eficiencia es muy baja. Revise el diseño para reducir pérdidas.'
        });
    } else if (results.efficiency < 85) {
        warnings.push({
            type: 'warning',
            title: '⚠️ EFICIENCIA MODERADA',
            message: 'La eficiencia podría mejorarse optimizando el diseño.'
        });
    }
    
    // Mostrar advertencias
    warnings.forEach(warning => {
        html += `<div class="result-item ${warning.type}" style="margin-top: 20px;">
            <div class="result-label">${warning.title}</div>
            <div class="result-value">${warning.message}</div>
        </div>`;
    });
    
    document.getElementById('transformerResults').innerHTML = html;
}

// ============================================================================
// COMPARACIÓN DE NÚCLEOS
// ============================================================================

/**
 * Compara todos los núcleos disponibles
 */
function compareAllCores() {
    try {
        const inductanceValue = parseFloat(document.getElementById('compInductance').value);
        const inductanceUnit = document.getElementById('compInductanceUnit').value;
        const current = parseFloat(document.getElementById('compCurrent').value);
        
        if (isNaN(inductanceValue) || inductanceValue <= 0) {
            throw new Error('Valor de inductancia inválido');
        }
        if (isNaN(current) || current <= 0) {
            throw new Error('Valor de corriente inválido');
        }
        
        const L = convertToHenry(inductanceValue, inductanceUnit);
        const results = [];
        
        // Parámetros geométricos del formulario (con fallback a valores típicos)
        const wireGauge = parseInt(document.getElementById('compWireGauge')?.value) || 20;
        const od = parseFloat(document.getElementById('compOD')?.value) || 30;
        const id = parseFloat(document.getElementById('compID')?.value) || 15;
        const h  = parseFloat(document.getElementById('compHeight')?.value) || 10;
        
        for (const [type, core] of Object.entries(coreDatabase)) {
            if (type === 'air') continue;
            
            try {
                const result = calculateToroidInductor(L, current, type, wireGauge, od, id, h, undefined, 50);
                results.push({
                    type,
                    name: core.name,
                    ...result,
                    cost: (core.cost || 0) * result.weight / 1000
                });
            } catch (error) {
                console.error(`Error calculando ${type}:`, error);
            }
        }
        
        displayComparisonResults(results);
        
        if (typeof drawComparisonChart === 'function') {
            drawComparisonChart(results);
        }
        
    } catch (error) {
        console.error('Error en comparación:', error);
        document.getElementById('comparisonResults').innerHTML = `
            <div class="result-item error">
                <div class="result-label">❌ Error</div>
                <div class="result-value">${error.message}</div>
            </div>
        `;
    }
}

/**
 * Muestra los resultados de la comparación de núcleos
 * @param {Array} results - Array de resultados
 */
function displayComparisonResults(results) {
    // Ordenar por pérdidas totales (menor a mayor)
    results.sort((a, b) => a.totalLoss - b.totalLoss);
    
    let html = '<table class="comparison-table">';
    html += '<thead><tr>';
    html += '<th>Material</th>';
    html += '<th>Vueltas</th>';
    html += '<th>Resistencia (Ω)</th>';
    html += '<th>Pérdidas (W)</th>';
    html += '<th>Saturación (%)</th>';
    html += '<th>Factor Llenado (%)</th>';
    html += '<th>Peso (g)</th>';
    html += '<th>Costo ($)</th>';
    html += '</tr></thead><tbody>';
    
    results.forEach((r, index) => {
        const satClass = r.saturationLevel > 90 ? 'error' : (r.saturationLevel > 70 ? 'warning' : '');
        const fillClass = r.fillFactor > 80 ? 'warning' : '';
        const bestClass = index === 0 ? 'success' : '';
        
        html += `<tr class="${satClass} ${fillClass} ${bestClass}">`;
        html += `<td><strong>${r.name}</strong></td>`;
        html += `<td>${r.turns}</td>`;
        html += `<td>${r.resistance.toFixed(3)}</td>`;
        html += `<td>${r.totalLoss.toFixed(3)}</td>`;
        html += `<td>${r.saturationLevel.toFixed(1)}</td>`;
        html += `<td>${r.fillFactor.toFixed(1)}</td>`;
        html += `<td>${r.weight.toFixed(1)}</td>`;
        html += `<td>${r.cost.toFixed(2)}</td>`;
        html += '</tr>';
    });
    
    html += '</tbody></table>';
    
    // Agregar recomendación
    if (results.length > 0) {
        const best = results[0];
        html += `<div class="result-item success" style="margin-top: 20px;">
            <div class="result-label">✅ MEJOR OPCIÓN</div>
            <div class="result-value">El núcleo de ${best.name} ofrece las menores pérdidas totales (${best.totalLoss.toFixed(3)} W) para esta aplicación.</div>
        </div>`;
    }
    
    document.getElementById('comparisonResults').innerHTML = html;
}

// ============================================================================
// FUNCIONES DE EXPORTACIÓN/IMPORTACIÓN
// ============================================================================

/**
 * Exporta los resultados a formato JSON
 * @param {string} type - Tipo de diseño ('inductor' o 'transformer')
 */
function exportDesign(type) {
    try {
        let data;
        if (type === 'inductor' && window.lastInductorResults) {
            data = window.lastInductorResults;
        } else if (type === 'transformer' && window.lastTransformerResults) {
            data = window.lastTransformerResults;
        } else {
            showAlert('No hay resultados para exportar.\nRealice un cálculo primero.', 'Sin datos');
            return;
        }

        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${type}_design_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

    } catch (error) {
        console.error('Error exportando diseño:', error);
        showAlert('Error al exportar el diseño:\n' + error.message, 'Error de exportación');
    }
}

function importDesign(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            showAlert('Diseño importado exitosamente.', 'Importación completada');
        } catch (error) {
            console.error('Error importando diseño:', error);
            showAlert('Error al importar el diseño:\n' + error.message, 'Error de importación');
        }
    };
    reader.readAsText(file);
}

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

// Esperar a que el DOM esté listo
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
        console.log('Sistema de cálculo de inductores y transformadores inicializado');
        
        // Añadir event listeners si es necesario
        const calculateBtn = document.getElementById('calculateBtn');
        if (calculateBtn) {
            calculateBtn.addEventListener('click', calculateInductor);
        }
        
        const calculateTransBtn = document.getElementById('calculateTransBtn');
        if (calculateTransBtn) {
            calculateTransBtn.addEventListener('click', calculateTransformer);
        }
        
        const compareBtn = document.getElementById('compareBtn');
        if (compareBtn) {
            compareBtn.addEventListener('click', compareAllCores);
        }
    });
}
