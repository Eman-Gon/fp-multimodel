import { TwelveLabsError } from "./errors.ts";

export const TWELVELABS_API_VERSION = "v1.3" as const;
export const TWELVELABS_MODEL = "pegasus1.5" as const;
export const TWELVELABS_API_BASE_URL =
  `https://api.twelvelabs.io/${TWELVELABS_API_VERSION}` as const;

export interface TwelveLabsConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
}

export interface TwelveLabsConfigurationStatus {
  readonly provider: "twelvelabs";
  readonly configured: boolean;
  readonly api_version: typeof TWELVELABS_API_VERSION;
  readonly model: typeof TWELVELABS_MODEL;
  readonly capabilities: {
    readonly direct_upload: true;
    readonly indexing: true;
    readonly structured_gesture_analysis: true;
  };
}

export function readTwelveLabsConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): TwelveLabsConfig {
  const apiKey = environment.TWELVELABS_API_KEY?.trim() ?? "";
  if (apiKey.length === 0) {
    throw new TwelveLabsError(
      "TWELVELABS_NOT_CONFIGURED",
      "TwelveLabs is not configured on the server.",
      503,
    );
  }

  return {
    apiKey,
    baseUrl: TWELVELABS_API_BASE_URL,
  };
}

export function getTwelveLabsConfigurationStatus(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): TwelveLabsConfigurationStatus {
  return {
    provider: "twelvelabs",
    configured:
      (environment.TWELVELABS_API_KEY?.trim().length ?? 0) > 0,
    api_version: TWELVELABS_API_VERSION,
    model: TWELVELABS_MODEL,
    capabilities: {
      direct_upload: true,
      indexing: true,
      structured_gesture_analysis: true,
    },
  };
}

