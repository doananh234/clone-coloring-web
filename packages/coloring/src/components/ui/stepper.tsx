import { Icon } from "../../lib/icon";

export interface StepperStep {
  label: string;
}

export interface StepperProps {
  steps: StepperStep[];
  /** 0-based index of the active step. */
  current: number;
  /** Allow clicking a completed step to jump back. */
  onStepClick?: (index: number) => void;
}

export function Stepper({ steps, current, onStepClick }: StepperProps) {
  return (
    <div className="mo-stepper">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const clickable = onStepClick && i < current;
        return (
          <div key={i} style={{ display: "contents" }}>
            <div
              className={`mo-step${active ? " mo-step--active" : done ? " mo-step--done" : ""}`}
              style={{ cursor: clickable ? "pointer" : "default" }}
              onClick={clickable ? () => onStepClick!(i) : undefined}
            >
              <span className="mo-step__num">{done ? <Icon name="check" size={16} stroke={2.5} /> : i + 1}</span>
              <span className="mo-step__label">
                <small>Bước {i + 1}</small>
                <span>{s.label}</span>
              </span>
            </div>
            {i < steps.length - 1 && <span className={`mo-step__line${i < current ? " mo-step__line--done" : ""}`} />}
          </div>
        );
      })}
    </div>
  );
}
