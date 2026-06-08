// ============================================================================
// MAIN.JS - Sistema Principal Corregido
// ============================================================================

// Inicialización
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Iniciando Suite de Diseño Magnético...');

    setupNavigation();
    setupModeToggle();
    setupCoreTypeChange();
    updateSavedDesignsList();

    // Event listener para el archivo de importación
    const importFile = document.getElementById('importFile');
    if (importFile) {
        importFile.addEventListener('change', importDesign);
    }

    // Restaurar diseño pendiente (cargado desde exportar.html)
    if (typeof restorePendingDesign === 'function') {
        restorePendingDesign();
    }

    console.log('✅ Suite iniciada correctamente');
    console.log('📚 Materiales disponibles:', Object.keys(coreDatabase).length);
});

// ============================================================================
// CONFIGURACIÓN DE NAVEGACIÓN
// ============================================================================

function setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    
    navButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetPage = this.getAttribute('data-page');
            switchPage(targetPage);
            
            // Actualizar botones activos
            navButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

function switchPage(pageName) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => {
        page.classList.remove('active');
    });
    
    const targetPage = document.getElementById(`page-${pageName}`);
    if (targetPage) {
        targetPage.classList.add('active');
    }
    
    // Actualizar lista de diseños guardados si estamos en la página de exportación
    if (pageName === 'export') {
        updateSavedDesignsList();
    }
}

// ============================================================================
// CONFIGURACIÓN DE MODO (SIMPLE/AVANZADO)
// ============================================================================

function setupModeToggle() {
    window.setMode = function(mode) {
        const modeBtns = document.querySelectorAll('.mode-btn-mini');
        modeBtns.forEach(btn => btn.classList.remove('active'));
        
        const advancedParams = document.getElementById('advancedParams');
        const modeTitle = document.getElementById('modeTitle');
        
        if (mode === 'simple') {
            if (modeBtns[0]) modeBtns[0].classList.add('active');
            if (advancedParams) advancedParams.style.display = 'none';
            if (modeTitle) modeTitle.textContent = 'Parámetros de Entrada';
        } else {
            if (modeBtns[1]) modeBtns[1].classList.add('active');
            if (advancedParams) advancedParams.style.display = 'block';
            if (modeTitle) modeTitle.textContent = 'Parámetros Avanzados';
        }
    };
}

// ============================================================================
// AUTO-SELECCIÓN DE CALIBRE AWG
// ============================================================================

window.autoSelectWireGauge = function() {
    const current = parseFloat(document.getElementById('current')?.value) || 1;
    const targetDensity = 3; // A/mm² - valor seguro

    const requiredArea = current / targetDensity;
    // Iterar de AWG 40 (más delgado) a 10 (más grueso) y quedarse con el
    // primer calibre cuya área supere el requerido; así el resultado es el
    // cable más delgado que aún cumple el margen de seguridad.
    let selectedAWG = 10; // fallback al más grueso si ninguno cumple
    for (let awg = 40; awg >= 10; awg--) {
        if (awgTable[awg] && awgTable[awg].area >= requiredArea) {
            selectedAWG = awg;
        }
    }

    // Actualizar el campo
    const wireGaugeInput = document.getElementById('wireGauge');
    if (wireGaugeInput) {
        wireGaugeInput.value = selectedAWG;
        updateWireGaugeInfo();
        
        // Mostrar notificación
        showToast(`AWG ${selectedAWG} seleccionado para ${current} A`, 'success');
    }
};

function updateWireGaugeInfo() {
    const current = parseFloat(document.getElementById('current')?.value) || 1;
    const awg = parseInt(document.getElementById('wireGauge')?.value) || 20;
    const infoElement = document.getElementById('wireGaugeInfo');
    
    if (!infoElement || !awgTable[awg]) return;
    
    const wire = awgTable[awg];
    const currentDensity = current / wire.area;
    const maxSafeCurrent = wire.area * 3; // 3 A/mm² es seguro
    
    let message = `📏 Diámetro: ${wire.diameter.toFixed(3)}mm`;
    let color = '#666';
    
    if (current > maxSafeCurrent) {
        message += ` ⚠️ Sobrecargado (máx: ${maxSafeCurrent.toFixed(2)}A)`;
        color = '#dc3545';
    } else if (current > maxSafeCurrent * 0.8) {
        message += ` ⚡ Cerca del límite`;
        color = '#ffc107';
    } else {
        message += ` ✓ Correcto`;
        color = '#28a745';
    }
    
    infoElement.textContent = message;
    infoElement.style.color = color;
}

