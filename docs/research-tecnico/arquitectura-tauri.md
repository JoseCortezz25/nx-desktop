# Arquitectura de aplicaciones con Tauri: guía para nx-desktop

Consulta: 15 de octubre de 2026. El punto de partida es el código de este repositorio y las restricciones expresadas en sus wireframes. Las recomendaciones de organización son nuestras; cuando una regla procede de Tauri, Rust, Serde o React se enlaza su fuente. Los árboles y fragmentos son propuestas referenciales, no archivos implementados ni ejemplos compilados.

## Índice

1. [Diagnóstico y alcance](#diagnóstico-y-alcance)
2. [Qué arquitectura conviene](#qué-arquitectura-conviene)
3. [Responsabilidades y dependencias](#responsabilidades-y-dependencias)
4. [Conexiones y protocolos](#conexiones-y-protocolos)
5. [DTO y contratos](#dto-y-contratos)
6. [Seguridad](#seguridad)
7. [Estado, concurrencia y ciclo de vida](#estado-concurrencia-y-ciclo-de-vida)
8. [Estructura de archivos](#estructura-de-archivos)
9. [Léxico y convenciones](#léxico-y-convenciones)
10. [Pruebas y observabilidad](#pruebas-y-observabilidad)
11. [Adopción incremental](#adopción-incremental)
12. [Fuentes y límites](#fuentes-y-límites)

## Diagnóstico y alcance

### Lo comprobado en el repositorio

| Evidencia local | Situación actual | Consecuencia arquitectónica |
|---|---|---|
| `package.json` | React `^19.1.0`, TypeScript `~6.0.3`, Vite `^8.0.16`, API y CLI Tauri `^2` | La recomendación debe servir a una SPA React y a Tauri 2. Son rangos declarados, no versiones instaladas verificadas. |
| `src-tauri/Cargo.toml` | Rust edición 2024, `tauri = "2"`, Serde, JSON y opener | Hay un núcleo Rust mínimo y un plugin; no una infraestructura de proveedores ya construida. `Cargo.lock` resuelve Tauri 2.12.4 y opener 2.7.2 en el snapshot inspeccionado. |
| `src/App.tsx` | Formulario de ejemplo que llama directamente a `invoke("greet", { name })` | La dependencia del transporte vive en la vista. Es aceptable para el ejemplo; será un punto de extracción al implementar casos reales. |
| `src-tauri/src/lib.rs` | `greet`, registro de comandos, plugin y arranque | Todavía no hay separación entre composición y comandos. Tampoco hay reglas de negocio que justifiquen muchas capas. |
| `src-tauri/tauri.conf.json` | SPA local, una ventana, `csp: null` | Falta definir una política CSP deliberada antes de incorporar contenido externo o capacidades sensibles. |
| `src-tauri/capabilities/default.json` | Ventana `main`, permisos `core:default` y `opener:default` | La política de plugins parte de valores generales; debe revisarse con cada integración. |
| `docs/wireframes/README.md` | Aplicación de agentes de programación, proveedores intercambiables, proyectos y conversaciones | Los proveedores necesitan una frontera propia. Los nombres de modelos del diseño son ejemplos, no datos que se deban fijar en código. |

No se encontró dependencia de Nx en `package.json`: el nombre `nx-desktop` no demuestra que sea un workspace Nx. No se deduce que exista una base de datos, servidor HTTP local, SDK de cada proveedor, sincronización o arquitectura hexagonal implementada.

Los wireframes piden que proveedor, modelo y proyecto procedan de abstracciones, y que la interfaz real use i18n. También dejan decisiones abiertas: alcance del modo de aprobación, continuidad al cambiar proveedor y comportamiento de hooks rechazados. Esta guía no cierra esas preguntas por cuenta del producto. Véase [las reglas y preguntas de los wireframes](../wireframes/README.md).

### Qué significa front y back aquí

El frontend ejecuta React dentro de una webview. El proceso principal Rust administra integración nativa y atiende mensajes. Un servicio remoto, si se incorpora, constituye otra frontera: no es el mismo «backend» que el núcleo local. Tauri usa componentes del sistema para ventanas y webviews; no hay que asumir un servidor Node dentro de la aplicación. [Modelo de procesos de Tauri](https://v2.tauri.app/concept/process-model/).

En esta guía usaremos **UI**, **núcleo local** y **servicio remoto** para evitar confundir estos tres lugares. Además, un motor de agente de programación (Codex, Claude u OpenCode en los wireframes) no equivale necesariamente a un proveedor de inferencia LLM: el motor puede gestionar herramientas, sesiones y varios modelos. No asumir un protocolo HTTP de chat común para esas integraciones. La división en procesos no determina por sí sola dónde debe vivir cada regla del producto.

## Qué arquitectura conviene

### Recomendación: monolito modular y puertos donde aporten valor

Comenzar con una aplicación distribuida como una unidad, dividida en módulos funcionales pequeños. Dentro del núcleo Rust, separar casos de uso e integraciones externas cuando aparezca una dependencia real. En React, organizar las funcionalidades con su UI, su estado y su cliente de aplicación.

«Monolito» describe aquí el límite de despliegue y coordinación, no un único archivo. «Modular» exige propiedad clara de los datos y dependencias controladas. Los puertos representan operaciones que el caso de uso necesita; los adaptadores conectan esas operaciones con proveedores, disco o procesos.

Ejemplo: el caso `start_run` no debería saber si un proveedor usa HTTP, un SDK o un proceso externo. Puede depender de un puerto `AgentProvider`. El adaptador concreto transforma el protocolo del proveedor al modelo interno. No hace falta crear un trait para cada función pura ni introducir un framework de inyección.

Esta es una elección para el estado actual del proyecto. Tauri admite distintas tecnologías de interfaz e integración; su arquitectura no prescribe Clean Architecture, DDD ni una jerarquía obligatoria de carpetas del negocio. [Arquitectura de Tauri](https://v2.tauri.app/concept/architecture/).

### Comparación de alternativas

| Opción | Aporte | Coste o riesgo | Cuándo elegirla |
|---|---|---|---|
| Todo en componentes y comandos | Arranque rápido, pocas piezas | Transporte, reglas y efectos se mezclan; difícil simular proveedores | Ejemplo inicial como `greet`; no como estructura objetivo del producto. |
| Capas técnicas globales: controller/service/repository | Responsabilidades conocidas | Un cambio funcional obliga a recorrer muchas carpetas; servicios genéricos crecen | Si el dominio es sencillo y las dependencias entre capas se mantienen claras. |
| Monolito modular por funcionalidad | Cambios localizados, propiedad de datos visible | Requiere controlar importaciones y evitar dependencias circulares | Punto de partida recomendado. |
| Monolito modular con puertos y adaptadores selectivos | Pruebas sin proveedor real; sustituir HTTP, disco o procesos | Más interfaces y conversiones | Proveedores, persistencia y ejecución de herramientas con complejidad efectiva. |
| Clean Architecture completa | Independencia formal entre entidades, casos de uso y frameworks | Duplicación, archivos vacíos y mapeos antes de necesitarse | Dominio complejo, varias interfaces o equipos y necesidad demostrada de reutilización. |
| Servicios separados | Aislamiento operativo y despliegue independiente | Versionado, autenticación, fallos de red y operación adicionales | Requisito explícito de servicio compartido o aislamiento que el proceso local no resuelva. |

La arquitectura hexagonal y el monolito modular son compatibles: una describe fronteras de dependencia y la otra la organización de la aplicación. «Clean» tampoco exige microservicios. La pregunta útil es qué cambios necesitamos aislar y qué coste estamos dispuestos a pagar para hacerlo.

### Criterios para profundizar la separación

Introducir una frontera cuando haya dos implementaciones plausibles, efectos difíciles de probar, políticas de acceso importantes o un protocolo externo inestable. Mantener funciones directas cuando la separación solo agregue archivos y nombres. Extraer crates Rust o paquetes frontend cuando exista reutilización o aislamiento verificable, no para reproducir en carpetas un diagrama teórico.

## Responsabilidades y dependencias

Proponemos estas responsabilidades:

| Pieza | Debe hacer | Dependencia que conviene evitar |
|---|---|---|
| Componente React | Mostrar datos y estados, capturar intención, accesibilidad | SDK del proveedor, acceso arbitrario al disco, cadenas `invoke` repetidas. |
| Hook/controlador de funcionalidad | Coordinar interacción, cancelar suscripciones, estado de la vista | Convertirse en segundo motor de reglas del producto. |
| Cliente IPC frontend | Encapsular comandos, argumentos, errores y suscripciones | Importar componentes o decidir permisos de negocio. |
| Comando Tauri | Recibir DTO, validar frontera, obtener contexto, llamar caso de uso y mapear respuesta | Implementar todo el protocolo del proveedor o toda la operación de negocio. |
| Caso de uso Rust | Coordinar políticas y secuencia de una operación | Depender de `WebviewWindow`, React o formato específico del proveedor. |
| Dominio | Identidades, invariantes y transiciones del producto | Imports de Tauri, cliente HTTP o tablas SQL como modelo universal. |
| Adaptador | Traducir y ejecutar efectos externos | Filtrar respuestas o errores crudos al resto de la aplicación. |
| Composición | Instanciar dependencias y registrar comandos/estado/plugins | Reglas de cada funcionalidad. |

Flujo propuesto:

```text
intención del usuario
  → componente / hook de funcionalidad
  → cliente IPC tipado
  → comando Tauri (adaptador de entrada)
  → caso de uso
  → puerto de integración
  → adaptador HTTP / archivos / proceso
```

El flujo de ejecución va hacia la infraestructura; la dependencia del caso de uso debe apuntar al contrato que necesita, no al cliente concreto. El comando realiza la traducción de errores internos al error público. `lib.rs` permanece como lugar de composición y `main.rs` como entrada mínima, siguiendo el papel de esos archivos en la [estructura de proyecto Tauri](https://v2.tauri.app/start/project-structure/).

Para los proveedores de los wireframes, proponemos distinguir `ProviderId`, `ModelId` y una operación `Run`. Una ejecución puede terminar, fallar o cancelarse sin confundir su identidad con la conversación. Son nombres propuestos, sujetos al comportamiento acordado del producto.

## Conexiones y protocolos

### Elegir el mecanismo por su semántica

| Necesidad | Mecanismo recomendado | Contrato que hay que definir |
|---|---|---|
| Consultar proveedores, crear proyecto, iniciar ejecución | Comando y `invoke` | Request, respuesta y error. |
| Progreso o salida incremental de una ejecución | `Channel` asociado al comando | Identidad, secuencia y estados terminales. |
| Avisar a varias vistas de un cambio | Evento dirigido o global según destinatarios | Nombre, payload, quién publica y quién escucha. |
| Consumir un API externo | HTTP desde un adaptador o acceso web deliberado | Autenticación, timeout, errores, cuotas y cancelación. |
| Integración con ejecutable externo | Adaptador de proceso o sidecar si se distribuye | Protocolo, argumentos permitidos y ciclo de vida. |

Tauri permite comandos con argumentos deserializables, respuesta serializable y `Result` para errores. Los nombres de comandos deben ser únicos. Su registro en `generate_handler!` constituye la superficie invocable. Las claves superiores de los argumentos JavaScript son `camelCase` por defecto, aunque la función Rust use `snake_case`. [Llamadas a Rust](https://v2.tauri.app/develop/calling-rust/).

Recomendación propia: comandos orientados a intención como `list_providers`, `start_run` y `cancel_run`. Evitar una puerta universal `execute(action, payload)` o `run_shell(command)` que concentre autoridad y elimine contratos específicos. Un comando Tauri no es automáticamente un endpoint REST y no necesita URL ni método HTTP.

### Eventos y channels

Los eventos sirven para comunicación dinámica; Tauri recomienda channels para streaming y no presenta el sistema de eventos como transporte de alto rendimiento. Preferir destinatarios explícitos cuando el dato no corresponda a todas las ventanas. [Comunicación hacia el frontend](https://v2.tauri.app/develop/calling-frontend/).

Recomendaciones propias para un stream de agentes:

- Identificar cada mensaje con `runId`; añadir número de secuencia si debemos detectar huecos o reconciliar estado.
- Separar `started`, `textDelta`, `toolActivity` y un terminal `completed`, `failed` o `cancelled`.
- Registrar el receptor antes de comenzar a emitir; no depender de que una vista haya montado a tiempo.
- Agrupar deltas pequeños y limitar buffers y tamaño de mensajes para no saturar IPC ni renderizado.
- Definir quién conserva el resultado si se desmonta la vista. El cierre de un panel no debería destruir trabajo útil por accidente.
- Considerar el stream una vista del progreso. Para reabrir una conversación, consultar un snapshot autoritativo en vez de exigir que el frontend conserve todos los eventos.

No asumir que un evento implica confirmación de persistencia, entrega durable o autorización. Esas garantías se diseñan en el producto. Tampoco reemplazar un comando sensible por un listener global que acepte peticiones sin validar.

### HTTP: tres caminos distintos

| Camino | Ventaja | Coste y precaución |
|---|---|---|
| `fetch` de la webview | Sencillo para recursos públicos; API web conocida | Reglas web del origen, CORS y CSP; el dato o credencial utilizado está expuesto al contexto JavaScript. |
| Plugin HTTP desde frontend | Cliente nativo con API JavaScript y controles del plugin | Requiere instalar/configurar plugin y scopes; no convierte un secreto entregado a JS en secreto protegido. |
| Cliente HTTP dentro de Rust | Centraliza credenciales, validación y normalización del proveedor | Hay que diseñar el adaptador, timeouts y política de destinos; los scopes del plugin no protegen automáticamente este cliente. |

El plugin HTTP dispone de permisos y scopes para destinos permitidos. Es una opción distinta del `fetch` del navegador. [Plugin HTTP oficial](https://v2.tauri.app/plugin/http-client/).

Para este producto proponemos que las llamadas autenticadas a proveedores se concentren en adaptadores Rust. Un acceso público puntual desde la UI puede ser razonable; no hace falta forzarlo a cruzar todas las capas. No instalar un servidor localhost solo para comunicar React con Rust: IPC ya resuelve esa frontera. Un servidor local necesita justificación y agrega dirección de escucha, autenticación, control de origen y ciclo de vida.

No reintentar indiscriminadamente una operación que inicia trabajo facturable o modifica archivos. Definir idempotencia, condiciones de reintento y reconciliación con el proveedor antes de automatizarlo.

### Procesos externos y sidecars

Un sidecar es un ejecutable distribuido junto a la aplicación. Tauri lo declara mediante `externalBin`, con nombres de binario según el target, y documenta permisos de shell cuando se expone desde JavaScript. Eso no demuestra que Codex, Claude u OpenCode deban integrarse así. [Binarios externos](https://v2.tauri.app/develop/sidecar/).

Primero verificar qué interfaz oficial ofrece cada proveedor y sus condiciones de distribución. Si se usa proceso, proponer ejecutable identificado, argumentos como lista, directorio de trabajo autorizado, entorno mínimo, lectura incremental de stdout/stderr y timeout. Evitar concatenar entrada del usuario en una cadena de shell. Definir cómo se terminan el proceso y sus hijos al cancelar, cerrar o reiniciar; el comportamiento debe verificarse por plataforma.

## DTO y contratos

### Separar tres representaciones

**DTO** significa objeto de transferencia de datos. Define qué cruza una frontera. No debería convertirse por comodidad en tabla de base de datos, entidad de dominio y respuesta de proveedor al mismo tiempo.

Por ejemplo, `StartRunRequest` puede contener identificadores y texto; el dominio resuelve si ese modelo pertenece al proveedor; un adaptador construye después la petición concreta del API externo. Los campos como API key, credencial interna o ruta de almacenamiento no tienen por qué aparecer en `RunDto`.

Propuesta de ejemplo mínimo para explicar el casing, sin implementar todavía el caso de uso:

```rust
// Contratos referenciales; no se han agregado al código de la app.
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartRunRequest {
    pub conversation_id: String,
    pub provider_id: String,
    pub model_id: String,
    pub prompt: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunDto {
    pub run_id: String,
    pub status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppErrorDto {
    pub code: String,
    pub message: String,
    pub retryable: bool,
    pub request_id: String,
}
```

```ts
// Contrato equivalente referencial; la generación puede sustituirlo.
import { invoke } from "@tauri-apps/api/core";

type StartRunRequest = {
  conversationId: string;
  providerId: string;
  modelId: string;
  prompt: string;
};

type RunDto = {
  runId: string;
  status: string;
};

export function startRun(request: StartRunRequest): Promise<RunDto> {
  return invoke<RunDto>("start_run", { request });
}
```

El comando correspondiente recibiría un parámetro `request: StartRunRequest`. La clave `{ request }` nombra ese parámetro; los campos anidados dependen de Serde. `#[serde(rename_all = "camelCase")]` transforma los campos del DTO, independientemente del casing de argumentos superiores de Tauri. `deny_unknown_fields` rechaza campos inesperados: útil para entradas estrictas, pero puede dificultar compatibilidad con clientes que envían campos nuevos. Elegirlo deliberadamente. [Atributos de contenedor Serde](https://serde.rs/container-attrs.html).

`status: String` mantiene el ejemplo pequeño; en un contrato real conviene un enum cerrado si el conjunto es conocido. Para mensajes con payload variable, una unión discriminada explícita facilita exhaustividad en TypeScript y evita adivinar variantes por la presencia de campos. Serde admite representaciones etiquetadas, adyacentes y otras; fijar una y probar su JSON. [Representaciones de enums](https://serde.rs/enum-representations.html).

### Tipar no equivale a validar

`invoke<RunDto>` expresa una expectativa para TypeScript; no comprueba por sí mismo que el valor recibido tenga esa forma. Serde comprueba forma y tipos de entrada Rust, pero no demuestra que el usuario pueda abrir esa carpeta o ejecutar ese modelo.

Proponemos cuatro comprobaciones distintas:

1. **Forma:** tipos, discriminantes y campos obligatorios.
2. **Límites:** longitud del prompt, cantidad de elementos, tamaños y timeouts.
3. **Invariantes:** modelo disponible en el proveedor seleccionado, estado que permite iniciar otra ejecución.
4. **Autoridad:** workspace autorizado, operación aprobada y permisos efectivos.

Validar en React mejora la experiencia; validar en Rust protege la frontera. Revalidar al ejecutar evita que un estado válido al abrir un diálogo se vuelva obsoleto antes de producir el efecto.

### Errores públicos y evolución

Proponemos códigos estables como `validation_failed`, `permission_denied`, `provider_unavailable`, `cancelled` e `internal_error`, adaptados al dominio real. El error público debería ser serializable y limitado; el detalle técnico permanece en logs redactados, enlazado con `requestId`. La UI traduce códigos con i18n y decide si ofrecer reintento.

Un `Result<T, E>` de un comando produce resolución o rechazo de la promesa; no asumir que el rechazo será una instancia JavaScript de `Error`. Normalizar `unknown` en el cliente IPC, incluyendo fallos anteriores al propio caso de uso. [Retornos y errores de comandos](https://v2.tauri.app/develop/calling-rust/#error-handling).

Para cambios internos distribuimos UI y Rust juntos, pero los datos persistidos o sidecars pueden sobrevivir a una actualización. Versionar esos formatos cuando exista compatibilidad que mantener. No añadir `v1` a todos los comandos preventivamente; documentar cambios incompatibles y sus migraciones.

### Contratos manuales frente a generación

| Estrategia | Ventaja | Limitación |
|---|---|---|
| Rust y TS manuales con fixtures de JSON | Sin nueva dependencia y fácil al inicio | La duplicación puede desviarse; exige pruebas del contrato real. |
| Generar tipos y wrappers con Tauri Specta | Reduce repetición de comandos y representaciones | Incorpora herramientas, compatibilidad y restricciones sobre tipos exportables. |
| Esquema de contrato independiente | Útil si varios clientes comparten protocolo | Puede duplicar el modelo Rust y necesita generación o validación adicional. |

Tauri Specta es una integración mantenida en su propio proyecto, no una capacidad nativa activada automáticamente. Antes de adoptarla, verificar compatibilidad y estabilidad de las versiones de Tauri, Specta y exportador, y probar un comando con error y un mensaje de stream. [Repositorio primario de Tauri Specta](https://github.com/specta-rs/tauri-specta).

Recomendación para hoy: contratos pequeños explícitos y tests de serialización; evaluar generación al introducir varios comandos de producto. Ningún generador sustituye autorización, validación semántica o pruebas de integración. Si se genera código, conservar una ubicación reconocible y no editarlo manualmente.

## Seguridad

### El comando es una frontera de confianza

La UI puede contener errores, contenido manipulado o una vulnerabilidad de inyección. Todo dato recibido por IPC merece validación. Que Rust tenga acceso al sistema no significa que cualquier intención llegada desde la webview deba ejercerlo. Tauri enfatiza las fronteras entre contenido de interfaz y privilegios del núcleo. [Modelo de seguridad](https://v2.tauri.app/security/).

### Capabilities, permisos y comandos propios

Una capability relaciona ventanas/webviews con permisos. No es un rol de usuario, una aprobación del agente ni un aislamiento del sistema operativo. Definir qué ventana necesita cada operación y limitar recursos asociados. Varias capabilities aplicables pueden sumar permisos; revisar el acceso efectivo. [Capabilities](https://v2.tauri.app/security/capabilities/).

**Matiz crítico para este repositorio:** los comandos propios registrados en `invoke_handler` son accesibles por defecto desde las ventanas/webviews de la aplicación. La documentación indica `tauri_build::AppManifest::commands` para incluirlos en el sistema ACL. Tener `default.json` con permisos de plugins no restringe automáticamente cada comando propio. [Regla explícita de comandos de aplicación](https://v2.tauri.app/security/capabilities/).

Propuesta cuando aparezcan comandos sensibles: declarar comandos en el manifiesto de aplicación del proceso de generación, definir permisos de aplicación y concederlos solo a los destinatarios previstos. Comprobar además que el comando aplica autorización de negocio. Un permiso permite acceder a operaciones; los scopes delimitan recursos cuando la implementación los interpreta. [Permisos](https://v2.tauri.app/security/permissions/), [scopes](https://v2.tauri.app/security/scope/).

No asumir que una llamada directa a `std::fs` o un cliente HTTP Rust hereda las restricciones de los plugins fs/http. En comandos propios, el adaptador debe aplicar la política equivalente. Separar en la revisión «qué permite ACL» y «qué valida el código».

### CSP y contenido externo

`csp: null` en la configuración actual deja pendiente una política configurada por la aplicación. Proponemos definir orígenes concretos para scripts, estilos, imágenes y conexiones según las necesidades reales. La configuración CSP de Tauri incluye tratamiento de recursos de la aplicación; comprobarla en las plataformas objetivo antes de cerrar la política. [CSP en Tauri](https://v2.tauri.app/security/csp/).

No copiar una CSP genérica con comodines o `unsafe-eval` para resolver problemas sin entenderlos. Separar excepciones necesarias para desarrollo de las que se distribuirán. Renderizar Markdown del proveedor con una política de sanitización y enlaces explícita; no insertar HTML recibido sin tratar. Evitar conceder IPC a contenido remoto salvo necesidad concreta y análisis de sus destinatarios.

### Secretos, archivos y herramientas

Recomendaciones para el producto:

- Mantener credenciales fuera de componentes, bundles frontend, DTO de respuesta y logs. Una variable de entorno incorporada al bundle no constituye un almacén secreto.
- Elegir almacenamiento según amenaza y recuperación: credencial del sistema o solución cifrada evaluada. Stronghold existe como plugin, pero requiere diseñar desbloqueo y gestión de claves; no está instalado en este proyecto. [Plugin Stronghold](https://tauri.app/plugin/stronghold/).
- Representar workspaces autorizados con una identidad interna. Validar cada ruta respecto de esa raíz, incluidos componentes `..`, rutas absolutas, enlaces simbólicos y diferencias de Windows. La comprobación textual de prefijo no prueba pertenencia.
- Para escritura de archivos nuevos, considerar que la ruta final puede no existir y que canonicalizarla directamente fallará. Validar padres y la operación efectiva; contemplar cambios concurrentes de enlaces/rutas cuando el modelo de amenaza lo requiera.
- Usar directorios de datos/configuración de la aplicación para sus propios archivos y no el directorio de trabajo como contrato implícito. El plugin fs documenta directorios base y scopes; esos controles son de ese acceso, no una garantía universal sobre código Rust arbitrario. [Plugin de archivos](https://v2.tauri.app/plugin/file-system/).
- Un modo de aprobación de herramientas pertenece a una política del núcleo. No basta esconder un botón en React ni transmitir `approved: true` y confiar ciegamente en él.

Si se implementan hooks ejecutables del producto, verificar comando, origen, directorio de trabajo, recursos y timeout en la política del núcleo. No equiparar un checkbox de la interfaz con autoridad suficiente para ejecutar; el tratamiento de hooks rechazados sigue pendiente en los wireframes.

En una app de agentes, una respuesta del modelo es dato no confiable. Una solicitud de herramienta requiere comprobar operación, recursos y aprobación aplicable antes de ejecutar. El alcance exacto de esa política sigue abierto en los wireframes y necesita una decisión de producto.

## Estado, concurrencia y ciclo de vida

### Una autoridad por dato

Proponemos conservar en React el estado efímero de presentación: panel abierto, texto aún no enviado y selección temporal. El núcleo local administra ejecuciones, credenciales y reglas de acceso. Si se agrega persistencia, esta conserva el historial que deba sobrevivir al cierre. No duplicar toda la base de datos en un store global por defecto.

Al cambiar proveedor, reconciliar la cadena proveedor → modelo → esfuerzo con el catálogo válido; limpiar selecciones incompatibles. Para solicitudes concurrentes, identificar la petición o selección que originó cada respuesta y descartar resultados obsoletos: una consulta lenta del proveedor anterior no debe reemplazar la selección actual.

Toda suscripción tiene propietario y cierre. Al desmontar, ejecutar `unlisten`; si el registro asíncrono termina después del desmontaje, liberar también ese listener recién recibido. Diseñar montaje/limpieza idempotentes y probar la carrera de registro.

En React, una acción del usuario puede llamar al cliente desde su handler. Usar efectos para sincronización con sistemas externos y limpiar suscripciones; los valores derivados del estado pueden calcularse al renderizar. [Guía de efectos de React](https://react.dev/learn/you-might-not-need-an-effect).

### Estado gestionado Rust

Tauri permite registrar estado con `manage` y obtenerlo con `State`. Para mutabilidad compartida documenta mecanismos de sincronización y la necesidad de conservar el tipo correcto al acceder. [Gestión de estado](https://v2.tauri.app/develop/state-management/).

Proponemos un contenedor pequeño de dependencias de larga duración: registro de proveedores, servicios y supervisor de ejecuciones. No colocar todos los mensajes y operaciones del producto detrás de un único mutex global. Cada recurso debe tener un dueño y una estrategia de acceso coherente.

Evitar sostener un guard de mutex mientras se realiza una operación de red o disco con `.await`. Copiar u obtener lo necesario, soltar el lock, ejecutar y luego reconciliar bajo una sección corta. Tokio distingue mutex síncronos y asíncronos y muestra los problemas de conservar un guard a través de suspensión. No usar un mutex asíncrono como arreglo automático a un diseño que serializa toda la app. [Estado compartido en Tokio](https://tokio.rs/tokio/tutorial/shared-state).

### Trabajo pesado y cancelación

Los comandos `async` se ejecutan en tareas asíncronas; los síncronos usan el hilo principal salvo la modalidad `#[tauri::command(async)]`. Declarar `async` no convierte un cálculo intensivo ni una API bloqueante en trabajo cooperativo. [Comandos asíncronos](https://v2.tauri.app/develop/calling-rust/#async-commands).

Recomendaciones propias:

1. Separar I/O asíncrono de CPU o APIs bloqueantes, y utilizar un executor/pool apropiado para estas últimas.
2. Mantener un registro `runId → estado/handle/cancelación` con propietario definido.
3. Definir `cancel_run` como petición idempotente y verificar que el llamante puede actuar sobre esa ejecución.
4. Propagar cancelación al adaptador. Abandonar una promesa frontend no cancela por sí mismo una operación remota o un proceso.
5. Definir la carrera entre completar y cancelar: un único resultado terminal autoritativo, que pueda consultarse.
6. Limitar ejecuciones simultáneas, memoria en buffers, reintentos y duración; fijar valores cuando se conozcan necesidades reales.
7. Definir cierre ordenado: persistir lo necesario, cancelar o dejar finalizar según política y liberar recursos.

## Estructura de archivos

### Árbol propuesto, creado a medida que aparezcan funcionalidades

Los nombres siguientes son una propuesta. No hay que crear todas las carpetas vacías en el siguiente cambio.

```text
src/
  main.tsx                          # entrada React existente
  app.tsx                           # posible evolución de App.tsx
  app/
    providers.tsx                   # composición UI, i18n y dependencias
    app-shell.tsx                   # regiones de la ventana
  features/
    providers/
      api/provider-client.ts        # API de aplicación de la funcionalidad
      model/provider.ts             # modelo de presentación si se necesita
      ui/provider-picker.tsx
    conversations/
      api/conversation-client.ts
      hooks/use-conversation.ts
      ui/conversation-view.tsx
    projects/
      api/project-client.ts
      ui/project-picker.tsx
    runs/
      api/run-client.ts
      hooks/use-run-stream.ts
      ui/run-status.tsx
  shared/
    ipc/client.ts                   # envoltura técnica mínima y errores
    ipc/contracts.ts                # DTO manuales, si se elige esa vía
    ui/                             # primitivas realmente compartidas
    i18n/                           # textos de interfaz
  generated/                        # solo si se adopta generación

src-tauri/
  Cargo.toml
  build.rs                          # generación y manifiesto de comandos
  tauri.conf.json
  capabilities/
    default.json                    # revisar permisos efectivos
  permissions/                      # si se adopta ACL en comandos propios
  src/
    main.rs                         # entrada
    lib.rs                          # composición y registro
    app_state.rs                    # servicios de larga duración
    ipc/
      error.rs                      # error público y mapeo
    features/
      mod.rs
      providers/
        mod.rs
        commands.rs                 # superficie Tauri de proveedores
        dto.rs
        service.rs                  # casos de uso pequeños
        domain.rs
        ports.rs                    # solo dependencias con valor real
        adapters/
          mod.rs
          codex.rs                  # interfaz por verificar
          claude.rs                 # interfaz por verificar
          opencode.rs               # interfaz por verificar
      projects/
        mod.rs
        commands.rs
        dto.rs
        service.rs
      conversations/
        mod.rs
        commands.rs
        dto.rs
        service.rs
      runs/
        mod.rs
        commands.rs
        dto.rs
        service.rs
        supervisor.rs
  tests/                            # integración Rust entre módulos

docs/
  wireframes/
  research-tecnico/
    README.md
    arquitectura-tauri.md
```

Por qué así: el lector encuentra una funcionalidad sin recorrer `controllers/`, `services/`, `models/` globales. `shared` conserva infraestructura transversal pequeña. `lib.rs` conecta módulos y registra comandos; no acumula implementaciones. En Rust, los archivos de módulo pueden ser `mod.rs` o archivos nombrados según módulo; el equipo debe elegir una forma consistente, no mezclar por imitación.

El árbol no obliga a replicar cada módulo frontend en Rust: una funcionalidad solo de presentación puede no tener equivalente nativo. Tampoco obliga a que `service.rs` sobreviva cuando una función de aplicación en un archivo pequeño resulte más clara. Para APIs que crucen módulos, exponer lo necesario desde `mod.rs` y usar visibilidad restringida en detalles internos.

Evitar una carpeta `utils` que absorba cualquier lógica. Preferir nombres por responsabilidad: `path_policy`, `error_mapping`, `run_supervisor`. Si un helper pertenece a una sola funcionalidad, mantenerlo allí.

## Léxico y convenciones

| Concepto | Significado en esta propuesta | Ejemplo |
|---|---|---|
| Comando Tauri | Entrada invocable desde la UI | `start_run` |
| Caso de uso | Operación con reglas y secuencia del producto | Iniciar ejecución verificando contexto y permisos. |
| DTO | Representación que cruza frontera | `StartRunRequest`, `RunDto` |
| Entidad | Objeto con identidad y ciclo de vida | `Conversation`, si sus reglas lo justifican. |
| Value object | Valor validado sin identidad independiente | `ProviderId`, `WorkspacePath`, cuando aporten invariantes. |
| Puerto | Contrato que necesita un caso de uso | `AgentProvider` |
| Adaptador | Implementación de un puerto o traducción de entrada | Adaptador del protocolo Codex. |
| Repositorio | Abstracción de acceso a entidades persistidas | Solo crear si hay persistencia; no llamar repository a todo cliente HTTP. |
| Evento | Notificación de un hecho | `run-completed` |
| Channel | Flujo IPC asociado a un consumidor | Deltas de una ejecución. |
| Capability | Asociación Tauri de destinatarios y permisos | Acceso de la ventana principal. |
| Scope | Límite de recursos para una operación | Conjunto autorizado de rutas o destinos. |
| Run | Una ejecución concreta | Puede fallar sin eliminar la conversación. |
| Proveedor | Nombre de la selección visual; puede representar un motor de agente y no solo un API de inferencia | Codex, Claude u OpenCode según wireframes. |
| Hook React | Función de composición de comportamiento de UI | `useRunStream` |
| Hook de herramienta | Acción ejecutable vinculada al ciclo del agente, distinta de un hook React | `PreToolUse` en los wireframes. |

### Convenciones propuestas para el equipo

| Elemento | Convención | Ejemplo |
|---|---|---|
| Carpetas y archivos TS/TSX nuevos | Minúsculas, `kebab-case` | `provider-picker.tsx`, `use-run-stream.ts` |
| Componentes y tipos TS | `PascalCase` | `ProviderPicker`, `RunDto` |
| Funciones y variables TS | `camelCase`; hooks `use…` | `startRun`, `useRunStream` |
| Módulos, funciones y campos Rust | `snake_case` | `app_state.rs`, `start_run`, `run_id` |
| Structs, enums y traits Rust | `UpperCamelCase` | `RunDto`, `AgentProvider` |
| Constantes Rust | `SCREAMING_SNAKE_CASE` | `MAX_PROMPT_BYTES` |
| Comandos IPC | `snake_case`, verbo e intención | `list_providers`, `cancel_run` |
| Campos JSON | `camelCase`, declarado en DTO | `providerId`, `runId` |
| Códigos de error | Valor estable `snake_case` | `provider_unavailable` |
| Eventos de aplicación | Nombre estable y contextual en minúsculas | `run-progress`, `provider-status-changed` |
| Identificadores del producto | Nombre semántico, sin nombres de UI | `conversationId`, no `selectedCardId` |

Las convenciones Rust siguen las [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/naming.html). Las de archivos frontend, eventos y DTO son acuerdos sugeridos para este repositorio, no mandatos del framework. Mantener `Cargo.toml`, `README.md` y otros nombres convencionales existentes; renombrar `App.tsx` no es requisito para introducir arquitectura.

Usar lenguaje inglés en identificadores de código y español en esta documentación; la UI se traduce mediante i18n según los wireframes. No llamar `backendService` a cada dependencia: el nombre debe explicar la operación o integración. Usar `Request`/`Response` para mensajes de operación y `Dto` para representaciones compartidas cuando esa distinción ayude; evitar sufijos acumulados como `ProviderResponseDtoModel`.

## Pruebas y observabilidad

### Qué merece comprobarse

| Frontera | Prueba valiosa | Fallo que detecta |
|---|---|---|
| DTO Serde ↔ cliente IPC | Fixtures reales de request, respuesta y error | `run_id` frente a `runId`, enums o nulabilidad incompatibles. |
| Caso de uso | Proveedor falso y políticas reales | Modelo de proveedor incorrecto, operación no permitida. |
| Adaptador externo | Respuestas controladas: timeout, error, stream truncado | Suposiciones sobre APIs y estados terminales. |
| Rutas y procesos | Escape del workspace, symlink, argumentos maliciosos | Acceso fuera de autoridad prevista. |
| UI | Estado de espera/error/cancelación y cambio de proveedor | Selección inválida o doble envío. |
| Ejecuciones concurrentes | Cancelar mientras termina, cerrar/reabrir vista | Resultados terminales duplicados o recursos huérfanos. |
| Aplicación nativa | Permisos concedidos y denegados por destinatario | Diferencia entre política declarada y acceso real. |

Tauri ofrece mocks de sus APIs JavaScript, incluido IPC. Sirven para verificar componentes y wrappers en un entorno controlado; no demuestran que Rust, ACL o el sistema operativo funcionen. [Mocks oficiales](https://v2.tauri.app/develop/tests/mocking/).

Para extremo a extremo nativo, distinguir las rutas documentadas: `tauri-driver` directo está limitado a Windows y Linux; el servicio `@wdio/tauri-service` con driver integrado documenta soporte también para macOS. Verificar requisitos de la ruta elegida antes de definir la matriz. Un test solo en navegador no cubre el puente nativo. Planificar verificación por plataforma y complementar manualmente donde haga falta. [WebDriver](https://v2.tauri.app/develop/tests/webdriver/).

El repositorio no declara scripts de tests en `package.json`. Elegir herramientas cuando se agregue comportamiento comprobable; esta investigación no instala ninguna. La prohibición de ejecutar builds se mantiene en este trabajo: no se compilaron los fragmentos ni se presenta la guía como implementación validada.

### Observabilidad propuesta

Conservar `requestId` y `runId` para correlacionar UI, caso de uso y adaptador. Registrar operación, duración, código de resultado y proveedor cuando corresponda. Redactar credenciales, prompts, rutas sensibles y contenido de archivos; el hecho de que una aplicación sea local no hace inocuos sus logs.

Medir antes de cambiar de mecanismo: latencia IPC, frecuencia de deltas, tiempo de render y memoria del stream. No atribuir un problema al puente Tauri sin distinguir tiempo de proveedor, disco, serialización y UI.

## Adopción incremental

1. **Acordar el vocabulario y las decisiones abiertas.** Definir proveedor/modelo/ejecución, propiedad del estado, alcance de aprobación y continuidad de conversaciones. Registrar esas decisiones cerca de su contexto.
2. **Elegir una funcionalidad vertical pequeña.** Por ejemplo listar proveedores, si se confirma como siguiente necesidad. Crear DTO, cliente IPC, comando y caso de uso solo para ella; mantener el resto del ejemplo estable.
3. **Fijar la frontera.** Prueba de JSON/error, validación Rust y revisión de ACL propia. Decidir si los contratos manuales siguen siendo suficientes.
4. **Agregar una integración real.** Verificar primero protocolo oficial del proveedor. Crear adaptador y puerto con una implementación falsa para pruebas; no fijar nombres de modelos del wireframe.
5. **Introducir ejecución incremental.** Supervisor, channel, límites, cancelación y resultado terminal. Verificar la salida y las carreras antes de reproducir toda la conversación visual.
6. **Agregar persistencia si se requiere.** Elegir almacenamiento según consultas, volumen y recuperación; definir migraciones y estado al reiniciar. No imponer SQL o archivos JSON antes de esos requisitos.
7. **Cerrar seguridad por capacidades reales.** CSP, rutas, secretos y permisos de cada ventana. Incluir casos denegados en las verificaciones.
8. **Reevaluar complejidad.** Extraer crates, stores globales o capas adicionales solo cuando existan problemas concretos que resuelvan.

Para aceptar la primera funcionalidad, pedir que pueda seguirse desde UI hasta adaptador, que tenga contrato explícito, que el núcleo valide la intención y que el fallo se convierta en un estado comprensible. Esa evidencia aporta más que tener muchas carpetas llamadas `domain` o `application`.

## Fuentes y límites

### Fuentes primarias consultadas

| Fuente | Qué permite verificar | Límite |
|---|---|---|
| [Arquitectura Tauri](https://v2.tauri.app/concept/architecture/) | Componentes y libertad de composición | No prescribe arquitectura de dominio. |
| [Modelo de procesos](https://v2.tauri.app/concept/process-model/) | Núcleo y webviews | No define propiedad de nuestros datos. |
| [Estructura Tauri](https://v2.tauri.app/start/project-structure/) | Papel de archivos iniciales | No obliga a nuestro árbol por funcionalidad. |
| [Llamar Rust](https://v2.tauri.app/develop/calling-rust/) | Comandos, argumentos, respuestas, errores y async | El genérico TS no prueba la semántica del contrato. |
| [Llamar frontend](https://v2.tauri.app/develop/calling-frontend/) | Eventos y channels | No da entrega durable ni política de negocio. |
| [Capabilities](https://v2.tauri.app/security/capabilities/) | Destinatarios, acceso y comportamiento de comandos propios | No sustituye validación interna. |
| [Permisos](https://v2.tauri.app/security/permissions/) | Concesión/denegación y agrupación | Hay que comprobar el permiso efectivo instalado. |
| [Scopes](https://v2.tauri.app/security/scope/) | Recursos asociados a operaciones | La implementación debe interpretar el scope. |
| [Seguridad Tauri](https://v2.tauri.app/security/) | Fronteras y responsabilidad de aplicación | No es una auditoría del producto. |
| [CSP](https://v2.tauri.app/security/csp/) | Política de contenido e integración Tauri | Requiere ajuste a recursos reales. |
| [HTTP](https://v2.tauri.app/plugin/http-client/) | Cliente nativo y configuración de acceso | No representa un cliente Rust propio. |
| [Archivos](https://v2.tauri.app/plugin/file-system/) | Directorios base, operaciones y scopes del plugin | No restringe todo acceso de `std::fs`. |
| [Sidecars](https://v2.tauri.app/develop/sidecar/) | Empaquetado y ejecución de binarios | No confirma interfaces ni licencias de proveedores. |
| [Stronghold](https://tauri.app/plugin/stronghold/) | Opción de almacenamiento protegido | No decide gestión de claves ni amenaza de la app. |
| [Estado Tauri](https://v2.tauri.app/develop/state-management/) | Estado gestionado y sincronización | No diseña nuestro supervisor. |
| [Tokio: estado compartido](https://tokio.rs/tokio/tutorial/shared-state) | Locks y suspensión | Requiere elegir sincronización según recurso. |
| [Serde: atributos](https://serde.rs/container-attrs.html) | Casing y campos desconocidos | No valida reglas ni autoridad. |
| [Serde: enums](https://serde.rs/enum-representations.html) | Representaciones serializadas | El proyecto debe elegir el contrato. |
| [Rust: nombres](https://rust-lang.github.io/api-guidelines/naming.html) | Convenciones idiomáticas | No fija nombres de funcionalidades del producto. |
| [React: efectos](https://react.dev/learn/you-might-not-need-an-effect) | Estado derivado y efectos | No impone librería de estado. |
| [Tauri Specta](https://github.com/specta-rs/tauri-specta) | Generación de tipos/comandos del proyecto | Compatibilidad y madurez deben revisarse al adoptar. |
| [Mocks Tauri](https://v2.tauri.app/develop/tests/mocking/) | Aislamiento del frontend para pruebas | No verifica integración nativa. |
| [WebDriver Tauri](https://v2.tauri.app/develop/tests/webdriver/) | Alcance de automatización nativa | El soporte cambia entre `tauri-driver` directo y el servicio integrado. |

### Cómo interpretar la recomendación

La inspección confirma una plantilla mínima y un conjunto de wireframes, no una implementación completa de sus interacciones. No se ejecutó build ni prueba funcional. No se investigaron los protocolos concretos de Codex, Claude y OpenCode ni sus acuerdos de distribución, porque primero hace falta decidir qué integración se pretende consumir. Tampoco hay mediciones que justifiquen un objetivo de rendimiento concreto.

Las fuentes son documentación viva consultada en la fecha indicada, no un snapshot de las versiones instaladas. Al implementar, contrastar el lockfile y las APIs de esas versiones, especialmente plugins, generación de bindings y configuración de seguridad.

La recomendación de monolito modular con puertos selectivos es una inferencia de ingeniería a partir del tamaño actual, las integraciones previstas en los wireframes y el coste de separación. No existe evidencia aquí que permita declarar una arquitectura universalmente mejor para todas las aplicaciones Tauri.
