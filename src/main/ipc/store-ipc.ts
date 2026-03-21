import { ipcMain } from "electron";
import { AuthService } from "../services/auth/auth-service";

export function registerAuthIpc(authService: AuthService): void {
  ipcMain.handle("auth:getSession", () => authService.getSession());
  ipcMain.handle("auth:login", () => authService.loginWithBrowser());
  ipcMain.handle("auth:logout", () => authService.logout());
}
