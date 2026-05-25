type ImageItem = {
  id: string;
  url: string;
  isPublic?: boolean;
  coloredUrl?: string;
  coloringStyleId?: string;
};

type ImageGridProps = {
  images: ImageItem[];
  resolveUrl: (url: string | undefined | null) => string;
  columns?: number;
  maxVisible?: number;
  showPublicIndicator?: boolean;
  onImageClick?: (image: ImageItem, index: number) => void;
  className?: string;
};

export function ImageGrid({
  images,
  resolveUrl,
  columns = 5,
  maxVisible = 8,
  showPublicIndicator = false,
  onImageClick,
  className,
}: ImageGridProps) {
  const visible = images.slice(0, maxVisible);
  const remaining = images.length - maxVisible;

  return (
    <div className={className}>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {visible.map((img, i) => (
          <button
            key={img.id}
            type="button"
            className="group relative aspect-[3/4] overflow-hidden rounded-md border bg-muted"
            onClick={() => onImageClick?.(img, i)}
          >
            <img
              src={resolveUrl(img.url)}
              alt=""
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            {showPublicIndicator && img.isPublic && (
              <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-green-500 ring-1 ring-white" />
            )}
            {img.coloredUrl && (
              <span
                className="absolute left-1 top-1 h-2.5 w-2.5 rounded-full bg-purple-500 ring-1 ring-white"
                title="Has colored version"
              />
            )}
          </button>
        ))}
        {remaining > 0 && (
          <button
            type="button"
            className="flex aspect-[3/4] items-center justify-center rounded-md border bg-muted text-sm text-muted-foreground hover:bg-accent"
            onClick={() => onImageClick?.(images[maxVisible], maxVisible)}
          >
            +{remaining} more
          </button>
        )}
      </div>
      {showPublicIndicator && (
        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-green-500" />
            Public
          </span>
          {images.some((img) => img.coloredUrl) && (
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-purple-500" />
              Colored
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export type { ImageItem };
