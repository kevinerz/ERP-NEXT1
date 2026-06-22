import { SetMetadata } from '@nestjs/common';

// Tandai route sebagai public (skip JWT guard)
// Dipakai untuk: /webhook/*, /public/wo/:token, /auth/login
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
