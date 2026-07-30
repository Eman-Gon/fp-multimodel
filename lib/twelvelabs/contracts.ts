import type {
  FinalParticleInstance,
  GestureAnnotationDraft,
} from "../types.ts";
import type { TwelveLabsConfigurationStatus } from "./config.ts";

export const TWELVELABS_STATUS_ENDPOINT =
  "/api/integrations/twelvelabs/status";
export const TWELVELABS_INDEX_ENDPOINT =
  "/api/integrations/twelvelabs/index";
export const TWELVELABS_ANALYZE_ENDPOINT =
  "/api/integrations/twelvelabs/analyze";
export const TWELVELABS_MAX_DIRECT_UPLOAD_BYTES = 200 * 1024 * 1024;

export interface ApiDataResponse<T> {
  readonly data: T;
}

export interface ApiErrorDetails {
  readonly retryable?: boolean;
  readonly video_id?: string;
  readonly instance_id?: string;
}

export interface ApiErrorResponse {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: ApiErrorDetails;
  };
}

export type TwelveLabsStatusData = TwelveLabsConfigurationStatus;
export type TwelveLabsStatusResponse =
  ApiDataResponse<TwelveLabsStatusData>;

export interface TwelveLabsCreateDestinationRequest {
  readonly action: "create_index";
  readonly video_id: string;
}

export interface TwelveLabsCreateDestinationData {
  readonly provider: "twelvelabs";
  readonly video_id: string;
  readonly index_id: string;
}

interface TwelveLabsIndexRequestBase {
  readonly video_id: string;
  readonly index_id: string;
}

export interface TwelveLabsUploadUrlRequest
  extends TwelveLabsIndexRequestBase {
  readonly action: "upload";
  readonly video_url: string;
  readonly filename?: string;
}

export interface TwelveLabsCreateIndexRequest
  extends TwelveLabsIndexRequestBase {
  readonly action: "index";
  readonly asset_id: string;
}

export interface TwelveLabsIndexStatusRequest
  extends TwelveLabsIndexRequestBase {
  readonly action: "status";
  readonly asset_id: string;
  readonly indexed_asset_id?: string;
}

export type TwelveLabsIndexRequest =
  | TwelveLabsUploadUrlRequest
  | TwelveLabsCreateIndexRequest
  | TwelveLabsIndexStatusRequest;

export type TwelveLabsIndexStage = "upload" | "index";
export type TwelveLabsIndexStatus = "processing" | "ready" | "failed";

interface TwelveLabsIndexDataBase {
  readonly provider: "twelvelabs";
  readonly video_id: string;
  readonly index_id: string;
  readonly asset_id: string;
  readonly status: TwelveLabsIndexStatus;
}

export interface TwelveLabsUploadIndexData
  extends TwelveLabsIndexDataBase {
  readonly indexed_asset_id: null;
  readonly stage: "upload";
}

export interface TwelveLabsIndexedIndexData
  extends TwelveLabsIndexDataBase {
  readonly indexed_asset_id: string;
  readonly stage: "index";
}

export type TwelveLabsIndexData =
  | TwelveLabsUploadIndexData
  | TwelveLabsIndexedIndexData;

export type TwelveLabsIndexResponse =
  ApiDataResponse<TwelveLabsIndexData>;

export interface TwelveLabsAnalyzeRequest {
  readonly video_id: string;
  readonly instance_id?: string;
  readonly asset_id: string;
  readonly video_duration_ms: number;
  readonly particle: FinalParticleInstance;
}

export interface TwelveLabsAnalyzeData {
  readonly provider: "twelvelabs";
  readonly model: "pegasus1.5";
  readonly video_id: string;
  readonly instance_id: string;
  readonly asset_id: string;
  readonly annotation: GestureAnnotationDraft;
}

export type TwelveLabsAnalyzeResponse =
  ApiDataResponse<TwelveLabsAnalyzeData>;

/**
 * Browser workflow input for the route's upload → poll → index → poll
 * sequence. This is not a separate HTTP shape.
 */
export interface TwelveLabsIndexWorkflowRequest {
  readonly video_id: string;
  readonly index_id: string;
  readonly video_url: string;
  readonly filename?: string;
}
