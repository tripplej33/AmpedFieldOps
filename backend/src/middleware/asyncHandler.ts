import { Request, Response, NextFunction } from 'express';

/**
 * Async route handler wrapper
 * Automatically catches promise rejections and forwards them to error handling middleware
 * 
 * Usage:
 *   router.get('/route', asyncHandler(async (req, res) => {
 *     // async code here
 *   }));
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
