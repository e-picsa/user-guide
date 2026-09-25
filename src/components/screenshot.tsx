import { cn } from "@/lib/cn";

export interface ScreenshotMarker {
  /** Horizontal position as % of image width (0–100) */
  x: number;
  /** Vertical position as % of image height (0–100) */
  y: number;
  /** Short label shown in the numbered key below the image */
  label: string;
}

interface ScreenshotProps {
  src: string;
  alt: string;
  markers?: ScreenshotMarker[];
  caption?: string;
  className?: string;
}

/**
 * Annotated dashboard screenshot.
 *
 * Markers are positioned by percentage so they scale with the image.
 * Number the matching steps in a list below, e.g.
 *
 * ```mdx
 * <Screenshot
 *   src="/screenshots/zm-admin/climate/station.png"
 *   alt="Station list with table and map"
 *   markers={[
 *     { x: 30, y: 8, label: 'Search and sort the station table' },
 *     { x: 78, y: 50, label: 'Click a numbered map marker' },
 *   ]}
 * />
 * ```
 *
 * Keep marker coordinates in sync with the post-capture `.json` sidecars
 * (viewport-relative bboxes, 1:1 with png pixels at 1280x720): use the
 * element's bbox centre as `x = (bbox.x + bbox.width / 2) / 12.8`,
 * `y = (bbox.y + bbox.height / 2) / 7.2`. Never target elements with a
 * negative or >720 bbox — they are scrolled out of the capture.
 * `bun run overlay:check` composites the markers onto the pngs for review.
 */
export function Screenshot({
  src,
  alt,
  markers = [],
  caption,
  className,
}: ScreenshotProps) {
  return (
    <figure className={cn("my-6", className)}>
      <div className="relative overflow-hidden rounded-lg border border-fd-border shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="block w-full" loading="lazy" />
        {markers.map((marker, i) => (
          <span
            key={`${marker.x}-${marker.y}-${i}`}
            title={marker.label}
            aria-label={`Marker ${i + 1}: ${marker.label}`}
            className="absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-amber-600 text-sm font-extrabold text-white ring-2 ring-white [box-shadow:0_0_0_1px_rgb(0_0_0/0.45),0_4px_10px_rgb(0_0_0/0.4)]"
            style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
          >
            {i + 1}
          </span>
        ))}
      </div>
      {markers.length > 0 && (
        <ol className="mt-3 space-y-1 text-sm text-fd-muted-foreground">
          {markers.map((marker, i) => (
            <li key={`${marker.x}-${marker.y}-${i}`} className="flex gap-2">
              <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-600/10 text-xs font-extrabold text-amber-700 dark:text-amber-400">
                {i + 1}
              </span>
              <span>{marker.label}</span>
            </li>
          ))}
        </ol>
      )}
      {caption && (
        <figcaption className="mt-2 text-center text-xs text-fd-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
