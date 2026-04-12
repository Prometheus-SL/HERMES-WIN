# Hermes Media Bridge

Extension MV3 para Chrome y Edge que envia el estado de reproduccion del navegador a Hermes por `http://127.0.0.1:<puerto>`.

## Instalacion rapida

1. Abre la consola de Hermes.
2. En la tarjeta `Now Playing bridge`, pulsa `Install in browser`.
3. Hermes preparara una copia ya configurada de la extension e intentara abrir la pagina de extensiones del navegador soportado.
4. Si hace falta, pulsa `Open prepared folder` desde Hermes.
5. Carga esa carpeta preparada como extension descomprimida.

## Sitios soportados

- YouTube
- Twitch
- SoundCloud

## Que hace

- detecta titulo, artista/canal, artwork, estado y posicion aproximada
- envia heartbeats al bridge local de Hermes
- ejecuta comandos `media_play`, `media_pause`, `media_toggle_playback`, `media_next` y `media_previous` cuando el sitio lo permite
