import { MilvusClient, DataType } from '@zilliz/milvus2-sdk-node';
import { pipeline } from '@xenova/transformers';
import fs from 'fs';


const COLLECTION_NAME = ['endpoints_redgps', 'manuales_redgps'];
const VECTOR_DIM = 384; // all-MiniLM-L6-v2 produce vectores de 384 dimensiones

// Catálogo de endpoints — en producción esto viviría en una base de datos
// Mezclamos los 3 reales con 3 ficticios para ver cómo RAG escala
const ENDPOINTS = [
  {
    nombre: 'getAllAssets',
    descripcion: 'Obtiene la lista completa de vehículos del usuario. Devuelve todos los activos con su nombre, placa, tipo, marca, modelo y estado de ignición.',
    parametros: '{}',
    casos_de_uso: 'listar vehículos, cuántos camiones tengo, mostrar todos los activos, ver flota completa, vehículos activos, obtener idgps de un vehículo'
  },
  {
    nombre: 'getRecorrido',
    descripcion: 'Obtiene el historial de ruta y movimiento de un vehículo en un rango de fechas. Requiere el idgps del vehículo. Si no lo tienes, primero llama getAllAssets para obtenerlo por nombre o placa. NUNCA inventes el idgps',
    parametros: '{ "imei": "idgps del vehículo", "from": "YYYY-MM-DD 00:00:00", "to": "YYYY-MM-DD 23:59:59" }',
    casos_de_uso: 'recorrido de hoy, dónde estuvo el camión ayer, ruta de la semana, trayecto, historial de movimiento, paradas del día, distancia recorrida'
  },
  {
    nombre: 'crearTarea',
    descripcion: 'Crear una tarea para realizar una usuarios específico , solo el titulo y descripción son obligatorios.',
    parametros: '{ "titulo": "titulo de la tarea", "descripcion": "descripcion de la tarea", "usuarios": ["nombre del usuario"] }',
    casos_de_uso: 'crear tarea, asignar tarea, asignar tarea a usuarios, asignar tarea a un área'
  }
];

