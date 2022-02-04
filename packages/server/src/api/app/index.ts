/**
 * Handlers for app routes
 */
import { URL } from 'url';
import querystring from 'querystring';
import path from 'path';
import { Request, Response } from 'express';
import fs from 'fs-extra';
import Loggee from 'loggee';
import { values as config } from '../../config';
import * as uploader from '../../helpers/uploader';
import { RTV_USER, getRtvUserFromExpressRequest } from '../../helpers/rtv-user';
import * as platform from '../../platform';
import { proxyUrlAsPath } from '../../proxy/helper';
import { sendFile } from '../protocol';
import { safeJsonParse } from '../../helpers';
import { getServerOrigin } from '../../helpers/srv';
import { getKnownTv } from '../tv/service';
import { PackAppOptions } from '../../platform';
import * as AppService from './service';
import { AppState, DebugAppInfo, KnownApp, InstallAppResult, AppListInfo } from './types';

const logger = Loggee.create('app');
const WEINRE_URL = process.env.WEINRE_URL || 'http://localhost:8080/client';

export const installApp = async (req: Request, res: Response<InstallAppResult>) => {
  const { ip, appId } = req.body;
  const noMinify = req.body.noMinify === 'true';
  const file = req.file as Express.Multer.File;

  const tv = getKnownTv(ip);
  const shouldPackApp = isZipFile(file.filename) && tv.platform !== 'orsay';
  const packedFilePath = shouldPackApp ? await packZippedFile(file.path, { ip, noMinify }) : file.path;

  const output = await platform.installApp(ip, packedFilePath, appId);

  res.json(output);
};

export const packApp = async (req: Request, res: Response) => {
  const file = req.file as Express.Multer.File;
  const packedFilePath = isZipFile(file.filename) ? await packZippedFile(file.path, req.body) : file.path;

  sendFile(packedFilePath, req, res, { deleteAfterSend: true });
};

export const launchApp = async (req: Request, res: Response<void>) => {
  const { ip, appId, params } = req.query as Record<string, string>;
  await platform.launchApp(ip, appId, safeJsonParse(params));
  res.end();
};

export const closeApp = async (req: Request, res: Response<void>) => {
  const { ip, appId } = req.query as Record<string, string>;
  await platform.closeApp(ip, appId);
  res.end();
};

export const debugApp = async (req: Request, res: Response<DebugAppInfo>) => {
  const { ip, appId, params, options } = req.query as Record<string, string>;
  const serverOrigin = getServerOrigin(req);
  const rtvUser = getRtvUserFromExpressRequest(req);
  const supportsDevToolsProtocol = await platform.supportsDevToolsProtocol(ip);
  let debugInfo: DebugInfo;
  if (supportsDevToolsProtocol) {
    const rawDebugInfo = await platform.debugApp(ip, appId, safeJsonParse(params), safeJsonParse(options));
    debugInfo = getDevtoolsProtocolDebugInfo(rawDebugInfo, serverOrigin, rtvUser);
  } else {
    await platform.launchApp(ip, appId, safeJsonParse(params));
    debugInfo = getWeinreDebugInfo();
  }

  res.json(formatDebugInfo(debugInfo));
};

export const getAppState = async (req: Request, res: Response<AppState>) => {
  const { ip, appId } = req.query as Record<string, string>;
  const result = await platform.getAppState(ip, appId);
  res.json(result);
};

export const uninstallApp = async (req: Request, res: Response<void>) => {
  const { ip, appId } = req.query as Record<string, string>;
  await platform.uninstallApp(ip, appId);
  res.end();
};

export const getAppList = async (req: Request, res: Response<AppListInfo[]>) => {
  const list = await platform.getAppList(req.query.ip as string);
  res.json(list);
};

export const getKnownApps = async (req: Request, res: Response<KnownApp[]>) => {
  const list = AppService.getKnownApps();
  res.json(list);
};

export const saveKnownApp = async (req: Request, res: Response<KnownApp>) => {
  const app = AppService.saveKnownApp(req.body);
  res.json(app);
};

export const deleteKnownApp = async (req: Request, res: Response<void>) => {
  AppService.deleteKnownApp(req.params.id);
  res.end();
};