// showToast — notificación global usada en todos los módulos
window.showToast = function(message, type = 'info') {
    const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
    const bg = colors[type] || colors.info;

    const el = document.createElement('div');
    el.style.cssText = `
        position:fixed;top:20px;right:20px;
        background:${bg};color:#fff;
        padding:12px 18px;border-radius:10px;
        box-shadow:0 6px 20px rgba(0,0,0,0.35);
        z-index:99999;font-size:14px;font-weight:500;
        max-width:320px;line-height:1.4;
        animation:_toastIn .25s ease;
        font-family:'Segoe UI',system-ui,sans-serif;
    `;
    el.textContent = message;

    if (!document.getElementById('_toastStyles')) {
        const s = document.createElement('style');
        s.id = '_toastStyles';
        s.textContent = `@keyframes _toastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:none}}
        @keyframes _toastOut{from{opacity:1;transform:none}to{opacity:0;transform:translateX(20px)}}`;
        document.head.appendChild(s);
    }

    document.body.appendChild(el);
    setTimeout(() => {
        el.style.animation = '_toastOut .25s ease forwards';
        setTimeout(() => el.remove(), 260);
    }, 3200);
};
// Alias para compatibilidad con código existente
function showNotification(message, type) { showToast(message, type); }

// Event listeners para actualizar info en tiempo real
document.addEventListener('DOMContentLoaded', function() {
    const currentInput = document.getElementById('current');
    const wireGaugeInput = document.getElementById('wireGauge');
    
    if (currentInput) {
        currentInput.addEventListener('input', updateWireGaugeInfo);
    }
    
    if (wireGaugeInput) {
        wireGaugeInput.addEventListener('input', updateWireGaugeInfo);
    }
    
    // Actualizar info inicial
    setTimeout(updateWireGaugeInfo, 100);
});

// ============================================================================
// CONFIGURACIÓN DE TIPO DE NÚCLEO
// ============================================================================

function setupCoreTypeChange() {
    const coreTypeSelect = document.getElementById('coreType');
    
    if (!coreTypeSelect) {
        console.error('❌ No se encontró el elemento coreType');
        return;
    }
    
    coreTypeSelect.addEventListener('change', function() {
        const coreType = this.value;
        const airParams = document.getElementById('airCoreParams');
        const toroidParams = document.getElementById('toroidParams');
        
        if (!airParams || !toroidParams) {
            console.error('❌ No se encontraron los contenedores de parámetros');
            return;
        }
        
        // Mostrar/ocultar parámetros según el tipo de núcleo
        if (coreType === 'air') {
            airParams.style.display = 'block';
            toroidParams.style.display = 'none';
        } else {
            airParams.style.display = 'none';
            toroidParams.style.display = 'block';
            
            // Ajustar permeabilidad según el material
            if (coreDatabase[coreType]) {
                const core = coreDatabase[coreType];
                const permeabilityInput = document.getElementById('permeability');
                if (permeabilityInput) {
                    permeabilityInput.value = core.mu_r;
                }
            }
        }
    });
    
    // Trigger inicial
    coreTypeSelect.dispatchEvent(new Event('change'));
}

// ============================================================================
// FUNCIONES DE VALIDACIÓN Y CÁLCULO - INDUCTOR
// ============================================================================

