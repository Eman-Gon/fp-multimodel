import type {
  TwelveLabsAsset,
  TwelveLabsIndexedAsset,
} from "@/lib/twelvelabs/client.ts";
import type {
  TwelveLabsCreateIndexRequest,
  TwelveLabsIndexData,
  TwelveLabsIndexRequest,
  TwelveLabsIndexStatusRequest,
  TwelveLabsUploadUrlRequest,
} from "@/lib/twelvelabs/contracts.ts";
import { TWELVELABS_MAX_DIRECT_UPLOAD_BYTES } from "@/lib/twelvelabs/contracts.ts";
import { TwelveLabsError } from "@/lib/twelvelabs/errors.ts";
import {
  createTwelveLabsClient,
  integrationErrorResponse,
  invalidJsonResponse,
  invalidRequestResponse,
  isRecord,
  jsonData,
  readRequiredString,
} from "@/lib/twelvelabs/route-support.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface UploadFileCommand {
  readonly action: "upload";
  readonly video_id: string;
  readonly index_id: string;
  readonly file: File;
  readonly filename?: string;
}

type IndexRouteCommand = TwelveLabsIndexRequest | UploadFileCommand;

export async function POST(request: Request): Promise<Response> {
  const parsed = await parseCommand(request);
  if (parsed instanceof Response) {
    return parsed;
  }

  try {
    const client = createTwelveLabsClient();
    switch (parsed.action) {
      case "upload": {
        const asset =
          "video_url" in parsed
            ? await client.createAssetFromUrl({
                video_id: parsed.video_id,
                video_url: parsed.video_url,
                ...(parsed.filename === undefined
                  ? {}
                  : { filename: parsed.filename }),
              })
            : await client.createAssetFromFile({
                video_id: parsed.video_id,
                file: parsed.file,
                ...(parsed.filename === undefined
                  ? {}
                  : { filename: parsed.filename }),
              });
        return uploadResponse(parsed, asset);
      }
      case "index": {
        const asset = await client.retrieveAsset(parsed.asset_id);
        assertVideoBinding(asset.video_id, parsed.video_id, "asset");
        if (asset.status !== "ready") {
          return uploadResponse(parsed, asset);
        }
        const indexedAsset = await client.indexAsset(parsed);
        return indexingResponse(parsed, indexedAsset, 202);
      }
      case "status": {
        if (parsed.indexed_asset_id === undefined) {
          const asset = await client.retrieveAsset(parsed.asset_id);
          assertVideoBinding(asset.video_id, parsed.video_id, "asset");
          return uploadResponse(parsed, asset);
        }
        const indexedAsset = await client.retrieveIndexedAsset(
          parsed.index_id,
          parsed.indexed_asset_id,
        );
        if (indexedAsset.asset_id !== parsed.asset_id) {
          throw new TwelveLabsError(
            "TWELVELABS_INVALID_RESPONSE",
            "TwelveLabs returned indexing state for a different source asset.",
            502,
          );
        }
        assertVideoBinding(
          indexedAsset.video_id,
          parsed.video_id,
          "indexed asset",
        );
        return indexingResponse(parsed, indexedAsset);
      }
    }
  } catch (error) {
    return integrationErrorResponse(error, { video_id: parsed.video_id });
  }
}

async function parseCommand(
  request: Request,
): Promise<IndexRouteCommand | Response> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("multipart/form-data")) {
    return parseMultipartCommand(request);
  }
  if (!contentType.includes("application/json")) {
    return invalidRequestResponse(
      "Content-Type must be application/json or multipart/form-data.",
    );
  }

  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return invalidJsonResponse();
  }
  if (!isRecord(value)) {
    return invalidRequestResponse("Request body must be a JSON object.");
  }

  const inferredAction =
    value.action === undefined && typeof value.video_url === "string"
      ? "upload"
      : value.action;
  if (
    inferredAction !== "upload" &&
    inferredAction !== "index" &&
    inferredAction !== "status"
  ) {
    return invalidRequestResponse(
      "action must be upload, index, or status.",
      requestVideoContext(value),
    );
  }

  const common = parseCommonFields(value);
  if (common instanceof Response) {
    return common;
  }

  if (inferredAction === "upload") {
    const videoUrl = readRequiredString(value, "video_url");
    if (videoUrl === null) {
      return invalidRequestResponse(
        "Upload requests require a non-empty video_url.",
        common,
      );
    }
    const filename = readOptionalString(value, "filename");
    if (filename instanceof Response) {
      return filename;
    }
    return {
      action: "upload",
      ...common,
      video_url: videoUrl,
      ...(filename === undefined ? {} : { filename }),
    } satisfies TwelveLabsUploadUrlRequest;
  }

  const assetId = readRequiredString(value, "asset_id");
  if (assetId === null) {
    return invalidRequestResponse(
      `${inferredAction} requests require a non-empty asset_id.`,
      common,
    );
  }
  if (inferredAction === "index") {
    return {
      action: "index",
      ...common,
      asset_id: assetId,
    } satisfies TwelveLabsCreateIndexRequest;
  }

  const indexedAssetId = readOptionalString(value, "indexed_asset_id");
  if (indexedAssetId instanceof Response) {
    return indexedAssetId;
  }
  return {
    action: "status",
    ...common,
    asset_id: assetId,
    ...(indexedAssetId === undefined
      ? {}
      : { indexed_asset_id: indexedAssetId }),
  } satisfies TwelveLabsIndexStatusRequest;
}

