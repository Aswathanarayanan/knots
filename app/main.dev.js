/*
 * knots
 * Copyright 2018 data.world, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the
 * License.
 *
 * You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
 * implied. See the License for the specific language governing
 * permissions and limitations under the License.
 *
 * This product includes software developed at
 * data.world, Inc.(http://data.world/).
 */

/* eslint global-require: 0, flowtype-errors/show-errors: 0 */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build-main`, this file is compiled to
 * `./app/main.prod.js` using webpack. This gives us some performance wins.
 *
 * @flow
 */
import { app, ipcMain, BrowserWindow } from 'electron';
import MenuBuilder from './menu';
import { electronOauth } from './electron-oauth';

const fixPath = require('fix-path');

fixPath();

let mainWindow = null;

if (process.env.NODE_ENV === 'production') {
  require('./backend');
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

if (
  process.env.NODE_ENV === 'development' ||
  process.env.DEBUG_PROD === 'true'
) {
  require('electron-debug')();
  const path = require('path');
  const p = path.join(__dirname, '..', 'app', 'node_modules');
  require('module').globalPaths.push(p);
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS', 'REDUX_DEVTOOLS'];

  return Promise.all(
    extensions.map((name) => installer.default(installer[name], forceDownload))
  ).catch(console.log);
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('ready', async () => {
  if (
    process.env.NODE_ENV === 'development' ||
    process.env.DEBUG_PROD === 'true'
  ) {
    await installExtensions();
  }

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728
  });

  mainWindow.loadURL(`file://${__dirname}/app.html`);

  // @TODO: Use 'ready-to-show' event
  //        https://github.com/electron/electron/blob/master/docs/api/browser-window.md#using-ready-to-show-event
  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  const windowParams = {
    alwaysOnTop: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false
    }
  };

  ipcMain.on('sf-oauth', (event, clientId, clientSecret) => {
    const authorizationUrl =
      'https://login.salesforce.com/services/oauth2/authorize';
    const redirectUri = 'https://login.salesforce.com/services/oauth2/success';
    const tokenUrl = 'https://login.salesforce.com/services/oauth2/token';
    const salesforceOauth = electronOauth(windowParams);
    salesforceOauth
      .getAccessToken(
        ['refresh_token', 'api', 'offline_access'],
        clientId,
        clientSecret,
        redirectUri,
        tokenUrl,
        authorizationUrl
      )
      .then(
        (token) => {
          event.sender.send('sf-oauth-reply', token);
        },
        (err) => {
          console.log('Error while getting token', err);
        }
      )
      .catch((error) => console.log(error));
  });

  ipcMain.on('adwords-oauth', (event, clientId, clientSecret) => {
    const tokenUrl = 'https://accounts.google.com/o/oauth2/token';
    const redirectUrl = 'urn:ietf:wg:oauth:2.0:oob';
    const scope = 'https://www.googleapis.com/auth/adwords';
    const googleOauth = electronOauth(windowParams);
    googleOauth
      .getAccessToken(scope, clientId, clientSecret, redirectUrl, tokenUrl)
      .then((token) => {
        event.sender.send('adwords-oauth-reply', token);
      })
      .catch((error) => console.log(error));
  });

  ipcMain.on('fb-authenticate', (event, accountId, appSecret) => {
    const scope = ['ads_read', 'ads_management'];
    const redirectUrl = 'https://www.facebook.com/connect/login_success.html';
    const authorizationUrl = 'https://graph.facebook.com/oauth/authorize';
    const tokenUrl = 'https://graph.facebook.com/oauth/access_token';
    const fbOauth = electronOauth(windowParams);
    fbOauth
      .getAccessToken(
        scope,
        accountId,
        appSecret,
        redirectUrl,
        tokenUrl,
        authorizationUrl
      )
      .then((token) => {
        event.sender.send('fb-oauth-reply', token);
      })
      .catch((error) => console.log(error));
  });
});