window.calculateInductorWithValidation = function() {
    console.log('🔧 Iniciando cálculo de inductor con validación...');
    
    // Recopilar parámetros
    const params = {
        coreType: document.getElementById('coreType')?.value || 'ferrite_mn_zn',
        inductance: parseFloat(document.getElementById('inductance')?.value) || 100,
        inductanceUnit: document.getElementById('inductanceUnit')?.value || 'mH',
        current: parseFloat(document.getElementById('current')?.value) || 1,
        wireGauge: parseInt(document.getElementById('wireGauge')?.value) || 20,
        coilDiameter: parseFloat(document.getElementById('coilDiameter')?.value) || 20,
        coilLength: parseFloat(document.getElementById('coilLength')?.value) || 30,
        toroidOD: parseFloat(document.getElementById('toroidOD')?.value) || 30,
        toroidID: parseFloat(document.getElementById('toroidID')?.value) || 15,
        toroidHeight: parseFloat(document.getElementById('toroidHeight')?.value) || 10
    };
    
    console.log('📊 Parámetros:', params);
    
    // Validar si existe el sistema de validación
    if (typeof ValidationSystem !== 'undefined') {
        const validator = new ValidationSystem();
        const result = validator.validateInductor(params);
        
        // Mostrar resultados de validación con botón de corrección
        displayValidationResultsWithFix(result, 'validationMessages', params);
        
        // Solo calcular si no hay errores críticos
        if (!result.valid) {
            console.warn('⚠️ Cálculo bloqueado por errores de validación');
            
            // Ofrecer corrección automática
            if (hasWireGaugeError(result.errors)) {
                showNotification('💡 Click en "🔄 Auto" para corregir el AWG automáticamente', 'warning');
            }
            return;
        }
    } else {
        console.warn('⚠️ Sistema de validación no disponible, procediendo sin validación');
    }
    
    // Realizar el cálculo
    calculateInductor();
};

function hasWireGaugeError(errors) {
    return errors.some(error => error.includes('AWG') && error.includes('no soporta'));
}

