// Este archivo exporta tipos y interfaces compartidos que se utilizan en diferentes partes de la aplicación.

export interface LockScreenCommand {
    commandType: string;
    parameters: Record<string, any>;
    requestId?: string;
}

export interface CommandResponse {
    success: boolean;
    message?: string;
    data?: any;
}

export type AllowedCommands = 'lock_screen' | 'volume_control' | 'app_launch';