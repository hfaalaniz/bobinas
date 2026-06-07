// ============================================================================
// VALIDATION.JS - Sistema de Validación Avanzada con Rangos Realistas
// ============================================================================

/**
 * Rangos de validación por tipo de núcleo y aplicación
 */
const VALIDATION_RANGES = {
    // Rangos generales de inductancia por tipo de núcleo
    inductance: {
        air: {
            min: 0.001, // 1 nH
            max: 10, // 10 mH
            optimal: { min: 0.001, max: 1 }, // 1 µH - 1 mH
            unit: 'mH',
            warning: 'Los núcleos de aire son mejores para inductancias bajas'
        },
        ferrite_mn_zn: {
            min: 0.01,
            max: 100,
            optimal: { min: 0.1, max: 10 },
            unit: 'mH',
            warning: 'Ferrita MnZn es óptima para frecuencias medias (10kHz-1MHz)'
        },
        ferrite_ni_zn: {
            min: 0.001,
            max: 10,
            optimal: { min: 0.01, max: 1 },
            unit: 'mH',
            warning: 'Ferrita NiZn es mejor para alta frecuencia (>1MHz)'
        },
        toroid: {
            min: 0.01,
            max: 50,
            optimal: { min: 0.1, max: 5 },
            unit: 'mH',
            warning: 'Toroides de ferrita son ideales para filtros y fuentes conmutadas'
        },
        ferrite: {
            min: 0.1,
            max: 100,
            optimal: { min: 1, max: 20 },
            unit: 'mH',
            warning: 'Núcleos E/I son excelentes para transformadores de potencia'
        },
        ferrite_power: {
            min: 0.01,
            max: 50,
            optimal: { min: 0.1, max: 10 },
            unit: 'mH',
            warning: 'Ferrita Power optimizada para convertidores DC-DC'
        },
        iron: {
            min: 0.01,
            max: 50,
            optimal: { min: 0.1, max: 5 },
            unit: 'mH',
            warning: 'Hierro carbonilo para alta corriente DC'
        },
        powdered: {
            min: 0.01,
            max: 100,
            optimal: { min: 0.1, max: 10 },
            unit: 'mH',
            warning: 'Iron Powder Mix 26 ideal para filtros EMI'
        },
        iron_mix2: {
            min: 0.01,
            max: 50,
            optimal: { min: 0.1, max: 5 },
            unit: 'mH',
            warning: 'Mix 2 para aplicaciones de RF (0.1-2MHz)'
        },
        iron_mix8: {
            min: 0.01,
            max: 100,
            optimal: { min: 0.1, max: 10 },
            unit: 'mH',
            warning: 'Mix 8 para inductores de filtro (1-30MHz)'
        },
        sendust: {
            min: 0.05,
            max: 100,
            optimal: { min: 0.5, max: 20 },
            unit: 'mH',
            warning: 'Sendust/KoolMu excelente para baja pérdida y alta corriente'
        },
        silicon_steel: {
            min: 1,
            max: 1000,
            optimal: { min: 10, max: 500 },
            unit: 'H',
            warning: 'Acero al silicio para transformadores de potencia 50/60Hz'
        },
        grain_oriented: {
            min: 5,
            max: 1000,
            optimal: { min: 50, max: 500 },
            unit: 'H',
            warning: 'Grano orientado para máxima eficiencia en 50/60Hz'
        },
        nanocrystalline: {
            min: 0.1,
            max: 100,
            optimal: { min: 1, max: 50 },
            unit: 'mH',
            warning: 'Nanocristalino para alta frecuencia y baja pérdida'
        },
        amorphous: {
            min: 1,
            max: 500,
            optimal: { min: 10, max: 200 },
            unit: 'H',
            warning: 'Amorfo para transformadores de distribución eficientes'
        },
        mpp: {
            min: 0.1,
            max: 100,
            optimal: { min: 1, max: 50 },
            unit: 'mH',
            warning: 'MPP para inductores de filtro con alta estabilidad'
        },
        high_flux: {
            min: 0.05,
            max: 50,
            optimal: { min: 0.5, max: 10 },
            unit: 'mH',
            warning: 'High Flux para corrientes muy altas con bajo tamaño'
        }
    },

    // Rangos de corriente por tipo de núcleo
    current: {
        air: { min: 0.001, max: 10, optimal: { min: 0.01, max: 5 } },
        ferrite_mn_zn: { min: 0.01, max: 10, optimal: { min: 0.1, max: 5 } },
        ferrite_ni_zn: { min: 0.01, max: 5, optimal: { min: 0.1, max: 3 } },
        toroid: { min: 0.01, max: 10, optimal: { min: 0.1, max: 5 } },
        ferrite: { min: 0.1, max: 20, optimal: { min: 0.5, max: 10 } },
        ferrite_power: { min: 0.1, max: 15, optimal: { min: 0.5, max: 10 } },
        iron: { min: 0.1, max: 50, optimal: { min: 1, max: 20 } },
        powdered: { min: 0.1, max: 30, optimal: { min: 0.5, max: 15 } },
        iron_mix2: { min: 0.05, max: 10, optimal: { min: 0.2, max: 5 } },
        iron_mix8: { min: 0.1, max: 20, optimal: { min: 0.5, max: 10 } },
        sendust: { min: 0.5, max: 50, optimal: { min: 2, max: 30 } },
        silicon_steel: { min: 0.5, max: 100, optimal: { min: 2, max: 50 } },
        grain_oriented: { min: 1, max: 200, optimal: { min: 5, max: 100 } },
        nanocrystalline: { min: 0.1, max: 30, optimal: { min: 0.5, max: 15 } },
        amorphous: { min: 1, max: 100, optimal: { min: 5, max: 50 } },
        mpp: { min: 0.5, max: 30, optimal: { min: 2, max: 15 } },
        high_flux: { min: 1, max: 100, optimal: { min: 5, max: 50 } }
    },

    // Rangos de frecuencia óptima por material
    frequency: {
        air: { min: 0, max: 1e9, optimal: { min: 1e6, max: 1e9 } }, // MHz-GHz
        ferrite_mn_zn: { min: 10e3, max: 1e6, optimal: { min: 50e3, max: 500e3 } }, // 10kHz-1MHz
        ferrite_ni_zn: { min: 1e6, max: 100e6, optimal: { min: 5e6, max: 50e6 } }, // 1MHz-100MHz
        toroid: { min: 10e3, max: 1e6, optimal: { min: 20e3, max: 200e3 } },
        ferrite: { min: 20e3, max: 500e3, optimal: { min: 50e3, max: 200e3 } },
        ferrite_power: { min: 50e3, max: 1e6, optimal: { min: 100e3, max: 500e3 } },
        iron: { min: 100e3, max: 10e6, optimal: { min: 500e3, max: 5e6 } },
        powdered: { min: 50e3, max: 10e6, optimal: { min: 100e3, max: 1e6 } },
        iron_mix2: { min: 100e3, max: 2e6, optimal: { min: 200e3, max: 1e6 } },
        iron_mix8: { min: 1e6, max: 30e6, optimal: { min: 5e6, max: 20e6 } },
        sendust: { min: 10e3, max: 500e3, optimal: { min: 50e3, max: 200e3 } },
        silicon_steel: { min: 50, max: 400, optimal: { min: 50, max: 60 } }, // Solo 50/60Hz
        grain_oriented: { min: 50, max: 400, optimal: { min: 50, max: 60 } },
        nanocrystalline: { min: 10e3, max: 100e3, optimal: { min: 20e3, max: 50e3 } },
        amorphous: { min: 50, max: 1e3, optimal: { min: 50, max: 400 } },
        mpp: { min: 10e3, max: 500e3, optimal: { min: 50e3, max: 200e3 } },
        high_flux: { min: 20e3, max: 200e3, optimal: { min: 50e3, max: 100e3 } }
    },

    // Rangos de temperatura de operación
    temperature: {
        ambient: { min: -40, max: 125, optimal: { min: 0, max: 50 } },
        operating: { min: 0, max: 180, optimal: { min: 20, max: 100 } }
    },

    // Rangos de AWG por corriente
    wireGauge: {
        10: { maxCurrent: 15, area: 5.261, diameter: 2.588 },
        12: { maxCurrent: 9.3, area: 3.309, diameter: 2.053 },
        14: { maxCurrent: 5.9, area: 2.081, diameter: 1.628 },
        16: { maxCurrent: 3.7, area: 1.309, diameter: 1.291 },
        18: { maxCurrent: 2.3, area: 0.823, diameter: 1.024 },
        20: { maxCurrent: 1.5, area: 0.519, diameter: 0.812 },
        22: { maxCurrent: 0.92, area: 0.326, diameter: 0.644 },
        24: { maxCurrent: 0.577, area: 0.205, diameter: 0.511 },
        26: { maxCurrent: 0.361, area: 0.129, diameter: 0.405 },
        28: { maxCurrent: 0.226, area: 0.0804, diameter: 0.321 },
        30: { maxCurrent: 0.142, area: 0.0509, diameter: 0.255 },
        32: { maxCurrent: 0.091, area: 0.0324, diameter: 0.202 },
        34: { maxCurrent: 0.056, area: 0.0201, diameter: 0.160 },
        36: { maxCurrent: 0.035, area: 0.0127, diameter: 0.127 },
        38: { maxCurrent: 0.022, area: 0.00797, diameter: 0.101 },
        40: { maxCurrent: 0.014, area: 0.00501, diameter: 0.0799 }
    },

    // Rangos de dimensiones de núcleo toroidal (mm)
    toroidDimensions: {
        OD: { min: 5, max: 200, optimal: { min: 10, max: 100 } },
        ID: { min: 2, max: 150, optimal: { min: 5, max: 70 } },
        height: { min: 2, max: 100, optimal: { min: 5, max: 50 } }
    },

    // Rangos de dimensiones de bobina de aire (mm)
    airCoreDimensions: {
        diameter: { min: 3, max: 200, optimal: { min: 10, max: 100 } },
        length: { min: 5, max: 500, optimal: { min: 20, max: 200 } }
    }
};

