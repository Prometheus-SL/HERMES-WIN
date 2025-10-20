use napi::bindgen_prelude::*;
use napi_derive::napi;
use windows::Win32::Media::Audio::*;
use windows::Win32::System::Com::*;
use windows::Win32::System::Com;

fn with_com<F, R>(f: F) -> Result<R, anyhow::Error>
where
  F: FnOnce() -> windows::core::Result<R>,
{
  unsafe { CoInitializeEx(std::ptr::null_mut(), COINIT_MULTITHREADED)? };
  let res = f().map_err(|e| anyhow::anyhow!("COM error: {}", e));
  unsafe { CoUninitialize(); }
  res
}

#[napi]
fn hello() -> String {
  "win_volume native stub".to_string()
}

#[napi]
fn set_master_volume_scalar(level: f32) -> bool {
  // level: 0.0 - 1.0
  let r = with_com(|| -> windows::core::Result<bool> {
    let device_enumerator: IMMDeviceEnumerator = unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)? }?
      .cast()?;
    let mut device: Option<IMMDevice> = None;
    unsafe { device_enumerator.GetDefaultAudioEndpoint(eRender, eConsole, &mut device)?; }
    let device = device.ok_or_else(|| windows::core::Error::from_win32())?;
    let mut endpoint: Option<::std::option::Option<IUnknown>> = None;
    let iid = &IAudioEndpointVolume::IID;
    unsafe { device.Activate(iid, CLSCTX_ALL.0 as u32, std::ptr::null_mut(), &mut endpoint as *mut _ as *mut _)?; }
    let endpoint = endpoint.ok_or_else(|| windows::core::Error::from_win32())?;
    let aev: IAudioEndpointVolume = unsafe { endpoint.cast()? };
    unsafe { aev.SetMasterVolumeLevelScalar(level, std::ptr::null_mut())?; }
    Ok(true)
  });
  r.is_ok()
}

#[napi]
fn set_mute(mute: bool) -> bool {
  let r = with_com(|| -> windows::core::Result<bool> {
    let device_enumerator: IMMDeviceEnumerator = unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)? }?
      .cast()?;
    let mut device: Option<IMMDevice> = None;
    unsafe { device_enumerator.GetDefaultAudioEndpoint(eRender, eConsole, &mut device)?; }
    let device = device.ok_or_else(|| windows::core::Error::from_win32())?;
    let mut endpoint: Option<::std::option::Option<IUnknown>> = None;
    let iid = &IAudioEndpointVolume::IID;
    unsafe { device.Activate(iid, CLSCTX_ALL.0 as u32, std::ptr::null_mut(), &mut endpoint as *mut _ as *mut _)?; }
    let endpoint = endpoint.ok_or_else(|| windows::core::Error::from_win32())?;
    let aev: IAudioEndpointVolume = unsafe { endpoint.cast()? };
    unsafe { aev.SetMute(if mute { 1 } else { 0 }, std::ptr::null_mut())?; }
    Ok(true)
  });
  r.is_ok()
}

#[napi]
fn get_master_volume_scalar() -> f32 {
  let r = with_com(|| -> windows::core::Result<f32> {
    let device_enumerator: IMMDeviceEnumerator = unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)? }?
      .cast()?;
    let mut device: Option<IMMDevice> = None;
    unsafe { device_enumerator.GetDefaultAudioEndpoint(eRender, eConsole, &mut device)?; }
    let device = device.ok_or_else(|| windows::core::Error::from_win32())?;
    let mut endpoint: Option<::std::option::Option<IUnknown>> = None;
    let iid = &IAudioEndpointVolume::IID;
    unsafe { device.Activate(iid, CLSCTX_ALL.0 as u32, std::ptr::null_mut(), &mut endpoint as *mut _ as *mut _)?; }
    let endpoint = endpoint.ok_or_else(|| windows::core::Error::from_win32())?;
    let aev: IAudioEndpointVolume = unsafe { endpoint.cast()? };
    let mut val: f32 = 0.0;
    unsafe { aev.GetMasterVolumeLevelScalar(&mut val)?; }
    Ok(val)
  });
  r.unwrap_or(0.0)
}
