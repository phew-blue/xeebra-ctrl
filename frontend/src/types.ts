// App config (from xeebra-ctrl.config.json via /api/config)
export interface Group {
  name: string;
  apiServerIp: string;
  sshUser?: string;
  sshPassword?: string;
}

export interface AppConfig {
  port: number;
  groups: Group[];
}

// Xeebra API types (matches lexi/packages/xeebra-client/types.ts)
export interface XeebraConfigServer {
  id: string;
  ip: string;
  name: string;
  status: 'RUNNING' | 'STOPPED' | 'ERROR' | 'OFFLINE';
}

export interface XeebraSdiCharacteristics {
  boardId: number;
  nbrAvailableIn: number;
  nbrAvailableOut: number;
  nbrPort: number;
  boardType: string;
}

export interface XeebraCharacteristics {
  serverUUID: string;
  serverName: string;
  serialNumber: string;
  version: string;
  hardwareType: string;
  sdiAvailable: boolean;
  srtAvailable: boolean;
  ndiAvailable: boolean;
  sdiCharacteristics: XeebraSdiCharacteristics[];
  timezone: string;
}

export interface XeebraNtpInfo {
  ntpType: 'CLIENT' | 'SERVER' | 'DISABLED';
  ntpServer: string;
  ntpStatus: 'SYNCHRONIZED' | 'UNSYNCHRONIZED' | 'ERROR';
}

export interface XeebraBoardPort {
  board: number;
  port: number;
}

export interface XeebraRecorderSdiConfiguration {
  boardPorts: XeebraBoardPort[];
}

export interface XeebraRecorder {
  recorderName: string;
  slsmType: string;
  recorderSdiConfiguration: XeebraRecorderSdiConfiguration;
}

export interface XeebraRecordersConfiguration {
  transport: 'SDI' | 'IP' | 'SRT' | 'NDI';
  audioChannelsCount: number;
  recordersList: XeebraRecorder[];
}

export interface XeebraPlayout {
  playoutName: string;
  profile: string;
  playoutSdiConfiguration: { boardPorts: XeebraBoardPort[] };
}

export interface XeebraPlayoutsConfiguration {
  transport: 'SDI' | 'IP' | 'SRT' | 'NDI';
  playoutsList: XeebraPlayout[];
}

export interface XeebraCommonConfiguration {
  videoFormat: string;
  sampleRate: string;
  hdrProfile: string;
}

export interface XeebraLicensingInformation {
  configurationAuthorized: boolean;
  numberOfInputs: number;
  numberOfOutputs: number;
}

export interface XeebraServerConfiguration {
  id: string;
  ip: string;
  name: string;
  status: 'RUNNING' | 'STOPPED' | 'ERROR' | 'OFFLINE' | 'NOT_CONNECTED';
  characteristics: XeebraCharacteristics;
  ntpInfo: XeebraNtpInfo;
  commonConfiguration: XeebraCommonConfiguration;
  recordersConfiguration: XeebraRecordersConfiguration;
  playoutsConfiguration: XeebraPlayoutsConfiguration;
  licensingInformation: XeebraLicensingInformation;
  connectedClients: string[];
  playoutController: string;
}

export interface XeebraSDIChannelPictureResponse {
  img: string;
  errormsg: string;
}
