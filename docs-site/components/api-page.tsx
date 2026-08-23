'use client';

import { createOpenAPIPage } from 'fumadocs-openapi/ui';

// The spec is bound at the source level (lib/source.ts -> openapi.staticSource), so the
// page component only needs render options. Uses the built-in playground; the Scalar
// client is a possible follow-up but pulls in ~30 extra packages.
export const OpenAPIPage = createOpenAPIPage();
