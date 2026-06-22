import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// Standarisasi format response semua API:
// { success: true, data: ..., message: '...' }

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data: data?.data !== undefined ? data.data : data,
        message: data?.message || 'OK',
        meta: data?.meta || undefined,
      })),
    );
  }
}
