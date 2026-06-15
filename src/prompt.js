// ============================================================================
// prompt.js — Lee base.md y construye el system prompt final
//
// Uso en cualquier agente:
//   import { getSystemPrompt } from './prompt.js';
//   const prompt = await getSystemPrompt();
// ============================================================================

// Importa el contenido de base.md como string (Vite lo soporta nativamente)
import basePrompt from './prompts/base.md?raw';

/**
 * Retorna el system prompt completo con la fecha/hora actual inyectada.
 * Se llama una vez al iniciar cada sesión para tener la fecha fresca.
 */
export function getSystemPrompt(endpoints) {
    const ahora = new Date();
    
    // REDONDEO: Redondeamos a los 5 minutos más cercanos para activar el CACHING de Google.
    // Esto hace que el prompt sea "idéntico" durante 5 minutos, ahorrando miles de tokens.
    const minutosRedondeados = Math.floor(ahora.getMinutes() / 5) * 5;
    ahora.setMinutes(minutosRedondeados);
    ahora.setSeconds(0);

    const fechaActual = ahora.toLocaleString('es-MX', {
        timeZone: 'America/Mexico_City',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
        hour12: false
    });

    const contextoTemporal = `[SISTEMA] Fecha/Hora actual aproximada: ${fechaActual}. 
    Calcula fechas relativas ("hoy", "mañana", "ayer") basándote en esta. 
    Para las herramientas/API usa SIEMPRE formato 'YYYY-MM-DD HH:MM:SS'.\n\n`;

    return  basePrompt.replace('{{endpoints}}', endpoints) + contextoTemporal ;
}

/**
 * Definición de herramientas compartida — formato OpenAI-compatible.
 * Gemini las convierte a su formato internamente con el SDK.
 */
export const herramientas = [
    {
        type: 'function',
        function: {
            name: 'consultar_backend',
            description: 'Enrutador universal. Úsalo para enviar CUALQUIER comando o consulta al backend. Puedes llamarlo múltiples veces si necesitas procesar varios endpoints.',
            parameters: {
                type: 'object',
                properties: {
                    intencion: { type: 'string', description: "El nombre exacto del endpoint a ejecutar (ej: 'crearTarea', 'getReporteActivos', 'infoVehiculo')." },
                    parametros: { type: 'string', description: "Un string en formato JSON con los parámetros requeridos. Ej: '{\"titulo\": \"Hola\"}'" }
                },
                required: ['intencion', 'parametros']
            }
        }
    }
];

/**
 * Formato de herramientas para Gemini SDK
 * El SDK de Google usa functionDeclarations en lugar del formato OpenAI
 */
export const herramientasGemini = [{
    functionDeclarations: herramientas.map(h => ({
        name: h.function.name,
        description: h.function.description,
        parameters: {
            type: 'OBJECT',
            properties: Object.fromEntries(
                Object.entries(h.function.parameters.properties).map(([k, v]) => [
                    k, { type: v.type.toUpperCase(), description: v.description }
                ])
            ),
            required: h.function.parameters.required
        }
    }))
}];
