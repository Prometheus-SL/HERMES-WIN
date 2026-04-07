# Audio nativo opcional

## Estado actual

HERMES-WIN funciona por defecto sin Rust.

El control de audio normal usa PowerShell y `AudioDeviceCmdlets`. El addon `win_volume` solo se compila si activas explicitamente la variable de entorno:

```powershell
$env:HERMES_ENABLE_NATIVE_AUDIO = "1"
```

## Cuando merece la pena usarlo

Solo tiene sentido si necesitas validar o evolucionar el camino nativo de audio. Para CI, releases normales y desarrollo diario no es necesario.

## Requisitos

- Rust estable con `cargo`
- toolchain de Windows compatible con `x86_64-pc-windows-msvc`
- Node.js 20

## Compilacion local

```powershell
$env:HERMES_ENABLE_NATIVE_AUDIO = "1"
npm run build:native
```

Si `cargo` no esta disponible, el script avisa y HERMES sigue funcionando con el camino PowerShell.

## Donde queda el binario

La compilacion genera el addon en:

`src/native/win_volume/target/release/win_volume.node`

En desarrollo, HERMES intenta cargar ese archivo directamente. En builds empaquetados, Electron lo toma desde `app.asar.unpacked` cuando existe.

## Nota sobre CI

Los workflows de GitHub Actions no instalan Rust por defecto porque el proyecto ya queda operativo sin este addon. Si en el futuro quieres probar el camino nativo en CI, lo ideal es crear un job especifico en lugar de encarecer todas las releases.