async function parseMultipartCommand(
  request: Request,
): Promise<IndexRouteCommand | Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return invalidRequestResponse("Multipart request body could not be read.");
  }

  const videoId = readFormString(form, "video_id");
  const indexId = readFormString(form, "index_id");
  const action = form.get("action");
  if (action !== null && action !== "upload") {
    return invalidRequestResponse(
      "Multipart requests support only the upload action.",
      videoId === null ? undefined : { video_id: videoId },
    );
  }
  if (videoId === null || indexId === null) {
    return invalidRequestResponse(
      "Multipart upload requires video_id and index_id.",
      videoId === null ? undefined : { video_id: videoId },
    );
  }
  const file = form.get("video_file") ?? form.get("file");
  if (!(file instanceof File)) {
    return invalidRequestResponse(
      "Multipart upload requires a video_file.",
      { video_id: videoId },
    );
  }
  if (
    file.size === 0 ||
    file.size > TWELVELABS_MAX_DIRECT_UPLOAD_BYTES
  ) {
    return invalidRequestResponse(
      "video_file must be between 1 byte and 200 MB.",
      { video_id: videoId },
    );
  }
  const filename = readOptionalFormString(form, "filename") ?? file.name;
  return {
    action: "upload",
    video_id: videoId,
    index_id: indexId,
    file,
    filename,
  };
}

function parseCommonFields(
  value: Record<string, unknown>,
): Pick<TwelveLabsCreateIndexRequest, "video_id" | "index_id"> | Response {
  const videoId = readRequiredString(value, "video_id");
  const indexId = readRequiredString(value, "index_id");
  if (videoId === null || indexId === null) {
    return invalidRequestResponse(
      "video_id and index_id must be non-empty strings.",
      videoId === null ? undefined : { video_id: videoId },
    );
  }
  return { video_id: videoId, index_id: indexId };
}

function readOptionalString(
  value: Record<string, unknown>,
  key: string,
): string | undefined | Response {
  const field = value[key];
  if (field === undefined) {
    return undefined;
  }
  if (typeof field !== "string" || field.trim().length === 0) {
    return invalidRequestResponse(
      `${key} must be a non-empty string.`,
      requestVideoContext(value),
    );
  }
  return field;
}

function requestVideoContext(
  value: Record<string, unknown>,
): { readonly video_id?: string } {
  const videoId = readRequiredString(value, "video_id");
  return videoId === null ? {} : { video_id: videoId };
}

function readFormString(form: FormData, key: string): string | null {
  const value = form.get(key);
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readOptionalFormString(
  form: FormData,
  key: string,
): string | undefined {
  const value = form.get(key);
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function uploadResponse(
  command: Pick<IndexRouteCommand, "video_id" | "index_id">,
  asset: TwelveLabsAsset,
): Response {
  const status = asset.status === "ready" ? "ready" : asset.status;
  const data = {
    provider: "twelvelabs",
    video_id: command.video_id,
    index_id: command.index_id,
    asset_id: asset.id,
    indexed_asset_id: null,
    stage: "upload",
    status,
  } satisfies TwelveLabsIndexData;
  return jsonData(
    data,
    { status: asset.status === "processing" ? 202 : 200 },
  );
}

function indexingResponse(
  command: Pick<IndexRouteCommand, "video_id" | "index_id">,
  indexedAsset: TwelveLabsIndexedAsset,
  httpStatus = 200,
): Response {
  const status =
    indexedAsset.status === "ready" || indexedAsset.status === "failed"
      ? indexedAsset.status
      : "processing";
  const data = {
    provider: "twelvelabs",
    video_id: command.video_id,
    index_id: command.index_id,
    asset_id: indexedAsset.asset_id,
    indexed_asset_id: indexedAsset.id,
    stage: "index",
    status,
  } satisfies TwelveLabsIndexData;
  return jsonData(
    data,
    { status: status === "processing" ? 202 : httpStatus },
  );
}

function assertVideoBinding(
  providerVideoId: string | null,
  requestedVideoId: string,
  resource: string,
): void {
  if (providerVideoId === null) {
    throw new TwelveLabsError(
      "TWELVELABS_INVALID_RESPONSE",
      `TwelveLabs did not return the ${resource} video_id metadata.`,
      502,
    );
  }
  if (providerVideoId !== requestedVideoId) {
    throw new TwelveLabsError(
      "TWELVELABS_INVALID_REQUEST",
      `The TwelveLabs ${resource} belongs to a different video_id.`,
      400,
    );
  }
}