function displayValidationResultsWithFix(results, containerId, params) {
    const container = document.getElementById(containerId);
    if (!container) {
        const newContainer = document.createElement('div');
        newContainer.id = containerId;
        newContainer.className = 'validation-container';
        const form = document.querySelector('.panel');
        if (form) {
            form.insertBefore(newContainer, form.querySelector('.btn-primary'));
        }
        return displayValidationResultsWithFix(results, containerId, params);
    }

    let html = '';

    // Errores (bloquean el cálculo)
    if (results.errors.length > 0) {
        html += '<div class="validation-errors">';
        html += '<div class="validation-title error">❌ Errores Críticos</div>';
        
        let hasWireError = false;
        results.errors.forEach(error => {
            html += `<div class="validation-message error">• ${error}</div>`;
            if (error.includes('AWG') && error.includes('no soporta')) {
                hasWireError = true;
            }
        });
        
        // Agregar botón de corrección automática si hay error de AWG
        if (hasWireError) {
            html += `
                <button onclick="autoSelectWireGauge(); setTimeout(() => window.calculateInductorWithValidation(), 500);" 
                        class="btn-fix"
                        style="margin-top: 10px; width: 100%;">
                    🔧 Corregir AWG Automáticamente
                </button>
            `;
        }
        
        html += '</div>';
    }

    // Advertencias (no bloquean pero alertan)
    if (results.warnings.length > 0) {
        html += '<div class="validation-warnings">';
        html += '<div class="validation-title warning">⚠️ Advertencias</div>';
        results.warnings.forEach(warning => {
            html += `<div class="validation-message warning">• ${warning}</div>`;
        });
        html += '</div>';
    }

    // Sugerencias (optimización)
    if (results.suggestions.length > 0) {
        html += '<div class="validation-suggestions">';
        html += '<div class="validation-title suggestion">💡 Sugerencias</div>';
        results.suggestions.forEach(suggestion => {
            html += `<div class="validation-message suggestion">• ${suggestion}</div>`;
        });
        html += '</div>';
    }

    // Mensaje de éxito
    if (results.valid && results.warnings.length === 0) {
        html = '<div class="validation-success">✅ Todos los parámetros son válidos</div>';
    }

    container.innerHTML = html;
    container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ============================================================================
// FUNCIONES DE VALIDACIÓN Y CÁLCULO - TRANSFORMADOR
// ============================================================================

window.calculateTransformerWithValidation = function() {
    console.log('🔧 Iniciando cálculo de transformador con validación...');
    
    // Recopilar parámetros
    const params = {
        coreType: document.getElementById('transCore')?.value || 'ferrite_mn_zn',
        vPrimary: parseFloat(document.getElementById('vPrimary')?.value) || 220,
        vSecondary: parseFloat(document.getElementById('vSecondary')?.value) || 12,
        iSecondary: parseFloat(document.getElementById('iSecondary')?.value) || 2,
        frequency: parseFloat(document.getElementById('frequency')?.value) || 50,
        efficiency: parseFloat(document.getElementById('efficiency')?.value) || 90
    };
    
    console.log('📊 Parámetros transformador:', params);
    
    // Validar si existe el sistema de validación
    if (typeof ValidationSystem !== 'undefined') {
        const validator = new ValidationSystem();
        const result = validator.validateTransformer(params);
        
        // Mostrar resultados de validación
        displayValidationResults(result, 'validationMessagesTransformer');
        
        // Solo calcular si no hay errores críticos
        if (!result.valid) {
            console.warn('⚠️ Cálculo bloqueado por errores de validación');
            return;
        }
    } else {
        console.warn('⚠️ Sistema de validación no disponible, procediendo sin validación');
    }
    
    // Realizar el cálculo
    calculateTransformer();
};

// ============================================================================
// GUARDAR DISEÑO ACTUAL
// ============================================================================

window.saveCurrentDesign = function() {
    console.log('💾 Guardando diseño...');
    
    const activePage = document.querySelector('.page.active');
    if (!activePage) return;
    
    let design = {
        timestamp: new Date().toISOString(),
        type: null,
        data: null
    };
    
    if (activePage.id === 'page-inductor') {
        design.type = 'inductor';
        design.data = {
            coreType: document.getElementById('coreType')?.value,
            inductance: document.getElementById('inductance')?.value,
            inductanceUnit: document.getElementById('inductanceUnit')?.value,
            current: document.getElementById('current')?.value,
            wireGauge: document.getElementById('wireGauge')?.value
        };
    } else if (activePage.id === 'page-transformer') {
        design.type = 'transformer';
        design.data = {
            coreType: document.getElementById('transCore')?.value,
            vPrimary: document.getElementById('vPrimary')?.value,
            vSecondary: document.getElementById('vSecondary')?.value,
            iSecondary: document.getElementById('iSecondary')?.value,
            frequency: document.getElementById('frequency')?.value
        };
    } else if (activePage.id === 'page-motor') {
        if (typeof window.motorSaveDesign === 'function') {
            window.motorSaveDesign();
        } else {
            showAlert('No hay un diseño activo para guardar.\nRealice un cálculo primero.', 'Sin diseño activo');
        }
        return;
    } else {
        showAlert('No hay un diseño activo para guardar.\nRealice un cálculo primero.', 'Sin diseño activo');
        return;
    }
    
    savedDesigns.push(design);

    try {
        localStorage.setItem('inductorDesigns', JSON.stringify(savedDesigns));
        showToast('Diseño guardado correctamente', 'success');
        updateSavedDesignsList();
    } catch (error) {
        console.error('Error guardando:', error);
        showToast('Error al guardar el diseño', 'error');
    }
};

// ============================================================================
// ACTUALIZAR LISTA DE DISEÑOS GUARDADOS
// ============================================================================

function updateSavedDesignsList() {
    const container = document.getElementById('savedDesigns');
    if (!container) return;

    if (savedDesigns.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:48px 20px;color:#475569;">
                <div style="font-size:48px;margin-bottom:12px;opacity:.4;">📭</div>
                <div style="font-weight:600;margin-bottom:4px;">Sin diseños guardados</div>
                <div style="font-size:13px;color:#64748b;">Realice un cálculo en cualquier módulo para guardar un diseño.</div>
            </div>`;
        return;
    }

    const icons  = { inductor: '🔌', transformer: '🔄', rewind: '🔧', lcfilter: '📐', smps: '⚡', motor: '⚙️' };
    const labels = { inductor: 'Inductor Toroidal', transformer: 'Transformador', rewind: 'Rebobinado de Red', lcfilter: 'Filtro LC/EMI', smps: 'SMPS', motor: 'Rebobinado Motor' };
    const pages  = { inductor: 'inductor.html', transformer: 'inductor.html', rewind: 'rebobinado.html', lcfilter: 'filtros.html', smps: 'smps.html', motor: 'motor.html' };
    const colors = { inductor: '#667eea', transformer: '#10b981', rewind: '#f59e0b', lcfilter: '#3b82f6', smps: '#ef4444', motor: '#22d3ee' };

    let html = '<div class="saved-designs-list">';

    savedDesigns.forEach((design, index) => {
        const date  = new Date(design.timestamp).toLocaleString('es-ES');
        const icon  = icons[design.type]  || '📦';
        const label = labels[design.type] || design.type;
        const page  = pages[design.type]  || '#';
        const color = colors[design.type] || '#667eea';

        // Líneas de detalle específicas por tipo
        let rows = '';
        if (design.type === 'inductor') {
            rows = `
                <div class="sdi-row"><span>Inductancia</span><strong>${design.data.inductance} ${design.data.inductanceUnit}</strong></div>
                <div class="sdi-row"><span>Corriente</span><strong>${design.data.current} A</strong></div>
                <div class="sdi-row"><span>Material</span><strong>${design.data.coreType || '—'}</strong></div>
                <div class="sdi-row"><span>Calibre</span><strong>AWG ${design.data.wireGauge || '—'}</strong></div>`;
        } else if (design.type === 'transformer') {
            rows = `
                <div class="sdi-row"><span>Vprimario</span><strong>${design.data.vPrimary} V</strong></div>
                <div class="sdi-row"><span>Vsecundario</span><strong>${design.data.vSecondary} V / ${design.data.iSecondary} A</strong></div>
                <div class="sdi-row"><span>Frecuencia</span><strong>${design.data.frequency} Hz</strong></div>
                <div class="sdi-row"><span>Material</span><strong>${design.data.coreType || '—'}</strong></div>`;
        } else if (design.type === 'rewind') {
            const secs = (design.data.secondaries || [])
                .map((s, i) => `<div class="sdi-row"><span>Secundario ${i+1}</span><strong>${s.Vs} V / ${s.Ps} VA</strong></div>`)
                .join('');
            rows = `
                <div class="sdi-row"><span>Vprimario</span><strong>${design.data.Vp} V / ${design.data.freq} Hz</strong></div>
                <div class="sdi-row"><span>Núcleo Ae</span><strong>${design.data.Ae_cm2} cm²</strong></div>
                <div class="sdi-row"><span>Ventana Aw</span><strong>${design.data.winArea_cm2} cm²</strong></div>
                ${secs}`;
        } else if (design.type === 'lcfilter') {
            const typeMap = { lowpass: 'Paso Bajo', highpass: 'Paso Alto', bandpass: 'Paso Banda', notch: 'Notch' };
            rows = `
                <div class="sdi-row"><span>Tipo</span><strong>${typeMap[design.data.filterType] || design.data.filterType}</strong></div>
                <div class="sdi-row"><span>Topología</span><strong>${design.data.topology} — Orden ${design.data.order}</strong></div>
                <div class="sdi-row"><span>Frecuencia de corte</span><strong>${design.data.fc} Hz</strong></div>
                <div class="sdi-row"><span>Carga / Corriente</span><strong>${design.data.Z} Ω / ${design.data.Imax} A</strong></div>`;
        } else if (design.type === 'smps') {
            const tops = { flyback: 'Flyback', forward: 'Forward' };
            const outs = (design.data.outputs || [])
                .map((o, i) => `<div class="sdi-row"><span>Salida ${i+1}</span><strong>${o.Vout} V / ${o.Iout} A</strong></div>`)
                .join('');
            rows = `
                <div class="sdi-row"><span>Topología</span><strong>${tops[design.data.topology] || design.data.topology}</strong></div>
                <div class="sdi-row"><span>Vin</span><strong>${design.data.VinMin}–${design.data.VinMax} V</strong></div>
                <div class="sdi-row"><span>Frecuencia</span><strong>${design.data.freqKHz} kHz</strong></div>
                ${outs}`;
        } else if (design.type === 'motor') {
            const mtype = design.data.motorType === 'three' ? 'Trifásico' : 'Monofásico';
            const conn  = design.data.motorType === 'three'
                ? (design.data.connection === 'star' ? 'Y' : 'Δ') : '1ϕ';
            rows = `
                <div class="sdi-row"><span>Tipo</span><strong>${mtype} (${conn})</strong></div>
                <div class="sdi-row"><span>Tensión</span><strong>${design.data.voltage} V / ${design.data.freq} Hz</strong></div>
                <div class="sdi-row"><span>Potencia</span><strong>${parseFloat(design.data.powerKW || 0).toFixed(2)} kW (${parseFloat(design.data.powerHP || 0).toFixed(1)} HP)</strong></div>
                <div class="sdi-row"><span>RPM / Ranuras</span><strong>${design.data.rpm} RPM · Q=${design.data.slots}</strong></div>
                <div class="sdi-row"><span>Estátor OD/ID</span><strong>${design.data.extDiam||'—'}/${design.data.boreDiam||'—'} mm · L=${design.data.stackLength||'—'} mm</strong></div>
                <div class="sdi-row"><span>Clase aislamiento</span><strong>Clase ${design.data.insClass}</strong></div>`;
        }

        html += `
            <div class="saved-design-item" style="--type-color:${color}">
                <div class="sdi-header">
                    <div class="sdi-badge" style="background:${color}22;border-color:${color}44;">
                        <span class="sdi-icon">${icon}</span>
                        <span class="sdi-label">${label}</span>
                    </div>
                    <span class="sdi-index">#${index + 1}</span>
                </div>
                <div class="sdi-date">${date}</div>
                <div class="sdi-body">${rows}</div>
                <div class="sdi-actions">
                    <a href="${page}" onclick="loadDesign(${index}); return false;"
                       class="sdi-btn-load" style="--btn-color:${color}">
                        ↗ Cargar
                    </a>
                    <button onclick="exportDesignToPDF(${index})" class="sdi-btn-export" title="Exportar este diseño a PDF">🖨️</button>
                    <button onclick="deleteDesign(${index})" class="sdi-btn-delete" title="Eliminar">🗑️</button>
                </div>
            </div>`;
    });

    html += '</div>';
    container.innerHTML = html;
}

window.deleteDesign = async function(index) {
    const ok = await showConfirm('¿Eliminar este diseño? Esta acción no se puede deshacer.', 'Eliminar diseño', true);
    if (ok) {
        savedDesigns.splice(index, 1);
        localStorage.setItem('inductorDesigns', JSON.stringify(savedDesigns));
        updateSavedDesignsList();
        showToast('Diseño eliminado', 'info');
    }
};

window.clearAllDesigns = async function() {
    const ok = await showConfirm('Se eliminarán TODOS los diseños guardados.\nEsta acción no se puede deshacer.', 'Eliminar todo', true);
    if (ok) {
        savedDesigns = [];
        localStorage.removeItem('inductorDesigns');
        updateSavedDesignsList();
        showToast('Todos los diseños han sido eliminados', 'info');
    }
};

// ============================================================================
// EXPORTACIÓN
// ============================================================================

window.exportToJSON = function() {
    if (savedDesigns.length === 0) {
        showToast('No hay diseños para exportar', 'error');
        return;
    }
    const json = JSON.stringify(savedDesigns, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `disenos_magneticos_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('JSON exportado correctamente', 'success');
};

// exportToCSV y exportToPDF redefinidos en export.js con soporte completo para todos los tipos

// ============================================================================
// IMPORTACIÓN
// ============================================================================

function isValidDesign(d) {
    const validTypes = ['inductor', 'transformer', 'rewind', 'lcfilter', 'smps'];
    return d && typeof d === 'object' &&
        typeof d.type === 'string' &&
        validTypes.includes(d.type) &&
        typeof d.timestamp === 'string' &&
        d.data && typeof d.data === 'object';
}

function importDesign(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);

            const candidates = Array.isArray(imported) ? imported : [imported];
            const valid = candidates.filter(isValidDesign);
            const invalid = candidates.length - valid.length;

            if (valid.length === 0) {
                showToast('El archivo no contiene diseños válidos', 'error');
                return;
            }

            savedDesigns = [...savedDesigns, ...valid];
            localStorage.setItem('inductorDesigns', JSON.stringify(savedDesigns));
            updateSavedDesignsList();

            const msg = invalid > 0
                ? `${valid.length} diseño(s) importado(s) — ${invalid} ignorado(s) (formato inválido)`
                : `${valid.length} diseño(s) importado(s) correctamente`;
            showToast(msg, 'success');
        } catch (error) {
            console.error('Error importando:', error);
            showToast('Error al importar: archivo JSON inválido', 'error');
        }
    };
    reader.readAsText(file);
}