const MANUAL = [
  {
    nombre: 'Cómo obtener el ID de dispositivos BLE',
    contenido: `Para utilizar dispositivos BLE dentro de la plataforma necesitas 
    conocer su dirección MAC. Usa la app BLE Scanner en Android: instálala, 
    activa Bluetooth, escanea dispositivos cercanos, localiza tu dispositivo 
    y copia la dirección MAC (formato XX:XX:XX:XX:XX:XX).`,
  },
  {
    nombre: 'Identificador de dispositivos BLE (Bluetooth Low Energy)',
    contenido: `Disponible únicamente en dispositivos Android.Para conocer la dirección MAC de un dispositivo BLE, puedes utilizar la aplicación BLE Scanner, disponible en Google Play.
    Pasos para obtener el identificador BLE:
    Instala la aplicación BLE Scanner en tu dispositivo Android.
    Activa el Bluetooth del teléfono.
    Abre la aplicación y comienza el escaneo de dispositivos cercanos.
    Localiza el dispositivo BLE en el listado. Copia o anota la dirección MAC que se muestra (formato: XX:XX:XX:XX:XX:XX)`
  },
  {
    nombre: 'Identificador de dispositivos NFC',
    contenido: `Disponible en Android y iOS.Para conocer el identificador de un tag NFC, puedes utilizar la aplicación NFC Tools, disponible tanto en Google Play como en App Store.
    Pasos para obtener el identificador NFC:
    Instala la aplicación NFC Tools en tu dispositivo móvil.
    Abre la aplicación y selecciona la opción Leer.
    Acerca el dispositivo móvil al tag NFC.La aplicación mostrará la información del tag, incluyendo su número de serie.`
  },
  {
    nombre: 'OnFlow',
    contenido: 'OnFlow es la plataforma de gestión de procesos y tareas de RedGPS, diseñada para ayudarte a organizar, ejecutar y dar seguimiento a operaciones de campo de forma centralizada, trazable y conectada directamente con tus Activos. A diferencia de otras plataformas de gestión de tareas tradicionales, OnFlow no solo administra actividades: también integra información operativa relacionada con vehículos, usuarios, ubicación, alertas, formularios y evidencia de ejecución dentro del ecosistema RedGPS. Esto permite digitalizar procesos completos de operación, mantenimiento, instalación, soporte técnico, logística, auditoría y servicios en campo desde web y dispositivos móviles.'
  },
  {
    nombre: 'Crear tarea en OnFlow',
    contenido: 'Crea y organiza tareas asignando responsables, prioridades, fechas y Activos relacionados para dar seguimiento a las actividades de tu operación. Para registrar una tarea, selecciona el botón Crear tarea desde la pestaña Tareas. Si la creas desde la vista Por estado, el botón se encontrará en la columna Nueva. Si accedes desde un proceso, el botón Crear tarea estará disponible en la primera etapa del proceso.'
  },
  {
    nombre: 'Datos que debe ingresar para Crear tarea en OnFlow',
    contenido: `Nombre: El nombre ingresado en este campo será el que se visualizará en la tarjeta de la tarea dentro del tablero, permitiendo identificarla fácilmente.
    Descripción: En este campo puedes agregar información adicional sobre la tarea. Además, permite incluir elementos como hipervínculos o tablas para complementar los detalles necesarios. 
    Prioridad: Permite categorizar la tarea según en nivel de atención que requiere, puedes seleccionar las siguientes opciones:
    Baja
    Media
    Alta
    Crítica
    Estado: Indica en qué punto de ejecución en el que se encuentra actualmente la tarea
    Nueva: La tarea fue registrada y aún no ha sido tomada por nadie.
    Pendiente: La tarea está asignada pero aún no se ha comenzado a trabajar en ella.
    En proceso: Alguien está atendiendo la tarea actualmente.
    Finalizada: La tarea fue completada satisfactoriamente.
    Vencida: La tarea no fue atendida dentro del tiempo establecido.
    Cancelada: La tarea fue descartada y ya no aplica.
    Área: Define el área a la que será asignada la tarea.
    Colaboradores: Permite seleccionar los usuarios asignados previamente al área seleccionada. En caso de no seleccionar un usuario, la tarea quedará asignada al área.
    Duración: Tiempo planificado para la ejecución de la tarea, establecido mediante una fecha y hora de inicio y fin. Si la tarea no es completada dentro de este rango, el sistema la marcará automáticamente como Vencida.
    Activo: Permite relacionar un Activo con la tarea. El Activo seleccionado será sobre el cual se realizará la tarea`
  },
  {
    nombre: 'Geocercas',
    contenido: `Una geocerca es una delimitación geográfica dentro de un área específica en el mapa. Su propósito es ayudar a monitorear si los Activos: Entran o salen de la geocerca. Generan eventos dentro de la zona. Exceden la velocidad establecida dentro del área.`
  },
  {
    nombre: 'Activo',
    contenido: `Un Activo es el nombre con el que se define el objeto que se está rastreando, puede ser un vehículo, persona, carga, o cualquier otro objeto que se rastree. .`
  },
  {
    nombre: 'OnPatrol',
    contenido: `El módulo OnPatrol te permite configurar las direcciones MAC necesarias para validar los puntos de control de tus rondines, ya sea por Wi-Fi o por Bluetooth.
    `
  },
  {
    nombre: 'OnDash',
    contenido: `OnDash es una plataforma que ofrece gráficos para poder visualizar los datos de tu flota y plataforma, por ejemplo la actividad de tus unidades, eventos emitidos, alertas generadas, elementos creados por los usuarios, entre otros.`
  },
  {
    nombre: 'OnBus',
    contenido: `Permite realizar de forma rápida y simple el trabajo de asignación, distribución y despacho de buses logrando controlar y optimizar el servicio. Esta solución es un módulo adicional en la plataforma, además funciona en conjunto de una aplicación móvil para el encargado de ruta y otra aplicación para el conductor del bus..`
  },
  

];

