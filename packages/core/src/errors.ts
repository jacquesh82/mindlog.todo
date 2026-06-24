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
export const Conflict = (msg = 'Conflict') => new AppError(msg, 409, 'conflict');
export const ServiceUnavailable = (msg = 'Service unavailable') =>
  new AppError(msg, 503, 'service_unavailable');
