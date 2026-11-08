export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (msg) => new AppError(400, msg);
export const unauthorized = (msg = 'Please open the link you received when you joined this group') => new AppError(401, msg);
export const forbidden = (msg) => new AppError(403, msg);
export const notFound = (msg = 'Group not found') => new AppError(404, msg);
export const conflict = (msg) => new AppError(409, msg);
