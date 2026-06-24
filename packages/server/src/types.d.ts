import 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by the auth middleware once a JWT or API key is resolved. */
      userId?: string;
    }
  }
}
