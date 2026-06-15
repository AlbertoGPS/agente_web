// ============================================================================
// apis.js — Todas las llamadas a la API de RedGPS
//
// Uso en cualquier agente:
//   import { getTareasUsuario, crearTareaAPI, actualizarTareas, crearComentarioAPI } from './apis.js';
//
// Para cambiar credenciales o URLs, solo editas este archivo.
// ============================================================================

import { getCredentials } from './auth.js';
import { enviarNotificacionTarea } from './firebase.js';

let BASE_URL = 'https://qaapi.service24gps.com/api/v1/onassistant';

function getRedGPSCredentials() {
    const creds = getCredentials();
    console.log('📡 creds:', creds);
    return {
        token: creds ? creds.token : 'MCNS1P1iGyB/BEPPnBLfDwSHktAScB5HQNQaoW6ZkGQ38J6Ut303+ti8FyXSLXd3',
        apikey: creds ? creds.redgpsKey : '90193e6fcd90b47902fcfdf4adf34ddc',
        username: creds ? creds.username : 'sin usuario'
    };
}

const CREDENCIALES_ACTIVOS ={
    apikey:"6024b79f2b985aa87539deb0bc0f80d4",
    token :"wBcWYNxVw+Z6UtWbX3ISxXQZ6GOA6BNBd3JII5clpjD0RoaGjWle8pe7UyufjOvI",
}

const CREDENCIALES_LICENCIAMIENTO ={
    apikey:"513c8028735a305ef4bc4e9847829813",
    token :"uUjqv3hJZ4x8in6Y5Jd3KKKdGoeHvHqXWLYHPWN1Uw7ocp2DXxUspg==I",
}

// Helper interno — hace el fetch y maneja errores de forma uniforme
async function postRedGPS(endpoint, body) {

    let credenciales = getRedGPSCredentials();

    // Si pasamos por el enrutador universal, la intención real viene en el body
    const intencionReal = (endpoint === 'consultar_backend') ? body.intencion : endpoint;

    if((intencionReal === 'getReporteActivos' || intencionReal === 'infoVehiculo' || intencionReal === 'getRecorridoActivo')){
        credenciales = CREDENCIALES_ACTIVOS;
    }

    if(intencionReal === 'getReporteLicenciamiento'){
        credenciales = CREDENCIALES_LICENCIAMIENTO;
    }

    if(endpoint === 'gettoken'){
        BASE_URL = 'https://qaapi.service24gps.com/api/v1';
    }else{
        BASE_URL = 'https://qaapi.service24gps.com/api/v1/onassistant';
    }

    console.log('📡 BASE_URL:', `${BASE_URL}/${endpoint}`);
    console.log('📡 credenciales:', credenciales);
    console.log('📡 body:', body);


    try {
        const response = await fetch(`${BASE_URL}/${endpoint}`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',   
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ...credenciales, ...body })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        return await response.json();

    } catch (error) {
        console.error(`❌ Error en /${endpoint}:`, error);
        return { error: `No se pudo conectar con RedGps (${endpoint}).` };
    }
}

// ── Funciones exportadas ──────────────────────────────────────────────────────

/**
 * Despachador genérico — recibe el nombre de la herramienta y sus args.
 * Usado por ambos agentes y por el login.
 * @param {string} nombre - nombre de la función ('consultar_backend' o 'gettoken')
 * @param {Object} args   - argumentos del LLM o del login
 * @returns {Promise<Object>} resultado de la API
 */
export async function ejecutarHerramienta(nombre, args) {
    if (nombre === 'gettoken') {
        console.log('📡 gettoken:', args);
        return postRedGPS('gettoken', {
            username: args.username,
            password: args.password,
            token: args.token || "wBcWYNxVw+Z6UtWbX3ISxXQZ6GOA6BNBd3JII5clpjD0RoaGjWle8pe7UyufjOvI"
        });
    }

    if (nombre === 'consultar_backend') {
        let parametrosJSON = {};
        try {
            parametrosJSON = args.parametros ? JSON.parse(args.parametros) : {};
        } catch (e) {
            console.error("Error parseando parámetros JSON:", e);
            return { error: "Parámetros inválidos (no es un JSON válido)" };
        }

        console.log(`📡 consultar_backend [${args.intencion}]:`, parametrosJSON);
        
        const response = await postRedGPS('consultar_backend', {
            intencion: args.intencion,
            parametros: args.parametros
        });

        // Lógica especial post-ejecución (Notificaciones de Firebase para crearTarea)
        if (args.intencion === 'crearTarea' && response && !response.error) {
            try {
                if (parametrosJSON.colaboradores) {
                    enviarNotificacionTarea(parametrosJSON.colaboradores, parametrosJSON.titulo, parametrosJSON.descripcion);
                }
            } catch (e) {
                console.error("❌ Error enviando notificación por Firebase:", e);
            }
        }

        return response;
    }

    console.warn('⚠️ Herramienta desconocida:', nombre);
    return { error: `Herramienta "${nombre}" no reconocida.` };
}