async function main() {
  console.log('Cargando modelo de embeddings local (primera vez descarga ~30MB)...');

  // all-MiniLM-L6-v2: modelo pequeño, rápido, sin API key, sin costo
  // Se descarga una sola vez y queda en caché local
  const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

  console.log('Modelo cargado\n');

  const client = new MilvusClient({ address: 'localhost:19530' });
  console.log('Conectado a Milvus\n');

  // Borrar colección anterior si existe (para poder re-ejecutar el script)
  console.log('Borrando colección anterior...');

  const collections = await client.listCollections();
  console.log(collections.collection_names);

  for (const collectionName of COLLECTION_NAME) {
    if (collections.collection_names.includes(collectionName)) {
      await client.dropCollection({ collection_name: collectionName });
      console.log(`Colección "${collectionName}" eliminada\n`);
    }
  }

  // Crear colección con el esquema
  await client.createCollection({
    collection_name: 'endpoints_redgps',
    fields: [
      {
        name: 'id',
        data_type: DataType.Int64,
        is_primary_key: true,
        autoID: true,
      },
      {
        name: 'nombre',
        data_type: DataType.VarChar,
        max_length: 100,
      },
      {
        name: 'descripcion',
        data_type: DataType.VarChar,
        max_length: 2000,
      },
      {
        name: 'parametros',
        data_type: DataType.VarChar,
        max_length: 500,
      },
      {
        name: 'embedding',
        data_type: DataType.FloatVector,
        dim: VECTOR_DIM,
      },
    ],
  });

  await client.createCollection({
    collection_name: 'manuales_redgps',
    fields: [
      {
        name: 'id',
        data_type: DataType.Int64,
        is_primary_key: true,
        autoID: true,
      },
      {
        name: 'nombre',
        data_type: DataType.VarChar,
        max_length: 200,
      },
      {
        name: 'contenido',
        data_type: DataType.VarChar,
        max_length: 3000,
      },
      {
        name: 'embedding',
        data_type: DataType.FloatVector,
        dim: VECTOR_DIM,
      },
    ],
  });

  console.log(`Colección "endpoints_redgps" creada con ${VECTOR_DIM} dimensiones\n`);
  console.log('Generando embeddings para cada endpoint...\n');

  const registros = [];

  for (const endpoint of ENDPOINTS) {
    // Combinamos nombre + descripción + casos de uso para el embedding
    const textoParaEmbedding = `${endpoint.nombre}: ${endpoint.descripcion} Casos de uso: ${endpoint.casos_de_uso}`;

    const output = await embedder(textoParaEmbedding, { pooling: 'mean', normalize: true });
    const embedding = Array.from(output.data);

    registros.push({ ...endpoint, embedding });
    console.log(`  ✓ ${endpoint.nombre} — vector de ${embedding.length} dimensiones`);
  }

  // Insertar todos los registros en Milvus
  await client.insert({
    collection_name: 'endpoints_redgps',
    data: registros.map(r => ({
      nombre: r.nombre,
      descripcion: r.descripcion,
      parametros: r.parametros,
      embedding: r.embedding,
    })),
  });

  const manualRegistros = [];

  for (const manual of MANUAL) {
    // Combinamos nombre + descripción + casos de uso para el embedding
    const textoParaEmbedding = `${manual.nombre}: ${manual.contenido}`;

    const output = await embedder(textoParaEmbedding, { pooling: 'mean', normalize: true });
    const embedding = Array.from(output.data);

    manualRegistros.push({ ...manual, embedding });
    console.log(`  ✓ ${manual.nombre} — vector de ${embedding.length} dimensiones`);
  }

  // Insertar todos los registros en Milvus
  await client.insert({
    collection_name: 'manuales_redgps',
    data: manualRegistros.map(r => ({
      nombre: r.nombre,
      contenido: r.contenido,
      embedding: r.embedding,
    })),
  });

  // Crear índice para búsqueda por similitud coseno
  await client.createIndex({
    collection_name: 'endpoints_redgps',
    field_name: 'embedding',
    metric_type: 'COSINE',
    index_type: 'FLAT',
  });

  await client.createIndex({
    collection_name: 'manuales_redgps',
    field_name: 'embedding',
    metric_type: 'COSINE',
    index_type: 'FLAT',
  });

  // Cargar colección en memoria para poder hacer búsquedas
  await client.loadCollection({ collection_name: 'endpoints_redgps' });
  await client.loadCollection({ collection_name: 'manuales_redgps' });


  const query = await client.query({
    collection_name: 'endpoints_redgps',
    output_fields: ['nombre', 'descripcion', 'parametros', 'embedding'],
    filter: 'id > 0',  // trae todos
    limit: 1000,
  })

  const queryManual = await client.query({
    collection_name: 'manuales_redgps',
    output_fields: ['nombre', 'contenido', 'embedding'],
    filter: 'id > 0',  // trae todos
    limit: 1000,
  })

  console.log(query);
  console.log(queryManual);

  fs.writeFileSync('../src/data/embeddings.json', JSON.stringify({ query, queryManual }, null, 2));

  console.log(`\n${ENDPOINTS.length} endpoints indexados en Milvus.`);
  console.log('Ahora ejecuta: npm run buscar');
}

main().catch(console.error);
