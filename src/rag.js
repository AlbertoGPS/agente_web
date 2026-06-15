import { pipeline, env } from '@xenova/transformers';
import embeddingsData from './data/embeddings.json';
env.allowLocalModels = false;

const THRESHOLD = 0.65;
const COLLECTION_NAME = 'endpoints_redgps';

let embedder = null;

function cosineSimilarity(a, b) {
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

// Búsqueda local en el JSON estático (producción)
function buscarEnJSON(data, queryEmbedding, limite) {
  return data
    .map(item => ({ ...item, distance: cosineSimilarity(queryEmbedding, item.embedding) }))
    .filter(item => item.distance >= THRESHOLD)
    .sort((a, b) => b.distance - a.distance)
    .slice(0, limite);
}

async function buscarEndpointsRelevantes(embedder, pregunta, limite = 3) {
  const output = await embedder(pregunta, { pooling: 'mean', normalize: true });
  const queryEmbedding = Array.from(output.data);



  if (import.meta.env.PROD) {
    console.log('entra a prod');
    return buscarEnJSON(embeddingsData.query.data, queryEmbedding, limite);
  }

  const respuesta = await fetch('/milvus/v2/vectordb/entities/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collectionName: COLLECTION_NAME,
      data: [queryEmbedding],
      outputFields: ['nombre', 'descripcion', 'parametros'],
      limit: limite
    })
  });

  const json = await respuesta.json();
  return json.data.filter(item => item.distance >= THRESHOLD);
}

async function buscarManual(embedder, pregunta, limite = 3) {
  const output = await embedder(pregunta, { pooling: 'mean', normalize: true });
  const queryEmbedding = Array.from(output.data);

  if (import.meta.env.PROD) {
    return buscarEnJSON(embeddingsData.queryManual.data, queryEmbedding, limite);
  }

  const respuesta = await fetch('/milvus/v2/vectordb/entities/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collectionName: 'manuales_redgps',
      data: [queryEmbedding],
      outputFields: ['nombre', 'contenido'],
      limit: limite
    })
  });

  const json = await respuesta.json();
  return json.data.filter(item => item.distance >= THRESHOLD);
}

async function cargarEmbedder() {
  console.log('🚀 Cargando modelo de embedding...');
  const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  console.log('✅ Modelo de embedding cargado');
  return embedder;
}

export async function buscarEndpoints(pregunta) {
  try {
    if (!embedder) {
      embedder = await cargarEmbedder();
    }

    const resultados = await buscarEndpointsRelevantes(embedder, pregunta);
    const resultadosManual = await buscarManual(embedder, pregunta);

    let respuesta = '';

    if (resultados.length > 0) {
      respuesta += "Endpoints relacionados con tu pregunta:\n\n";
      resultados.forEach(resultado => {
        respuesta += `📝 **${resultado.nombre}**\n`;
        respuesta += `📄 **Descripción**: ${resultado.descripcion}\n`;
        respuesta += `⚙️ **Parámetros**: ${resultado.parametros}\n\n`;
      });
    }

    if (resultadosManual.length > 0) {
      respuesta += "Documentación relevante:\n\n";
      resultadosManual.forEach(resultado => {
        respuesta += `📝 **${resultado.nombre}**\n`;
        respuesta += `📄 **Contenido**: ${resultado.contenido}\n\n`;
      });
    }

    console.log('RAG encontró:', resultados.length, 'endpoints,', resultadosManual.length, 'manuales');
    return respuesta;
  } catch (error) {
    console.error('Error al buscar endpoints:', error);
    return '';
  }
}
