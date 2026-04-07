# Consentimiento y aviso de privacidad

## Antes de instalar

HERMES-WIN es un agente de monitorizacion y operacion remota para equipos Windows, Linux y macOS. Debe instalarse solo en equipos propios o en sistemas para los que exista autorizacion expresa.

Al instalarlo, el usuario o administrador confirma que entiende:

- que el agente mantiene una conexion segura con un servidor remoto
- que recopila telemetria operativa del equipo
- que puede ejecutar un conjunto limitado de acciones remotas

## Que hace HERMES-WIN

- autentica el equipo contra el servidor configurado
- mantiene una sesion compartida entre la app Electron y el agente en segundo plano de la plataforma
- envia snapshots periodicos del estado del sistema
- permite ejecutar comandos remotos predefinidos y auditables

## Datos que recopila

HERMES-WIN puede recopilar y transmitir:

- nombre del equipo y usuario activo
- version del sistema operativo y arquitectura
- uso de CPU, memoria y discos
- informacion basica de red, como IP y MAC
- estado del audio cuando esta disponible
- eventos operativos: conexion, errores, reinicios del runtime y ejecucion de comandos

## Datos que no recopila por defecto

HERMES-WIN no esta pensado para capturar:

- archivos personales
- historiales de navegacion
- comunicaciones privadas
- pulsaciones de teclado
- capturas de pantalla

## Comandos remotos soportados

El backend solo puede invocar comandos que ya estan contemplados por la aplicacion. En la implementacion actual esto incluye:

- cambio de volumen y mute
- cambio del dispositivo de audio por defecto
- apertura de aplicaciones
- bloqueo de pantalla
- suspension e hibernacion
- lectura de informacion del sistema, rendimiento y red
- reinicio del runtime del agente

## Donde se guarda informacion local

- Sesion y estado compartido:
  Windows `%ProgramData%\HERMES-WIN\runtime-state.json`, Linux `~/.local/state/hermes/runtime-state.json`, macOS `~/Library/Application Support/Prometeo Hermes/runtime-state.json`
- Credenciales reutilizables desde la app: almacen de credenciales del sistema mediante `keytar`
- Log local del agente: carpeta de logs del runtime en cada plataforma

## Salvaguardas

- La comunicacion con el servidor se realiza sobre TLS/WSS.
- Los comandos estan limitados a una lista blanca en el runtime.
- La actividad queda registrada en logs locales.
- El agente persistente puede gestionarse desde la propia app cuando la plataforma lo soporta.

## Requisitos de consentimiento

Antes de desplegar HERMES-WIN debes asegurarte de que:

- existe autorizacion legal y organizativa para instalar software de monitorizacion
- los usuarios afectados conocen el alcance de la telemetria
- se han validado las politicas internas de IT o compliance
- el responsable del despliegue sabe como desinstalar el agente y revisar logs

## Revocacion del consentimiento

El consentimiento puede retirarse desinstalando el servicio y eliminando la aplicacion del equipo.

## Confirmacion

La instalacion de HERMES-WIN implica que el responsable del despliegue:

- ha leido este documento
- entiende las capacidades remotas del agente
- cuenta con autorizacion para instalarlo
- acepta revisar periodicamente configuracion, conectividad y logs
