import { MilvusClient } from '@zilliz/milvus2-sdk-node';
import { pipeline } from '@xenova/transformers';

const COLLECTION_NAME = 'endpoints_redgps';

async function buscarEndpointsRelevantes(embedder, client, pregunta, limite = 2) {
  // 1. Convertir la pregunta del usuario a un vector con el MISMO modelo
  const output = await embedder(pregunta, { pooling: 'mean', normalize: true });
  const queryEmbedding = Array.from(output.data);

  // 2. Buscar en Milvus los endpoints más similares semánticamente
  const resultados = await client.search({
    collection_name: COLLECTION_NAME,
    data: [queryEmbedding],
    output_fields: ['nombre', 'descripcion', 'parametros'],
    limit: limite,
  });

  console.log(resultados);

  return resultados.results;
}

function construirPromptReducido(endpoints) {
  return endpoints
    .map(e => `- **${e.nombre}**: ${e.descripcion}\n  Parámetros: ${e.parametros}`)
    .join('\n\n');
}

const PREGUNTAS_DE_PRUEBA = [
  '¿Cuántos vehículos tengo activos en mi flota?',
  '¿Dónde estuvo el camión con placa ABC-123 ayer?',
  'Quiero ver las alertas de velocidad de hoy',
  '¿Cuánta gasolina consumió la flota esta semana?',
  'El vehículo salió de la zona permitida',
];

async function main() {
  console.log('Cargando modelo local...');
  const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  const client = new MilvusClient({ address: 'localhost:19530' });

  console.log('=== Demo RAG — Búsqueda de endpoints por pregunta del usuario ===\n');
  console.log('Concepto: en vez de meter TODOS los endpoints en el prompt,');
  console.log('solo enviamos los 2 más relevantes para cada pregunta.\n');
  console.log('─'.repeat(60) + '\n');

  for (const pregunta of PREGUNTAS_DE_PRUEBA) {
    console.log(`Pregunta: "${pregunta}"`);

    const endpointsRelevantes = await buscarEndpointsRelevantes(embedder, client, pregunta, 2);

    console.log('Endpoints encontrados por Milvus:');
    endpointsRelevantes.forEach((e, i) => {
      const score = (e.score * 100).toFixed(1);
      console.log(`  ${i + 1}. ${e.nombre} (similitud: ${score}%)`);
    });

    console.log('\nPrompt reducido que iría al modelo:');
    console.log(endpointsRelevantes);
    console.log(
      construirPromptReducido(endpointsRelevantes)
        .split('\n')
        .map(l => '  ' + l)
        .join('\n')
    );

    console.log('\n' + '─'.repeat(60) + '\n');
  }

  console.log('Resultado: en vez de 6 endpoints en el prompt, solo van 2.');
  console.log('Con 50 endpoints, la reducción sería de 50 → 2-3.');
}

main().catch(console.error);
