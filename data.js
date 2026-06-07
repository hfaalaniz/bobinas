// Base de datos de materiales magnéticos
const coreDatabase = {
    air: {
        name: "Núcleo de Aire",
        mu_r: 1,
        bsat: 0,
        loss: 0,
        temp_coef: 0,
        frequency_range: [0, 1e9],
        cost: 1,
        color: "#87CEEB"
    },
    // loss     : mW/cm³ medido a loss_bref [T] y loss_fref [Hz]
    // loss_bref: densidad de flujo de referencia para el dato loss
    // loss_fref: frecuencia de referencia para el dato loss
    // steinmetz_beta: exponente B de la ley de Steinmetz (Pfe ∝ B^β)
    // steinmetz_alpha: exponente f de la ley de Steinmetz (Pfe ∝ f^α)
    ferrite_mn_zn: {
        name: "Ferrita MnZn (3C90)",
        mu_r: 2300,
        bsat: 0.47,
        loss: 450,       // mW/cm³ @ 0.2T, 100kHz (datasheet Ferroxcube)
        loss_bref: 0.20,
        loss_fref: 100e3,
        steinmetz_beta: 2.5,
        steinmetz_alpha: 1.6,
        temp_coef: -0.25,
        frequency_range: [25e3, 500e3],
        cost: 3,
        color: "#8B4513"
    },
    ferrite_ni_zn: {
        name: "Ferrita NiZn (4C65)",
        mu_r: 125,
        bsat: 0.35,
        loss: 600,       // mW/cm³ @ 0.15T, 1MHz
        loss_bref: 0.15,
        loss_fref: 1e6,
        steinmetz_beta: 2.5,
        steinmetz_alpha: 1.7,
        temp_coef: -0.15,
        frequency_range: [1e6, 50e6],
        cost: 4,
        color: "#A0522D"
    },
    toroid: {
        name: "Toroidal Ferrita (3F3)",
        mu_r: 2000,
        bsat: 0.45,
        loss: 300,       // mW/cm³ @ 0.2T, 200kHz
        loss_bref: 0.20,
        loss_fref: 200e3,
        steinmetz_beta: 2.5,
        steinmetz_alpha: 1.6,
        temp_coef: -0.2,
        frequency_range: [50e3, 1e6],
        cost: 3.5,
        color: "#CD853F"
    },
    ferrite: {
        name: "Núcleo E/I Ferrita (N87)",
        mu_r: 2200,
        bsat: 0.49,
        loss: 400,       // mW/cm³ @ 0.2T, 100kHz (EPCOS N87)
        loss_bref: 0.20,
        loss_fref: 100e3,
        steinmetz_beta: 2.5,
        steinmetz_alpha: 1.6,
        temp_coef: -0.22,
        frequency_range: [25e3, 500e3],
        cost: 3.2,
        color: "#D2691E"
    },
    ferrite_power: {
        name: "Ferrita Power (3F4)",
        mu_r: 900,
        bsat: 0.50,
        loss: 200,       // mW/cm³ @ 0.1T, 500kHz
        loss_bref: 0.10,
        loss_fref: 500e3,
        steinmetz_beta: 2.5,
        steinmetz_alpha: 1.5,
        temp_coef: -0.18,
        frequency_range: [500e3, 3e6],
        cost: 4.5,
        color: "#8B4513"
    },
    iron: {
        name: "Hierro Carbonilo",
        mu_r: 35,
        bsat: 1.5,
        loss: 120,       // mW/cm³ @ 0.5T, 100kHz (Arnold/Micrometals)
        loss_bref: 0.50,
        loss_fref: 100e3,
        steinmetz_beta: 2.2,
        steinmetz_alpha: 1.5,
        temp_coef: 0.05,
        frequency_range: [1e5, 10e6],
        cost: 5,
        color: "#696969"
    },
    powdered: {
        name: "Iron Powder Mix 26",
        mu_r: 75,
        bsat: 1.5,
        loss: 80,        // mW/cm³ @ 0.5T, 50kHz
        loss_bref: 0.50,
        loss_fref: 50e3,
        steinmetz_beta: 2.2,
        steinmetz_alpha: 1.5,
        temp_coef: 0.08,
        frequency_range: [50e3, 1e6],
        cost: 4,
        color: "#808080"
    },
    iron_mix2: {
        name: "Iron Powder Mix 2",
        mu_r: 10,
        bsat: 1.5,
        loss: 50,        // mW/cm³ @ 0.3T, 1MHz
        loss_bref: 0.30,
        loss_fref: 1e6,
        steinmetz_beta: 2.2,
        steinmetz_alpha: 1.6,
        temp_coef: 0.12,
        frequency_range: [1e6, 50e6],
        cost: 3.8,
        color: "#A9A9A9"
    },
    iron_mix8: {
        name: "Iron Powder Mix 8",
        mu_r: 35,
        bsat: 1.5,
        loss: 70,        // mW/cm³ @ 0.5T, 500kHz
        loss_bref: 0.50,
        loss_fref: 500e3,
        steinmetz_beta: 2.2,
        steinmetz_alpha: 1.5,
        temp_coef: 0.1,
        frequency_range: [500e3, 10e6],
        cost: 4.2,
        color: "#778899"
    },
    sendust: {
        name: "Sendust (KoolMu)",
        mu_r: 60,
        bsat: 1.0,
        loss: 30,        // mW/cm³ @ 0.5T, 100kHz (Magnetics Inc.)
        loss_bref: 0.50,
        loss_fref: 100e3,
        steinmetz_beta: 2.3,
        steinmetz_alpha: 1.4,
        temp_coef: 0.06,
        frequency_range: [50e3, 1e6],
        cost: 6,
        color: "#B0C4DE"
    },
    // Materiales laminados para red (50/60 Hz)
    // loss en mW/cm³ @ loss_bref [T], 50 Hz (norma IEC 60404 / ASTM A677)
    silicon_steel: {
        name: "Acero al Silicio",
        mu_r: 4000,
        bsat: 1.8,
        loss: 8.4,       // mW/cm³ @ 1.5T, 50Hz  (M330-35A: ~1.1 W/kg × 7.65 g/cm³)
        loss_bref: 1.50,
        loss_fref: 50,
        steinmetz_beta: 2.0,
        steinmetz_alpha: 1.4,
        temp_coef: 0.02,
        frequency_range: [50, 400],
        cost: 2,
        color: "#4682B4"
    },
    grain_oriented: {
        name: "Acero Grano Orientado",
        mu_r: 5000,
        bsat: 2.0,
        loss: 5.0,       // mW/cm³ @ 1.7T, 50Hz  (M100-23S: ~0.65 W/kg × 7.65 g/cm³)
        loss_bref: 1.70,
        loss_fref: 50,
        steinmetz_beta: 2.0,
        steinmetz_alpha: 1.4,
        temp_coef: 0.01,
        frequency_range: [50, 400],
        cost: 2.5,
        color: "#5F9EA0"
    },
    nanocrystalline: {
        name: "Nanocristalino",
        mu_r: 80000,
        bsat: 1.2,
        loss: 2.0,       // mW/cm³ @ 1.0T, 20kHz  (Vitroperm 500F)
        loss_bref: 1.00,
        loss_fref: 20e3,
        steinmetz_beta: 2.2,
        steinmetz_alpha: 1.3,
        temp_coef: -0.02,
        frequency_range: [20e3, 100e3],
        cost: 10,
        color: "#FF6347"
    },
    amorphous: {
        name: "Amorfo metálico",
        mu_r: 50000,
        bsat: 1.5,
        loss: 0.5,       // mW/cm³ @ 1.4T, 50Hz  (Metglas 2605SA1: ~0.06 W/kg × 7.18 g/cm³)
        loss_bref: 1.40,
        loss_fref: 50,
        steinmetz_beta: 1.8,
        steinmetz_alpha: 1.3,
        temp_coef: -0.03,
        frequency_range: [50, 10e3],
        cost: 8,
        color: "#FF4500"
    },
    mpp: {
        name: "MPP (Molypermalloy)",
        mu_r: 125,
        bsat: 0.8,
        loss: 15,        // mW/cm³ @ 0.5T, 100kHz (Magnetics Inc.)
        loss_bref: 0.50,
        loss_fref: 100e3,
        steinmetz_beta: 2.3,
        steinmetz_alpha: 1.4,
        temp_coef: 0.04,
        frequency_range: [50e3, 500e3],
        cost: 9,
        color: "#FFD700"
    },
    high_flux: {
        name: "High Flux",
        mu_r: 60,
        bsat: 1.5,
        loss: 40,        // mW/cm³ @ 0.5T, 100kHz
        loss_bref: 0.50,
        loss_fref: 100e3,
        steinmetz_beta: 2.2,
        steinmetz_alpha: 1.4,
        temp_coef: 0.05,
        frequency_range: [50e3, 200e3],
        cost: 7,
        color: "#FFA500"
    }
};

