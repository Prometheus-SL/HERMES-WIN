//! Media information retrieval for Windows using Global System Media Transport Controls (GSMTC)

use serde::{Deserialize, Serialize};
use thiserror::Error;
use tracing::debug;

#[cfg(target_os = "windows")]
use windows::Media::Control::{GlobalSystemMediaTransportControlsSessionManager, GlobalSystemMediaTransportControlsSessionPlaybackStatus};
// no async/await: usamos `.get()` en operaciones WinRT

/// Errors related to media info collection
#[derive(Debug, Error)]
pub enum MediaError {
    #[error("Windows API error: {0}")]
    WindowsApi(String),
    #[error("Unsupported platform for media info")]
    Unsupported,
}

/// Current media session info snapshot
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MediaInfo {
    pub playing: bool,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub app_display_name: Option<String>,
}

/// Media monitor to query GSMTC
pub struct MediaMonitor;

impl MediaMonitor {
    pub fn new() -> Self { Self }

    /// Obtiene la información multimedia actual. Devuelve Ok(None) si no hay sesión activa.
    pub fn get_media_info(&self) -> Result<Option<MediaInfo>, MediaError> {
        #[cfg(target_os = "windows")]
        {
            // Get GSMTC session manager
            let mgr = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
                .map_err(|e| MediaError::WindowsApi(format!("RequestAsync failed: {e:?}")))?
                .get()
                .map_err(|e| MediaError::WindowsApi(format!("Get manager failed: {e:?}")))?;

            // Tomar la sesión "actual" según Windows
            let session = match mgr.GetCurrentSession() {
                Ok(s) => s,
                Err(e) => {
                    debug!("GetCurrentSession error: {:?}", e);
                    return Ok(None);
                }
            };

            // Playback status
            let playback_info = session
                .GetPlaybackInfo()
                .map_err(|e| MediaError::WindowsApi(format!("GetPlaybackInfo failed: {e:?}")))?;
            let status = playback_info.PlaybackStatus().map_err(|e| MediaError::WindowsApi(format!("PlaybackStatus failed: {e:?}")))?;
            let playing = status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing;

            // Media properties
            let props = session
                .TryGetMediaPropertiesAsync()
                .map_err(|e| MediaError::WindowsApi(format!("TryGetMediaPropertiesAsync failed: {e:?}")))?
                .get()
                .map_err(|e| MediaError::WindowsApi(format!("Get media props failed: {e:?}")))?;

            // Props are WinRT strings (HSTRING). Convert to Rust String optionally
            let title = props.Title().ok().map(|s| s.to_string_lossy());
            let artist = props.Artist().ok().map(|s| s.to_string_lossy());
            let album = props.AlbumTitle().ok().map(|s| s.to_string_lossy());

            let app_display_name = session.SourceAppUserModelId()
                .ok()
                .map(|s| s.to_string_lossy());

            let info = MediaInfo { playing, title, artist, album, app_display_name };
            Ok(Some(info))
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = &self; // silence unused
            Err(MediaError::Unsupported)
        }
    }
}
