import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, Switch } from "@vx/core-uikit/components";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft,
  faChevronRight,
  faDroplet,
  faSparkles,
  faPaintbrushPencil,
  faXmark,
  faImage,
  faSquare,
  faEllipsis,
} from "@fortawesome/pro-regular-svg-icons";
import type { ImageItem } from "./image-grid";
import { ImageComparison } from "./image-comparison";

type ImageLightboxProps = {
  images: ImageItem[];
  resolveUrl: (url: string | undefined | null) => string;
  currentIndex: number;
  open: boolean;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  /** Callback when isPublic is toggled. If provided, shows toggle control. */
  onTogglePublic?: (image: ImageItem, isPublic: boolean) => void;
  /** Callback when Extract is clicked. If provided, shows Extract button. */
  onExtract?: (image: ImageItem) => void;
  /** Callback when Colorize is clicked. If provided, shows Colorize button. */
  onColorize?: (image: ImageItem) => void;
  /** Callback when Redesign is clicked. If provided, shows Redesign button. */
  onRedesign?: (image: ImageItem) => void;
  /** Set image as cover. Receives the URL of the currently displayed version (B&W or colored). */
  onSetAsCover?: (imageUrl: string) => void;
  /** Set image as square thumbnail. Receives the URL of the currently displayed version. */
  onSetAsSquare?: (imageUrl: string) => void;
  /** Set image as thumbnail (3:4). Receives the URL of the currently displayed version. */
  onSetAsThumbnail?: (imageUrl: string) => void;
};

