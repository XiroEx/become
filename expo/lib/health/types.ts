export interface DateRange {
  startISO: string;
  endISO: string;
}

export interface WeightSample {
  valueLbs: number;
  timestamp: string;
}

export interface StepSample {
  count: number;
  timestamp: string;
}

export interface HealthClient {
  platform: "ios" | "android";
  readWeight: (range: DateRange) => Promise<WeightSample[]>;
  readSteps: (range: DateRange) => Promise<StepSample[]>;
}

export class HealthPermissionError extends Error {
  readonly platform: "ios" | "android";
  readonly metric: "weight" | "steps";
  constructor(platform: "ios" | "android", metric: "weight" | "steps") {
    super(`Permission denied for ${platform} ${metric}`);
    this.name = "HealthPermissionError";
    this.platform = platform;
    this.metric = metric;
  }
}
