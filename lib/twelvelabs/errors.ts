export type TwelveLabsErrorCode =
  | "TWELVELABS_NOT_CONFIGURED"
  | "TWELVELABS_INVALID_REQUEST"
  | "TWELVELABS_UNAUTHORIZED"
  | "TWELVELABS_NOT_FOUND"
  | "TWELVELABS_RATE_LIMITED"
  | "TWELVELABS_TIMEOUT"
  | "TWELVELABS_UNAVAILABLE"
  | "TWELVELABS_INVALID_RESPONSE";

/**
 * Carries only a client-safe message. Provider response bodies are
 * intentionally not attached because they may contain request diagnostics.
 */
export class TwelveLabsError extends Error {
  readonly code: TwelveLabsErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;

  constructor(
    code: TwelveLabsErrorCode,
    message: string,
    httpStatus: number,
    retryable = false,
  ) {
    super(message);
    this.name = "TwelveLabsError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
  }
}

