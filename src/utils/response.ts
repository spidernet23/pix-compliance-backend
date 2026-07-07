import { Response } from 'express';
import { ApiResponse, PaginatedResponse, DataProvenance } from '../domain/types';

export function sendSuccess<T>(
  res: Response,
  data: T,
  message?: string,
  status = 200,
  meta?: DataProvenance
): void {
  const response: ApiResponse<T> = {
    success: true,
    data,
    message,
    meta,
    timestamp: new Date().toISOString(),
    requestId: (res.req as { requestId?: string }).requestId ?? '',
  };
  res.status(status).json(response);
}

export function sendError(
  res: Response,
  status: number,
  message: string,
  errors?: string[]
): void {
  const response: ApiResponse = {
    success: false,
    message,
    errors,
    timestamp: new Date().toISOString(),
    requestId: (res.req as { requestId?: string }).requestId ?? '',
  };
  res.status(status).json(response);
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number,
  meta?: DataProvenance
): void {
  const response: PaginatedResponse<T> = {
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    meta,
    timestamp: new Date().toISOString(),
    requestId: (res.req as { requestId?: string }).requestId ?? '',
  };
  res.status(200).json(response);
}
