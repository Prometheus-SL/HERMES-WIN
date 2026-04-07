# HERMES-WIN: instalacion rapida

## Que archivo tengo que abrir

Usa `HERMES-windows-Setup-<version>.exe`.

El `.zip` de la release sirve para soporte tecnico, validaciones internas o despliegues manuales, pero el instalador es la opcion recomendada para usuarios finales.

## Instalacion en 5 minutos

1. Ejecuta `HERMES-windows-Setup-<version>.exe`.
2. Acepta la instalacion y, si Windows lo solicita, concede permisos de administrador.
3. Abre `Prometeo Hermes`.
4. Inicia sesion con las credenciales y la URL del servidor que te haya facilitado soporte.
5. Comprueba que el agente aparece como conectado.

## Como dejarlo funcionando en segundo plano

1. En la pantalla principal, pulsa `Instalar servicio`.
2. Cuando termine, pulsa `Iniciar servicio` si no arranca automaticamente.
3. Cierra la app y vuelve a abrirla para verificar que el estado sigue apareciendo como activo.

## Que incluye cada release

- `HERMES-windows-Setup-<version>.exe`: instalador completo
- `HERMES-windows-<version>-x64.zip`: copia portable de la aplicacion
- `HERMES-windows-client-bundle-<version>.zip`: paquete de entrega con documentacion y checksums

## Si algo falla

- Si la instalacion del servicio pide elevacion, acepta el aviso de Windows.
- Si el agente no conecta, revisa la URL del servidor y repite el login.
- Si el panel muestra errores persistentes, abre los logs de HERMES y comparte las ultimas lineas con soporte.

## Informacion util para soporte

- Estado del servicio: visible desde la propia app
- Log local: `%ProgramData%\HERMES-WIN\logs\agent.log`
- Estado compartido del runtime: `%ProgramData%\HERMES-WIN\runtime-state.json`
