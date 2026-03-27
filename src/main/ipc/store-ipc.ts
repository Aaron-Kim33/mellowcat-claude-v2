import { ipcMain } from "electron";
import { AuthService } from "../services/auth/auth-service";

export function registerAuthIpc(authService: AuthService): void {
  ipcMain.handle("auth:getSession", () => authService.getSession());
  ipcMain.handle("auth:login", () => authService.loginWithBrowser());
  ipcMain.handle("auth:loginWithToken", (_event, token: string) =>
    authService.loginWithToken(token)
  );
  ipcMain.handle("auth:createPaymentHandoff", (_event, productId: string, source?: string) =>
    authService.createPaymentHandoff(productId, source)
  );
  ipcMain.handle("auth:logout", () => authService.logout());
}
