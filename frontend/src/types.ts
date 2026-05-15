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
  status: 'RUNNING' | 'STOPPED' | 'ERROR' | 'OFFLINE' | 'NOT_CONNECTED';
}

export interface XeebraSdiCharacteristics {
  boardId: number;
  nbrAvailableIn: number;
  nbrAvailableOut: number;
  nbrPort: number;
  boardType: string;
}

export interface XeebraCharacteristics {
  serverName: string;
  version: string;
  serverUUID?: string;
  serialNumber?: string;
  hardwareType?: string;
  sdiAvailable?: boolean;
  srtAvailable?: boolean;
  ndiAvailable?: boolean;
  sdiCharacteristics?: XeebraSdiCharacteristics[];
  timezone?: string;
}

export interface XeebraNtpInfo {
  ntpType: 'CLIENT' | 'SERVER' | 'DISABLED';
  ntpServer?: string;
  ntpStatus: string;
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
  slsmType?: string;
  recorderSdiConfiguration?: XeebraRecorderSdiConfiguration;
}

export interface XeebraRecordersConfiguration {
  transport?: string;
  audioChannelsCount?: number;
  recordersList?: XeebraRecorder[];
}

export interface XeebraPlayout {
  playoutName: string;
  profile?: string;
  playoutSdiConfiguration?: { boardPorts: XeebraBoardPort[] };
}

export interface XeebraPlayoutsConfiguration {
  transport?: string;
  playoutsList?: XeebraPlayout[];
}

export interface XeebraCommonConfiguration {
  videoFormat?: string;
  sampleRate?: string;
  hdrProfile?: string;
}

export interface XeebraLicensingInformation {
  configurationAuthorized?: boolean;
  numberOfInputs?: number;
  numberOfOutputs?: number;
}

export interface XeebraServerConfiguration {
  ip: string;
  status: 'RUNNING' | 'STOPPED' | 'ERROR' | 'OFFLINE' | 'NOT_CONNECTED';
  id?: string;
  name?: string;
  characteristics?: XeebraCharacteristics;
  ntpInfo?: XeebraNtpInfo;
  commonConfiguration?: XeebraCommonConfiguration;
  recordersConfiguration?: XeebraRecordersConfiguration;
  playoutsConfiguration?: XeebraPlayoutsConfiguration;
  licensingInformation?: XeebraLicensingInformation;
  connectedClients?: string[];
  playoutController?: string;
}

export interface XeebraSDIChannelPictureResponse {
  img: string;
  errormsg: string;
}

// ─── platform-console (:9081) endpoints — Metrics tab ─────────────────────

// /api/platform-console/health/checks — Consul-style service health entries
// per systemd unit. Status is 'passing' | 'warning' | 'critical'.
export interface PlatformHealthCheck {
  Node?: string;
  CheckID?: string;
  Name?: string;
  Status?: string;
  Output?: string;
  ServiceID?: string;
  ServiceName?: string;
  ServiceTags?: string[];
}

// /api/platform-console/metrics/sdi — per-board, per-channel signal info.
export interface PlatformSDIChannel {
  Index?: number;
  Type?: string;
  Running?: boolean;
  Error?: string;
  SyncWithRef?: string;
  Configuration?: PlatformSDIFormat;
  Signal?: PlatformSDIFormat & { '3GInterface'?: string; LtcValid?: boolean; LtcValue?: string; AudioTracks?: number };
  Timecodes?: { 'Auto-Generated'?: { Timecode?: string; DropFrame?: boolean }; LTC?: { ErrorStatus?: string } };
}
export interface PlatformSDIFormat {
  HorizontalResolution?: number;
  VerticalResolution?: number;
  Progressive?: boolean;
  Rate?: { Numerator?: number; Denominator?: number };
  AudioTracks?: number;
}
export interface PlatformSDIMetrics {
  Boards?: Array<{ Channels?: PlatformSDIChannel[] }>;
}

// /api/platform-console/metrics/sensors — per-chip hardware sensors.
export interface PlatformSensorElement {
  name?: string;
  data?: string;
  temp?: number | null;
  high?: number | null;
  crit?: number | null;
}
export interface PlatformSensorChip {
  name?: string;
  elements?: PlatformSensorElement[];
}

// /api/platform-console/metrics/sxstorage — recording storage on raw block
// device. Top-level keys come back as space-separated strings ("total size",
// "block size") — that's the upstream API shape.
export interface PlatformSxStoragePartition {
  id?: number;
  totalBytes?: number;
  totalUsedBytes?: number;
  totalProtectedBytes?: number;
  protectedPct?: number;
  totalBitrate?: number;
  totalAverageBitrate?: number;
  availableBytes?: number;
  tracks?: Array<{ id?: number; durationSec?: number; bitrate?: number; usedBytes?: number; protectedBytes?: number }>;
}
export interface PlatformSxStorage {
  version?: string;
  'protocolx API version'?: string;
  'block size'?: string;
  'total size'?: string;
  'remaining size'?: string;
  'partition count'?: string | number;
  'dynamic track count'?: string | number;
  'static track count'?: string | number;
  protectedCount?: number;
  partitionsInfos?: PlatformSxStoragePartition[];
}