interface DebugInfo {
  title?: string;
  debugUrl: string;
  wsUrl?: string;
  platform?: platform.Platform;
  inspectorUrl?: string;
  osMajor?: number;
  osMinor?: number;
}

function getDevtoolsProtocolDebugInfo(debugInfo: DebugInfo, serverOrigin: string, rtvUser: string) {
  setHostedInspectorUrl(debugInfo, serverOrigin);
  setProxiedWsUrl(debugInfo, serverOrigin, rtvUser);
  const wsProtocol = new URL(serverOrigin).protocol == 'https:' ? 'wss' : 'ws';
  setDebugUrl(debugInfo, wsProtocol);

  return debugInfo;
}

function formatDebugInfo(debugInfo: DebugInfo) {
  return {
    title: debugInfo.title,
    debugUrl: debugInfo.debugUrl,
    wsUrl: debugInfo.wsUrl,
  };
}

function getWeinreDebugInfo() {
  return {
    debugUrl: WEINRE_URL,
  };
}
// In Tizen 2.4 TV browser's devtools is too old and have broken console tab and do not support wss://.
// So use self-hosted devtools instance with fixed bugs from: https://github.com/vitalets/node-webkit-agent-frontend.
// See: https://github.com/danmactough/node-webkit-agent-frontend/pull/6
// In Tizen 3.0 it is also better use self-hosted inspector. See devtools/README.md.
// For webOS we also have to use our own devtools, different for webOS <= 3 and webOS 4
function setHostedInspectorUrl(debugInfo: DebugInfo, serverOrigin: string) {
  const hostedInspectorPath = `${getDevtoolsUrl(debugInfo)}/inspector.html`;
  debugInfo.inspectorUrl = `${serverOrigin}/${hostedInspectorPath}`;
}

function getDevtoolsUrl(debugInfo: DebugInfo) {
  const { platform, osMajor } = debugInfo;

  if (platform === 'webos') {
    return `devtools/webos${osMajor && osMajor <= 3 ? '3' : '4'}`;
  }

  if (platform === 'tizen') {
    if (osMajor === 2) {
      return 'devtools/webkit';
    }

    if (osMajor === 3) {
      return 'devtools';
    }

    return 'devtools/tizen4';
  }

  //playstation and others
  return `devtools`;
}

/**
 * Always proxy WebSocket as it is more reliable.
 */
function setProxiedWsUrl(debugInfo: DebugInfo, serverOrigin: string, rtvUser: string) {
  const proxiedWsPath = proxyUrlAsPath(`http://${debugInfo.wsUrl}`);
  const serverHost = serverOrigin.split('//')[1];
  debugInfo.wsUrl = `${serverHost}${proxiedWsPath}?${RTV_USER}=${rtvUser}`; // wsUrl does not contain protocol ('ws://' | 'wss://')
}

function setDebugUrl(debugInfo: DebugInfo, wsProtocol: 'ws' | 'wss') {
  // Escape wsUrl search string because Devtools Inspector cannot parse nested query params,
  // e.g. http://localhost:3000/devtools/webkit/inspector.html?ws=localhost:3000/proxy/http/10.42.0.19/7011/devtools/page/1?rtv-user%3Dusername
  const wsUrlWithProtocol = `${wsProtocol}://${debugInfo.wsUrl}`;
  const wsUrl = new URL(wsUrlWithProtocol);
  const wsUrlSearchEscaped = querystring.escape(wsUrl.search);
  // Note: wsUrl.search = querystring.escape(wsUrl.search) doesn't work, it adds extra '?' in query string
  wsUrl.search = '';
  debugInfo.debugUrl = `${debugInfo.inspectorUrl}?${wsProtocol}=${wsUrl.host}${wsUrl.pathname}${wsUrlSearchEscaped}`;
  debugInfo.wsUrl = wsUrlWithProtocol;
}

const isZipFile = (fileName: string) => path.extname(fileName) === '.zip';

async function packZippedFile(zipPath: string, options?: PackAppOptions) {
  const unzippedPath = await uploader.extractZipToTempDir(zipPath);
  logger.log(`Extracted to: ${unzippedPath}`);
  const packPath = path.join(config.workDirPath, 'builds');
  fs.ensureDir(packPath);
  return platform.packApp(unzippedPath, packPath, options);
}
