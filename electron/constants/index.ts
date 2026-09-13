export const IpcMainToRender = {
  appResume: "appResume",
  messageNotificationClicked: "messageNotificationClicked",
  windowMaximizedChanged: "windowMaximizedChanged",
};

export const IpcRenderToMain = {
  minimizeWindow: "minimizeWindow",
  maxmizeWindow: "maxmizeWindow",
  closeWindow: "closeWindow",
  getKeyStore: "getKeyStore",
  getKeyStoreSync: "getKeyStoreSync",
  getDataPath: "getDataPath",
  showMessageNotification: "showMessageNotification",
  updateBadgeCount: "updateBadgeCount",
};
