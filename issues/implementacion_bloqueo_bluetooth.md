# Título: Implementar funcionalidad de bloqueo/desbloqueo automático basado en proximidad Bluetooth del dispositivo móvil

Se propone desarrollar una funcionalidad que permita bloquear o desbloquear automáticamente el ordenador utilizando la proximidad del dispositivo móvil del usuario mediante la señal Bluetooth. Esta característica tiene como objetivo mejorar la seguridad y la comodidad del sistema.

#### Especificaciones iniciales:
1. **Detección de proximidad mediante Bluetooth**:
   - Utilizar la intensidad de la señal Bluetooth (RSSI) para determinar si el dispositivo móvil del usuario está cerca o lejos del ordenador.
   - Definir un umbral para identificar la "cercanía" del dispositivo móvil.

2. **Acciones automáticas**:
   - **Bloqueo automático**: Si el dispositivo móvil se aleja más allá del umbral definido, el ordenador debe bloquearse automáticamente.
   - **Desbloqueo automático**: Si el dispositivo móvil vuelve a estar dentro del rango establecido, el ordenador debe desbloquearse automáticamente. Para mayor seguridad, considerar un paso adicional de autenticación (como un PIN o una confirmación en el móvil).

3. **Compatibilidad**:
   - Garantizar que la funcionalidad sea compatible con los sistemas operativos relevantes (Windows y dispositivos Android/iOS).

4. **Configuración personalizada**:
   - Permitir al usuario ajustar el umbral de proximidad y activar/desactivar la funcionalidad según sus preferencias.

#### Beneficios:
- Incrementa la seguridad al evitar accesos no autorizados al ordenador.
- Mejora la experiencia del usuario al automatizar el bloqueo y desbloqueo del sistema.

#### Tareas sugeridas:
1. Investigar cómo medir la intensidad de la señal Bluetooth (RSSI) y su implementación en el sistema.
2. Diseñar y desarrollar los algoritmos de detección de proximidad basados en Bluetooth.
3. Implementar funcionalidades de bloqueo y desbloqueo automáticos en el sistema.
4. Crear una interfaz para configurar los parámetros de proximidad.
5. Probar y ajustar el sistema para garantizar su precisión y fiabilidad.
6. Documentar la funcionalidad y su configuración.