// Tabla AWG - Diámetro del cable y resistencia
const awgTable = {
    10: { diameter: 2.588, resistance: 3.277, area: 5.261 },
    11: { diameter: 2.305, resistance: 4.132, area: 4.172 },
    12: { diameter: 2.053, resistance: 5.211, area: 3.309 },
    13: { diameter: 1.828, resistance: 6.571, area: 2.624 },
    14: { diameter: 1.628, resistance: 8.286, area: 2.081 },
    15: { diameter: 1.450, resistance: 10.45, area: 1.650 },
    16: { diameter: 1.291, resistance: 13.17, area: 1.309 },
    17: { diameter: 1.150, resistance: 16.61, area: 1.038 },
    18: { diameter: 1.024, resistance: 20.95, area: 0.823 },
    19: { diameter: 0.912, resistance: 26.42, area: 0.653 },
    20: { diameter: 0.812, resistance: 33.31, area: 0.518 },
    21: { diameter: 0.723, resistance: 42.00, area: 0.410 },
    22: { diameter: 0.644, resistance: 52.96, area: 0.326 },
    23: { diameter: 0.573, resistance: 66.79, area: 0.258 },
    24: { diameter: 0.511, resistance: 84.22, area: 0.205 },
    25: { diameter: 0.455, resistance: 106.2, area: 0.162 },
    26: { diameter: 0.405, resistance: 133.9, area: 0.129 },
    27: { diameter: 0.361, resistance: 168.9, area: 0.102 },
    28: { diameter: 0.321, resistance: 212.9, area: 0.081 },
    29: { diameter: 0.286, resistance: 268.5, area: 0.0642 },
    30: { diameter: 0.255, resistance: 338.6, area: 0.0509 },
    32: { diameter: 0.202, resistance: 538.3, area: 0.0320 },
    34: { diameter: 0.160, resistance: 856.0, area: 0.0201 },
    36: { diameter: 0.127, resistance: 1361, area: 0.0127 },
    38: { diameter: 0.101, resistance: 2163, area: 0.00797 },
    40: { diameter: 0.0799, resistance: 3441, area: 0.00501 }
};

// Constantes físicas
const CONSTANTS = {
    mu0: 4 * Math.PI * 1e-7, // Permeabilidad del vacío (H/m)
    copperResistivity: 1.68e-8, // Resistividad del cobre (Ω·m)
    copperDensity: 8960, // Densidad del cobre (kg/m³)
    maxCurrentDensity: 5e6, // Densidad de corriente máxima (A/m²)
    tempCoefCopper: 0.00393 // Coeficiente de temperatura del cobre (/°C)
};

// Variable global para almacenar diseños
let savedDesigns = [];

// Formas de núcleo comunes y sus dimensiones estándar
const coreShapes = {
    toroid: [
        { od: 10, id: 5, h: 5 },
        { od: 15, id: 8, h: 6 },
        { od: 20, id: 10, h: 8 },
        { od: 25, id: 13, h: 10 },
        { od: 30, id: 15, h: 10 },
        { od: 40, id: 20, h: 12 },
        { od: 50, id: 25, h: 15 }
    ],
    ei: [
        { width: 10, height: 10, depth: 5 },
        { width: 15, height: 15, depth: 8 },
        { width: 20, height: 20, depth: 10 },
        { width: 25, height: 25, depth: 12 },
        { width: 30, height: 30, depth: 15 }
    ]
};