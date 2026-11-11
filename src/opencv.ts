/**
 * Loads OpenCV on first use. It is a download of a few megabytes, so it stays out of the app's own bundle and is
 * only fetched when a photo is opened; after that the browser has it cached.
 */
import cvUrl from '@techstark/opencv-js/dist/opencv.js?url';
import type { CV } from './detectCv';

let pending: Promise<{ cv: CV }> | null = null;

/** Resolves once OpenCV is ready. The module is wrapped in an object so awaiting never treats it as a thenable. */
export function loadOpenCv(): Promise<{ cv: CV }> {
  pending ??= new Promise<{ cv: CV }>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = cvUrl;
    script.async = true;
    script.onerror = () => reject(new Error('Could not load the piece detector'));
    script.onload = () => {
      // Depending on the build, the global is a promise for the module or the module itself, ready or not.
      Promise.resolve((window as unknown as { cv?: unknown }).cv).then((loaded) => {
        const cv = loaded as (CV & { onRuntimeInitialized?: () => void }) | undefined;
        if (!cv) reject(new Error('Could not start the piece detector'));
        else if (cv.Mat) resolve({ cv });
        else cv.onRuntimeInitialized = () => resolve({ cv });
      }, reject);
    };
    document.head.appendChild(script);
  });
  // A failed load (offline, say) shouldn't stick: the next photo tries again.
  pending.catch(() => (pending = null));
  return pending;
}