// ============================================================================
// ATAJOS DE TECLADO
// ============================================================================

document.addEventListener('keydown', function(event) {
    // Ctrl+Enter o Cmd+Enter para calcular
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        const activePage = document.querySelector('.page.active');
        
        if (activePage?.id === 'page-inductor') {
            calculateInductorWithValidation();
        } else if (activePage?.id === 'page-transformer') {
            calculateTransformerWithValidation();
        }
    }
    
    // Ctrl+S o Cmd+S para guardar
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        saveCurrentDesign();
    }
});

// ============================================================================
// CARGAR DISEÑOS GUARDADOS AL INICIAR
// ============================================================================

(function() {
    try {
        const stored = localStorage.getItem('inductorDesigns');
        if (stored) {
            savedDesigns = JSON.parse(stored);
            console.log(`📦 Cargados ${savedDesigns.length} diseños guardados`);
        }
    } catch (error) {
        console.error('Error cargando diseños guardados:', error);
        savedDesigns = [];
    }
})();

// ============================================================================
// PREVENIR PÉRDIDA DE DATOS
// ============================================================================

// beforeunload solo aplica si hay datos NO guardados en localStorage
window.addEventListener('beforeunload', function(event) {
    // Si los diseños ya están en localStorage, no hay riesgo de pérdida
    // Solo alertar si hay diseños en memoria que no se pudieron persistir
    try {
        const stored = localStorage.getItem('inductorDesigns');
        const storedArr = stored ? JSON.parse(stored) : [];
        if (savedDesigns.length > storedArr.length) {
            event.returnValue = '¿Estás seguro? Hay diseños sin guardar.';
        }
    } catch (_) {}
});