export function ImageLightbox({
  images,
  resolveUrl,
  currentIndex,
  open,
  onClose,
  onIndexChange,
  onTogglePublic,
  onExtract,
  onColorize,
  onRedesign,
  onSetAsCover,
  onSetAsSquare,
  onSetAsThumbnail,
}: ImageLightboxProps) {
  const image = images[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;
  const [viewMode, setViewMode] = useState<"bw" | "colored">("bw");
  const [menuOpen, setMenuOpen] = useState(false);

  const hasColoredVersion = !!image?.coloredUrl;

  // Reset to B&W and close menu when changing page
  useEffect(() => {
    if (!hasColoredVersion) setViewMode("bw");
    setMenuOpen(false);
  }, [currentIndex, hasColoredVersion]);

  const displayUrl =
    viewMode === "colored" && image?.coloredUrl
      ? resolveUrl(image.coloredUrl)
      : resolveUrl(image?.url);

  const goPrev = useCallback(() => {
    if (hasPrev) onIndexChange(currentIndex - 1);
  }, [hasPrev, currentIndex, onIndexChange]);

  const goNext = useCallback(() => {
    if (hasNext) onIndexChange(currentIndex + 1);
  }, [hasNext, currentIndex, onIndexChange]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, goPrev, goNext, onClose]);

  if (!image) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="!max-w-4xl !border !bg-white !p-0 sm:!max-w-4xl !rounded-xl !gap-0"
      >
        {/* Image area */}
        <div className="relative flex min-h-[60vh] items-center">
          <button
            type="button"
            className="absolute left-2 z-10 rounded-full bg-black/5 p-2 text-gray-600 hover:bg-black/10 disabled:opacity-30"
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            disabled={!hasPrev}
          >
            <FontAwesomeIcon icon={faChevronLeft} className="h-6 w-6" />
          </button>

          <div className="flex flex-1 items-center justify-center p-8">
            {hasColoredVersion ? (
              <ImageComparison
                beforeSrc={resolveUrl(image.url)}
                afterSrc={resolveUrl(image.coloredUrl)}
                beforeAlt="B&W Original"
                afterAlt="Colorized"
                className="h-[65vh] aspect-square rounded-lg shadow-sm"
              />
            ) : (
              <img
                src={displayUrl}
                alt=""
                className="max-h-[65vh] max-w-full rounded-lg object-contain shadow-sm"
                onError={(e) => {
                  const el = e.target as HTMLImageElement;
                  el.style.display = "none";
                  el.parentElement!.innerHTML =
                    '<p class="text-gray-400 text-sm">Image failed to load</p>';
                }}
              />
            )}
          </div>

          <button
            type="button"
            className="absolute right-2 z-10 rounded-full bg-black/5 p-2 text-gray-600 hover:bg-black/10 disabled:opacity-30"
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            disabled={!hasNext}
          >
            <FontAwesomeIcon icon={faChevronRight} className="h-6 w-6" />
          </button>
        </div>

        {/* Metadata bar */}
        <div className="flex items-center justify-between border-t bg-gray-50 px-4 py-3 rounded-b-xl">
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span>
              Page {currentIndex + 1} of {images.length}
            </span>
            <span className="font-mono text-xs truncate max-w-[200px]">{image.id}</span>
          </div>
          <div className="flex items-center gap-3">
            {image.isPublic !== undefined &&
              (onTogglePublic ? (
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch
                    checked={!!image.isPublic}
                    onCheckedChange={(checked) => onTogglePublic(image, checked)}
                  />
                  <span
                    className={`text-sm font-medium ${image.isPublic ? "text-green-600" : "text-gray-400"}`}
                  >
                    {image.isPublic ? "Public" : "Private"}
                  </span>
                </label>
              ) : (
                <span className="flex items-center gap-1.5 text-sm">
                  <span
                    className={`h-2 w-2 rounded-full ${image.isPublic ? "bg-green-500" : "bg-gray-500"}`}
                  />
                  <span className={image.isPublic ? "text-green-600" : "text-gray-400"}>
                    {image.isPublic ? "Public" : "Private"}
                  </span>
                </span>
              ))}

            {/* Actions menu (inline, no portal — avoids Dialog z-index conflict) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="rounded bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 outline-none"
              >
                Actions
                <FontAwesomeIcon icon={faEllipsis} className="ml-1.5 inline h-3 w-3" />
              </button>
              {menuOpen && (
                <>
                  {/* Backdrop to close menu */}
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute bottom-full right-0 z-20 mb-2 w-52 rounded-lg border bg-popover p-1 shadow-lg">
                    {onColorize && (
                      <button
                        type="button"
                        onClick={() => {
                          onColorize(image);
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        <FontAwesomeIcon icon={faDroplet} className="h-3.5 w-3.5 text-purple-500" />
                        Colorize
                      </button>
                    )}
                    {onRedesign && (
                      <button
                        type="button"
                        onClick={() => {
                          onRedesign(image);
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        <FontAwesomeIcon
                          icon={faPaintbrushPencil}
                          className="h-3.5 w-3.5 text-amber-500"
                        />
                        Redesign
                      </button>
                    )}
                    {onExtract && (
                      <button
                        type="button"
                        onClick={() => {
                          onExtract(image);
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        <FontAwesomeIcon icon={faSparkles} className="h-3.5 w-3.5" />
                        Extract Characters & Locations
                      </button>
                    )}
                    {hasColoredVersion && (onSetAsCover || onSetAsThumbnail || onSetAsSquare) && (
                      <div className="my-1 h-px bg-border" />
                    )}
                    {hasColoredVersion && onSetAsCover && (
                      <button
                        type="button"
                        onClick={() => {
                          onSetAsCover(resolveUrl(image.coloredUrl));
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        <FontAwesomeIcon icon={faImage} className="h-3.5 w-3.5 text-green-500" />
                        Set Colored as Cover
                      </button>
                    )}
                    {hasColoredVersion && onSetAsThumbnail && (
                      <button
                        type="button"
                        onClick={() => {
                          onSetAsThumbnail(resolveUrl(image.coloredUrl));
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        <FontAwesomeIcon icon={faImage} className="h-3.5 w-3.5 text-green-500" />
                        Set Colored as Thumbnail
                      </button>
                    )}
                    {hasColoredVersion && onSetAsSquare && (
                      <button
                        type="button"
                        onClick={() => {
                          onSetAsSquare(resolveUrl(image.coloredUrl));
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        <FontAwesomeIcon icon={faSquare} className="h-3.5 w-3.5 text-green-500" />
                        Set Colored as Square
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded bg-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-300"
            >
              <FontAwesomeIcon icon={faXmark} className="mr-1 inline h-3 w-3" />
              Close
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
