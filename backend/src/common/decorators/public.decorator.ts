import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as not requiring authentication (e.g. OTP request/verify,
 * health check). Use sparingly and deliberately — this is the one place
 * where an endpoint opts OUT of the secure-by-default posture.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
