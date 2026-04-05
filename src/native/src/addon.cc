#include <napi.h>

Napi::String LockScreen(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Aquí se implementaría la lógica para bloquear la pantalla.
    // Esto es solo un ejemplo y no bloquea realmente la pantalla.
    return Napi::String::New(env, "Pantalla bloqueada (simulación)");
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "lockScreen"), Napi::Function::New(env, LockScreen));
    return exports;
}

NODE_API_MODULE(addon, Init)