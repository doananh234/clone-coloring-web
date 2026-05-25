import React, { useState } from "react";
import { Input } from "../ui/input";
import { cn } from "../../utils/cn";

type UrlImageFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
};

export function UrlImageField({ value, onChange, placeholder, error }: UrlImageFieldProps) {
  const [imgError, setImgError] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setImgError(false);
    onChange(e.target.value);
  }

  return (
    <div className="space-y-2">
      <Input
        type="text"
        value={value ?? ""}
        onChange={handleChange}
        placeholder={placeholder ?? "https://example.com/image.png"}
        className={cn(error && "border-destructive")}
      />
      {value && (
        <div className="mt-1">
          {imgError ? (
            <span className="text-sm text-muted-foreground">Unable to load</span>
          ) : (
            <img
              src={value}
              alt="Preview"
              className="h-20 w-20 rounded border object-cover"
              onError={() => setImgError(true)}
            />
          )}
        </div>
      )}
    </div>
  );
}
