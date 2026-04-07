# Politica de seguridad

## Como reportar una vulnerabilidad

No publiques vulnerabilidades en issues abiertos.

Usa uno de estos canales privados:

- GitHub Security Advisories, si el repositorio lo tiene habilitado
- el canal interno o correo de seguridad definido por el equipo de PROMETEO
- contacto directo con los mantenedores responsables del despliegue

Incluye siempre:

- descripcion del problema
- impacto esperado
- pasos para reproducirlo
- entorno afectado
- mitigacion temporal, si la conoces

## Superficie de riesgo principal

HERMES-WIN combina tres piezas con niveles de confianza distintos:

- interfaz Electron para login, estado y operacion local
- runtime Node que mantiene la conexion con el backend
- agente en segundo plano gestionado por plataforma que conserva el runtime online sin depender de la UI

El objetivo de seguridad es reducir privilegios innecesarios, limitar comandos remotos y dejar trazabilidad local.

## Datos sensibles y almacenamiento

- El estado compartido del runtime se guarda en la ruta nativa del sistema:
  Windows `%ProgramData%\HERMES-WIN\runtime-state.json`, Linux `~/.local/state/hermes/runtime-state.json`, macOS `~/Library/Application Support/Prometeo Hermes/runtime-state.json`.
- Las credenciales reutilizables de la app se almacenan mediante `keytar`.
- Los eventos operativos se escriben en la carpeta de logs del runtime de cada plataforma.

Protege esas rutas con permisos adecuados y evita copiarlas sin necesidad a otros equipos o tickets de soporte.

## Comunicacion de red

- El login usa HTTPS contra el servidor configurado.
- La comunicacion en tiempo real se realiza mediante Socket.IO sobre `ws` o `wss` segun la URL configurada.
- El servidor debe estar expuesto solo a endpoints controlados y con TLS valido.

## Ejecucion de comandos

El runtime valida el tipo de comando frente a una lista blanca antes de ejecutarlo. Hoy se contemplan acciones de:

- audio
- apertura de aplicaciones
- bloqueo, suspension e hibernacion
- lectura de informacion del sistema y red
- reinicio del runtime

Recomendaciones:

- no expongas el backend a operadores sin trazabilidad
- revisa periodicamente que la lista blanca siga siendo la minima necesaria
- audita los logs locales cuando un equipo reciba comandos remotos

## Despliegue recomendado

- Ejecuta el agente persistente solo cuando de verdad necesites modo continuo.
- Usa la minima elevacion posible durante la instalacion.
- Restringe el trafico saliente a dominios y puertos conocidos.
- Manten Node, Electron y dependencias al dia mediante releases controladas.
- Separa entornos de pruebas y produccion.

## Dependencias y CI

El pipeline por defecto valida:

- `npm ci`
- `npm run typecheck`
- `npm test -- --ci`
- `npm run build:bundle`

Revision recomendada adicional:

- `npm audit`
- analisis estatico si el equipo ya usa una herramienta corporativa
- `cargo audit` solo si se decide habilitar el addon nativo opcional de audio

## Respuesta ante incidentes

1. Deten el agente persistente si hay sospecha de abuso o ejecucion remota no esperada.
2. Conserva el log local y el estado del runtime para analisis.
3. Revoca la sesion si el backend o los tokens pueden haber quedado comprometidos.
4. Publica una version corregida y redistribuye los artefactos firmados o validados.
