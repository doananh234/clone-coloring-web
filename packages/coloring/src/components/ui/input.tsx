import type { InputHTMLAttributes } from "react";
import { Icon, type IconName } from "../../lib/icon";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: IconName;
}

export function Input({ icon, className, ...rest }: InputProps) {
  const input = (
    <input
      className={["mo-input", icon && "mo-input--icon", className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
  if (!icon) return input;
  return (
    <span className="mo-inputwrap">
      <Icon name={icon} size={16} />
      {input}
    </span>
  );
}