/**
 * Clase principal de validación
 */
class ValidationSystem {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.suggestions = [];
    }

    /**
     * Limpia todos los mensajes
     */
    clear() {
        this.errors = [];
        this.warnings = [];
        this.suggestions = [];
    }

    /**
     * Valida todos los parámetros del inductor
     */
    validateInductor(params) {
        this.clear();

        const { coreType, inductance, inductanceUnit, current, wireGauge, 
                coilDiameter, coilLength, toroidOD, toroidID, toroidHeight } = params;

        // Convertir inductancia a unidad estándar (mH)
        const L_mH = this.convertToMH(inductance, inductanceUnit);

        // Validar tipo de núcleo
        if (!coreType || !VALIDATION_RANGES.inductance[coreType]) {
            this.errors.push('Tipo de núcleo no válido');
            return this.getResults();
        }

        // Validar inductancia
        this.validateInductance(coreType, L_mH);

        // Validar corriente
        this.validateCurrent(coreType, current);

        // Validar AWG
        this.validateWireGauge(wireGauge, current);

        // Validar dimensiones según tipo de núcleo
        if (coreType === 'air') {
            this.validateAirCoreDimensions(coilDiameter, coilLength);
        } else {
            this.validateToroidDimensions(toroidOD, toroidID, toroidHeight);
        }

        // Validar combinación de parámetros
        this.validateParameterCombination(coreType, L_mH, current);

        return this.getResults();
    }

    /**
     * Valida parámetros del transformador
     */
    validateTransformer(params) {
        this.clear();

        const { coreType, vPrimary, vSecondary, iSecondary, frequency, efficiency } = params;

        // Validar voltajes
        if (vPrimary <= 0 || vPrimary > 500000) {
            this.errors.push('Voltaje primario debe estar entre 0 y 500kV');
        }
        if (vSecondary <= 0 || vSecondary > 500000) {
            this.errors.push('Voltaje secundario debe estar entre 0 y 500kV');
        }

        // Relación de transformación
        const ratio = vPrimary / vSecondary;
        if (ratio < 0.01 || ratio > 1000) {
            this.warnings.push(`Relación de transformación ${ratio.toFixed(2)}:1 es inusual. Rango típico: 0.1:1 a 100:1`);
        }

        // Validar corriente secundaria
        if (iSecondary <= 0 || iSecondary > 1000) {
            this.errors.push('Corriente secundaria debe estar entre 0 y 1000A');
        }

        // Validar frecuencia
        this.validateFrequency(coreType, frequency);

        // Validar eficiencia
        if (efficiency < 50 || efficiency > 99.9) {
            this.errors.push('Eficiencia debe estar entre 50% y 99.9%');
        } else if (efficiency < 70) {
            this.warnings.push('Eficiencia muy baja. Considere mejorar el diseño');
        } else if (efficiency > 98) {
            this.warnings.push('Eficiencia muy alta. Verifique que sea realista para su aplicación');
        }

        // Potencia
        const power = vSecondary * iSecondary;
        if (power < 0.1) {
            this.warnings.push('Potencia muy baja (<0.1W). Considere usar componentes más pequeños');
        } else if (power > 10000) {
            this.warnings.push('Potencia muy alta (>10kW). Requiere diseño térmico especializado');
        }

        // Validar compatibilidad frecuencia-núcleo
        this.validateCoreFrequencyMatch(coreType, frequency);

        return this.getResults();
    }

    /**
     * Valida inductancia contra rangos del núcleo
     */
    validateInductance(coreType, L_mH) {
        const range = VALIDATION_RANGES.inductance[coreType];
        
        if (L_mH < range.min) {
            this.errors.push(`Inductancia demasiado baja para ${coreType}. Mínimo: ${range.min} ${range.unit}`);
        } else if (L_mH > range.max) {
            this.errors.push(`Inductancia demasiado alta para ${coreType}. Máximo: ${range.max} ${range.unit}`);
        }

        if (L_mH < range.optimal.min || L_mH > range.optimal.max) {
            this.warnings.push(range.warning);
            this.suggestions.push(`Rango óptimo: ${range.optimal.min}-${range.optimal.max} ${range.unit}`);
        }
    }

    /**
     * Valida corriente contra capacidad del núcleo
     */
    validateCurrent(coreType, current) {
        const range = VALIDATION_RANGES.current[coreType];
        
        if (current <= 0) {
            this.errors.push('La corriente debe ser mayor que cero');
            return;
        }

        if (current < range.min) {
            this.warnings.push(`Corriente muy baja para ${coreType}. Mínimo recomendado: ${range.min}A`);
        } else if (current > range.max) {
            this.errors.push(`Corriente demasiado alta para ${coreType}. Máximo: ${range.max}A`);
        }

        if (current < range.optimal.min || current > range.optimal.max) {
            this.suggestions.push(`Rango óptimo de corriente: ${range.optimal.min}-${range.optimal.max}A`);
        }
    }

    /**
     * Valida AWG contra corriente
     */
    validateWireGauge(awg, current) {
        const wire = VALIDATION_RANGES.wireGauge[awg];
        
        if (!wire) {
            this.errors.push(`AWG ${awg} no está en el rango soportado (10-40)`);
            return;
        }

        if (current > wire.maxCurrent) {
            this.errors.push(`AWG ${awg} no soporta ${current}A. Máximo recomendado: ${wire.maxCurrent}A`);
            const suggestedAWG = this.suggestAWG(current);
            if (suggestedAWG) {
                this.suggestions.push(`Use AWG ${suggestedAWG} o menor para ${current}A`);
            }
        } else if (current < wire.maxCurrent * 0.1) {
            this.warnings.push(`AWG ${awg} es muy grueso para ${current}A. Puede usar un cable más delgado`);
            const suggestedAWG = this.suggestAWG(current);
            if (suggestedAWG) {
                this.suggestions.push(`AWG ${suggestedAWG} sería más apropiado`);
            }
        }
    }

    /**
     * Sugiere AWG apropiado para una corriente
     */
    suggestAWG(current) {
        for (let awg = 10; awg <= 40; awg++) {
            const wire = VALIDATION_RANGES.wireGauge[awg];
            if (wire && wire.maxCurrent >= current * 1.2) { // 20% de margen
                return awg;
            }
        }
        return null;
    }

    /**
     * Valida frecuencia para el tipo de núcleo
     */
    validateFrequency(coreType, frequency) {
        if (!VALIDATION_RANGES.frequency[coreType]) return;

        const range = VALIDATION_RANGES.frequency[coreType];

        if (frequency <= 0) {
            this.errors.push('La frecuencia debe ser mayor que cero');
            return;
        }

        if (frequency < range.min) {
            this.warnings.push(`Frecuencia muy baja para ${coreType}. Mínimo: ${this.formatFrequency(range.min)}`);
        } else if (frequency > range.max) {
            this.errors.push(`Frecuencia demasiado alta para ${coreType}. Máximo: ${this.formatFrequency(range.max)}`);
        }

        if (frequency < range.optimal.min || frequency > range.optimal.max) {
            this.suggestions.push(`Rango óptimo: ${this.formatFrequency(range.optimal.min)}-${this.formatFrequency(range.optimal.max)}`);
        }
    }

    /**
     * Valida compatibilidad entre núcleo y frecuencia
     */
    validateCoreFrequencyMatch(coreType, frequency) {
        const recommendations = {
            'silicon_steel': { 
                range: [50, 400], 
                message: 'Acero al silicio es óptimo solo para 50/60Hz. Para frecuencias más altas use ferrita'
            },
            'grain_oriented': { 
                range: [50, 400], 
                message: 'Grano orientado es óptimo solo para 50/60Hz'
            },
            'ferrite_mn_zn': { 
                range: [10000, 1000000], 
                message: 'Ferrita MnZn es óptima para 10kHz-1MHz'
            },
            'ferrite_ni_zn': { 
                range: [1000000, 100000000], 
                message: 'Ferrita NiZn es óptima para >1MHz'
            }
        };

        const rec = recommendations[coreType];
        if (rec && (frequency < rec.range[0] || frequency > rec.range[1])) {
            this.warnings.push(rec.message);
        }
    }

    /**
     * Valida dimensiones de núcleo toroidal
     */
    validateToroidDimensions(od, id, height) {
        const ranges = VALIDATION_RANGES.toroidDimensions;

        if (od <= id) {
            this.errors.push('El diámetro exterior debe ser mayor que el interior');
        }

        if (od < ranges.OD.min || od > ranges.OD.max) {
            this.warnings.push(`Diámetro exterior fuera de rango típico: ${ranges.OD.min}-${ranges.OD.max}mm`);
        }

        if (id < ranges.ID.min || id > ranges.ID.max) {
            this.warnings.push(`Diámetro interior fuera de rango típico: ${ranges.ID.min}-${ranges.ID.max}mm`);
        }

        if (height < ranges.height.min || height > ranges.height.max) {
            this.warnings.push(`Altura fuera de rango típico: ${ranges.height.min}-${ranges.height.max}mm`);
        }

        // Validar proporciones
        const wallThickness = (od - id) / 2;
        if (wallThickness < 2) {
            this.warnings.push('Pared del toroide muy delgada (<2mm). Puede ser frágil');
        }
        if (wallThickness > height * 2) {
            this.warnings.push('Toroide muy ancho en relación a su altura. Considere ajustar dimensiones');
        }
    }

    /**
     * Valida dimensiones de bobina de aire
     */
    validateAirCoreDimensions(diameter, length) {
        const ranges = VALIDATION_RANGES.airCoreDimensions;

        if (diameter < ranges.diameter.min || diameter > ranges.diameter.max) {
            this.warnings.push(`Diámetro fuera de rango típico: ${ranges.diameter.min}-${ranges.diameter.max}mm`);
        }

        if (length < ranges.length.min || length > ranges.length.max) {
            this.warnings.push(`Longitud fuera de rango típico: ${ranges.length.min}-${ranges.length.max}mm`);
        }

        // Validar relación longitud/diámetro
        const ratio = length / diameter;
        if (ratio < 0.5) {
            this.warnings.push('Bobina muy corta. Factor de forma bajo puede reducir inductancia');
        } else if (ratio > 5) {
            this.warnings.push('Bobina muy larga. Considere bobinado en capas');
        }
    }

    /**
     * Valida combinación de parámetros
     */
    validateParameterCombination(coreType, L_mH, current) {
        // Producto L×I² (energía almacenada)
        const energy = L_mH * 1e-3 * Math.pow(current, 2) / 2;

        if (energy > 100) {
            this.warnings.push(`Energía almacenada alta (${energy.toFixed(1)}J). Requiere diseño térmico cuidadoso`);
        }

        // Advertencias específicas por tipo de núcleo
        if (coreType.includes('silicon') || coreType.includes('grain')) {
            if (current < 0.1) {
                this.warnings.push('Núcleos de acero son innecesariamente grandes para corrientes bajas. Considere ferrita');
            }
        }

        if (coreType === 'air') {
            if (L_mH > 1) {
                this.warnings.push('Inductancias altas con núcleo de aire requieren muchas vueltas. Considere usar núcleo magnético');
            }
        }
    }

    /**
     * Convierte inductancia a mH
     */
    convertToMH(value, unit) {
        const conversions = {
            'uH': value / 1000,
            'mH': value,
            'H': value * 1000
        };
        return conversions[unit] || value;
    }

    /**
     * Formatea frecuencia con unidad apropiada
     */
    formatFrequency(freq) {
        if (freq >= 1e9) return `${(freq/1e9).toFixed(1)}GHz`;
        if (freq >= 1e6) return `${(freq/1e6).toFixed(1)}MHz`;
        if (freq >= 1e3) return `${(freq/1e3).toFixed(1)}kHz`;
        return `${freq}Hz`;
    }

    /**
     * Retorna resultados de validación
     */
    getResults() {
        return {
            valid: this.errors.length === 0,
            errors: this.errors,
            warnings: this.warnings,
            suggestions: this.suggestions
        };
    }
}

/**
 * Función para mostrar resultados de validación en la UI
 */
function displayValidationResults(results, containerId = 'validationMessages') {
    const container = document.getElementById(containerId);
    if (!container) {
        // Crear contenedor si no existe
        const newContainer = document.createElement('div');
        newContainer.id = containerId;
        newContainer.className = 'validation-container';
        const form = document.querySelector('.panel');
        if (form) {
            form.insertBefore(newContainer, form.querySelector('.btn-primary'));
        }
        return displayValidationResults(results, containerId);
    }

    let html = '';

    // Errores (bloquean el cálculo)
    if (results.errors.length > 0) {
        html += '<div class="validation-errors">';
        html += '<div class="validation-title error">❌ Errores Críticos</div>';
        results.errors.forEach(error => {
            html += `<div class="validation-message error">• ${error}</div>`;
        });
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

    // Desplazar al contenedor de mensajes
    container.scrollIntoView({ behavior: 'smooth' });
}
// Exportar la clase ValidationSystem para uso en otros módulos
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = ValidationSystem;
} else {
    window.ValidationSystem = ValidationSystem;
}
