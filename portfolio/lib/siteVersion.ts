import packageJson from '@/package.json';

export const SITE_VERSION = packageJson.version;
export const SITE_VERSION_LABEL = `v${SITE_VERSION}`;
export const RESUME_PDF_URL = `/resources/resume.pdf?v=${SITE_VERSION}`;