# Hermes Electron App

## Descripción

Hermes Electron App es una aplicación multiplataforma construida con Electron y React. Este proyecto permite el uso de bindings nativos cuando sea necesario, asegurando un rendimiento óptimo y una experiencia de usuario fluida. La aplicación está diseñada para ser compatible con la licencia GPL-2.0-or-later.

## Estructura del Proyecto

El proyecto está organizado de la siguiente manera:

```
hermes-electron-app
├── src
│   ├── main
│   │   └── main.ts          # Punto de entrada principal de la aplicación Electron
│   ├── renderer
│   │   ├── index.tsx       # Punto de entrada para la parte de renderizado
│   │   ├── components
│   │   │   └── App.tsx     # Componente raíz de la aplicación
│   │   └── styles
│   │       └── index.css    # Estilos CSS globales
│   ├── preload
│   │   └── preload.ts      # Contexto de seguridad y funciones expuestas
│   ├── native
│   │   ├── binding.gyp     # Configuración para compilar bindings nativos
│   │   ├── src
│   │   │   └── addon.cc    # Código C++ para el addon nativo
│   │   └── README.md       # Documentación sobre el addon nativo
│   └── shared
│       └── types.ts        # Tipos y interfaces compartidos
├── package.json             # Configuración de npm
├── tsconfig.json            # Configuración de TypeScript
├── .eslintrc.js             # Configuración de ESLint
├── electron-builder.json     # Configuración para Electron Builder
├── LICENSE                  # Licencia del proyecto
└── README.md                # Documentación del proyecto
```

## Instalación

Para instalar las dependencias del proyecto, ejecuta el siguiente comando en la raíz del proyecto:

```
npm install
```

## Uso

Para iniciar la aplicación en modo de desarrollo, utiliza el siguiente comando:

```
npm start
```

Para empaquetar la aplicación para distribución, ejecuta:

```
npm run build
```

### Compilar el addon nativo (Windows)

El addon nativo `native/win_volume` requiere toolchain de Rust y las Build Tools de Visual Studio (MSVC).

Requisitos mínimos en Windows:
- Rust toolchain (rustup)
- Visual Studio Build Tools (C++/MSVC) o SDK apropiado

Para compilar y copiar el binario al directorio de la app:

```powershell
npm run build:native
```

Esto ejecuta `cargo build --release` dentro de `native/win_volume` y copia el artefacto `.node` a `src/native`.

### Ejecutar el servicio (Windows)

Instalar como servicio (requiere derechos de administrador):

```powershell
npm run service:install
```

Desinstalar servicio:

```powershell
npm run service:uninstall
```

## Contribuciones

Las contribuciones son bienvenidas. Si deseas contribuir, por favor abre un issue o un pull request en el repositorio.

## Licencia

Este proyecto está bajo la licencia GPL-2.0-or-later. Consulta el archivo LICENSE para más detalles.