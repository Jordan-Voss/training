export type Sport =
  | 'strength'
  | 'weightlifting'
  | 'plyometrics'
  | 'running'
  | 'cycling'
  | 'rowing'
  | 'skiErg'
  | 'tagRugby';
export type SetKind = 'warmup' | 'working' | 'top' | 'backoff' | 'drop';
export type Attempt = 'unlogged' | 'completed' | 'partial' | 'failed' | 'skipped';
export type SourceCell = {
  a1: string;
  display: string;
  raw?: string | number | boolean;
  formula?: string;
  numberFormat?: { type?: string; pattern?: string };
  validation?: unknown;
  note?: string;
};
export type ParsedPrescription = {
  sets?: number;
  setsMax?: number;
  reps?: number;
  repsMax?: number;
  amrap?: boolean;
  durationSeconds?: number;
  durationMaxSeconds?: number;
  distanceMetres?: number;
  review?: string;
};
export type Exercise = {
  defaultSetKind?: SetKind;
  id: string;
  name: string;
  order: string;
  sport: Sport;
  prescription: string;
  parsed?: ParsedPrescription;
  rpe?: string;
  coachNotes?: string;
  group?: { id: string; type: 'superset' | 'circuit' };
  components?: { id: string; name: string; reps?: number; prescription: string }[];
  backoff?: {
    fraction: number;
    increment: number;
    prescription: string;
    parsed?: ParsedPrescription;
    formula?: string;
  };
  source?: {
    workbookId: string;
    sheetId: number;
    row: number;
    cells: SourceCell[];
    legacyTopWeight?: number;
    legacyNotes?: string;
  };
  demoUrl?: string;
  review?: string;
};
export type TrainingDay = {
  id: string;
  day: number;
  title: string;
  sport: Sport;
  coachNotes?: string;
  exercises: Exercise[];
};
export type SourceMapping = {
  workbookId: string;
  sheetId: number;
  title: string;
  range: string;
  fingerprint: string;
  generation: string;
  round: number;
  verified: boolean;
  writebackEnabled: boolean;
};
export type PrescriptionVersion = {
  id: string;
  blockId: string;
  title: string;
  acceptedAt: string;
  digest: string;
  days: TrainingDay[];
  kind?: 'programme' | 'routines';
  source?: SourceMapping;
  origin: 'demo' | 'sheets' | 'manual';
};
export type Programme = {
  id: string;
  title: string;
  rounds: number;
  activeVersionId: string;
  archived?: boolean;
};
export type Interval = {
  id: string;
  durationSeconds?: number;
  distanceMetres?: number;
  recoverySeconds?: number;
  notes?: string;
};
export type ActualSet = {
  id: string;
  kind: SetKind;
  load?: number;
  loadSource?: 'topSet' | 'manual';
  loadUnit: 'kg' | 'lb';
  loadMode?: 'external' | 'bodyweight' | 'assisted';
  reps?: number;
  repsSource?: 'prescription';
  status: Attempt;
  rpe?: number;
  rir?: number;
  restSeconds?: number;
  tempo?: string;
  notes?: string;
  durationSeconds?: number;
  distanceMetres?: number;
  contacts?: number;
  side?: 'left' | 'right' | 'both';
  execution?: 'bilateral' | 'unilateral';
  surface?: string;
  equipment?: string;
  boxHeightCm?: number;
  jumpHeightCm?: number;
  measuredDistanceCm?: number;
  components?: { componentId: string; reps?: number; status: Attempt }[];
};
export type ExerciseResult = {
  id: string;
  prescriptionId: string;
  substitution?: string;
  notes?: string;
  sets: ActualSet[];
  intervals?: Interval[];
  group?: { type: 'superset' | 'circuit'; label: string };
  components?: { id: string; name: string; prescription: string }[];
};
export type Session = {
  sourceActivity?: { provider: 'garmin' | 'file'; externalId: string };
  id: string;
  blockId: string;
  versionId: string;
  round: number;
  dayId: string;
  day: number;
  title: string;
  sport: Sport;
  status: 'inProgress' | 'completed' | 'skipped';
  startedAt: string;
  finishedAt?: string;
  scheduledDate?: string;
  trainingDate: string;
  timezone: string;
  prescription: TrainingDay;
  exercises: ExerciseResult[];
  notes?: string;
  sessionRpe?: number;
  durationSeconds?: number;
  distanceMetres?: number;
  classification?: 'training' | 'match';
  averageHeartRate?: number;
  elevationMetres?: number;
  intervals?: Interval[];
  revision: number;
};
export type Operation = {
  id: string;
  sessionId: string;
  expectedRevision: number;
  session: Session;
  attempts: number;
  nextAttemptAt: number;
  status: 'pending' | 'conflict';
  error?: string;
};
export type PendingVideo = {
  id: string;
  sessionId: string;
  setId: string;
  uri: string;
  thumbnailUri?: string;
  compressionApplied?: boolean;
  mime: string;
  bytes: number;
  duration?: number;
  objectPath?: string;
  uploadUrl?: string;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  progress: number;
  error?: string;
};
export type ExternalActivity = {
  syncStatus?: 'pending' | 'synced';
  id: string;
  provider: 'garmin' | 'file';
  externalId: string;
  name: string;
  sport: Sport;
  startedAt: string;
  durationSeconds?: number;
  distanceMetres?: number;
  averageHeartRate?: number;
  elevationMetres?: number;
  matchedSessionId?: string;
  dismissed?: boolean;
  raw: unknown;
};
export type AppState = {
  conflictBackups?: {
    id: string;
    sessionId: string;
    local: Session;
    remote: Session;
    resolvedAt: string;
    choice: 'device' | 'cloud';
  }[];
  schema: 1;
  scope: string;
  programme?: Programme;
  versions: PrescriptionVersion[];
  routines?: TrainingDay[];
  sessions: Session[];
  outbox: Operation[];
  media: PendingVideo[];
  activities: ExternalActivity[];
  settings: {
    theme: 'system' | 'light' | 'dark';
    compression: 'medium' | 'original';
    retentionDays?: number;
  };
  savedAt?: string;
};
export type IdFactory = () => string;
export function blankState(scope: string): AppState {
  return {
    schema: 1,
    scope,
    versions: [],
    sessions: [],
    outbox: [],
    media: [],
    activities: [],
    settings: { theme: 'system', compression: 'medium' },
  };
}
