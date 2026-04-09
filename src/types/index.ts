// ─── Enums ────────────────────────────────────────────────────────────────────

export enum Retailer {
  Walmart = 'walmart',
  Target  = 'target',
  Amazon  = 'amazon',
  BestBuy = 'bestbuy',
}

export enum TaskStatus {
  Idle        = 'idle',
  Monitoring  = 'monitoring',
  InQueue     = 'in_queue',
  CheckingOut = 'checking_out',
  Success     = 'success',
  Failed      = 'failed',
}

export enum LogLevel {
  Info    = 'info',
  Warn    = 'warn',
  Error   = 'error',
  Success = 'success',
}

// ─── Task ─────────────────────────────────────────────────────────────────────

export interface Task {
  id:              number;
  group_id:        number | null;
  retailer:        Retailer;
  product_url:     string | null;
  keywords:        string | null;
  size:            string | null;
  quantity:        number;
  profile_id:      number | null;
  proxy:           string | null;
  status:          TaskStatus;
  poll_interval:   number; // ms
  offer_id:        string | null; // Walmart OID — targets specific seller listing
  skip_monitoring: boolean;       // skip stock check, go straight to ATC
  created_at:      number;
  updated_at:      number;
}

export interface CreateTaskInput {
  group_id?:        number | null;
  retailer:         Retailer;
  product_url?:     string;
  keywords?:        string;
  size?:            string;
  quantity?:        number;
  profile_id?:      number | null;
  proxy?:           string;
  poll_interval?:   number;
  offer_id?:        string;
  skip_monitoring?: boolean;
}

// ─── Task Group ───────────────────────────────────────────────────────────────

export interface TaskGroup {
  id:         number;
  name:       string;
  created_at: number;
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export interface Profile {
  id:         number;
  name:       string;
  email:      string;
  phone:      string | null;

  // Shipping
  ship_first_name: string;
  ship_last_name:  string;
  ship_address1:   string;
  ship_address2:   string | null;
  ship_city:       string;
  ship_state:      string;
  ship_zip:        string;
  ship_country:    string;

  // Billing
  billing_same_as_shipping: boolean;
  bill_first_name: string | null;
  bill_last_name:  string | null;
  bill_address1:   string | null;
  bill_address2:   string | null;
  bill_city:       string | null;
  bill_state:      string | null;
  bill_zip:        string | null;
  bill_country:    string | null;

  // Payment (card_number and cvv stored encrypted in DB, decrypted in memory)
  card_name:   string;
  card_number: string; // plain in memory, encrypted in DB
  card_expiry: string; // MM/YY
  card_cvv:    string; // plain in memory, encrypted in DB

  created_at: number;
}

export interface CreateProfileInput {
  name:       string;
  email:      string;
  phone?:     string;
  ship_first_name: string;
  ship_last_name:  string;
  ship_address1:   string;
  ship_address2?:  string;
  ship_city:       string;
  ship_state:      string;
  ship_zip:        string;
  ship_country?:   string;
  billing_same_as_shipping?: boolean;
  bill_first_name?: string;
  bill_last_name?:  string;
  bill_address1?:   string;
  bill_address2?:   string;
  bill_city?:       string;
  bill_state?:      string;
  bill_zip?:        string;
  bill_country?:    string;
  card_name:   string;
  card_number: string;
  card_expiry: string;
  card_cvv:    string;
}

// ─── Log Entry ────────────────────────────────────────────────────────────────

export interface LogEntry {
  id:        number;
  task_id:   number | null;
  level:     LogLevel;
  message:   string;
  timestamp: number;
}

export interface LogFilters {
  task_id?:  number;
  level?:    LogLevel;
  since?:    number;
  limit?:    number;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface Settings {
  poll_interval:        number;  // ms, default 3000
  default_proxy:        string;  // optional global proxy
  imap_host:            string;
  imap_port:            number;
  imap_user:            string;
  imap_password:        string;  // encrypted at rest
  imap_tls:             boolean;
  notifications_enabled: boolean;
  browser_headless:     boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  poll_interval:        3000,
  default_proxy:        '',
  imap_host:            '',
  imap_port:            993,
  imap_user:            '',
  imap_password:        '',
  imap_tls:             true,
  notifications_enabled: true,
  browser_headless:     true,
};

// ─── IPC API (exposed via contextBridge) ─────────────────────────────────────

export interface ElectronAPI {
  // Tasks
  getTasks:       ()                            => Promise<Task[]>;
  getTask:        (id: number)                  => Promise<Task | null>;
  createTask:     (input: CreateTaskInput)      => Promise<Task>;
  updateTask:     (id: number, input: Partial<CreateTaskInput>) => Promise<Task>;
  deleteTask:     (id: number)                  => Promise<void>;
  startTask:      (id: number)                  => Promise<void>;
  stopTask:       (id: number)                  => Promise<void>;

  // Groups
  getGroups:      ()                            => Promise<TaskGroup[]>;
  createGroup:    (name: string)                => Promise<TaskGroup>;
  deleteGroup:    (id: number)                  => Promise<void>;
  startGroup:     (id: number)                  => Promise<void>;
  stopGroup:      (id: number)                  => Promise<void>;

  // Profiles
  getProfiles:    ()                            => Promise<Profile[]>;
  createProfile:  (input: CreateProfileInput)   => Promise<Profile>;
  updateProfile:  (id: number, input: Partial<CreateProfileInput>) => Promise<Profile>;
  deleteProfile:  (id: number)                  => Promise<void>;

  // Logs
  getLogs:        (filters?: LogFilters)        => Promise<LogEntry[]>;
  clearLogs:      ()                            => Promise<void>;

  // Settings
  getSettings:    ()                            => Promise<Settings>;
  saveSettings:   (s: Partial<Settings>)        => Promise<void>;

  // Events (renderer subscribes to main-process events)
  onTaskUpdate:   (cb: (task: Task)     => void) => () => void;
  onLogEntry:     (cb: (log: LogEntry)  => void) => () => void;
}

// Augment Window
declare global {
  interface Window {
    api: ElectronAPI;
  }
}
