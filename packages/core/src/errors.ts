/** Domain errors carrying an HTTP-friendly status code. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const NotFound = (msg = 'Not found') => new AppError(msg, 404, 'not_found');
export const BadRequest = (msg = 'Bad request') => new AppError(msg, 400, 'bad_request');
export const Unauthorized = (msg = 'Unauthorized') => new AppError(msg, 401, 'unauthorized');
export const Forbidden = (msg = 'Forbidden') => new AppError(msg, 403, 'forbidden');
export const Conflict = (msg = 'Conflict') => new AppError(msg, 409, 'conflict');
export const PaymentRequired = (msg = 'Payment required') =>
  new AppError(msg, 402, 'payment_required');
export const QuotaExceeded = (msg = 'Storage quota exceeded') =>
  new AppError(msg, 413, 'quota_exceeded');
export const ServiceUnavailable = (msg = 'Service unavailable') =>
  new AppError(msg, 503, 'service_unavailable');
