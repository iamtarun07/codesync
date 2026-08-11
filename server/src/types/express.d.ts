import type { IUser } from '../models/User';

declare global {
  namespace Express {
    interface Request {
      /** Populated by requireAuth. Never set from client input. */
      user?: IUser;
    }
  }
}

export {};