// ============================================================================
// TOOLTIPS
// ============================================================================

function showTooltip(element, text) {
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.textContent = text;
    tooltip.style.cssText = `
        position: absolute;
        background: #333;
        color: white;
        padding: 8px 12px;
        border-radius: 5px;
        font-size: 12px;
        z-index: 1000;
        pointer-events: none;
    `;
    
    document.body.appendChild(tooltip);
    
    const rect = element.getBoundingClientRect();
    tooltip.style.left = rect.left + 'px';
    tooltip.style.top = (rect.top - tooltip.offsetHeight - 10) + 'px';
    
    setTimeout(() => tooltip.remove(), 3000);
}

// ============================================================================
// AUTO-GUARDADO
// ============================================================================

setInterval(function() {
    if (savedDesigns.length > 0) {
        try {
            localStorage.setItem('inductorDesigns', JSON.stringify(savedDesigns));
        } catch (error) {
            console.error('Error en auto-guardado:', error);
        }
    }
}, 300000); // Cada 5 minutos

// ============================================================================
// STICKY SAVE BUTTON — inyectar en páginas de calculadora
// ============================================================================
document.addEventListener('DOMContentLoaded', function() {
    // Solo en páginas que tienen .page (calculadoras), no en la landing
    if (!document.querySelector('.page')) return;
    // No en exportar.html (no hay diseño que guardar)
    if (window.location.pathname.endsWith('exportar.html')) return;

    const fab = document.createElement('button');
    fab.className = 'sticky-save';
    fab.title = 'Guardar diseño actual (Ctrl+S)';

    // Páginas de módulos (rewind, filtros, smps) guardan automáticamente al calcular.
    // En inductor/transformador el usuario puede guardar explícitamente.
    const path = window.location.pathname;
    const isAutoSave = path.endsWith('rebobinado.html') || path.endsWith('filtros.html') || path.endsWith('smps.html');

    if (isAutoSave) {
        fab.innerHTML = '🔄 Calcular y guardar';
        fab.addEventListener('click', function() {
            if (path.endsWith('rebobinado.html') && typeof window.calculateRewind === 'function') window.calculateRewind();
            else if (path.endsWith('filtros.html') && typeof window.calculateLCFilter === 'function') window.calculateLCFilter();
            else if (path.endsWith('smps.html') && typeof window.calculateSMPS === 'function') window.calculateSMPS();
        });
    } else {
        fab.innerHTML = '💾 Guardar diseño';
        fab.addEventListener('click', function() {
            if (typeof saveCurrentDesign === 'function') saveCurrentDesign();
        });
    }
    document.body.appendChild(fab);
});
// ============================================================================
// MENSAJES DE CONSOLA INICIALES
// ============================================================================
console.log('🎯 Atajos de teclado: Ctrl+Enter (calcular), Ctrl+S (guardar)');
console.log('✅ Calculadora de Inductores y Transformadores iniciada correctamente');
console.log('📚 Materiales disponibles:', Object.keys(coreDatabase).length);
console.log('🎯 Presiona Ctrl+Enter para calcular rápidamente');
console.log('💾 Presiona Ctrl+S para guardar el diseño actual');