# HERMES Agent Tray - Instalación como Servicio de Windows

Este documento explica cómo instalar y gestionar el HERMES Agent Tray como un servicio de Windows que se ejecuta automáticamente al iniciar el sistema.

## 📋 Requisitos Previos

- Windows 10/11 o Windows Server
- Privilegios de administrador
- El proyecto debe estar compilado

## 🚀 Instalación Rápida

### Opción 1: Instalador Automático (Recomendado)

1. **Compila el proyecto** (si no lo has hecho):
   ```cmd
   cargo build --release
   ```

2. **Ejecuta el instalador automático**:
   - Haz doble clic en `install-service.bat`
   - O ejecuta desde la línea de comandos: `install-service.bat`
   - El script solicitará automáticamente privilegios de administrador

3. **Sigue las opciones del menú**:
   - Opción 1: Instalar servicio
   - El servicio se instalará y configurará para inicio automático
   - Se iniciará inmediatamente después de la instalación

### Opción 2: PowerShell (Para usuarios avanzados)

```powershell
# Ejecutar PowerShell como Administrador
.\install-service.ps1 install
```

### Opción 3: Línea de Comandos Manual

```cmd
# Ejecutar CMD como Administrador
target\release\agent-tray.exe install
target\release\agent-tray.exe start
```

## 🎛️ Gestión del Servicio

### Comandos Disponibles

```cmd
# Verificar estado del servicio
agent-tray.exe status

# Iniciar servicio
agent-tray.exe start

# Detener servicio
agent-tray.exe stop

# Reiniciar servicio
agent-tray.exe restart

# Desinstalar servicio
agent-tray.exe uninstall

# Ejecutar en modo consola (para pruebas)
agent-tray.exe console
```

### Utilizando el Administrador de Servicios de Windows

1. Presiona `Win + R` y escribe `services.msc`
2. Busca **"HERMES Remote Agent Tray"**
3. Haz clic derecho para ver opciones:
   - Iniciar
   - Detener
   - Reiniciar
   - Propiedades (configurar inicio automático)

### Utilizando el Instalador

Ejecuta `install-service.bat` y selecciona:
- **1**: Instalar servicio
- **2**: Desinstalar servicio  
- **3**: Reinstalar servicio
- **4**: Verificar estado
- **5**: Salir

## ⚙️ Configuración del Servicio

### Detalles del Servicio

- **Nombre del servicio**: `HermesAgentTray`
- **Nombre para mostrar**: `HERMES Remote Agent Tray`
- **Tipo de inicio**: Automático (se inicia con Windows)
- **Ejecutar como**: Sistema Local

### Configuración Automática

El servicio se configura automáticamente para:
- ✅ Iniciarse automáticamente con Windows
- ✅ Reiniciarse si falla
- ✅ Ejecutarse en segundo plano
- ✅ No requerir inicio de sesión de usuario

## 🔧 Solución de Problemas

### El servicio no se instala

**Error**: "Access denied" o "Permission denied"
**Solución**: 
- Asegúrate de ejecutar como Administrador
- Haz clic derecho en `install-service.bat` → "Ejecutar como administrador"

### El servicio no inicia

**Verificar**:
1. Estado del servicio: `agent-tray.exe status`
2. Archivo de configuración: Asegúrate de que `config.toml` existe
3. Logs del sistema: Revisar Visor de Eventos de Windows

**Soluciones**:
```cmd
# Reinstalar el servicio
agent-tray.exe uninstall
agent-tray.exe install
agent-tray.exe start
```

### Verificar si está funcionando

```cmd
# Verificar estado
agent-tray.exe status

# Verificar en servicios de Windows
services.msc
```

### Ejecutar en modo consola para depuración

```cmd
# Ejecutar en modo consola para ver errores
agent-tray.exe console
```

## 📂 Ubicación de Archivos

- **Ejecutable del servicio**: `target/release/agent-tray.exe`
- **Configuración**: `config.toml`
- **Instalador**: `install-service.bat`
- **Logs**: Visor de Eventos de Windows → Aplicaciones

## 🔄 Actualización del Servicio

Para actualizar el servicio después de recompilar:

```cmd
# Opción 1: Usar el instalador
install-service.bat
# Seleccionar opción 3 (Reinstalar)

# Opción 2: Manual
agent-tray.exe stop
cargo build --release
agent-tray.exe start
```

## 🚫 Desinstalación Completa

```cmd
# Usar el instalador
install-service.bat
# Seleccionar opción 2 (Desinstalar)

# O manualmente
agent-tray.exe stop
agent-tray.exe uninstall
```

## 📞 Soporte

Si tienes problemas:

1. **Revisa los logs** en el Visor de Eventos de Windows
2. **Ejecuta en modo consola** para ver errores: `agent-tray.exe console`
3. **Verifica la configuración** en `config.toml`
4. **Reinstala el servicio** usando `install-service.bat`

---

## 🔐 Notas de Seguridad

- El servicio se ejecuta con privilegios de sistema
- Solo usuarios administradores pueden instalar/desinstalar
- El servicio se inicia automáticamente con Windows
- Los archivos de configuración deben estar protegidos contra escritura no autorizada